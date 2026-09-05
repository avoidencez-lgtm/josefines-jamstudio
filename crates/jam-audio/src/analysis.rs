//! analysis: Audio take analysis for timing, dynamics, and pitch accuracy.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TakeAnalysis {
    pub timing_accuracy_pct: f32,
    pub dynamic_consistency_pct: f32,
    pub intonation_accuracy_pct: f32,
    pub detected_transients: usize,
    pub summary: String,
}

pub struct TakeAnalyzer {
    sample_rate: u32,
}

impl TakeAnalyzer {
    pub fn new(sample_rate: u32) -> Self {
        Self { sample_rate }
    }

    /// Analyze guitar DI audio against target tempo for timing, dynamics, and intonation.
    pub fn analyze(&self, di_samples: &[f32], tempo: f64) -> TakeAnalysis {
        if di_samples.is_empty() {
            return TakeAnalysis {
                timing_accuracy_pct: 100.0,
                dynamic_consistency_pct: 100.0,
                intonation_accuracy_pct: 100.0,
                detected_transients: 0,
                summary: "No audio data recorded in take.".into(),
            };
        }

        // 1. Attack candidates separated by a quiet interval.
        let transients = self.transients(di_samples);

        // 2. Timing accuracy: offset from beat grid
        let beat_samples = self.sample_rate as f64 * 60.0 / tempo.max(40.0);
        let mut timing_errors = Vec::new();

        for &(idx, _) in &transients {
            let beat_pos = (idx as f64) % beat_samples;
            let offset = if beat_pos > beat_samples * 0.5 {
                beat_samples - beat_pos
            } else {
                beat_pos
            };
            let norm_err = (offset / (beat_samples * 0.5)).min(1.0);
            timing_errors.push(norm_err);
        }

        let avg_timing_err = if timing_errors.is_empty() {
            0.1
        } else {
            timing_errors.iter().sum::<f64>() / timing_errors.len() as f64
        };
        let timing_score = ((1.0 - avg_timing_err * 0.5) * 100.0).clamp(65.0, 99.0) as f32;

        // 3. Dynamic consistency: RMS variance across transients
        let dynamic_score = if transients.len() > 2 {
            let amps: Vec<f32> = transients.iter().map(|&(_, a)| a).collect();
            let mean = amps.iter().sum::<f32>() / amps.len() as f32;
            let variance =
                amps.iter().map(|&a| (a - mean).powi(2)).sum::<f32>() / amps.len() as f32;
            let std_dev = variance.sqrt();
            let coef_var = (std_dev / mean.max(0.01)).min(1.0);
            ((1.0 - coef_var * 0.4) * 100.0).clamp(70.0, 98.0)
        } else {
            92.0
        };

        // 4. Intonation: how far confident, pitched frames sit from the nearest semitone.
        let intonation = self.intonation(di_samples);
        let intonation_score = intonation
            .map(|(mean_cents, _)| ((1.0 - (mean_cents / 50.0).min(1.0)) * 100.0).round())
            .unwrap_or(0.0);

        let intonation_text = match intonation {
            Some((cents, frames)) => format!(
                " Pitch sat {cents:.0} cents from the nearest note on average across {frames} pitched frames."
            ),
            None => " No sustained pitched notes were found to judge intonation.".to_string(),
        };
        let summary = format!(
            "Recorded {} pick transients. Timing locked at {:.1}%, dynamics consistency at {:.1}%.{}",
            transients.len(),
            timing_score,
            dynamic_score,
            intonation_text
        );

        TakeAnalysis {
            timing_accuracy_pct: (timing_score * 10.0).round() / 10.0,
            dynamic_consistency_pct: (dynamic_score * 10.0).round() / 10.0,
            intonation_accuracy_pct: intonation_score,
            detected_transients: transients.len(),
            summary,
        }
    }

    fn transients(&self, samples: &[f32]) -> Vec<(usize, f32)> {
        let mut attacks = Vec::new();
        let mut armed = true;
        let mut quiet = 0;
        // A zero crossing is not a new pick. Require 5 ms continuously below
        // half the attack threshold before rearming; allow attacks 20 ms apart.
        // ponytail: this gate misses legato/re-picks without a quiet gap; use an
        // envelope/spectral onset detector if those performances need analysis.
        let release = (self.sample_rate as usize / 200).max(1);
        let min_gap = (self.sample_rate as usize / 50).max(1);
        let mut last = 0;
        for (i, &sample) in samples.iter().enumerate() {
            let amp = sample.abs();
            quiet = if amp < 0.025 { quiet + 1 } else { 0 };
            if quiet >= release {
                armed = true;
            }
            if armed && amp > 0.05 && (attacks.is_empty() || i - last >= min_gap) {
                attacks.push((i, amp));
                armed = false;
                last = i;
            }
        }
        attacks
    }

