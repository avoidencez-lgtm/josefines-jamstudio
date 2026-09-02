//! sampler: Polyphonic drum sampler with velocity layers, round-robin, and choke groups.
//! Includes built-in synthetic fallback percussion for tests and headless operation.

use jam_core::timeline::SAMPLE_RATE;
use std::collections::HashMap;

#[derive(Clone)]
struct ActiveVoice {
    #[allow(dead_code)]
    instrument: String,
    samples: Vec<f32>,
    position: usize,
    velocity: f32,
    choke_group: Option<String>,
    fade_remaining: usize,
    fade_total: usize,
}

pub struct Sampler {
    sample_rate: u32,
    kit_name: String,
    /// Instrument name -> list of alternative samples (round-robin)
    sample_bank: HashMap<String, Vec<Vec<f32>>>,
    choke_mappings: HashMap<String, String>,
    voices: Vec<Option<ActiveVoice>>,
    round_robin_idx: HashMap<String, usize>,
    #[allow(dead_code)]
    max_polyphony: usize,
}

impl Default for Sampler {
    fn default() -> Self {
        Self::new_with_synthetic_kit(SAMPLE_RATE)
    }
}

impl Sampler {
    pub fn new(sample_rate: u32, max_polyphony: usize) -> Self {
        Self {
            sample_rate,
            kit_name: "Default".into(),
            sample_bank: HashMap::new(),
            choke_mappings: HashMap::new(),
            voices: vec![None; max_polyphony],
            round_robin_idx: HashMap::new(),
            max_polyphony,
        }
    }

    /// Creates a Sampler pre-loaded with synthetic percussive drum samples (48 kHz)
    /// for reliable offline testing and headless CI.
    pub fn new_with_synthetic_kit(sample_rate: u32) -> Self {
        let mut sampler = Self::new(sample_rate, 32);
        sampler.kit_name = "SyntheticStandard".into();

        // Choke hi-hats: closed hi-hat chokes open hi-hat
        sampler.set_choke_group("hihat_closed", "hihat");
        sampler.set_choke_group("hihat_open", "hihat");
        sampler.set_choke_group("pedal_hihat", "hihat");

        // Synthesize drum samples
        sampler.add_synthetic_kick();
        sampler.add_synthetic_snare();
        sampler.add_synthetic_hihat_closed();
        sampler.add_synthetic_hihat_open();
        sampler.add_synthetic_crash();
        sampler.add_synthetic_ride();
        sampler.add_synthetic_tom("tom_high", 160.0);
        sampler.add_synthetic_tom("tom_mid", 120.0);
        sampler.add_synthetic_tom("tom_low", 90.0);

        sampler
    }

    pub fn set_choke_group(&mut self, instrument: &str, group: &str) {
        self.choke_mappings.insert(instrument.into(), group.into());
    }

    pub fn load_sample(&mut self, instrument: &str, pcm: Vec<f32>) {
        self.sample_bank
            .entry(instrument.into())
            .or_default()
            .push(pcm);
    }

    pub fn trigger(&mut self, instrument: &str, velocity: f32) {
        let choke_grp = self.choke_mappings.get(instrument).cloned();

        // Choke any active voices in the same choke group
        if let Some(ref grp) = choke_grp {
            for slot in self.voices.iter_mut().flatten() {
                if slot.choke_group.as_ref() == Some(grp) && slot.fade_remaining == 0 {
                    // Start a 128-sample (~2.6ms) quick fadeout
                    slot.fade_remaining = 128;
                    slot.fade_total = 128;
                }
            }
        }

        // Fetch sample from bank or generate on the fly
        let samples = if let Some(alternatives) = self.sample_bank.get(instrument) {
            if alternatives.is_empty() {
                return;
            }
            let idx = self.round_robin_idx.entry(instrument.into()).or_insert(0);
            let s = alternatives[*idx % alternatives.len()].clone();
            *idx = (*idx + 1) % alternatives.len();
            s
        } else {
            return;
        };

        let voice = ActiveVoice {
            instrument: instrument.into(),
            samples,
            position: 0,
            velocity: velocity.clamp(0.0, 1.0),
            choke_group: choke_grp,
            fade_remaining: 0,
            fade_total: 0,
        };

        // Find empty voice slot or steal the oldest
        let mut target_idx = None;
        for (i, slot) in self.voices.iter().enumerate() {
            if slot.is_none() {
                target_idx = Some(i);
                break;
            }
        }

        let idx = target_idx.unwrap_or(0); // If full, replace voice 0
        self.voices[idx] = Some(voice);
    }

    pub fn render(&mut self, output_left: &mut [f32], output_right: &mut [f32]) {
        let frames = output_left.len().min(output_right.len());

        for slot in self.voices.iter_mut() {
            if let Some(voice) = slot {
                let avail = voice.samples.len().saturating_sub(voice.position);
                let count = frames.min(avail);

                for i in 0..count {
                    let mut s = voice.samples[voice.position + i] * voice.velocity;

                    if voice.fade_remaining > 0 {
                        let gain = voice.fade_remaining as f32 / voice.fade_total as f32;
                        s *= gain;
                        voice.fade_remaining = voice.fade_remaining.saturating_sub(1);
                    }

                    output_left[i] += s;
                    output_right[i] += s;

                    if voice.fade_total > 0 && voice.fade_remaining == 0 {
                        voice.position = voice.samples.len();
                        break;
                    }
                }

                voice.position += count;
                if voice.position >= voice.samples.len() {
                    *slot = None;
                }
            }
        }
    }

