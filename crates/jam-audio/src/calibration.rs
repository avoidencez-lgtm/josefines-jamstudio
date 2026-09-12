//! Three-click loopback latency. Pure: play a click train, listen on the guitar
//! input, return round-trip frames. No devices, no allocation in the audio callback.

use serde::{Deserialize, Serialize};

/// Product ceiling: the recorder also clamps compensation to one second.
pub const MAX_DELAY_FRAMES: u32 = 48_000;
const CLICK_COUNT: usize = 3;
const CLICK_SECS: f32 = 0.012;
const CLICK_HZ: f32 = 1_200.0;
const CLICK_INTERVAL_SECS: f32 = 0.15;
const DETECT_THRESHOLD: f32 = 0.55;
const SPACING_SLOP: usize = 16;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyCalibration {
    pub round_trip_frames: u32,
    pub confidence: f32,
    pub estimated: bool,
}

/// One 12 ms decaying 1.2 kHz click, same envelope the metronome uses.
pub fn click_samples(sample_rate: u32, volume: f32) -> Vec<f32> {
    let len = ((sample_rate as f32 * CLICK_SECS) as usize).max(1);
    let sr = sample_rate.max(1) as f32;
    (0..len)
        .map(|pos| {
            let t = pos as f32 / sr;
            let env = 1.0 - pos as f32 / len as f32;
            (t * std::f32::consts::TAU * CLICK_HZ).sin() * env * env * volume
        })
        .collect()
}

/// Click train plus one second of silence so a delayed copy still fits.
pub fn click_train(sample_rate: u32) -> (Vec<f32>, Vec<usize>) {
    let click = click_samples(sample_rate, 0.7);
    let interval = ((sample_rate as f32 * CLICK_INTERVAL_SECS) as usize).max(click.len() + 1);
    let onsets: Vec<usize> = (0..CLICK_COUNT).map(|i| i * interval).collect();
    let tail = (sample_rate as usize).min(MAX_DELAY_FRAMES as usize);
    let mut play = vec![0.0f32; onsets[CLICK_COUNT - 1] + click.len() + tail];
    for &at in &onsets {
        for (i, s) in click.iter().enumerate() {
            play[at + i] += *s;
        }
    }
    (play, onsets)
}

/// `2 × buffer`, plus any known device buffers, capped at one second.
pub fn estimate_round_trip(
    buffer_frames: u32,
    input_latency_frames: u32,
    output_latency_frames: u32,
) -> u32 {
    let frames = if input_latency_frames > 0 || output_latency_frames > 0 {
        input_latency_frames.saturating_add(output_latency_frames)
    } else {
        buffer_frames.saturating_mul(2)
    };
    frames.clamp(1, MAX_DELAY_FRAMES)
}

/// Delay of `captured` relative to `play_onsets` (samples). `None` without a loopback.
pub fn measure_round_trip(
    sample_rate: u32,
    play_onsets: &[usize],
    captured: &[f32],
) -> Option<(usize, f32)> {
    if play_onsets.len() != CLICK_COUNT {
        return None;
    }
    let interval = play_onsets[1].saturating_sub(play_onsets[0]);
    if interval == 0 {
        return None;
    }
    let click = click_samples(sample_rate, 1.0);
    let detected = detect_click_onsets(captured, &click);
    match_triplet(&detected, interval)
}

fn cosine_at(samples: &[f32], start: usize, template: &[f32]) -> f32 {
    if start + template.len() > samples.len() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut te = 0.0f32;
    let mut se = 0.0f32;
    for (i, t) in template.iter().enumerate() {
        let s = samples[start + i];
        dot += t * s;
        te += t * t;
        se += s * s;
    }
    let denom = (te * se).sqrt();
    if denom < 1e-8 {
        0.0
    } else {
        dot / denom
    }
}

