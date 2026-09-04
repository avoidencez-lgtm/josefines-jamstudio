//! export: DAW multi-track export packaging (WAV stems + SMF Type 1 MIDI tempo map).

use std::fs::File;
use std::io::Write;
use std::path::Path;

pub struct DawExporter;

/// Everything the exporter needs to know about one take. All of it comes from the
/// recorded take and the chart it was played against; nothing is assumed.
pub struct ExportJob<'a> {
    pub take_id: &'a str,
    pub tempo: f64,
    pub time_sig: (u8, u8),
    pub sample_rate: u32,
    /// `(section name, 1-indexed first bar)` in playing order.
    pub sections: &'a [(&'a str, u32)],
    /// `(stem name, path to the recorded WAV)`. Missing files are reported, not fatal.
    pub stems: &'a [(&'a str, &'a Path)],
}

/// What was written, so the UI can tell the truth about the bundle.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub dir: String,
    pub midi_file: String,
    pub copied_stems: Vec<String>,
    pub missing_stems: Vec<String>,
}

impl DawExporter {
    /// Generates Standard MIDI File (SMF Type 1) with tempo, time signature, and section markers.
    pub fn build_tempo_map_midi(tempo: f64, sections: &[(&str, u32)]) -> Vec<u8> {
        Self::build_tempo_map_midi_with_meter(tempo, (4, 4), sections)
    }

    pub fn build_tempo_map_midi_with_meter(
        tempo: f64,
        time_sig: (u8, u8),
        sections: &[(&str, u32)],
    ) -> Vec<u8> {
        let mut midi = Vec::new();

        // SMF Header: 'MThd', length 6, format 1 (multi-track / tempo map), 1 track, 480 ticks/quarter
        midi.extend_from_slice(b"MThd");
        midi.extend_from_slice(&6u32.to_be_bytes());
        midi.extend_from_slice(&1u16.to_be_bytes()); // Format 1
        midi.extend_from_slice(&1u16.to_be_bytes()); // 1 Track
        midi.extend_from_slice(&480u16.to_be_bytes()); // 480 ticks/quarter note

        // Track data
        let mut track_data = Vec::new();

        // 1. Time Signature: FF 58 04 nn dd cc bb. dd is log2 of the denominator,
        // cc = 24 MIDI clocks per metronome click, bb = 8 32nd notes per quarter.
        let (num, den) = (time_sig.0.max(1), time_sig.1.max(1));
        let den_pow = den.trailing_zeros() as u8;
        track_data.extend_from_slice(&[0x00, 0xFF, 0x58, 0x04, num, den_pow, 0x18, 0x08]);

        // 2. Set Tempo: delta 0, FF 51 03 [24-bit microsec/quarter]
        let us_per_quarter = (60_000_000.0 / tempo.max(20.0)).round() as u32;
        let t_bytes = us_per_quarter.to_be_bytes();
        track_data.extend_from_slice(&[0x00, 0xFF, 0x51, 0x03, t_bytes[1], t_bytes[2], t_bytes[3]]);

        // 3. Section Markers. A bar is `num` beats of `4/den` quarter notes each.
        let ticks_per_bar = (num as u32 * 480 * 4) / den as u32;
        let mut prev_tick = 0u32;
        for &(name, bar) in sections {
            let target_tick = (bar.saturating_sub(1)) * ticks_per_bar;
            let delta = target_tick.saturating_sub(prev_tick);
            prev_tick = target_tick;

            write_var_len(&mut track_data, delta);
            track_data.push(0xFF);
            track_data.push(0x06); // Marker meta event
            let name_bytes = name.as_bytes();
            write_var_len(&mut track_data, name_bytes.len() as u32);
            track_data.extend_from_slice(name_bytes);
        }

        // End of Track: delta 0, FF 2F 00
        track_data.extend_from_slice(&[0x00, 0xFF, 0x2F, 0x00]);

        // Track Chunk: 'MTrk', length, data
        midi.extend_from_slice(b"MTrk");
        midi.extend_from_slice(&(track_data.len() as u32).to_be_bytes());
        midi.extend_from_slice(&track_data);

        midi
    }

