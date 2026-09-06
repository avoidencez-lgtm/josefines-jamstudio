//! Local, low-confidence reference analysis. No network, files or audio callbacks.
use realfft::RealFftPlanner;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};

const RATE: usize = 48_000;
const HOP: usize = 960;
const FFT: usize = 8192;
pub const NOTES: [&str; 12] = [
    "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongAnalysis {
    pub schema_version: u32,
    pub analyzer: String,
    pub confidence: String,
    pub seconds: f64,
    pub bpm: Option<f64>,
    pub beats: Vec<f64>,
    pub chords: Vec<ChordEstimate>,
    pub key: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChordEstimate {
    pub start: f64,
    pub end: f64,
    pub chord: Option<String>,
}

fn canceled(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        Err("Song analysis canceled.".into())
    } else {
        Ok(())
    }
}

/// Stereo energy avoids canceling opposite-polarity left/right channels.
pub fn analyze(input: &[f32], cancel: &AtomicBool) -> Result<SongAnalysis, String> {
    canceled(cancel)?;
    if !input.len().is_multiple_of(2)
        || !(RATE * 4..=RATE * 1200 * 2).contains(&input.len())
        || input.iter().any(|s| !s.is_finite() || s.abs() > 32.0)
    {
        return Err(
            "Analysis needs finite 48 kHz stereo audio between 2 seconds and 20 minutes.".into(),
        );
    }
    let seconds = input.len() as f64 / (RATE * 2) as f64;
    let mut onset = Vec::new();
    let mut previous = 0.0_f64;
    for chunk in input.chunks(HOP * 2) {
        canceled(cancel)?;
        let rms =
            (chunk.iter().map(|s| (*s as f64).powi(2)).sum::<f64>() / chunk.len() as f64).sqrt();
        onset.push((rms - previous).max(0.0));
        previous = rms;
    }
    let (bpm, beats) = tempo(&onset, seconds);
    let mut result = SongAnalysis {
        schema_version: 1,
        analyzer: "local-chroma-v1".into(),
        confidence: "low".into(),
        seconds,
        bpm,
        beats,
        chords: Vec::new(),
        key: None,
    };
    let fft = RealFftPlanner::<f64>::new().plan_fft_forward(FFT);
    let mut samples = fft.make_input_vec();
    let mut spectrum = fft.make_output_vec();
    let mut scratch = fft.make_scratch_vec();
    let window: Vec<f64> = (0..FFT)
        .map(|i| 0.5 - 0.5 * (std::f64::consts::TAU * i as f64 / FFT as f64).cos())
        .collect();
    let mut total = [0.0; 12];
    // ponytail: constant-tempo grid and major/minor triads only. Variable tempo,
    // inversions, extended chords and downbeats need the provider/edited analysis.
    let positions: Vec<f64> = if result.beats.is_empty() {
        (0..(seconds * 2.0) as usize)
            .map(|i| i as f64 * 0.5)
            .collect()
    } else {
        result.beats.clone()
    };
    for (i, start) in positions.iter().copied().enumerate() {
        canceled(cancel)?;
        let end = positions.get(i + 1).copied().unwrap_or(seconds);
        let center = ((start + end) * 0.5 * RATE as f64) as usize;
        let mut chroma = [0.0; 12];
        for channel in 0..2 {
            for n in 0..FFT {
                let frame = center as isize + n as isize - (FFT / 2) as isize;
                samples[n] = if frame < 0 {
                    0.0
                } else {
                    input
                        .get(frame as usize * 2 + channel)
                        .copied()
                        .unwrap_or(0.0) as f64
                        * window[n]
                };
            }
            fft.process_with_scratch(&mut samples, &mut spectrum, &mut scratch)
                .map_err(|e| e.to_string())?;
            for (bin, value) in spectrum.iter().enumerate().skip(1) {
                let hz = bin as f64 * RATE as f64 / FFT as f64;
                if !(60.0..=2000.0).contains(&hz) {
                    continue;
                }
                let note = 69.0 + 12.0 * (hz / 440.0).log2();
                if (note - note.round()).abs() < 0.4 {
                    chroma[(note.round() as usize) % 12] += value.norm_sqr();
                }
            }
        }
        let energy = chroma.iter().sum::<f64>();
        if energy > 1e-5 {
            for (sum, value) in total.iter_mut().zip(chroma.iter_mut()) {
                *value /= energy;
                *sum += *value;
            }
        }
        result.chords.push(ChordEstimate {
            start,
            end,
            chord: chord(&chroma),
        });
    }
    result.key = key(&total);
    Ok(result)
}

