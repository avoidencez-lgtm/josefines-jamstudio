//! Source clocks travel with output audio; only consumed, accepted frames enter a take.
use crate::{export::write_var_len, song::grid::Grid};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct Clock {
    pub position: f64,
    /// Source seconds per output second. Zero means no reference playback.
    pub speed: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Segment {
    pub frame: u64,
    pub position: f64,
    pub speed: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceTiming {
    pub schema_version: u32,
    pub asset_id: String,
    pub source_seconds: f64,
    pub grid: Grid,
    pub segments: Vec<Segment>,
    #[serde(default)]
    pub error: Option<String>,
}

// ponytail: bounded in-manifest trace; stream a separate clock file if long takes hit this ceiling.
const MAX_EVENTS: usize = 100_000;
const TIMING_ERROR: &str =
    "Invalid or incomplete reference timing. Recover the take timing before exporting.";

impl ReferenceTiming {
    pub(crate) fn new(asset_id: String, source_seconds: f64, grid: Grid) -> Self {
        Self {
            schema_version: 1,
            asset_id,
            source_seconds,
            grid,
            segments: vec![],
            error: None,
        }
    }

    pub(crate) fn capture(&mut self, base: u64, clocks: &[Clock], rate: u32) -> Result<(), String> {
        for (i, clock) in clocks.iter().enumerate() {
            let frame = base + i as u64;
            if !valid_clock(clock.position, clock.speed, self.source_seconds) || rate == 0 {
                self.error = Some(TIMING_ERROR.into());
                return Err(TIMING_ERROR.into());
            }
            let changed = self.segments.last().is_none_or(|last| {
                last.speed != clock.speed
                    || (clock.position
                        - last.position
                        - (frame - last.frame) as f64 * last.speed / f64::from(rate))
                    .abs()
                        > 0.25 / 48_000.0
            });
            if changed {
                if self.segments.len() == MAX_EVENTS {
                    self.error = Some("Reference timing capacity reached.".into());
                    return Err(self.error.clone().unwrap());
                }
                self.segments.push(Segment {
                    frame,
                    position: clock.position,
                    speed: clock.speed,
                });
            }
        }
        Ok(())
    }

    pub fn tempo_map(
        &self,
        asset_id: &str,
        sample_rate: u32,
        frames: u64,
    ) -> Result<TempoMap, String> {
        if self.schema_version != 1
            || self.asset_id != asset_id
            || asset_id.is_empty()
            || !self.source_seconds.is_finite()
            || !(0.0..=1200.2).contains(&self.source_seconds)
            || self.source_seconds == 0.0
            || self.error.is_some()
            || sample_rate == 0
            || frames == 0
            || frames >= 1_u64 << 53
            || self.segments.is_empty()
            || self.segments.len() > MAX_EVENTS
            || self.segments[0].frame != 0
            || self.segments.iter().enumerate().any(|(i, s)| {
                s.frame >= frames
                    || (i > 0 && s.frame <= self.segments[i - 1].frame)
                    || !valid_clock(s.position, s.speed, self.source_seconds)
            })
        {
            return Err(TIMING_ERROR.into());
        }
        self.grid
            .validate(self.source_seconds)
            .map_err(|e| format!("{TIMING_ERROR} {e}"))?;
        let mut map = TempoMap {
            sample_rate,
            frames,
            time_sig: (self.grid.beats_per_bar as u8, 4),
            tempos: vec![],
            markers: vec![],
        };
        let beats = &self.grid.beats;
        let interval = |position: f64| {
            let i = beats
                .partition_point(|b| *b <= position)
                .saturating_sub(1)
                .min(beats.len() - 2);
            beats[i + 1] - beats[i]
        };
        let mut boundaries = 0;
        for (i, s) in self.segments.iter().enumerate() {
            let end_frame = self.segments.get(i + 1).map_or(frames, |s| s.frame);
            if s.speed == 0.0 {
                if map.tempos.is_empty() {
                    map.tempo(0, 60.0 / interval(s.position))?;
                }
                map.marker(s.frame, "Reference not playing")?;
                continue;
            }
            let end = s.position + (end_frame - s.frame) as f64 * s.speed / f64::from(sample_rate);
            if end > self.source_seconds + s.speed / f64::from(sample_rate) + 1e-6 {
                return Err(TIMING_ERROR.into());
            }
            map.tempo(s.frame, 60.0 / interval(s.position) * s.speed)?;
            if let Some(p) = self.grid.state(s.position, s.speed).position {
                if let Some(label) = p.section_label {
                    map.marker(s.frame, &label)?;
                }
            } else {
                map.marker(s.frame, "Outside confirmed grid (edge tempo)")?;
            }
            let start = beats.partition_point(|b| *b < s.position);
            let finish = beats.partition_point(|b| *b < end);
            boundaries += finish - start;
            if boundaries > MAX_EVENTS {
                return Err(TIMING_ERROR.into());
            }
            for (offset, &position) in beats[start..finish].iter().enumerate() {
                let b = start + offset;
                let frame = s.frame
                    + ((position - s.position) * f64::from(sample_rate) / s.speed).round() as u64;
                if frame >= end_frame {
                    continue;
                }
                map.tempo(frame, 60.0 / interval(position) * s.speed)?;
                for section in &self.grid.sections {
                    if (section.start_bar - 1) * self.grid.beats_per_bar == b {
                        map.marker(frame, &section.label)?;
                    }
                }
                if b == beats.len() - 1 {
                    map.marker(frame, "Outside confirmed grid (edge tempo)")?;
                }
            }
        }
        Ok(map)
    }
}

fn valid_clock(position: f64, speed: f64, seconds: f64) -> bool {
    position.is_finite()
        && (0.0..=seconds).contains(&position)
        && (speed == 0.0 || (0.5..=1.5).contains(&speed))
}

#[derive(Debug, Serialize)]
pub struct Tempo {
    pub frame: u64,
    pub bpm: f64,
}
#[derive(Debug, Serialize)]
pub struct Marker {
    pub frame: u64,
    pub name: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TempoMap {
    pub sample_rate: u32,
    pub frames: u64,
    pub time_sig: (u8, u8),
    pub tempos: Vec<Tempo>,
    pub markers: Vec<Marker>,
}

fn micros(bpm: f64) -> Result<u32, String> {
    let value = (60_000_000.0 / bpm).round();
    if !bpm.is_finite() || bpm <= 0.0 || !(1.0..=16_777_215.0).contains(&value) {
        return Err("Reference timing tempo cannot fit a MIDI tempo event.".into());
    }
    Ok(value as u32)
}

impl TempoMap {
    fn tempo(&mut self, frame: u64, bpm: f64) -> Result<(), String> {
        let bpm = (bpm * 1e9).round() / 1e9;
        micros(bpm)?;
        if let Some(last) = self.tempos.last_mut() {
            if (last.bpm - bpm).abs() < 1e-8 {
                return Ok(());
            }
            if last.frame == frame {
                last.bpm = bpm;
                return Ok(());
            }
        }
        self.tempos.push(Tempo { frame, bpm });
        self.check_size()
    }
    fn marker(&mut self, frame: u64, name: &str) -> Result<(), String> {
        if self
            .markers
            .last()
            .is_none_or(|m| m.frame != frame || m.name != name)
        {
            self.markers.push(Marker {
                frame,
                name: name.into(),
            });
        }
        self.check_size()
    }
    fn check_size(&self) -> Result<(), String> {
        if self.tempos.len() + self.markers.len() > MAX_EVENTS {
            Err(TIMING_ERROR.into())
        } else {
            Ok(())
        }
    }

    /// Correct each delta against encoded elapsed time, carrying sub-tick error forward.
    /// 9600 PPQ keeps timing quantisation below 1 ms even at the slowest SMF tempo.
    pub fn midi(&self) -> std::io::Result<Vec<u8>> {
        let mut events: Vec<(u64, Vec<u8>, Option<u32>)> = Vec::new();
        for t in &self.tempos {
            let us = micros(t.bpm).map_err(std::io::Error::other)?;
            let mut bytes = vec![0xff, 0x51, 3];
            bytes.extend_from_slice(&us.to_be_bytes()[1..]);
            events.push((t.frame, bytes, Some(us)));
        }
        for m in &self.markers {
            let mut bytes = vec![0xff, 6];
            write_var_len(&mut bytes, m.name.len() as u64)?;
            bytes.extend_from_slice(m.name.as_bytes());
            events.push((m.frame, bytes, None));
        }
        events.push((self.frames, vec![0xff, 0x2f, 0], None));
        events.sort_by_key(|e| e.0);
        let mut track = vec![0, 0xff, 0x58, 4, self.time_sig.0, 2, 24, 8];
        let (mut frame, mut elapsed, mut emitted, mut us) = (0, 0.0, 0, 500_000);
        for (next_frame, bytes, tempo) in events {
            let seconds = next_frame as f64 / f64::from(self.sample_rate);
            let delta = if next_frame == frame {
                0.0
            } else {
                ((seconds - elapsed) * 9_600_000_000.0 / f64::from(us))
                    .round()
                    .max(0.0)
            };
            if !delta.is_finite() || emitted as f64 + delta >= (1_u64 << 53) as f64 {
                return Err(std::io::Error::other(TIMING_ERROR));
            }
            write_var_len(&mut track, delta as u64)?;
            track.extend(bytes);
            elapsed += delta * f64::from(us) / 9_600_000_000.0;
            frame = next_frame;
            emitted += delta as u64;
            if let Some(tempo) = tempo {
                us = tempo;
            }
        }
        let mut midi = b"MThd".to_vec();
        midi.extend_from_slice(&[0, 0, 0, 6, 0, 1, 0, 1]);
        midi.extend_from_slice(&9600u16.to_be_bytes());
        midi.extend_from_slice(b"MTrk");
        midi.extend_from_slice(&(track.len() as u32).to_be_bytes());
        midi.extend(track);
        Ok(midi)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> ReferenceTiming {
        serde_json::from_str(include_str!(
            "../../../tests/invariants/reference-timing.json"
        ))
        .unwrap()
    }

    // Reparse SMF bytes, measuring wall time with the actual encoded tempo events.
    fn midi_events(bytes: &[u8]) -> Vec<(u8, f64, Vec<u8>)> {
        fn vlq(bytes: &[u8], i: &mut usize) -> u64 {
            let mut value = 0;
            loop {
                let byte = bytes[*i];
                *i += 1;
                value = value * 128 + u64::from(byte & 127);
                if byte & 128 == 0 {
                    return value;
                }
            }
        }
        assert_eq!(&bytes[..4], b"MThd");
        let ppq = u16::from_be_bytes([bytes[12], bytes[13]]) as f64;
        let (mut i, mut seconds, mut us) = (22, 0.0, 500_000.0);
        let mut events = vec![];
        while i < bytes.len() {
            seconds += vlq(bytes, &mut i) as f64 / ppq * us / 1e6;
            assert_eq!(bytes[i], 0xff);
            i += 1;
            let kind = bytes[i];
            i += 1;
            let size = vlq(bytes, &mut i) as usize;
            let data = bytes[i..i + size].to_vec();
            i += size;
            if kind == 0x51 {
                us = u32::from_be_bytes([0, data[0], data[1], data[2]]) as f64;
            }
            events.push((kind, seconds, data));
        }
        events
    }

    #[test]
    fn recorded_ramp_midi_and_five_minute_loops_stay_within_one_millisecond() {
        let mut trace = fixture();
        let original = trace.segments.clone();
        for repetition in 1..25 {
            trace.segments.extend(original.iter().cloned().map(|mut s| {
                s.frame += repetition * 576_000;
                s
            }));
        }
        let map = trace
            .tempo_map("fixture-source", 48_000, 300 * 48_000)
            .unwrap();
        assert_eq!(
            map.tempos.iter().take(4).map(|t| t.bpm).collect::<Vec<_>>(),
            [50.0, 75.0, 100.0, 125.0]
        );
        let events = midi_events(&map.midi().unwrap());
        for ((_, seconds, _), tempo) in events.iter().filter(|e| e.0 == 0x51).zip(&map.tempos) {
            assert!((seconds - tempo.frame as f64 / 48_000.0).abs() < 0.001);
        }
        let markers: Vec<_> = events.iter().filter(|e| e.0 == 6).collect();
        assert_eq!(markers.len(), map.markers.len());
        for ((_, seconds, name), marker) in markers.into_iter().zip(&map.markers) {
            assert!((seconds - marker.frame as f64 / 48_000.0).abs() < 0.001);
            assert_eq!(name, marker.name.as_bytes());
        }
        assert!((events.last().unwrap().1 - 300.0).abs() < 0.001);
        // Noninteger beat intervals force both microsecond and tick rounding.
        trace.grid.beats[5] = 2.81321;
        trace.grid.beats[6] = 3.39765;
        trace.grid.beats[7] = 4.037;
        let map = trace
            .tempo_map("fixture-source", 48_000, 300 * 48_000)
            .unwrap();
        let events = midi_events(&map.midi().unwrap());
        for ((_, seconds, _), tempo) in events.iter().filter(|e| e.0 == 0x51).zip(&map.tempos) {
            assert!((seconds - tempo.frame as f64 / 48_000.0).abs() < 0.001);
        }
        assert!((events.last().unwrap().1 - 300.0).abs() < 0.001);
    }

    #[test]
    fn partial_starts_silence_and_edge_tempos_keep_recorded_positions() {
        let mut trace = fixture();
        trace.segments = vec![
            Segment {
                frame: 0,
                position: 0.0,
                speed: 0.0,
            },
            Segment {
                frame: 48_000,
                position: 0.0,
                speed: 1.0,
            },
            Segment {
                frame: 288_000,
                position: 5.0,
                speed: 0.0,
            },
        ];
        let map = trace.tempo_map("fixture-source", 48_000, 336_000).unwrap();
        assert!(map
            .markers
            .iter()
            .any(|m| m.frame == 57_600 && m.name == "Verse"));
        assert!(map
            .markers
            .iter()
            .any(|m| m.frame == 153_600 && m.name == "Chorus"));
        assert!(map
            .markers
            .iter()
            .any(|m| m.frame == 268_800 && m.name.starts_with("Outside")));
        assert!(map.markers.last().unwrap().name.contains("not playing"));
        trace.segments = vec![Segment {
            frame: 0,
            position: 2.5,
            speed: 1.0,
        }];
        let map = trace.tempo_map("fixture-source", 48_000, 48_000).unwrap();
        assert_eq!(map.markers[0].name, "Chorus");
        assert_eq!(map.markers[0].frame, 0);
        assert_eq!(map.tempos[0].bpm, 100.0);
    }

    #[test]
    fn invalid_or_incomplete_timing_is_never_exported_as_constant_tempo() {
        for kind in 0..9 {
            let mut t = fixture();
            match kind {
                0 => t.schema_version = 2,
                1 => t.error = Some("capture interrupted".into()),
                2 => t.segments[0].frame = 1,
                3 => t.segments[1].frame = 0,
                4 => t.segments[1].position = f64::NAN,
                5 => t.segments[0].speed = -1.0,
                6 => t.grid.beats[1] = t.grid.beats[0],
                7 => t.asset_id = "other".into(),
                _ => t.segments[0].position = 4.9,
            }
            assert!(
                t.tempo_map("fixture-source", 48_000, 576_000).is_err(),
                "case {kind}"
            );
        }
        assert!(fixture().tempo_map("fixture-source", 0, 576_000).is_err());
        assert!(fixture().tempo_map("fixture-source", 48_000, 0).is_err());
        // Very short confirmed beats exceed the UI's constant-tempo range, but fit SMF.
        let mut t = fixture();
        t.grid.beats = (0..9).map(|i| i as f64 * 0.125).collect();
        t.segments = vec![Segment {
            frame: 0,
            position: 0.0,
            speed: 1.5,
        }];
        assert_eq!(
            t.tempo_map("fixture-source", 48_000, 32_000)
                .unwrap()
                .tempos[0]
                .bpm,
            720.0
        );
        t.segments = vec![
            Segment {
                frame: 0,
                position: 0.0,
                speed: 0.0
            };
            MAX_EVENTS
        ];
        let error = t
            .capture(
                1,
                &[Clock {
                    position: 0.1,
                    speed: 1.0,
                }],
                48_000,
            )
            .unwrap_err();
        assert!(error.contains("capacity"));
        assert!(t.error.is_some());
    }
}
