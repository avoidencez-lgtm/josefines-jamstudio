//! timeline: Pure timeline conversion math between samples, beats, bars and time.

use serde::{Deserialize, Serialize};

pub const SAMPLE_RATE: u32 = 48_000;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TempoPoint {
    pub bpm: f64,
    pub time_signature: (u8, u8),
}

impl Default for TempoPoint {
    fn default() -> Self {
        Self {
            bpm: 120.0,
            time_signature: (4, 4),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
pub struct Position {
    pub samples: u64,
    pub beats: f64,
    pub bar: u32,
    pub beat: u32,
}

pub fn beats_to_samples(beats: f64, bpm: f64, sample_rate: u32) -> u64 {
    if bpm <= 0.0 {
        return 0;
    }
    let seconds = (beats * 60.0) / bpm;
    (seconds * sample_rate as f64).round() as u64
}

pub fn samples_to_beats(samples: u64, bpm: f64, sample_rate: u32) -> f64 {
    if sample_rate == 0 || bpm <= 0.0 {
        return 0.0;
    }
    let seconds = samples as f64 / sample_rate as f64;
    (seconds * bpm) / 60.0
}

pub fn bar_beat_at(beats: f64, time_sig: (u8, u8)) -> (u32, u32) {
    let beats_per_bar = time_sig.0 as f64;
    let total_beats = beats.max(0.0);
    let bar = (total_beats / beats_per_bar).floor() as u32 + 1;
    let beat = (total_beats % beats_per_bar).floor() as u32 + 1;
    (bar, beat)
}

pub fn next_bar_boundary(samples: u64, bpm: f64, time_sig: (u8, u8), sample_rate: u32) -> u64 {
    let current_beats = samples_to_beats(samples, bpm, sample_rate);
    let beats_per_bar = time_sig.0 as f64;
    let current_bar = (current_beats / beats_per_bar).floor();
    let next_bar_beats = (current_bar + 1.0) * beats_per_bar;
    beats_to_samples(next_bar_beats, bpm, sample_rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_beats_samples_roundtrip() {
        let bpm = 120.0;
        let rate = 48_000;
        let beats = 4.0;
        let samples = beats_to_samples(beats, bpm, rate);
        assert_eq!(samples, 96_000); // 4 beats @ 120 bpm = 2.0s = 96,000 samples
        let calc_beats = samples_to_beats(samples, bpm, rate);
        assert!((calc_beats - beats).abs() < 1e-6);
    }

    #[test]
    fn test_bar_beat_calculation() {
        assert_eq!(bar_beat_at(0.0, (4, 4)), (1, 1));
        assert_eq!(bar_beat_at(3.5, (4, 4)), (1, 4));
        assert_eq!(bar_beat_at(4.0, (4, 4)), (2, 1));
        assert_eq!(bar_beat_at(7.9, (4, 4)), (2, 4));
    }

    #[test]
    fn test_next_bar_boundary() {
        let bpm = 120.0;
        let rate = 48_000;
        let boundary = next_bar_boundary(1000, bpm, (4, 4), rate);
        assert_eq!(boundary, 96_000);
    }
}