    /// Writes the bundle a DAW needs to reopen a take at bar 1: the recorded stems, an
    /// SMF Type 1 tempo map with section markers, and a JSON sidecar describing both.
    pub fn export_take_bundle(
        output_dir: &Path,
        job: &ExportJob<'_>,
    ) -> std::io::Result<ExportReport> {
        std::fs::create_dir_all(output_dir)?;

        let midi_bytes =
            Self::build_tempo_map_midi_with_meter(job.tempo, job.time_sig, job.sections);
        let midi_path = output_dir.join(format!("{}-tempo-map.mid", job.take_id));
        File::create(&midi_path)?.write_all(&midi_bytes)?;

        let mut copied_stems = Vec::new();
        let mut missing_stems = Vec::new();
        for (name, src) in job.stems {
            let dest = output_dir.join(format!("{}-{}.wav", job.take_id, name));
            match std::fs::copy(src, &dest) {
                Ok(_) => copied_stems.push(dest.to_string_lossy().to_string()),
                Err(_) => missing_stems.push(src.to_string_lossy().to_string()),
            }
        }

        let json_path = output_dir.join(format!("{}-info.json", job.take_id));
        let info = serde_json::json!({
            "takeId": job.take_id,
            "tempo": job.tempo,
            "timeSignature": format!("{}/{}", job.time_sig.0, job.time_sig.1),
            "sampleRate": job.sample_rate,
            "sections": job.sections.iter().map(|(n, b)| serde_json::json!({"name": n, "bar": b})).collect::<Vec<_>>(),
            "stems": copied_stems,
            "tempoMap": midi_path.to_string_lossy(),
            "format": "24-bit PCM WAV + SMF Type 1 MIDI",
            "howTo": "Import the tempo map first so the DAW adopts the tempo and markers, then drop every stem at bar 1."
        });
        File::create(&json_path)?.write_all(serde_json::to_string_pretty(&info)?.as_bytes())?;

        Ok(ExportReport {
            dir: output_dir.to_string_lossy().to_string(),
            midi_file: midi_path.to_string_lossy().to_string(),
            copied_stems,
            missing_stems,
        })
    }
}

fn write_var_len(buf: &mut Vec<u8>, mut val: u32) {
    let mut buffer = [0u8; 4];
    let mut i = 0;
    buffer[i] = (val & 0x7F) as u8;
    while val > 0x7F {
        val >>= 7;
        i += 1;
        buffer[i] = ((val & 0x7F) | 0x80) as u8;
    }
    while i > 0 {
        buf.push(buffer[i]);
        i -= 1;
    }
    buf.push(buffer[0]);
}

/// Actual scheduled notes, not inferred notes from the recorded guitar.
pub fn write_performance_midi(
    path: &Path,
    take: &crate::recorder::TakeMetadata,
) -> std::io::Result<()> {
    let mut notes = take.midi.clone();
    notes.sort_by_key(|n| (n.frame, n.bytes[0]));
    let mut track = vec![0, 0xff, 0x51, 3];
    let tempo = (60_000_000.0 / take.tempo.max(20.0)).round() as u32;
    track.extend_from_slice(&tempo.to_be_bytes()[1..]);
    let mut previous = 0;
    let rate = take.sample_rate.max(1) as f64;
    for n in notes {
        let tick = (n.frame.min(take.sample_count as u64) as f64 / rate * take.tempo / 60.0 * 480.0)
            .round() as u32;
        write_var_len(&mut track, tick.saturating_sub(previous));
        track.extend_from_slice(&n.bytes);
        previous = tick;
    }
    let end = (take.sample_count as f64 / rate * take.tempo / 60.0 * 480.0).round() as u32;
    write_var_len(&mut track, end.saturating_sub(previous));
    track.extend_from_slice(&[
        0xb0, 123, 0, 0, 0xb1, 123, 0, 0, 0xb9, 123, 0, 0, 0xff, 0x2f, 0,
    ]);
    let mut out = b"MThd".to_vec();
    out.extend_from_slice(&6u32.to_be_bytes());
    out.extend_from_slice(&[0, 0, 0, 1, 1, 224]);
    out.extend_from_slice(b"MTrk");
    out.extend_from_slice(&(track.len() as u32).to_be_bytes());
    out.extend(track);
    std::fs::write(path, out)
}

