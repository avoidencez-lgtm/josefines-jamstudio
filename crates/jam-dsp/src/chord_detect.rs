//! chord_detect: Chromagram calculation and harmonic chord estimation.
//! Extracts chord symbols from audio blocks for automatic chord timelines.

pub struct ChordDetector {
    sample_rate: u32,
}

impl ChordDetector {
    pub fn new(sample_rate: u32) -> Self {
        Self { sample_rate }
    }

    /// Detect the most prominent chord in an audio segment.
    pub fn detect_chord(&self, samples: &[f32]) -> String {
        if samples.len() < 512 {
            return "C".into();
        }

        let chroma = self.compute_chroma(samples);

        // Standard root note names
        let note_names = [
            "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
        ];

        // Chord templates relative to root (0):
        // Major: [root, major 3rd (4), 5th (7)]
        // Minor: [root, minor 3rd (3), 5th (7)]
        // Dom7:  [root, major 3rd (4), 5th (7), minor 7th (10)]
        let templates = [
            ("maj", vec![0, 4, 7]),
            ("m", vec![0, 3, 7]),
            ("7", vec![0, 4, 7, 10]),
        ];

        let mut best_score = -1.0f32;
        let mut best_chord = "A".to_string();

        for (root, &note_name) in note_names.iter().enumerate() {
            for &(suffix, ref intervals) in &templates {
                let mut score = 0.0f32;
                for &interval in intervals {
                    let pitch_class = (root + interval) % 12;
                    score += chroma[pitch_class];
                }

                if score > best_score {
                    best_score = score;
                    let chord_label = if suffix == "maj" {
                        note_name.to_string()
                    } else {
                        format!("{}{}", note_name, suffix)
                    };
                    best_chord = chord_label;
                }
            }
        }

        best_chord
    }

    /// Computes 12-bin chromagram using Goertzel / discrete frequency bins across 2 octaves (A2 to A4).
    fn compute_chroma(&self, samples: &[f32]) -> [f32; 12] {
        let mut chroma = [0.0f32; 12];
        let sr = self.sample_rate as f32;

        // Base frequencies for octave 3 (C3=130.81 Hz to B3=246.94 Hz)
        let base_freqs = [
            130.81, 138.59, 146.83, 155.56, 164.81, 174.61, 185.00, 196.00, 207.65, 220.00, 233.08,
            246.94,
        ];

        for (pc, &freq) in base_freqs.iter().enumerate() {
            // Check octave 3 and octave 4
            let energy_oct3 = goertzel_energy(samples, freq, sr);
            let energy_oct4 = goertzel_energy(samples, freq * 2.0, sr);
            chroma[pc] = energy_oct3 + energy_oct4;
        }

        // Normalize
        let max_val = chroma.iter().cloned().fold(0.0f32, f32::max);
        if max_val > 1e-6 {
            for v in chroma.iter_mut() {
                *v /= max_val;
            }
        }

        chroma
    }
}

fn goertzel_energy(samples: &[f32], target_freq: f32, sample_rate: f32) -> f32 {
    let k = (0.5 + (samples.len() as f32 * target_freq / sample_rate)).floor();
    let omega = (2.0 * std::f32::consts::PI * k) / samples.len() as f32;
    let coeff = 2.0 * omega.cos();

    let mut q0;
    let mut q1 = 0.0f32;
    let mut q2 = 0.0f32;

    for &s in samples {
        q0 = coeff * q1 - q2 + s;
        q2 = q1;
        q1 = q0;
    }

    (q1 * q1 + q2 * q2 - q1 * q2 * coeff).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chord_detector_synthetic_major_chord() {
        let sample_rate = 48_000;
        let detector = ChordDetector::new(sample_rate);

        // Generate 0.5s of A major triad: A3 (220 Hz), C#4 (277.18 Hz), E4 (329.63 Hz)
        let num_samples = 24_000;
        let mut triad = vec![0.0f32; num_samples];
        for (i, sample) in triad.iter_mut().enumerate() {
            let t = i as f32 / sample_rate as f32;
            let a = (2.0 * std::f32::consts::PI * 220.0 * t).sin();
            let c_sharp = (2.0 * std::f32::consts::PI * 277.18 * t).sin();
            let e = (2.0 * std::f32::consts::PI * 329.63 * t).sin();
            *sample = (a + c_sharp + e) / 3.0;
        }

        let detected = detector.detect_chord(&triad);
        assert!(
            detected.starts_with('A'),
            "Expected detected chord to start with A, got: {}",
            detected
        );
    }
}
