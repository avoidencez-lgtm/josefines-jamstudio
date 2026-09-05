//! pitch: McLeod pitch detection method and musical note estimation for tuner.

use pitch_estimate::{McLeodDetector, PitchDetector};

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
            detector: McLeodDetector::new(window_size, window_size / 2)
                .expect("supported pitch window")
                // The previous gate was total energy 5; this API uses mean square.
                .with_power_threshold(5.0 / window_size as f32)
                .with_clarity_threshold(0.7),
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

        let pitch = self.detector.detect(window, self.sample_rate)?;

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
    fn invalid_or_unpitched_frames_do_not_poison_the_next_detection() {
        let mut tracker = PitchTracker::new(2048, 48_000);
        for samples in [
            vec![],
            vec![0.0; 100],
            vec![0.0; 2048],
            vec![0.2; 2048],
            vec![f32::NAN; 2048],
            vec![f32::INFINITY; 2048],
            vec![f32::MAX; 2048],
        ] {
            assert!(tracker.detect(&samples).is_none());
        }
        let good: Vec<f32> = (0..2048)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48_000.0).sin())
            .collect();
        let quiet: Vec<f32> = good.iter().map(|x| x * 0.0001).collect();
        assert!(tracker.detect(&quiet).is_none());
        assert!(PitchTracker::new(2048, 0).detect(&good).is_none());
        assert!((tracker.detect(&good).unwrap().hz - 440.0).abs() < 0.1);
    }

    #[test]
    fn guitar_range_pitch_errors_stay_within_three_cents() {
        let mut worst = 0.0f32;
        for rate in [44_100, 48_000] {
            let mut tracker = PitchTracker::new(2048, rate);
            for hz in [
                82.4069f32, 110.0, 146.8324, 196.0, 220.0, 329.6276, 440.0, 659.2551, 1318.51,
            ] {
                for detune in [-35.0f32, 0.0, 35.0] {
                    let target = hz * 2f32.powf(detune / 1200.0);
                    for phase in [0.0f32, 0.8, 2.4] {
                        for amplitude in [0.1f32, 0.5] {
                            for harmonic in [0.0f32, 0.3] {
                                let samples: Vec<f32> = (0..2048)
                                    .map(|i| {
                                        let p = 2.0 * std::f32::consts::PI * target * i as f32
                                            / rate as f32
                                            + phase;
                                        amplitude * (p.sin() + harmonic * (2.0 * p).sin())
                                    })
                                    .collect();
                                let pitch = tracker
                                    .detect(&samples)
                                    .expect("pitched guitar-range signal");
                                let error = (1200.0 * (pitch.hz / target).log2()).abs();
                                worst = worst.max(error);
                                assert!(error <= 3.0, "{target} Hz at {rate}, phase {phase}, amplitude {amplitude}, harmonic {harmonic}: {error} cents");
                                assert!((0.0..=1.0).contains(&pitch.confidence));
                            }
                        }
                    }
                }
            }
        }
        eprintln!("worst synthetic guitar-range error: {worst:.4} cents");
    }

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
