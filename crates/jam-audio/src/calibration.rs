//! Three quiet coded clicks, measured against the input paired with consumed output.
//! The offset therefore includes the same input queue used by the take recorder.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LatencyMeasurement {
    pub round_trip_frames: u32,
    pub confidence: f32,
    pub estimated: bool,
    pub reason: String,
}

impl LatencyMeasurement {
    pub fn estimate(buffer: u32, reason: &str) -> Self {
        Self {
            round_trip_frames: buffer.saturating_mul(2).min(48_000),
            confidence: 0.0,
            estimated: true,
            reason: format!("{reason} Estimate uses two buffers; device nominal latency is unavailable. Check alignment in your DAW."),
        }
    }
}

pub(crate) struct Probe {
    pub emitted: usize,
    input: Vec<f32>,
    pulse: [f32; 63],
    starts: [usize; 3],
    max_delay: usize,
    pub length: usize,
    pub failed: bool,
}

impl Probe {
    pub fn new(rate: u32) -> Self {
        let rate = rate as usize;
        let mut seed = 42u32;
        let mut filtered = 0.0;
        let pulse = std::array::from_fn(|_| {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let bit = if seed & 0x8000_0000 == 0 {
                -0.125
            } else {
                0.125
            };
            // Smooth the code so fractional-sample converter delay does not destroy correlation.
            filtered += 0.2 * (bit - filtered);
            filtered
        });
        let starts = [rate / 4, rate * 85 / 100, rate * 145 / 100];
        let max_delay = rate * 2 / 5;
        let length = starts[2] + max_delay + pulse.len();
        Self {
            emitted: 0,
            input: Vec::with_capacity(length),
            pulse,
            starts,
            max_delay,
            length,
            failed: false,
        }
    }

    pub fn output(&self, frame: usize) -> f32 {
        self.starts
            .iter()
            .find_map(|start| {
                frame
                    .checked_sub(*start)
                    .and_then(|i| self.pulse.get(i))
                    .copied()
            })
            .unwrap_or(0.0)
    }

    pub fn capture(&mut self, index: usize, input: f32) {
        if index >= self.length {
            return;
        }
        if index != self.input.len() || !input.is_finite() {
            self.failed = true;
        } else if self.input.len() < self.length {
            self.input.push(input);
        }
    }

    pub fn complete(&self) -> bool {
        self.input.len() == self.length
    }

    pub fn measure(&self, buffer: u32) -> Result<LatencyMeasurement, String> {
        if self.failed || !self.complete() {
            return Err(
                "Calibration lost audio frames. Check the device and buffer, then retry.".into(),
            );
        }
        let mean = self.pulse.iter().sum::<f32>() / self.pulse.len() as f32;
        let template = self.pulse.map(|s| s - mean);
        let energy = template.iter().map(|s| s * s).sum::<f32>();
        let mut delays = [0; 3];
        let mut confidence = 1.0f32;
        for (click, start) in self.starts.iter().enumerate() {
            let mut best = (0.0f32, 0);
            for delay in 0..=self.max_delay {
                let signal = &self.input[start + delay..start + delay + template.len()];
                let dc = signal.iter().sum::<f32>() / signal.len() as f32;
                let power = signal.iter().map(|s| (s - dc).powi(2)).sum::<f32>();
                if power < 0.000_001 || signal.iter().any(|s| s.abs() >= 0.99) {
                    continue;
                }
                let dot = signal
                    .iter()
                    .zip(template)
                    .map(|(s, t)| (s - dc) * t)
                    .sum::<f32>();
                let score = (dot.abs() / (power * energy).sqrt()).min(1.0);
                if score > best.0 {
                    best = (score, delay);
                }
            }
            confidence = confidence.min(best.0);
            delays[click] = best.1;
        }
        delays.sort_unstable();
        if confidence < 0.85 || delays[2] - delays[0] > 2 {
            return Ok(LatencyMeasurement::estimate(buffer, "No stable three-click loopback detected. Check the cable, channel, gain and bypass effects."));
        }
        Ok(LatencyMeasurement { round_trip_frames: delays[1] as u32, confidence, estimated: false, reason: "Three clicks agree within two samples. Saved offset applies to this device pair, channel, rate and buffer.".into() })
    }
}

#[derive(Default)]
pub(crate) struct Calibration {
    pub generation: u64,
    pub probe: Option<Probe>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn three_clicks_measure_attenuated_inverted_noisy_loopback_within_one_sample() {
        for rate in [44_100, 48_000, 96_000] {
            for delay in [0, 127, 2049] {
                let mut probe = Probe::new(rate);
                for i in 0..probe.length {
                    let noise = ((i * 13 % 97) as f32 / 97.0 - 0.5) * 0.001;
                    let signal = i.checked_sub(delay).map(|i| probe.output(i)).unwrap_or(0.0);
                    probe.capture(i, 0.02 - signal * 0.4 + noise);
                }
                let result = probe.measure(256).unwrap();
                assert!(!result.estimated, "{result:?}");
                assert!(result.round_trip_frames.abs_diff(delay as u32) <= 1);
                assert!(result.confidence > 0.99);
            }
        }
    }

    #[test]
    fn silence_drift_clipping_and_lost_frames_never_claim_a_measurement() {
        for kind in 0..4 {
            let mut probe = Probe::new(48_000);
            for i in 0..probe.length {
                let delay = if kind == 1 && i > 48_000 { 1200 } else { 1000 };
                let s = i.checked_sub(delay).map(|i| probe.output(i)).unwrap_or(0.0);
                probe.capture(
                    i,
                    match kind {
                        0 => 0.0,
                        2 => (s * 80.0).clamp(-1.0, 1.0),
                        3 => (i as f32 * 0.03).sin() * 0.1,
                        _ => s,
                    },
                );
            }
            assert!(probe.measure(512).unwrap().estimated);
        }
        let mut probe = Probe::new(48_000);
        probe.capture(1, 0.0);
        assert!(probe.measure(256).is_err());
    }

    #[test]
    fn fractional_sample_loopback_is_measured_within_one_sample() {
        let mut probe = Probe::new(48_000);
        for i in 0..probe.length {
            let a = i.checked_sub(713).map(|i| probe.output(i)).unwrap_or(0.0);
            let b = i.checked_sub(714).map(|i| probe.output(i)).unwrap_or(0.0);
            probe.capture(i, (a + b) * 0.25);
        }
        let result = probe.measure(256).unwrap();
        assert!(!result.estimated, "{result:?}");
        assert!((result.round_trip_frames as f64 - 713.5).abs() <= 1.0);
    }
}
