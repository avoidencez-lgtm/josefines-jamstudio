//! pitch: McLeod pitch detection method and musical note estimation for tuner.

use pitch_detection::detector::mcleod::McLeodDetector;
use pitch_detection::detector::PitchDetector;

const NOTE_NAMES: [&str; 12] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

#[derive(Debug, Clone, PartialEq)]
pub struct PitchResult {
    pub hz: f32,
    pub note: String,
    pub cents: f32,
    pub confidence: f32,
}

pub struct PitchTracker {
    detector: McLeodDetector<f32>,
    window_size: usize,
    sample_rate: u32,
}

impl PitchTracker {
    pub fn new(window_size: usize, sample_rate: u32) -> Self {
        Self {
            detector: McLeodDetector::new(window_size, window_size / 2),
            window_size,
            sample_rate,
        }
    }

    pub fn detect(&mut self, samples: &[f32]) -> Option<PitchResult> {
        if samples.len() < self.window_size {
            return None;
        }

        // Window the latest samples
        let window = &samples[samples.len() - self.window_size..];

        // Power and clarity thresholds
        let pitch = self
            .detector
            .get_pitch(window, self.sample_rate as usize, 5.0, 0.7)?;

        let hz = pitch.frequency;
        let confidence = pitch.clarity;

        if hz <= 20.0 || hz >= 5000.0 {
            return None;
        }

        // MIDI note calculation: A4 = 440 Hz = MIDI 69
        let midi_exact = 69.0 + 12.0 * (hz / 440.0).log2();
        let midi_rounded = midi_exact.round() as i32;
        let cents = (midi_exact - midi_rounded as f32) * 100.0;

        let note_idx = (midi_rounded.rem_euclid(12)) as usize;
        let octave = (midi_rounded / 12) - 1;
        let note = format!("{}{}", NOTE_NAMES[note_idx], octave);

        Some(PitchResult {
            hz,
            note,
            cents,
            confidence,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_sine_440() {
        let sample_rate = 48000;
        let freq = 440.0;
        let window_size = 2048;
        let mut tracker = PitchTracker::new(window_size, sample_rate);

        let mut samples = Vec::with_capacity(window_size);
        for i in 0..window_size {
            let t = i as f32 / sample_rate as f32;
            samples.push((2.0 * std::f32::consts::PI * freq * t).sin());
        }

        let res = tracker.detect(&samples).expect("Expected pitch detected");
        assert!((res.hz - 440.0).abs() < 1.0);
        assert_eq!(res.note, "A4");
        assert!(res.cents.abs() < 5.0);
        assert!(res.confidence > 0.85);
    }

    #[test]
    fn test_detect_guitar_low_e() {
        // E2 is 82.41 Hz
        let sample_rate = 48000;
        let freq = 82.4069;
        let window_size = 2048;
        let mut tracker = PitchTracker::new(window_size, sample_rate);

        let mut samples = Vec::with_capacity(window_size);
        for i in 0..window_size {
            let t = i as f32 / sample_rate as f32;
            samples.push((2.0 * std::f32::consts::PI * freq * t).sin());
        }

        let res = tracker.detect(&samples).expect("Expected pitch detected");
        assert!((res.hz - 82.41).abs() < 1.0);
        assert_eq!(res.note, "E2");
        assert!(res.cents.abs() < 5.0);
    }
}
