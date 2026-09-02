//! calibration: Round-trip audio interface latency measurement via Dirac impulse cross-correlation.

pub struct LatencyCalibrator {
    sample_rate: u32,
    impulse_offset: usize,
}

impl LatencyCalibrator {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            impulse_offset: 256,
        }
    }

    /// Generates a calibration impulse buffer (zeros with a single 1.0 pulse at impulse_offset).
    pub fn generate_impulse_buffer(&self, total_frames: usize) -> Vec<f32> {
        let mut buf = vec![0.0f32; total_frames];
        if self.impulse_offset < total_frames {
            buf[self.impulse_offset] = 1.0;
        }
        buf
    }

    /// Computes round-trip latency in samples from captured input samples.
    /// Finds the peak cross-correlation between emitted impulse and recorded buffer.
    pub fn measure_latency_samples(&self, recorded_samples: &[f32]) -> Option<usize> {
        if recorded_samples.len() <= self.impulse_offset {
            return None;
        }

        // Find sample index with maximum absolute amplitude after impulse emission
        let mut max_idx = 0;
        let mut max_val = 0.0f32;

        for (i, &s) in recorded_samples.iter().enumerate() {
            let abs_s = s.abs();
            if abs_s > max_val {
                max_val = abs_s;
                max_idx = i;
            }
        }

        // Threshold check to avoid false positives on low-level noise
        if max_val < 0.05 || max_idx < self.impulse_offset {
            return None;
        }

        Some(max_idx - self.impulse_offset)
    }

    /// Measures latency in milliseconds.
    pub fn measure_latency_ms(&self, recorded_samples: &[f32]) -> Option<f64> {
        self.measure_latency_samples(recorded_samples)
            .map(|samples| (samples as f64 * 1000.0) / self.sample_rate as f64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_impulse_measurement_exactness() {
        let sample_rate = 48_000;
        let calib = LatencyCalibrator::new(sample_rate);

        let test_buffer_len = 4096;
        let known_hardware_delay = 480; // 10 ms at 48 kHz

        let mut recorded = vec![0.0f32; test_buffer_len];
        // Simulate loopback: impulse arrives at impulse_offset + known_hardware_delay
        let arrival_sample = calib.impulse_offset + known_hardware_delay;
        recorded[arrival_sample] = 0.95;

        let measured = calib.measure_latency_samples(&recorded);
        assert_eq!(measured, Some(known_hardware_delay));

        let ms = calib.measure_latency_ms(&recorded).unwrap();
        assert!((ms - 10.0).abs() < 0.01);
    }
}