pub fn write_clip_stem(
    path: &Path,
    clip: &crate::workstation::Clip,
    frames: usize,
    rate: u32,
    bpm: f64,
) -> std::io::Result<()> {
    let mut writer = hound::WavWriter::create(
        path,
        hound::WavSpec {
            channels: 1,
            sample_rate: rate,
            bits_per_sample: 24,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .map_err(std::io::Error::other)?;
    for offset in (0..frames).step_by(256) {
        let n = (frames - offset).min(256);
        let mut block = vec![0.0; n];
        clip.render(
            &[jam_core::timeline::Span {
                offset: 0,
                frames: n,
                start_beats: offset as f64 / rate as f64 * bpm / 60.0,
            }],
            bpm,
            4.0,
            rate,
            &mut block,
        );
        for x in block {
            writer
                .write_sample((x.clamp(-1.0, 1.0) * 8_388_607.0) as i32)
                .map_err(std::io::Error::other)?;
        }
    }
    writer.finalize().map_err(std::io::Error::other)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tempo_map_smf1_generation() {
        let sections = [("Verse", 1), ("Chorus", 5), ("Solo", 9)];
        let midi = DawExporter::build_tempo_map_midi(120.0, &sections);

        // Check header 'MThd'
        assert_eq!(&midi[0..4], b"MThd");
        assert_eq!(&midi[4..8], &6u32.to_be_bytes());
        // Format 1
        assert_eq!(&midi[8..10], &1u16.to_be_bytes());

        // Check track 'MTrk'
        assert_eq!(&midi[14..18], b"MTrk");

        // Time signature 4/4 then tempo 120 = 500 000 us per quarter.
        assert_eq!(
            &midi[22..30],
            &[0x00, 0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08]
        );
        assert_eq!(&midi[30..37], &[0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20]);
    }

    #[test]
    fn markers_follow_the_meter() {
        // In 3/4 a bar is 3 * 480 ticks, so the marker at bar 5 sits at 5760 ticks.
        let midi = DawExporter::build_tempo_map_midi_with_meter(100.0, (3, 4), &[("B", 5)]);
        assert_eq!(
            &midi[22..30],
            &[0x00, 0xFF, 0x58, 0x04, 0x03, 0x02, 0x18, 0x08]
        );
        // Var-len 5760 = 0xAD 0x00
        assert_eq!(&midi[37..39], &[0xAD, 0x00]);
        assert_eq!(&midi[39..41], &[0xFF, 0x06]);
    }

    #[test]
    fn bundle_copies_present_stems_and_reports_missing_ones() {
        let dir = std::env::temp_dir().join(format!("jam-export-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let src = dir.join("src");
        std::fs::create_dir_all(&src).unwrap();
        let input = src.join("input.wav");
        std::fs::write(&input, b"RIFF").unwrap();
        let missing = src.join("band.wav");

        let job = ExportJob {
            take_id: "take-1",
            tempo: 96.0,
            time_sig: (4, 4),
            sample_rate: 44_100,
            sections: &[("Intro", 1), ("Verse", 5)],
            stems: &[("input", input.as_path()), ("band", missing.as_path())],
        };
        let report = DawExporter::export_take_bundle(&dir.join("out"), &job).unwrap();
        assert_eq!(report.copied_stems.len(), 1);
        assert_eq!(report.missing_stems.len(), 1);
        assert!(Path::new(&report.midi_file).exists());
        assert!(dir.join("out").join("take-1-input.wav").exists());
        let info = std::fs::read_to_string(dir.join("out").join("take-1-info.json")).unwrap();
        assert!(info.contains("\"sampleRate\": 44100"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
