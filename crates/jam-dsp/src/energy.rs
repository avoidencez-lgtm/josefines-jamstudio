//! energy: RMS envelope detector on guitar DI with 300 ms attack and 1.5 s release.
//! Maps guitar dynamics to band intensity (0.0 to 1.0) with hysteresis.

pub struct EnergyFollower {
    #[allow(dead_code)]
    sample_rate: u32,
    attack_coeff: f32,
    release_coeff: f32,
    envelope: f32,
    min_db: f32,
    max_db: f32,
    hysteresis_threshold: f32,
    current_mapped: f32,
}

impl EnergyFollower {
    pub fn new(sample_rate: u32) -> Self {
        let sr = sample_rate as f32;
        // 300 ms attack, 1.5 s release
        let attack_coeff = (-1.0 / (sr * 0.3)).exp();
        let release_coeff = (-1.0 / (sr * 1.5)).exp();

        Self {
            sample_rate,
            attack_coeff,
            release_coeff,
            envelope: 0.0,
            min_db: -55.0,
            max_db: -12.0,
            hysteresis_threshold: 0.03,
            current_mapped: 0.5,
        }
    }

    pub fn process_sample(&mut self, sample: f32) -> f32 {
        let abs_val = sample.abs();
        if abs_val > self.envelope {
            self.envelope = self.attack_coeff * self.envelope + (1.0 - self.attack_coeff) * abs_val;
        } else {
            self.envelope =
                self.release_coeff * self.envelope + (1.0 - self.release_coeff) * abs_val;
        }

        // Convert envelope to dBFS
        let db = if self.envelope > 1e-6 {
            20.0 * self.envelope.log10()
        } else {
            -120.0
        };

        // Linear interpolation from [min_db, max_db] to [0.0, 1.0]
        let raw_mapped = ((db - self.min_db) / (self.max_db - self.min_db)).clamp(0.0, 1.0);

        // Apply hysteresis to prevent rapid jitter
        if (raw_mapped - self.current_mapped).abs() > self.hysteresis_threshold {
            self.current_mapped = self.current_mapped * 0.95 + raw_mapped * 0.05;
        }

        self.current_mapped
    }

    pub fn process_block(&mut self, samples: &[f32]) -> f32 {
        let mut last = self.current_mapped;
        for &s in samples {
            last = self.process_sample(s);
        }
        last
    }

    pub fn current_energy(&self) -> f32 {
        self.current_mapped
    }

    pub fn current_envelope_db(&self) -> f32 {
        if self.envelope > 1e-6 {
            20.0 * self.envelope.log10()
        } else {
            -120.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_energy_follower_dynamics() {
        let sample_rate = 48_000;
        let mut follower = EnergyFollower::new(sample_rate);

        // Quiet block (-60 dB)
        let quiet_sine: Vec<f32> = (0..sample_rate)
            .map(|i| {
                (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sample_rate as f32).sin() * 0.001
            })
            .collect();
        let low_energy = follower.process_block(&quiet_sine);
        assert!(
            low_energy < 0.4,
            "Expected low energy on quiet signal, got {}",
            low_energy
        );

        // Loud block (-12 dB) for 2 seconds
        let loud_sine: Vec<f32> = (0..sample_rate * 2)
            .map(|i| {
                (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sample_rate as f32).sin() * 0.25
            })
            .collect();
        let high_energy = follower.process_block(&loud_sine);
        assert!(
            high_energy > low_energy + 0.3,
            "Expected energy to rise significantly on loud section within 2 seconds, got {}",
            high_energy
        );
    }
}