fn tempo(onset: &[f64], seconds: f64) -> (Option<f64>, Vec<f64>) {
    let peak = onset.iter().copied().fold(0.0_f64, f64::max);
    if peak < 0.001 {
        return (None, vec![]);
    }
    let dt = HOP as f64 / RATE as f64;
    let mut best = (0, 0.0);
    for lag in 15..=60.min(onset.len() / 3) {
        let mut dot = 0.0;
        let mut norm_a = 0.0;
        let mut norm_b = 0.0;
        for i in lag..onset.len() {
            dot += onset[i] * onset[i - lag];
            norm_a += onset[i].powi(2);
            norm_b += onset[i - lag].powi(2);
        }
        let score = dot / (norm_a * norm_b).sqrt().max(1e-12) * (1.0 - lag as f64 * 0.0005);
        if score > best.1 {
            best = (lag, score);
        }
    }
    if best.1 < 0.2 {
        return (None, vec![]);
    }
    let mut peaks = Vec::new();
    for (i, value) in onset.iter().enumerate() {
        if *value < peak * 0.2 {
            continue;
        }
        if peaks.last().is_some_and(|last: &usize| i - *last < 5) {
            let last = peaks.last_mut().unwrap();
            if *value > onset[*last] {
                *last = i;
            }
        } else {
            peaks.push(i);
        }
    }
    let period = best.0 as f64 * dt;
    let intervals: Vec<f64> = peaks
        .windows(2)
        .map(|p| (p[1] - p[0]) as f64 * dt)
        .filter(|d| (*d - period).abs() < period * 0.2)
        .collect();
    if intervals.len() < 3 {
        return (None, vec![]);
    }
    let period = intervals.iter().sum::<f64>() / intervals.len() as f64;
    let (sin, cos) = peaks.iter().fold((0.0, 0.0), |(s, c), i| {
        let phase = *i as f64 * dt / period * std::f64::consts::TAU;
        (s + phase.sin(), c + phase.cos())
    });
    if sin.hypot(cos) / (peaks.len() as f64) < 0.5 {
        return (None, vec![]);
    }
    let mut phase =
        sin.atan2(cos).rem_euclid(std::f64::consts::TAU) * period / std::f64::consts::TAU;
    if phase > period - dt {
        phase = 0.0;
    }
    let beats = (0..)
        .map(|i| phase + i as f64 * period)
        .take_while(|t| *t < seconds)
        .collect();
    (Some(60.0 / period), beats)
}

fn chord(chroma: &[f64; 12]) -> Option<String> {
    let norm = chroma.iter().map(|x| x * x).sum::<f64>().sqrt();
    if norm < 1e-8 {
        return None;
    }
    let peak = chroma.iter().copied().fold(0.0_f64, f64::max);
    let mut scores = Vec::new();
    for root in 0..12 {
        for third in [4, 3] {
            let notes = [root, (root + third) % 12, (root + 7) % 12];
            if notes.iter().any(|n| chroma[*n] < peak * 0.08) {
                continue;
            }
            scores.push((
                notes.iter().map(|n| chroma[*n]).sum::<f64>() / (3.0_f64.sqrt() * norm),
                root,
                third,
            ));
        }
    }
    scores.sort_by(|a, b| b.0.total_cmp(&a.0));
    let best = scores.first()?;
    if best.0 < 0.65 || scores.get(1).is_some_and(|next| best.0 - next.0 < 0.035) {
        return None;
    }
    Some(format!(
        "{}{}",
        NOTES[best.1],
        if best.2 == 3 { "m" } else { "" }
    ))
}