fn detect_click_onsets(samples: &[f32], template: &[f32]) -> Vec<usize> {
    if samples.len() <= template.len() {
        return Vec::new();
    }
    let hop = 8usize;
    let last = samples.len() - template.len();
    let mut scores = Vec::new();
    let mut t = 0usize;
    while t <= last {
        scores.push((t, cosine_at(samples, t, template)));
        t += hop;
    }
    let mut peaks: Vec<(usize, f32)> = Vec::new();
    for i in 0..scores.len() {
        let (at, score) = scores[i];
        if score < DETECT_THRESHOLD {
            continue;
        }
        let prev = i.checked_sub(1).map(|j| scores[j].1).unwrap_or(0.0);
        let next = scores.get(i + 1).map(|s| s.1).unwrap_or(0.0);
        if score < prev || score < next {
            continue;
        }
        let mut best_at = at;
        let mut best = score;
        let lo = at.saturating_sub(hop);
        let hi = (at + hop).min(last);
        for refine in lo..=hi {
            let s = cosine_at(samples, refine, template);
            if s > best {
                best = s;
                best_at = refine;
            }
        }
        if let Some((last_at, last_score)) = peaks.last() {
            // 1.2 kHz clicks have cosine sidelobes; keep the strongest peak in one click.
            if best_at.abs_diff(*last_at) < template.len() {
                if best > *last_score {
                    peaks.pop();
                    peaks.push((best_at, best));
                }
                continue;
            }
        }
        peaks.push((best_at, best));
    }
    peaks.into_iter().map(|(at, _)| at).collect()
}

fn match_triplet(detected: &[usize], interval: usize) -> Option<(usize, f32)> {
    let slop = SPACING_SLOP.max(interval / 50);
    let mut best: Option<(usize, usize, f32)> = None;
    for (i, &a) in detected.iter().enumerate() {
        for (j, &b) in detected.iter().enumerate().skip(i + 1) {
            if b.abs_diff(a + interval) > slop {
                continue;
            }
            for &c in detected.iter().skip(j + 1) {
                if c.abs_diff(b + interval) > slop {
                    continue;
                }
                let err = b.abs_diff(a + interval) + c.abs_diff(b + interval);
                let confidence = (1.0 - err as f32 / (2 * slop) as f32).clamp(0.0, 1.0);
                if best.is_none_or(|(_, e, c)| err < e || (err == e && confidence > c)) {
                    best = Some((a, err, confidence));
                }
            }
        }
    }
    best.filter(|(delay, _, _)| *delay <= MAX_DELAY_FRAMES as usize)
        .map(|(delay, _, confidence)| (delay, confidence.max(0.25)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    fn delayed_capture(delay: usize) -> (Vec<usize>, Vec<f32>) {
        let (play, onsets) = click_train(RATE);
        let mut captured = vec![0.0; play.len() + delay];
        captured[delay..delay + play.len()].copy_from_slice(&play);
        (onsets, captured)
    }

    #[test]
    fn three_delayed_clicks_measure_the_known_delay() {
        for delay in [0usize, 1, 256, 480, 2048, 8192] {
            let (onsets, captured) = delayed_capture(delay);
            let (measured, confidence) = measure_round_trip(RATE, &onsets, &captured)
                .unwrap_or_else(|| panic!("delay {delay}"));
            let click = click_samples(RATE, 1.0);
            let detected = detect_click_onsets(&captured, &click);
            assert_eq!(measured, delay, "delay {delay} detected {detected:?}");
            assert!(
                confidence >= 0.9,
                "delay {delay} confidence {confidence} detected {detected:?} onsets {onsets:?}"
            );
        }
    }

    #[test]
    fn silence_and_a_tuner_sine_are_not_a_loopback() {
        let (_, onsets) = click_train(RATE);
        let silence = vec![0.0f32; 96_000];
        assert_eq!(measure_round_trip(RATE, &onsets, &silence), None);
        let sine: Vec<f32> = (0..96_000)
            .map(|i| (i as f32 * 440.0 * std::f32::consts::TAU / RATE as f32).sin() * 0.8)
            .collect();
        assert_eq!(measure_round_trip(RATE, &onsets, &sine), None);
    }

    #[test]
    fn estimate_is_two_buffers_or_named_device_latencies() {
        assert_eq!(estimate_round_trip(256, 0, 0), 512);
        assert_eq!(estimate_round_trip(256, 128, 256), 384);
        assert_eq!(estimate_round_trip(1024, 0, 0), 2048);
        assert_eq!(estimate_round_trip(48_000, 48_000, 48_000), 48_000);
    }
}
