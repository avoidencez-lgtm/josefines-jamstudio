//! click: Metronome click generation with distinct accented beat 1.

use jam_core::timeline::SAMPLE_RATE;

pub struct ClickGenerator {
    accent_freq: f32,
    normal_freq: f32,
    duration_samples: usize,
}

impl Default for ClickGenerator {
    fn default() -> Self {
        Self {
            accent_freq: 1200.0,
            normal_freq: 800.0,
            duration_samples: (SAMPLE_RATE as f32 * 0.01) as usize, // 10ms
        }
    }
}

impl ClickGenerator {
    pub fn new(accent_freq: f32, normal_freq: f32, duration_ms: f32) -> Self {
        Self {
            accent_freq,
            normal_freq,
            duration_samples: (SAMPLE_RATE as f32 * duration_ms / 1000.0) as usize,
        }
    }

    pub fn render_click(&self, is_accent: bool, buffer: &mut [f32]) {
        let freq = if is_accent {
            self.accent_freq
        } else {
            self.normal_freq
        };

        let len = buffer.len().min(self.duration_samples);
        for (i, item) in buffer.iter_mut().enumerate().take(len) {
            let t = i as f32 / SAMPLE_RATE as f32;
            let decay = 1.0 - (i as f32 / self.duration_samples as f32);
            let sample = (t * 2.0 * std::f32::consts::PI * freq).sin() * decay * 0.8;
            *item += sample;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_click_render() {
        let generator = ClickGenerator::default();
        let mut buf = vec![0.0f32; 1024];
        generator.render_click(true, &mut buf);

        assert!(buf.iter().any(|&s| s.abs() > 0.1));
    }
}