fn key(chroma: &[f64; 12]) -> Option<String> {
    let peak = chroma.iter().copied().fold(0.0_f64, f64::max);
    if chroma.iter().filter(|v| **v > peak * 0.05).count() < 4 {
        return None;
    }
    let mean = chroma.iter().sum::<f64>() / 12.0;
    let norm = chroma
        .iter()
        .map(|x| (x - mean).powi(2))
        .sum::<f64>()
        .sqrt();
    if norm < 1e-8 {
        return None;
    }
    let profiles = [
        [
            6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
        ],
        [
            6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
        ],
    ];
    let mut scores = Vec::new();
    for (mode, profile) in profiles.iter().enumerate() {
        let avg = profile.iter().sum::<f64>() / 12.0;
        let length = profile
            .iter()
            .map(|x| (x - avg).powi(2))
            .sum::<f64>()
            .sqrt();
        for root in 0..12 {
            let score = (0..12)
                .map(|n| (chroma[(n + root) % 12] - mean) * (profile[n] - avg))
                .sum::<f64>()
                / (norm * length);
            scores.push((score, root, mode));
        }
    }
    scores.sort_by(|a, b| b.0.total_cmp(&a.0));
    if scores[0].0 < 0.5 || scores[0].0 - scores[1].0 < 0.02 {
        return None;
    }
    Some(format!(
        "{} {}",
        NOTES[scores[0].1],
        if scores[0].2 == 0 { "major" } else { "minor" }
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chord_loop_has_ninety_percent_chords_and_tempo_within_one_bpm() {
        for (bpm, progression, names, expected_key) in [
            (
                90.0,
                [[60, 64, 67], [65, 69, 72], [67, 71, 74]],
                ["C", "F", "G"],
                "C major",
            ),
            (
                120.0,
                [[57, 60, 64], [62, 65, 69], [64, 68, 71]],
                ["Am", "Dm", "E"],
                "A minor",
            ),
        ] {
            let beat = (RATE as f64 * 60.0 / bpm) as usize;
            let mut input = Vec::new();
            for b in 0..24 {
                let notes = progression[b / 4 % 3];
                for i in 0..beat {
                    let env = (-(i as f64) / (RATE as f64 * 0.25)).exp();
                    let value = notes
                        .iter()
                        .map(|n| {
                            let hz = 440.0 * 2.0_f64.powf((*n as f64 - 69.0) / 12.0);
                            (i as f64 * hz * std::f64::consts::TAU / RATE as f64).sin() * 0.1 * env
                        })
                        .sum::<f64>() as f32;
                    input.extend([value, -value]);
                }
            }
            let result = analyze(&input, &AtomicBool::new(false)).unwrap();
            assert!((result.bpm.unwrap() - bpm).abs() <= 1.0, "{result:?}");
            let correct = result
                .chords
                .iter()
                .filter(|c| {
                    let index = ((c.start + c.end) * 0.5 * bpm / 60.0) as usize;
                    c.chord.as_deref() == Some(names[index / 4 % 3])
                })
                .count();
            assert!(
                correct as f64 / result.chords.len() as f64 >= 0.9,
                "{result:?}"
            );
            assert_eq!(result.key.as_deref(), Some(expected_key));
            assert!(result
                .beats
                .iter()
                .enumerate()
                .all(|(i, t)| (t - i as f64 * 60.0 / bpm).abs() < 0.1));
            let silence = analyze(&vec![0.0; RATE * 8], &AtomicBool::new(false)).unwrap();
            assert!(silence.bpm.is_none() && silence.key.is_none());
            assert!(silence.chords.iter().all(|c| c.chord.is_none()));
            assert!(analyze(&input, &AtomicBool::new(true))
                .unwrap_err()
                .contains("canceled"));
            input[0] = f32::NAN;
            assert!(analyze(&input, &AtomicBool::new(false)).is_err());
        }
    }
}