    /// Mean absolute cents deviation and the number of frames it was measured on, or
    /// `None` when nothing pitched and confident was found (silence, noise, chords).
    fn intonation(&self, samples: &[f32]) -> Option<(f32, usize)> {
        const WINDOW: usize = 2048;
        let hop = WINDOW / 2;
        if samples.len() < WINDOW {
            return None;
        }
        let mut tracker = jam_dsp::pitch::PitchTracker::new(WINDOW, self.sample_rate);
        let mut total_cents = 0.0f32;
        let mut frames = 0usize;
        let mut start = 0;
        while start + WINDOW <= samples.len() {
            if let Some(p) = tracker.detect(&samples[start..start + WINDOW]) {
                if p.confidence >= 0.8 && p.hz >= 70.0 && p.hz <= 1400.0 {
                    total_cents += p.cents.abs();
                    frames += 1;
                }
            }
            start += hop;
        }
        (frames > 0).then(|| (total_cents / frames as f32, frames))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_take_analyzer_detects_transients_and_scores() {
        let analyzer = TakeAnalyzer::new(48_000);
        let tempo = 120.0;
        let mut samples = vec![0.0f32; 48_000 * 2]; // 2 seconds

        // Add 4 quarter-note pulses
        let beat_len = 24_000;
        for b in 0..4 {
            let start = b * beat_len;
            for i in 0..100 {
                if start + i < samples.len() {
                    samples[start + i] = 0.8;
                }
            }
        }

        let analysis = analyzer.analyze(&samples, tempo);
        assert_eq!(analysis.detected_transients, 4);
        assert!(analysis.timing_accuracy_pct >= 80.0);
        assert!(analysis.dynamic_consistency_pct >= 80.0);
        // Square pulses are not pitched notes: intonation must say so instead of inventing a score.
        assert_eq!(analysis.intonation_accuracy_pct, 0.0);
        assert!(analysis.summary.contains("No sustained pitched notes"));
    }

    fn tone(hz: f32, secs: f32, rate: u32) -> Vec<f32> {
        (0..(secs * rate as f32) as usize)
            .map(|i| 0.5 * (2.0 * std::f32::consts::PI * hz * i as f32 / rate as f32).sin())
            .collect()
    }

    #[test]
    fn a_sustained_note_is_one_attack_not_repeated_zero_crossings() {
        let analyzer = TakeAnalyzer::new(48_000);
        for hz in [70.0, 220.0, 440.0, 1400.0] {
            let result = analyzer.analyze(&tone(hz, 1.0, 48_000), 120.0);
            assert_eq!(result.detected_transients, 1, "{hz} Hz: {}", result.summary);
        }
    }

    #[test]
    fn separated_fast_notes_keep_attack_times_within_two_ms() {
        for rate in [44_100, 48_000, 96_000] {
            let analyzer = TakeAnalyzer::new(rate);
            let mut samples = Vec::new();
            let mut expected = Vec::new();
            // 20 notes/second, faster than the old 80 ms dead time allowed.
            for _ in 0..8 {
                expected.push(samples.len());
                samples.extend(tone(220.0, 0.035, rate));
                samples.extend(vec![0.0; (rate as f32 * 0.015) as usize]);
            }
            let attacks = analyzer.transients(&samples);
            assert_eq!(attacks.len(), expected.len());
            for ((actual, _), start) in attacks.iter().zip(expected) {
                assert!(actual.abs_diff(start) <= rate as usize / 500);
            }
            assert!(analyzer.transients(&vec![0.0; rate as usize]).is_empty());
        }
    }

    #[test]
    fn in_tune_note_scores_high_and_sharp_note_scores_low() {
        let analyzer = TakeAnalyzer::new(48_000);
        let in_tune = analyzer.analyze(&tone(220.0, 1.0, 48_000), 120.0);
        assert!(
            in_tune.intonation_accuracy_pct >= 90.0,
            "{}",
            in_tune.summary
        );

        // A quarter-tone sharp (50 cents) is as far out as it gets.
        let sharp_hz = 220.0 * 2f32.powf(50.0 / 1200.0);
        let sharp = analyzer.analyze(&tone(sharp_hz, 1.0, 48_000), 120.0);
        assert!(sharp.intonation_accuracy_pct <= 15.0, "{}", sharp.summary);
    }
}
