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
    pub reaper_script: Option<String>,
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
        let us_per_quarter = (60_000_000.0 / (tempo.max(20.0) * 4.0 / den as f64)).round() as u32;
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
            "quarterNoteBpm": job.tempo * 4.0 / job.time_sig.1 as f64,
            "beatUnit": "time-signature denominator",
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
            reaper_script: None,
        })
    }
}

/// Quote data as Lua, never as executable text (JSON's Unicode escapes are not Lua).
fn lua_string(value: &str) -> String {
    let mut out = String::from("\"");
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if c.is_control() => out.push_str(&format!("\\{:03}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// A portable, inspectable session builder using REAPER's documented ReaScript API.
/// Existing projects are never overwritten: the user imports into an empty project and saves it.
pub fn write_reaper_import(
    output_dir: &Path,
    job: &ExportJob<'_>,
    report: &ExportReport,
    notes: &[crate::workstation::MidiNote],
) -> std::io::Result<String> {
    let invalid = |message| std::io::Error::new(std::io::ErrorKind::InvalidData, message);
    if !report.missing_stems.is_empty()
        || report.copied_stems.is_empty()
        || !job.tempo.is_finite()
        || !(20.0..=400.0).contains(&job.tempo)
        || job.sample_rate == 0
        || job.time_sig.0 == 0
        || !job.time_sig.1.is_power_of_two()
    {
        return Err(invalid(
            "A complete export and valid tempo/meter are required for REAPER.",
        ));
    }
    let mut files = Vec::new();
    for path in &report.copied_stems {
        let path = Path::new(path);
        if path.parent() != Some(output_dir) {
            return Err(invalid("REAPER media must be inside the export folder."));
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| invalid("Invalid media name"))?;
        let role = name
            .strip_prefix(&format!("{}-", job.take_id))
            .unwrap_or(name)
            .trim_end_matches(".wav");
        let wav = hound::WavReader::open(path).map_err(std::io::Error::other)?;
        let length = wav.duration() as f64 / wav.spec().sample_rate as f64;
        if !length.is_finite() || length <= 0.0 {
            return Err(invalid("Cannot import an empty WAV into REAPER."));
        }
        files.push((name, role, length));
    }
    let individual_band = ["drums", "bass", "comp"]
        .iter()
        .all(|role| files.iter().any(|(_, r, _)| r == role));
    let use_band_mix = !individual_band && files.iter().any(|(_, role, _)| *role == "band");
    let length = files
        .iter()
        .map(|(_, _, seconds)| *seconds)
        .fold(0.0, f64::max);
    let mut data = format!(
        "local session = {{tempo={}, numerator={}, denominator={}, length={}, files={{\n",
        job.tempo * 4.0 / job.time_sig.1 as f64,
        job.time_sig.0,
        job.time_sig.1,
        length
    );
    for (name, role, duration) in files {
        let muted = role == "master"
            || (role == "band" && !use_band_mix)
            || (use_band_mix && ["drums", "bass", "comp"].contains(&role));
        data.push_str(&format!(
            "{{file={}, name={}, length={}, muted={}}},\n",
            lua_string(name),
            lua_string(role),
            duration,
            muted
        ));
    }
    data.push_str("}, markers={\n");
    for (name, bar) in job.sections {
        let seconds = bar.saturating_sub(1) as f64 * job.time_sig.0 as f64 * 60.0 / job.tempo;
        if seconds < length {
            data.push_str(&format!(
                "{{name={}, time={}}},\n",
                lua_string(name),
                seconds
            ));
        }
    }
    data.push_str("}, notes={\n");
    for note in notes {
        let time = note.frame as f64 / job.sample_rate as f64;
        if time <= length
            && matches!(note.bytes[0] & 0xf0, 0x80 | 0x90)
            && note.bytes[1] < 128
            && note.bytes[2] < 128
        {
            data.push_str(&format!(
                "{{time={}, status={}, pitch={}, velocity={}}},\n",
                time, note.bytes[0], note.bytes[1], note.bytes[2]
            ));
        }
    }
    data.push_str("}}\n");
    data.push_str(include_str!("reaper_import.lua"));
    let path = output_dir.join("Import into REAPER.lua");
    std::fs::write(&path, data)?;
    std::fs::write(output_dir.join("REAPER-START-HERE.txt"), "REAPER must be installed separately. No extensions are required.\n\n1. Open a NEW EMPTY project in REAPER (File > New project tab is useful).\n2. Open Actions > Show action list. Choose New action > Load ReaScript.\n3. Select 'Import into REAPER.lua' in this folder and Run it.\n4. Save the resulting project in THIS folder with File > Save project as.\n\nThe script refuses projects containing tracks, markers or tempo automation.\nAudio starts at zero with its original speed/pitch. Reference mixes are muted.\nMIDI tracks are muted until you add instruments and mute the matching audio stems.\nKeep the whole export folder together when moving it or sending it to your Mac.\nWAV stems and the tempo map also remain usable in Logic and other DAWs.\n")?;
    Ok(path.to_string_lossy().into_owned())
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
    time_sig: (u8, u8),
) -> std::io::Result<()> {
    let mut notes = take.midi.clone();
    notes.sort_by_key(|n| (n.frame, n.bytes[0]));
    let mut track = vec![0, 0xff, 0x51, 3];
    let quarter_bpm = take.tempo.max(20.0) * 4.0 / time_sig.1.max(1) as f64;
    let tempo = (60_000_000.0 / quarter_bpm).round() as u32;
    track.extend_from_slice(&tempo.to_be_bytes()[1..]);
    let mut previous = 0;
    let rate = take.sample_rate.max(1) as f64;
    for n in notes {
        let tick = (n.frame.min(take.sample_count as u64) as f64 / rate * quarter_bpm / 60.0
            * 480.0)
            .round() as u32;
        write_var_len(&mut track, tick.saturating_sub(previous));
        track.extend_from_slice(&n.bytes);
        previous = tick;
    }
    let end = (take.sample_count as f64 / rate * quarter_bpm / 60.0 * 480.0).round() as u32;
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

/// Longest stem the exporter will write (same ten-minute cap as `media_from_take`).
pub const MAX_EXPORT_SECONDS: u64 = 600;

pub fn write_clip_stem(
    path: &Path,
    clip: &crate::workstation::Clip,
    frames: usize,
    rate: u32,
    bpm: f64,
) -> std::io::Result<()> {
    if rate == 0 || frames == 0 || frames as u64 > u64::from(rate) * MAX_EXPORT_SECONDS {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Take is empty or longer than ten minutes.",
        ));
    }
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
    fn reaper_bundle_is_portable_preserves_timing_and_mutes_only_reference_mixes() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/seams/reaper-export.json"
        ))
        .unwrap();
        let dir = std::env::temp_dir().join(format!("jam-reaper-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut report = ExportReport {
            dir: dir.to_string_lossy().into_owned(),
            midi_file: String::new(),
            copied_stems: vec![],
            missing_stems: vec![],
            reaper_script: None,
        };
        for role in fixture["stems"].as_array().unwrap() {
            let path = dir.join(format!("take-1-{}.wav", role.as_str().unwrap()));
            let mut writer = hound::WavWriter::create(
                &path,
                hound::WavSpec {
                    channels: 1,
                    sample_rate: 48000,
                    bits_per_sample: 16,
                    sample_format: hound::SampleFormat::Int,
                },
            )
            .unwrap();
            for _ in 0..96_000 {
                writer.write_sample(1000_i16).unwrap();
            }
            writer.finalize().unwrap();
            report
                .copied_stems
                .push(path.to_string_lossy().into_owned());
        }
        let sections: Vec<(&str, u32)> = fixture["sections"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| (s[0].as_str().unwrap(), s[1].as_u64().unwrap() as u32))
            .collect();
        let notes =
            serde_json::from_value::<Vec<crate::workstation::MidiNote>>(fixture["midi"].clone())
                .unwrap();
        let job = ExportJob {
            take_id: "take-1",
            tempo: 100.0,
            time_sig: (3, 4),
            sample_rate: 48000,
            sections: &sections,
            stems: &[],
        };
        let script = write_reaper_import(&dir, &job, &report, &notes).unwrap();
        let text = std::fs::read_to_string(&script).unwrap();
        assert!(text.contains("name=\"band\", length=2, muted=true"));
        assert!(text.contains("name=\"master\", length=2, muted=true"));
        assert!(text.contains("name=\"guitar-layer-1\", length=2, muted=false"));
        assert!(text.contains("{name=\"Chorus\", time=1.8}"));
        assert!(!text.contains("Beyond take"));
        assert!(text.contains("time=0.5, status=144, pitch=45, velocity=100"));
        assert!(text.contains("Verse \\\"one\\\"\\010ø"));
        assert!(!text.contains(&report.dir)); // relative media paths survive moving Windows -> Mac
        let compound = ExportJob {
            tempo: 240.0,
            time_sig: (6, 8),
            sections: &[("Next", 2)],
            ..job
        };
        write_reaper_import(&dir, &compound, &report, &[]).unwrap();
        let compound_text = std::fs::read_to_string(&script).unwrap();
        assert!(compound_text.contains("tempo=120, numerator=6, denominator=8"));
        assert!(compound_text.contains("{name=\"Next\", time=1.5}"));
        report.copied_stems.retain(|p| !p.ends_with("-drums.wav"));
        write_reaper_import(&dir, &job, &report, &[]).unwrap();
        assert!(std::fs::read_to_string(&script)
            .unwrap()
            .contains("name=\"band\", length=2, muted=false"));
        report.missing_stems.push("lost.wav".into());
        assert!(write_reaper_import(&dir, &job, &report, &[]).is_err());
        assert_eq!(lua_string("\"\\\n\0"), "\"\\\"\\\\\\010\\000\"");
        std::fs::remove_dir_all(dir).unwrap();
    }

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
        for meter in [(6, 8), (12, 8), (4, 4)] {
            let midi = DawExporter::build_tempo_map_midi_with_meter(60.0, meter, &[("B", 9)]);
            let micros = u32::from_be_bytes([0, midi[34], midi[35], midi[36]]);
            let mut tick = 0_u32;
            for byte in &midi[37..] {
                tick = (tick << 7) | u32::from(byte & 127);
                if byte & 128 == 0 {
                    break;
                }
            }
            let seconds = tick as f64 / 480.0 * micros as f64 / 1_000_000.0;
            let timeline = jam_core::timeline::Timeline::new(48_000, 60.0, meter);
            assert!((seconds - 8.0 * timeline.samples_per_bar() as f64 / 48_000.0).abs() < 1e-6);
        }
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

    #[test]
    fn clip_stem_refuses_an_unbounded_frame_count() {
        let clip = crate::workstation::Clip {
            spec: crate::workstation::ClipSpec {
                take_id: "take-1".into(),
                trim_start: 0.0,
                trim_end: 1.0,
                start_bar: 1,
                repeats: 1,
                gain: 1.0,
                muted: false,
                label: String::new(),
            },
            samples: std::sync::Arc::new(vec![0.0; 48000]),
            sample_rate: 48000,
        };
        let path = std::env::temp_dir().join(format!(
            "jam-clip-bound-{}-{}.wav",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let err = write_clip_stem(&path, &clip, usize::MAX, 48000, 120.0).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
        assert!(!path.exists());
    }
}
