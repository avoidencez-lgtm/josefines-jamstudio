//! export: DAW multi-track export packaging (WAV stems + SMF Type 1 MIDI tempo map).

use std::fs::File;
use std::io::Write;
use std::path::Path;

pub struct DawExporter;

impl DawExporter {
    /// Generates Standard MIDI File (SMF Type 1) with tempo, time signature, and section markers.
    pub fn build_tempo_map_midi(tempo: f64, sections: &[(&str, u32)]) -> Vec<u8> {
        let mut midi = Vec::new();

        // SMF Header: 'MThd', length 6, format 1 (multi-track / tempo map), 1 track, 480 ticks/quarter
        midi.extend_from_slice(b"MThd");
        midi.extend_from_slice(&6u32.to_be_bytes());
        midi.extend_from_slice(&1u16.to_be_bytes()); // Format 1
        midi.extend_from_slice(&1u16.to_be_bytes()); // 1 Track
        midi.extend_from_slice(&480u16.to_be_bytes()); // 480 ticks/quarter note

        // Track data
        let mut track_data = Vec::new();

        // 1. Time Signature: delta 0, FF 58 04 04 02 18 08 (4/4, 24 MIDI clocks/quarter, 8 32nd notes/beat)
        track_data.extend_from_slice(&[0x00, 0xFF, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08]);

        // 2. Set Tempo: delta 0, FF 51 03 [24-bit microsec/quarter]
        let us_per_quarter = (60_000_000.0 / tempo.max(20.0)).round() as u32;
        let t_bytes = us_per_quarter.to_be_bytes();
        track_data.extend_from_slice(&[0x00, 0xFF, 0x51, 0x03, t_bytes[1], t_bytes[2], t_bytes[3]]);

        // 3. Section Markers
        let mut prev_tick = 0u32;
        for &(name, bar) in sections {
            let target_tick = (bar.saturating_sub(1)) * 4 * 480;
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

    /// Exports take bundle with MIDI tempo map and take metadata to specified directory.
    pub fn export_take_bundle(
        output_dir: &Path,
        take_id: &str,
        tempo: f64,
        sections: &[(&str, u32)],
    ) -> std::io::Result<()> {
        std::fs::create_dir_all(output_dir)?;

        // Write tempo map MIDI
        let midi_bytes = Self::build_tempo_map_midi(tempo, sections);
        let midi_path = output_dir.join(format!("take_{}_tempo_map.mid", take_id));
        let mut file = File::create(midi_path)?;
        file.write_all(&midi_bytes)?;

        // Write metadata JSON
        let json_path = output_dir.join(format!("take_{}_info.json", take_id));
        let mut json_file = File::create(json_path)?;
        let info = serde_json::json!({
            "takeId": take_id,
            "tempo": tempo,
            "sampleRate": 48000,
            "format": "24-bit PCM WAV + SMF Type 1 MIDI",
            "dawCompatibility": ["Logic Pro", "Reaper", "Ableton Live", "Cubase", "Studio One"]
        });
        json_file.write_all(info.to_string().as_bytes())?;

        Ok(())
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
    }
}
