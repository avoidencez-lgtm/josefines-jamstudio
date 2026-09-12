//! energy: RMS envelope detector on guitar DI with 300 ms attack and 1.5 s release.
//! Maps guitar dynamics to band intensity (0.0 to 1.0) with hysteresis.

pub struct EnergyFollower {
    attack_coeff: f32,
    release_coeff: f32,
    envelope: f32,
    min_db: f32,
    max_db: f32,
    hysteresis_threshold: f32,
    current_mapped: f32,
    output: f32,
    direction: i8,
}

impl EnergyFollower {
    pub fn new(sample_rate: u32) -> Self {
        let sr = sample_rate as f32;
        // 300 ms attack, 1.5 s release
        let attack_coeff = (-1.0 / (sr * 0.3)).exp();
        let release_coeff = (-1.0 / (sr * 1.5)).exp();

        Self {
            attack_coeff,
            release_coeff,
            envelope: 0.0,
            min_db: -55.0,
            max_db: -12.0,
            hysteresis_threshold: 0.03,
            current_mapped: 0.5,
            output: 0.5,
            direction: 0,
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

        // IIR always runs; hysteresis only gates output direction changes.
        self.current_mapped = self.current_mapped * 0.95 + raw_mapped * 0.05;
        let delta = self.current_mapped - self.output;
        if self.direction == 0
            || self.direction as f32 * delta >= 0.0
            || delta.abs() > self.hysteresis_threshold
        {
            if delta.abs() > f32::EPSILON {
                self.direction = if delta > 0.0 { 1 } else { -1 };
            }
            self.output = self.current_mapped;
        }

        self.output
    }

    pub fn process_block(&mut self, samples: &[f32]) -> f32 {
        let mut last = self.output;
        for &s in samples {
            last = self.process_sample(s);
        }
        last
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

    #[test]
    fn envelope_follower_iir_reaches_mapped_level_within_one_percent() {
        // Gating the IIR on |raw - state| > 0.03 froze tracking ~3% below the
        // mapped level. Continuous smoothing must settle inside 0.01 of the
        // 0/1 rails on a 2 s synthetic DC step (tolerance: 0.01 of full scale).
        let sample_rate = 48_000u32;
        let mut follower = EnergyFollower::new(sample_rate);
        let n = sample_rate as usize * 2;
        let loud = vec![0.25f32; n];
        let high = follower.process_block(&loud);
        assert!(
            (high - 1.0).abs() <= 0.01,
            "loud DC must reach mapped 1.0 ±0.01, got {high}"
        );

        let mut follower = EnergyFollower::new(sample_rate);
        let quiet = vec![0.001f32; n];
        let low = follower.process_block(&quiet);
        assert!(
            low <= 0.01,
            "quiet DC must reach mapped 0.0 ±0.01, got {low}"
        );
    }
}
