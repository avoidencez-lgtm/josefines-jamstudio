//! sampler: Polyphonic drum sampler with velocity layers, round-robin, and choke groups.
//! Includes built-in synthetic fallback percussion for tests and headless operation.

use crate::kit::{self, KitStatus};
use jam_core::timeline::SAMPLE_RATE;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

struct VelocityLayer {
    lo: f32,
    hi: f32,
    files: Vec<Arc<Vec<f32>>>,
}

#[derive(Clone)]
struct ActiveVoice {
    samples: Arc<Vec<f32>>,
    position: usize,
    velocity: f32,
    gain_left: f32,
    gain_right: f32,
    choke_group: Option<String>,
    fade_remaining: usize,
    fade_total: usize,
}

pub struct Sampler {
    sample_rate: u32,
    /// Instrument name -> velocity layers (round-robin inside a layer)
    sample_bank: HashMap<String, Vec<VelocityLayer>>,
    choke_mappings: HashMap<String, String>,
    /// Instrument name -> stereo position, -1.0 (left) .. 1.0 (right)
    pan: HashMap<String, f32>,
    voices: Vec<Option<ActiveVoice>>,
    round_robin_idx: HashMap<String, usize>,
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
            sample_bank: HashMap::new(),
            choke_mappings: HashMap::new(),
            pan: HashMap::new(),
            voices: vec![None; max_polyphony],
            round_robin_idx: HashMap::new(),
        }
    }

    /// Creates a Sampler pre-loaded with synthetic percussive drum samples (48 kHz)
    /// for reliable offline testing and headless CI.
    pub fn new_with_synthetic_kit(sample_rate: u32) -> Self {
        let mut sampler = Self::new(sample_rate, 32);

        // Choke hi-hats: closed hi-hat chokes open hi-hat
        sampler.set_choke_group("hihat_closed", "hihat");
        sampler.set_choke_group("hihat_open", "hihat");
        sampler.set_choke_group("pedal_hihat", "hihat");

        // Drummer's perspective: hats slightly left, ride right, toms fanned.
        sampler.set_pan("hihat_closed", -0.35);
        sampler.set_pan("hihat_open", -0.35);
        sampler.set_pan("pedal_hihat", -0.35);
        sampler.set_pan("ride", 0.4);
        sampler.set_pan("crash", 0.2);
        sampler.set_pan("tom_high", -0.25);
        sampler.set_pan("tom_mid", 0.1);
        sampler.set_pan("tom_low", 0.35);

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
        sampler.add_synthetic_sidestick();
        sampler.add_synthetic_pedal_hihat();

        sampler
    }

    /// File kit from `~/JosefinesJamstudio/assets/<id>/` (or `JAM_KIT_DIR` / `JAM_USER_DIR`).
    /// Missing or invalid packs stay on the synthetic kit with a loud status.
    pub fn open(kit_id: &str, sample_rate: u32) -> (Self, KitStatus) {
        if std::env::var("JAM_SYNTHETIC_KIT").as_deref() == Ok("1") {
            return (
                Self::new_with_synthetic_kit(sample_rate),
                KitStatus::synthetic(kit_id, "Synthetic kit forced (JAM_SYNTHETIC_KIT=1).".into()),
            );
        }
        let dir = kit::pack_dir(kit_id);
        match Self::from_dir(&dir, sample_rate) {
            Ok(sampler) => (
                sampler,
                KitStatus {
                    kit_id: kit_id.into(),
                    source: kit::FILE,
                    message: format!("Playing unpacked kit from {}.", dir.display()),
                },
            ),
            Err(_) if !dir.join("kit.json").is_file() => (
                Self::new_with_synthetic_kit(sample_rate),
                KitStatus::missing(kit_id),
            ),
            Err(err) => (
                Self::new_with_synthetic_kit(sample_rate),
                KitStatus::synthetic(kit_id, format!("{err} Playing the bundled synthetic kit.")),
            ),
        }
    }

    pub fn from_dir(dir: &Path, sample_rate: u32) -> Result<Self, String> {
        let manifest = kit::read_manifest(dir)?;
        let mut sampler = Self::new(sample_rate, 32);
        sampler.set_pan("hihat_closed", -0.35);
        sampler.set_pan("hihat_open", -0.35);
        sampler.set_pan("pedal_hihat", -0.35);
        sampler.set_pan("ride", 0.4);
        sampler.set_pan("crash", 0.2);
        sampler.set_pan("tom_high", -0.25);
        sampler.set_pan("tom_mid", 0.1);
        sampler.set_pan("tom_low", 0.35);
        for inst in &manifest.instruments {
            if let Some(group) = &inst.choke_group {
                sampler.set_choke_group(&inst.name, group);
            }
            for layer in &inst.layers {
                let mut files = Vec::new();
                for rel in &layer.files {
                    let path = kit::safe_wav(dir, rel)?;
                    files.push(Arc::new(kit::read_wav_48k(&path)?));
                }
                if files.is_empty() {
                    return Err(format!("Instrument '{}' has no WAV files.", inst.name));
                }
                sampler
                    .sample_bank
                    .entry(inst.name.clone())
                    .or_default()
                    .push(VelocityLayer {
                        lo: layer.velocity[0],
                        hi: layer.velocity[1],
                        files,
                    });
            }
        }
        if sampler.sample_bank.is_empty() {
            return Err("kit.json loaded no samples.".into());
        }
        Ok(sampler)
    }

    pub fn set_choke_group(&mut self, instrument: &str, group: &str) {
        self.choke_mappings.insert(instrument.into(), group.into());
    }

    pub fn set_pan(&mut self, instrument: &str, pan: f32) {
        self.pan.insert(instrument.into(), pan.clamp(-1.0, 1.0));
    }

    pub fn load_sample(&mut self, instrument: &str, pcm: Vec<f32>) {
        self.sample_bank
            .entry(instrument.into())
            .or_default()
            .push(VelocityLayer {
                lo: 0.0,
                hi: 1.0,
                files: vec![Arc::new(pcm)],
            });
    }

    pub fn has_instrument(&self, instrument: &str) -> bool {
        self.sample_bank
            .get(instrument)
            .is_some_and(|layers| layers.iter().any(|l| !l.files.is_empty()))
    }

    /// Silences every voice immediately (transport stop).
    pub fn all_off(&mut self) {
        for slot in self.voices.iter_mut() {
            *slot = None;
        }
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

        let vel = velocity.clamp(0.0, 1.0);
        let samples = if let Some(layers) = self.sample_bank.get(instrument) {
            let layer = layers
                .iter()
                .find(|l| vel >= l.lo && vel <= l.hi)
                .or_else(|| layers.last());
            let Some(layer) = layer.filter(|l| !l.files.is_empty()) else {
                return;
            };
            let idx = self.round_robin_idx.entry(instrument.into()).or_insert(0);
            let s = Arc::clone(&layer.files[*idx % layer.files.len()]);
            *idx = (*idx + 1) % layer.files.len();
            s
        } else {
            return;
        };

        // Constant-power pan.
        let pan = self.pan.get(instrument).copied().unwrap_or(0.0);
        let angle = (pan + 1.0) * 0.25 * std::f32::consts::PI;
        let (gain_left, gain_right) = (angle.cos(), angle.sin());

        let voice = ActiveVoice {
            samples,
            position: 0,
            velocity: velocity.clamp(0.0, 1.0),
            gain_left,
            gain_right,
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

                    output_left[i] += s * voice.gain_left;
                    output_right[i] += s * voice.gain_right;

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

    /// Cross-stick on the snare rim: a short woody click for quiet grooves.
    fn add_synthetic_sidestick(&mut self) {
        let len = (self.sample_rate as f32 * 0.06) as usize; // 60ms
        let mut s = Vec::with_capacity(len);
        let mut seed = 24680u32;
        for i in 0..len {
            let t = i as f32 / self.sample_rate as f32;
            let decay = (-70.0 * t).exp();
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let noise = (seed as f32 / 2147483648.0) - 1.0;
            let knock = (t * 2.0 * std::f32::consts::PI * 1450.0).sin()
                + (t * 2.0 * std::f32::consts::PI * 2900.0).sin() * 0.4;
            s.push((knock * 0.55 + noise * 0.25) * decay * 0.7);
        }
        self.load_sample("sidestick", s);
    }

    /// Foot-closed hi-hat "chick": darker and shorter than a stick hit.
    fn add_synthetic_pedal_hihat(&mut self) {
        let len = (self.sample_rate as f32 * 0.03) as usize; // 30ms
        let mut s = Vec::with_capacity(len);
        let mut seed = 13572u32;
        let mut lp = 0.0f32;
        for i in 0..len {
            let t = i as f32 / self.sample_rate as f32;
            let decay = (-110.0 * t).exp();
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let noise = (seed as f32 / 2147483648.0) - 1.0;
            lp += 0.35 * (noise - lp);
            s.push(lp * decay * 0.8);
        }
        self.load_sample("pedal_hihat", s);
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

        // Open hat has finished its choke fade; one live closed-hat voice remains.
        assert_eq!(sampler.voices.iter().flatten().count(), 1);
    }

    fn write_wav(path: &Path, rate: u32, samples: &[i16]) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(path, spec).unwrap();
        for sample in samples {
            writer.write_sample(*sample).unwrap();
        }
        writer.finalize().unwrap();
    }

    fn fixture_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "jam-kit-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn write_kit(dir: &Path, rel: &str, rate: u32, samples: &[i16]) {
        write_wav(&dir.join(rel), rate, samples);
        std::fs::write(
            dir.join("kit.json"),
            format!(
                r#"{{"schemaVersion":1,"id":"fixture-kit","sampleRate":48000,"instruments":[{{"name":"kick","layers":[{{"velocity":[0,1],"files":["{rel}"]}}]}}]}}"#
            ),
        )
        .unwrap();
    }

    #[test]
    fn file_kit_plays_fixture_wav_not_synthetic() {
        let dir = fixture_dir("play");
        let mut pcm = vec![0i16; 480];
        for sample in pcm.iter_mut().take(8) {
            *sample = 16_383;
        }
        write_kit(&dir, "kick.wav", 48_000, &pcm);
        let mut sampler = Sampler::from_dir(&dir, 48_000).expect("load fixture kit");
        sampler.trigger("kick", 1.0);
        let mut left = vec![0.0f32; 32];
        let mut right = vec![0.0f32; 32];
        sampler.render(&mut left, &mut right);
        let expected = 16_383.0 / 32768.0 * std::f32::consts::FRAC_1_SQRT_2;
        assert!(
            (left[0] - expected).abs() < 0.01,
            "left[0]={} expected≈{expected}",
            left[0]
        );
        let mut synthetic = Sampler::new_with_synthetic_kit(48_000);
        synthetic.trigger("kick", 1.0);
        let mut syn_l = vec![0.0f32; 32];
        let mut syn_r = vec![0.0f32; 32];
        synthetic.render(&mut syn_l, &mut syn_r);
        assert!((syn_l[0] - left[0]).abs() > 0.05);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn open_missing_pack_stays_synthetic_and_says_so() {
        let _lock = crate::kit::TEST_ENV.lock().unwrap();
        let dir = fixture_dir("missing");
        std::env::remove_var("JAM_SYNTHETIC_KIT");
        std::env::set_var("JAM_KIT_DIR", &dir);
        let (mut sampler, status) = Sampler::open("standard-rock-kit", 48_000);
        assert_eq!(status.source, crate::kit::SYNTHETIC);
        assert!(
            status.message.contains("not unpacked"),
            "{}",
            status.message
        );
        assert!(status.message.contains("JAM_LIVE=1"), "{}", status.message);
        assert!(sampler.has_instrument("kick"));
        sampler.trigger("kick", 1.0);
        let mut left = vec![0.0f32; 64];
        let mut right = vec![0.0f32; 64];
        sampler.render(&mut left, &mut right);
        assert!(left.iter().any(|s| s.abs() > 0.05));
        std::env::remove_var("JAM_KIT_DIR");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn open_file_kit_sets_file_status() {
        let _lock = crate::kit::TEST_ENV.lock().unwrap();
        let dir = fixture_dir("open-file");
        write_kit(&dir, "kick.wav", 48_000, &[16_383; 64]);
        std::env::remove_var("JAM_SYNTHETIC_KIT");
        std::env::set_var("JAM_KIT_DIR", &dir);
        let (mut sampler, status) = Sampler::open("fixture-kit", 48_000);
        assert_eq!(status.source, crate::kit::FILE);
        assert!(status.message.contains("unpacked"), "{}", status.message);
        sampler.trigger("kick", 1.0);
        let mut left = vec![0.0f32; 16];
        let mut right = vec![0.0f32; 16];
        sampler.render(&mut left, &mut right);
        assert!(left[0].abs() > 0.2);
        std::env::remove_var("JAM_KIT_DIR");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_zip_slip_and_wrong_rate() {
        let dir = fixture_dir("unsafe");
        write_kit(&dir, "kick.wav", 44_100, &[1000; 32]);
        assert!(Sampler::from_dir(&dir, 48_000).is_err());
        std::fs::write(
            dir.join("kit.json"),
            r#"{"schemaVersion":1,"id":"x","sampleRate":48000,"instruments":[{"name":"kick","layers":[{"velocity":[0,1],"files":["../secret.wav"]}]}]}"#,
        )
        .unwrap();
        let err = match Sampler::from_dir(&dir, 48_000) {
            Ok(_) => panic!("zip-slip path must be refused"),
            Err(e) => e,
        };
        assert!(err.contains("Unsafe"), "{err}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
