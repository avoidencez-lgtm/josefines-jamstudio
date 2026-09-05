//! analysis: Audio take analysis for timing, dynamics, and pitch accuracy.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TakeAnalysis {
    /// Legacy normalized summaries; zero also represents unavailable evidence.
    /// Prefer the measurements and their explicit availability below.
    pub timing_accuracy_pct: f32,
    pub dynamic_consistency_pct: f32,
    pub intonation_accuracy_pct: f32,
    pub detected_transients: usize,
    pub summary: String,
    pub mean_grid_distance_ms: Option<f32>,
    pub grid_bias_ms: Option<f32>,
    pub grid_spread_ms: Option<f32>,
    pub attack_level_cv_pct: Option<f32>,
    pub pitched_frames: usize,
    pub mean_abs_cents: Option<f32>,
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
        // 1. Attack candidates separated by a quiet interval.
        let transients = self.transients(di_samples);

        // 2. Distance to the nearest quarter-note grid, not musical correctness.
        // Positive offsets are late, negative offsets early; exact half beats tie late.
        let timing =
            (transients.len() >= 2 && tempo.is_finite() && tempo > 0.0 && self.sample_rate > 0)
                .then(|| {
                    let beat_samples = self.sample_rate as f64 * 60.0 / tempo;
                    let offsets: Vec<f64> = transients
                        .iter()
                        .map(|(idx, _)| {
                            let phase = *idx as f64 % beat_samples;
                            let offset = if phase > beat_samples / 2.0 {
                                phase - beat_samples
                            } else {
                                phase
                            };
                            offset * 1000.0 / self.sample_rate as f64
                        })
                        .collect();
                    let mean = offsets.iter().sum::<f64>() / offsets.len() as f64;
                    let distance =
                        offsets.iter().map(|x| x.abs()).sum::<f64>() / offsets.len() as f64;
                    let spread = (offsets.iter().map(|x| (x - mean).powi(2)).sum::<f64>()
                        / offsets.len() as f64)
                        .sqrt();
                    (distance as f32, mean as f32, spread as f32)
                });

        // 3. Relative variation of up-to-20 ms RMS windows after detected attacks.
        let level_cv = (transients.len() >= 3 && self.sample_rate > 0).then(|| {
            let window = (self.sample_rate as usize / 50).max(1);
            let levels: Vec<f64> = transients
                .iter()
                .map(|(idx, _)| {
                    let block = &di_samples[*idx..(*idx + window).min(di_samples.len())];
                    (block.iter().map(|s| (*s as f64).powi(2)).sum::<f64>() / block.len() as f64)
                        .sqrt()
                })
                .collect();
            let mean = levels.iter().sum::<f64>() / levels.len() as f64;
            let variance =
                levels.iter().map(|a| (a - mean).powi(2)).sum::<f64>() / levels.len() as f64;
            (variance.sqrt() / mean.max(f64::EPSILON) * 100.0) as f32
        });
        let timing_score = timing
            .map(|(distance, _, _)| {
                (100.0 * (1.0 - distance as f64 / (30_000.0 / tempo))).clamp(0.0, 100.0) as f32
            })
            .unwrap_or(0.0);
        let dynamic_score = level_cv
            .map(|cv| (100.0 - cv).clamp(0.0, 100.0))
            .unwrap_or(0.0);

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
        let timing_text = match timing {
            Some((distance, bias, spread)) => format!(" Mean distance to the quarter-note grid: {distance:.1} ms; signed bias {bias:+.1} ms (positive is late); spread {spread:.1} ms. Offbeat notes may be intentional."),
            None => " Not enough attacks or valid tempo information for grid timing.".into(),
        };
        let dynamics_text = match level_cv {
            Some(cv) => format!(" Attack-level variation: {cv:.1}% (RMS coefficient of variation). Accents may be intentional."),
            None => " At least three attacks are needed to compare dynamics.".into(),
        };
        let summary = format!(
            "Detected {} attack candidates.{timing_text}{dynamics_text}{intonation_text}",
            transients.len()
        );

        TakeAnalysis {
            timing_accuracy_pct: (timing_score * 10.0).round() / 10.0,
            dynamic_consistency_pct: (dynamic_score * 10.0).round() / 10.0,
            intonation_accuracy_pct: intonation_score,
            detected_transients: transients.len(),
            summary,
            mean_grid_distance_ms: timing.map(|v| v.0),
            grid_bias_ms: timing.map(|v| v.1),
            grid_spread_ms: timing.map(|v| v.2),
            attack_level_cv_pct: level_cv,
            pitched_frames: intonation.map(|v| v.1).unwrap_or(0),
            mean_abs_cents: intonation.map(|v| v.0),
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
    fn empty_and_silent_input_have_no_measurements_or_perfect_scores() {
        let analyzer = TakeAnalyzer::new(48_000);
        for samples in [vec![], vec![0.0; 48_000]] {
            let result = analyzer.analyze(&samples, 120.0);
            assert_eq!(result.detected_transients, 0);
            assert_eq!(result.timing_accuracy_pct, 0.0);
            assert_eq!(result.dynamic_consistency_pct, 0.0);
            assert_eq!(result.intonation_accuracy_pct, 0.0);
            assert!(result.mean_grid_distance_ms.is_none());
            assert!(result.attack_level_cv_pct.is_none());
            assert!(result.mean_abs_cents.is_none());
            assert_eq!(result.pitched_frames, 0);
        }
    }

    #[test]
    fn grid_offsets_and_rms_variation_match_known_pulses() {
        let analyzer = TakeAnalyzer::new(48_000);
        for (offsets, bias, distance, spread) in [
            ([960; 4], 20.0, 20.0, 0.0),
            ([-960; 4], -20.0, 20.0, 0.0),
            ([960, -960, 480, -480], 0.0, 15.0, 15.8114),
        ] {
            let mut samples = vec![0.0; 120_000];
            for (i, offset) in offsets.iter().enumerate() {
                let start = ((i + 1) as i32 * 24_000 + offset) as usize;
                samples[start..start + 100].fill((i + 1) as f32 * 0.2);
            }
            let result = analyzer.analyze(&samples, 120.0);
            assert_eq!(result.detected_transients, 4);
            // Timing tolerance: 2 ms. RMS CV tolerance: 0.1 percentage point.
            assert!((result.grid_bias_ms.unwrap() - bias).abs() < 2.0);
            assert!((result.mean_grid_distance_ms.unwrap() - distance).abs() < 2.0);
            assert!((result.grid_spread_ms.unwrap() - spread).abs() < 2.0);
            assert!((result.attack_level_cv_pct.unwrap() - 44.7214).abs() < 0.1);
            assert!(analyzer
                .analyze(&samples, f64::NAN)
                .mean_grid_distance_ms
                .is_none());
        }
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
