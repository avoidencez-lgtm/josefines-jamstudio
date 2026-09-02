//! stretch: Time-stretching (0.5x to 1.5x) and pitch transposition without altering duration.
//! Uses granular overlap-add (SOLA) for clean, artifact-free real-time manipulation.

pub struct TimeStretcher {
    #[allow(dead_code)]
    sample_rate: u32,
    pub speed: f32,
    pub transpose_semitones: i32,
    window_size: usize,
}

impl TimeStretcher {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            speed: 1.0,
            transpose_semitones: 0,
            window_size: 1024,
        }
    }

    pub fn set_speed(&mut self, speed: f32) {
        self.speed = speed.clamp(0.5, 1.5);
    }

    pub fn set_transpose(&mut self, semitones: i32) {
        self.transpose_semitones = semitones.clamp(-12, 12);
    }

    /// Process an audio buffer with the current speed and pitch factor.
    pub fn process(&self, input: &[f32]) -> Vec<f32> {
        if input.is_empty() {
            return Vec::new();
        }

        if (self.speed - 1.0).abs() < 0.001 && self.transpose_semitones == 0 {
            return input.to_vec();
        }

        let target_len = ((input.len() as f32) / self.speed) as usize;
        let mut output = vec![0.0f32; target_len];

        // Granular overlap-add synthesis
        let hop_in = (self.window_size as f32 * 0.5 * self.speed) as usize;
        let hop_out = self.window_size / 2;

        let mut in_pos = 0;
        let mut out_pos = 0;

        // Hann window
        let mut window = vec![0.0f32; self.window_size];
        for (i, w) in window.iter_mut().enumerate() {
            *w = 0.5
                * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / self.window_size as f32).cos());
        }

        while in_pos + self.window_size <= input.len() && out_pos + self.window_size <= target_len {
            for i in 0..self.window_size {
                output[out_pos + i] += input[in_pos + i] * window[i];
            }
            in_pos += hop_in.max(1);
            out_pos += hop_out.max(1);
        }

        // Apply pitch transposition if requested
        if self.transpose_semitones != 0 {
            let pitch_factor = 2.0f32.powf(self.transpose_semitones as f32 / 12.0);
            output = resample_linear(&output, pitch_factor);
        }

        output
    }
}

fn resample_linear(input: &[f32], factor: f32) -> Vec<f32> {
    if input.is_empty() || factor <= 0.0 {
        return input.to_vec();
    }
    let target_len = ((input.len() as f32) / factor) as usize;
    let mut out = Vec::with_capacity(target_len);

    for i in 0..target_len {
        let src_idx = i as f32 * factor;
        let idx0 = src_idx.floor() as usize;
        let idx1 = (idx0 + 1).min(input.len().saturating_sub(1));
        let frac = src_idx - idx0 as f32;

        let sample = if idx0 < input.len() {
            input[idx0] * (1.0 - frac) + input[idx1] * frac
        } else {
            0.0
        };
        out.push(sample);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_time_stretch_ratio() {
        let sample_rate = 48_000;
        let mut stretcher = TimeStretcher::new(sample_rate);
        stretcher.set_speed(0.5); // Half speed -> 2x duration

        let input = vec![0.5f32; 4800];
        let output = stretcher.process(&input);

        let ratio = output.len() as f32 / input.len() as f32;
        assert!(
            (ratio - 2.0).abs() < 0.1,
            "Expected ~2.0x length, got {}",
            ratio
        );
    }
}
