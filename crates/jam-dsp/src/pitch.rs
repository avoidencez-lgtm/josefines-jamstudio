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
            // Cover ~30 Hz (bass / 8-string / drop tunings). McLeod k=0.9
            // rejects octave-down doubling instead of clipping the lag search.
            detector: McLeodDetector::new(
                window_size,
                (sample_rate as usize / 30)
                    .min(window_size.saturating_sub(1))
                    .clamp(1, window_size),
            )
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
    fn sweep_55_to_1319_with_noise_stays_within_cents() {
        // ARCHITECTURE §9.1: 55–1319 Hz sine +40 dB SNR, 2048-frame window.
        const RATE: u32 = 48_000;
        const WIN: usize = 2048;
        const F0: f64 = 55.0;
        const F1: f64 = 1319.0;
        // Slow log sweep so a 2048-frame window is nearly stationary (~8 cents at 55 Hz).
        let n = RATE as usize * 16;
        let amp = 0.5f32;
        let noise_rms = (amp / std::f32::consts::SQRT_2) / 100.0; // +40 dB SNR
        let mut phase = 0.0f64;
        let mut rng = 0xC0FFEE_u64;
        let samples: Vec<f32> = (0..n)
            .map(|i| {
                let t = i as f64 / (n - 1) as f64;
                let hz = F0 * (F1 / F0).powf(t);
                phase += std::f64::consts::TAU * hz / f64::from(RATE);
                rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1);
                let u = (rng >> 33) as f32 / (1u32 << 31) as f32;
                let noise = (u * 2.0 - 1.0) * noise_rms * 3.0f32.sqrt();
                amp * phase.sin() as f32 + noise
            })
            .collect();

        let mut tracker = PitchTracker::new(WIN, RATE);
        let mut errors = Vec::new();
        for start in (0..n - WIN).step_by(WIN / 2) {
            let mid = start + WIN / 2;
            let t = mid as f64 / (n - 1) as f64;
            let target = F0 * (F1 / F0).powf(t);
            let pitch = tracker
                .detect(&samples[start..start + WIN])
                .unwrap_or_else(|| panic!("no pitch at {target:.1} Hz"));
            let octaves = (f64::from(pitch.hz) / target).log2();
            assert!(
                octaves.abs() < 0.5,
                "octave error at {target:.1} Hz: got {} Hz",
                pitch.hz
            );
            let cents = 1200.0 * octaves.abs();
            assert!(
                cents <= 25.0,
                "max {cents:.1} cents at {target:.1} Hz, got {} Hz",
                pitch.hz
            );
            errors.push(cents);
        }
        errors.sort_by(|a, b| a.total_cmp(b));
        let median = errors[errors.len() / 2];
        assert!(median <= 10.0, "median {median:.1} cents");
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

    #[test]
    fn drop_tuning_and_bass_fundamentals_are_detected_within_ten_cents() {
        // tau_max of sr/55 truncated NSDF lobes below ~53 Hz. Search down to
        // 30 Hz (window 2048 @ 48 kHz) and keep McLeod k=0.9. Tolerance: 10 cents.
        let sample_rate = 48_000;
        let window_size = 2048;
        for freq in [41.2034f32, 46.2493, 48.9994, 51.9131] {
            let mut tracker = PitchTracker::new(window_size, sample_rate);
            let samples: Vec<f32> = (0..window_size)
                .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sample_rate as f32).sin())
                .collect();
            let res = tracker
                .detect(&samples)
                .unwrap_or_else(|| panic!("expected pitch at {freq} Hz"));
            let cents = 1200.0 * (res.hz / freq).log2().abs();
            assert!(
                cents <= 10.0,
                "{freq} Hz: got {} Hz ({cents} cents)",
                res.hz
            );
            assert!(
                (res.hz / freq).log2().abs() < 0.5,
                "{freq} Hz octave error: got {} Hz",
                res.hz
            );
        }
    }
}
