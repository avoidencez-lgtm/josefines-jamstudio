//! Offline monophonic sketches. This does not transcribe chords or regenerate audio.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MelodyNote {
    pub midi: u8,
    pub start_seconds: f64,
    pub duration_seconds: f64,
    pub confidence: f32,
}

pub fn extract(samples: &[f32], rate: u32) -> Vec<MelodyNote> {
    const WINDOW: usize = 2048;
    const HOP: usize = 512;
    if rate == 0 || samples.len() < WINDOW {
        return vec![];
    }
    let mut tracker = jam_dsp::pitch::PitchTracker::new(WINDOW, rate);
    let mut notes: Vec<MelodyNote> = Vec::new();
    let hop_seconds = HOP as f64 / rate as f64;
    for start in (0..=samples.len() - WINDOW).step_by(HOP) {
        if samples[start..start + WINDOW]
            .iter()
            .any(|n| !n.is_finite())
        {
            continue;
        }
        let Some(pitch) = tracker.detect(&samples[start..start + WINDOW]) else {
            continue;
        };
        if pitch.confidence < 0.85 || !(70.0..=1400.0).contains(&pitch.hz) {
            continue;
        }
        let midi = (69.0 + 12.0 * (pitch.hz / 440.0).log2()).round() as u8;
        let seconds = start as f64 / rate as f64;
        if let Some(previous) = notes.last_mut() {
            if previous.midi == midi
                && seconds - (previous.start_seconds + previous.duration_seconds)
                    < hop_seconds * 1.5
            {
                previous.duration_seconds = seconds + hop_seconds - previous.start_seconds;
                previous.confidence = previous.confidence.min(pitch.confidence);
                continue;
            }
        }
        notes.push(MelodyNote {
            midi,
            start_seconds: seconds,
            duration_seconds: hop_seconds,
            confidence: pitch.confidence,
        });
    }
    // ponytail: sustained-note sketch, not attack detection; repeated same-pitch attacks can merge.
    notes.retain(|n| n.duration_seconds >= 0.08);
    notes
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sketch_preserves_pitch_order_and_timing_and_ignores_silence() {
        let rate = 48_000;
        let mut signal = Vec::new();
        for hz in [440.0, 0.0, 523.251] {
            signal.extend(
                (0..rate / 2).map(|i| {
                    0.4 * (2.0 * std::f32::consts::PI * hz * i as f32 / rate as f32).sin()
                }),
            );
        }
        let notes = extract(&signal, rate);
        assert_eq!(
            notes.iter().map(|n| n.midi).collect::<Vec<_>>(),
            vec![69, 72]
        );
        assert!(notes[0].start_seconds < 0.05);
        assert!((notes[1].start_seconds - 1.0).abs() < 0.06);
        assert!(notes
            .iter()
            .all(|n| (n.duration_seconds - 0.5).abs() < 0.08));
        assert!(extract(&vec![0.0; rate as usize], rate).is_empty());
    }
}
