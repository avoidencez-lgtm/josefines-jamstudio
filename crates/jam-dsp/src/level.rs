//! level: Peak and RMS audio metering in dBFS.

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LevelResult {
    pub peak: f32,
    pub rms: f32,
    pub peak_db: f32,
    pub rms_db: f32,
}

pub fn calculate_level(samples: &[f32]) -> LevelResult {
    if samples.is_empty() {
        return LevelResult {
            peak: 0.0,
            rms: 0.0,
            peak_db: -180.0,
            rms_db: -180.0,
        };
    }

    let mut max_abs: f32 = 0.0;
    let mut sum_sq: f64 = 0.0;

    for &s in samples {
        let abs = s.abs();
        if abs > max_abs {
            max_abs = abs;
        }
        sum_sq += (s as f64) * (s as f64);
    }

    let rms = (sum_sq / samples.len() as f64).sqrt() as f32;

    LevelResult {
        peak: max_abs,
        rms,
        peak_db: amp_to_db(max_abs),
        rms_db: amp_to_db(rms),
    }
}

pub fn amp_to_db(amp: f32) -> f32 {
    if amp <= 1e-9 {
        -180.0
    } else {
        20.0 * amp.log10()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_silence_level() {
        let res = calculate_level(&[0.0; 1024]);
        assert_eq!(res.peak, 0.0);
        assert_eq!(res.rms, 0.0);
        assert_eq!(res.peak_db, -180.0);
        assert_eq!(res.rms_db, -180.0);
    }

    #[test]
    fn test_full_scale_sine() {
        let sample_rate = 48000;
        let freq = 1000.0;
        let mut samples = Vec::with_capacity(sample_rate);
        for i in 0..sample_rate {
            let t = i as f32 / sample_rate as f32;
            samples.push((2.0 * std::f32::consts::PI * freq * t).sin());
        }

        let res = calculate_level(&samples);
        assert!((res.peak - 1.0).abs() < 1e-3);
        assert!((res.peak_db - 0.0).abs() < 0.05);
        // Sine wave RMS of amplitude 1.0 is 1/sqrt(2) ≈ 0.7071 (-3.01 dBFS)
        assert!((res.rms - std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-3);
        assert!((res.rms_db - (-3.0103)).abs() < 0.05);
    }
}