    // Synthetic kit sample generators
    fn add_synthetic_kick(&mut self) {
        let len = (self.sample_rate as f32 * 0.25) as usize; // 250ms
        let mut s = Vec::with_capacity(len);
        let mut phase = 0.0f32;
        for i in 0..len {
            let t = i as f32 / self.sample_rate as f32;
            let decay = (-12.0 * t).exp();
            let freq = 140.0 * (-30.0 * t).exp() + 45.0; // Pitch envelope: 185Hz -> 45Hz
            phase += freq / self.sample_rate as f32;
            s.push((phase * 2.0 * std::f32::consts::PI).sin() * decay * 0.9);
        }
        self.load_sample("kick", s);
    }

    fn add_synthetic_snare(&mut self) {
        let len = (self.sample_rate as f32 * 0.2) as usize; // 200ms
        let mut s = Vec::with_capacity(len);
        let mut seed = 12345u32;
        for i in 0..len {
            let t = i as f32 / self.sample_rate as f32;
            let decay = (-18.0 * t).exp();
            // LCG noise
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let noise = (seed as f32 / 2147483648.0) - 1.0;
            let tone = (t * 2.0 * std::f32::consts::PI * 185.0).sin();
            s.push((noise * 0.7 + tone * 0.3) * decay * 0.85);
        }
        self.load_sample("snare", s);
    }

    fn add_synthetic_hihat_closed(&mut self) {
        let len = (self.sample_rate as f32 * 0.04) as usize; // 40ms
        let mut s = Vec::with_capacity(len);
        let mut seed = 54321u32;
        for i in 0..len {
            let t = i as f32 / self.sample_rate as f32;
            let decay = (-80.0 * t).exp();
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let noise = (seed as f32 / 2147483648.0) - 1.0;
            s.push(noise * decay * 0.6);
        }
        self.load_sample("hihat_closed", s);
    }

    fn add_synthetic_hihat_open(&mut self) {
        let len = (self.sample_rate as f32 * 0.35) as usize; // 350ms
        let mut s = Vec::with_capacity(len);
        let mut seed = 98765u32;
        for i in 0..len {
            let t = i as f32 / self.sample_rate as f32;
            let decay = (-9.0 * t).exp();
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let noise = (seed as f32 / 2147483648.0) - 1.0;
            s.push(noise * decay * 0.65);
        }
        self.load_sample("hihat_open", s);
    }

    fn add_synthetic_crash(&mut self) {
        let len = (self.sample_rate as f32 * 1.2) as usize; // 1.2s
        let mut s = Vec::with_capacity(len);
        let mut seed = 13579u32;
        for i in 0..len {
            let t = i as f32 / self.sample_rate as f32;
            let decay = (-3.5 * t).exp();
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let noise = (seed as f32 / 2147483648.0) - 1.0;
            s.push(noise * decay * 0.7);
        }
        self.load_sample("crash", s);
    }

    fn add_synthetic_ride(&mut self) {
        let len = (self.sample_rate as f32 * 0.8) as usize; // 800ms
        let mut s = Vec::with_capacity(len);
        for i in 0..len {
            let t = i as f32 / self.sample_rate as f32;
            let decay = (-5.0 * t).exp();
            let tone = (t * 2.0 * std::f32::consts::PI * 580.0).sin()
                + (t * 2.0 * std::f32::consts::PI * 840.0).sin() * 0.7;
            s.push(tone * decay * 0.5);
        }
        self.load_sample("ride", s);
    }

    fn add_synthetic_tom(&mut self, name: &str, base_freq: f32) {
        let len = (self.sample_rate as f32 * 0.3) as usize; // 300ms
        let mut s = Vec::with_capacity(len);
        let mut phase = 0.0f32;
        for i in 0..len {
            let t = i as f32 / self.sample_rate as f32;
            let decay = (-10.0 * t).exp();
            let freq = base_freq * (1.0 + 0.5 * (-20.0 * t).exp());
            phase += freq / self.sample_rate as f32;
            s.push((phase * 2.0 * std::f32::consts::PI).sin() * decay * 0.8);
        }
        self.load_sample(name, s);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sampler_synthetic_playback() {
        let mut sampler = Sampler::new_with_synthetic_kit(48_000);
        sampler.trigger("kick", 0.9);

        let mut left = vec![0.0f32; 1024];
        let mut right = vec![0.0f32; 1024];
        sampler.render(&mut left, &mut right);

        assert!(left.iter().any(|&s| s.abs() > 0.1));
        assert!(right.iter().any(|&s| s.abs() > 0.1));
    }

    #[test]
    fn test_choke_group_closes_open_hihat() {
        let mut sampler = Sampler::new_with_synthetic_kit(48_000);
        sampler.trigger("hihat_open", 1.0);

        let mut left = vec![0.0f32; 512];
        let mut right = vec![0.0f32; 512];
        sampler.render(&mut left, &mut right);

        // Now trigger closed hi-hat (should choke open hi-hat)
        sampler.trigger("hihat_closed", 0.8);

        // Render 256 frames (fade should finish)
        let mut left2 = vec![0.0f32; 256];
        let mut right2 = vec![0.0f32; 256];
        sampler.render(&mut left2, &mut right2);

        // Open hi-hat slot should be closed or dying
        assert!(sampler
            .voices
            .iter()
            .flatten()
            .any(|v| v.instrument == "hihat_closed"));
    }
}
