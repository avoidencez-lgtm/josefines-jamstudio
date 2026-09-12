//! Bass and comp: rustysynth + unpacked SF2, or sine voices when the pack is missing.
//! oxisynth is LGPL and is not used.

use crate::kit::{self, SF2_NOT_CONFIGURED, SINE};
use jam_core::timeline::SAMPLE_RATE;
use rustysynth::{SoundFont, Synthesizer, SynthesizerSettings};
use std::collections::HashSet;
use std::fs::File;
use std::path::Path;
use std::sync::Arc;

#[derive(Clone)]
struct SineVoice {
    channel: u8,
    key: u8,
    phase: f32,
    phase_inc: f32,
    velocity: f32,
    age_samples: usize,
    decay_samples: usize,
    is_bass: bool,
}

struct FontPair {
    bass: Synthesizer,
    comp: Synthesizer,
}

pub struct Sf2Synth {
    sample_rate: u32,
    voices: Vec<SineVoice>,
    max_polyphony: usize,
    fonts: Option<FontPair>,
    held: HashSet<(u8, u8)>,
    pub source: &'static str,
    pub message: String,
}

impl Default for Sf2Synth {
    fn default() -> Self {
        Self::new(SAMPLE_RATE)
    }
}

impl Sf2Synth {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            voices: Vec::with_capacity(32),
            max_polyphony: 32,
            fonts: None,
            held: HashSet::new(),
            source: SINE,
            message: SF2_NOT_CONFIGURED.into(),
        }
    }

    pub fn open(sample_rate: u32) -> Self {
        if std::env::var("JAM_SYNTHETIC_KIT").as_deref() == Ok("1") {
            let mut synth = Self::new(sample_rate);
            synth.message = "Sine voices forced (JAM_SYNTHETIC_KIT=1).".into();
            return synth;
        }
        let dir = kit::sf2_dir();
        match Self::from_dir(&dir, sample_rate) {
            Ok(synth) => synth,
            Err(_) if !kit::sf2_ready(&dir) => {
                let mut synth = Self::new(sample_rate);
                synth.message = SF2_NOT_CONFIGURED.into();
                synth
            }
            Err(err) => {
                let mut synth = Self::new(sample_rate);
                synth.message = format!("{err} Bass and comp use sine voices.");
                synth
            }
        }
    }

    pub fn from_dir(dir: &Path, sample_rate: u32) -> Result<Self, String> {
        if !kit::sf2_ready(dir) {
            return Err(SF2_NOT_CONFIGURED.into());
        }
        Ok(Self {
            sample_rate,
            voices: Vec::new(),
            max_polyphony: 32,
            fonts: Some(FontPair {
                bass: load_font(&dir.join("bass.sf2"), sample_rate)?,
                comp: load_font(&dir.join("comp.sf2"), sample_rate)?,
            }),
            held: HashSet::new(),
            source: kit::SF2,
            message: format!("Playing SoundFont from {}.", dir.display()),
        })
    }

    pub fn note_on(&mut self, channel: u8, key: u8, velocity: f32) {
        self.held.insert((channel, key));
        if let Some(fonts) = self.fonts.as_mut() {
            let vel = (velocity.clamp(0.0, 1.0) * 127.0).round() as i32;
            engine_mut(fonts, channel).note_on(0, i32::from(key), vel);
            return;
        }
        let is_bass = channel == 0;
        let freq = 440.0 * 2.0f32.powf((key as f32 - 69.0) / 12.0);
        let phase_inc = freq / self.sample_rate as f32;
        let decay_sec = if is_bass { 0.8 } else { 1.2 };
        let decay_samples = (self.sample_rate as f32 * decay_sec) as usize;
        self.voices
            .retain(|v| !(v.channel == channel && v.key == key));
        if self.voices.len() >= self.max_polyphony {
            self.voices.remove(0);
        }
        self.voices.push(SineVoice {
            channel,
            key,
            phase: 0.0,
            phase_inc,
            velocity: velocity.clamp(0.0, 1.0),
            age_samples: 0,
            decay_samples,
            is_bass,
        });
    }

    pub fn note_off(&mut self, channel: u8, key: u8) {
        self.held.remove(&(channel, key));
        if let Some(fonts) = self.fonts.as_mut() {
            engine_mut(fonts, channel).note_off(0, i32::from(key));
            return;
        }
        for v in self.voices.iter_mut() {
            if v.channel == channel && v.key == key {
                v.decay_samples = v.age_samples + (self.sample_rate as f32 * 0.05) as usize;
            }
        }
    }

    pub fn all_notes_off(&mut self) {
        self.held.clear();
        if let Some(fonts) = self.fonts.as_mut() {
            fonts.bass.note_off_all(true);
            fonts.comp.note_off_all(true);
            return;
        }
        self.voices.clear();
    }

    pub fn sustaining_voices(&self, channel: u8) -> usize {
        if self.fonts.is_some() {
            return self.held.iter().filter(|(ch, _)| *ch == channel).count();
        }
        let short_release = (self.sample_rate as f32 * 0.05) as usize;
        self.voices
            .iter()
            .filter(|v| v.channel == channel && v.decay_samples > v.age_samples + short_release)
            .count()
    }

    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        self.render_channel(0, left, right);
        self.render_channel(1, left, right);
    }

    pub fn render_channel(&mut self, channel: u8, left: &mut [f32], right: &mut [f32]) {
        if let Some(fonts) = self.fonts.as_mut() {
            let mut l = vec![0.0f32; left.len()];
            let mut r = vec![0.0f32; right.len()];
            engine_mut(fonts, channel).render(&mut l, &mut r);
            for i in 0..left.len().min(right.len()) {
                left[i] += l[i];
                right[i] += r[i];
            }
            return;
        }
        render_sine(&mut self.voices, self.sample_rate, channel, left, right);
    }
}

fn engine_mut(fonts: &mut FontPair, channel: u8) -> &mut Synthesizer {
    if channel == 0 {
        &mut fonts.bass
    } else {
        &mut fonts.comp
    }
}

fn load_font(path: &Path, sample_rate: u32) -> Result<Synthesizer, String> {
    let mut file = File::open(path).map_err(|e| format!("Cannot read {}. {e}", path.display()))?;
    let font = SoundFont::new(&mut file)
        .map_err(|e| format!("{} is not a SoundFont. {e}", path.display()))?;
    let mut settings = SynthesizerSettings::new(sample_rate as i32);
    settings.enable_reverb_and_chorus = false;
    settings.maximum_polyphony = 32;
    Synthesizer::new(&Arc::new(font), &settings)
        .map_err(|e| format!("Cannot start {}. {e}", path.display()))
}

fn render_sine(
    voices: &mut Vec<SineVoice>,
    sample_rate: u32,
    channel: u8,
    left: &mut [f32],
    right: &mut [f32],
) {
    let frames = left.len().min(right.len());
    for v in voices.iter_mut().filter(|v| v.channel == channel) {
        let start_age = v.age_samples;
        let end_age = start_age + frames;
        if start_age >= v.decay_samples {
            continue;
        }
        for i in 0..frames {
            let current_age = start_age + i;
            if current_age >= v.decay_samples {
                break;
            }
            let t = current_age as f32 / sample_rate as f32;
            let env = (-4.0 * t).exp() * v.velocity;
            let sample = if v.is_bass {
                let s1 = (v.phase * 2.0 * std::f32::consts::PI).sin();
                let s2 = (v.phase * 4.0 * std::f32::consts::PI).sin() * 0.35;
                (s1 + s2) * env * 0.7
            } else {
                let s1 = (v.phase * 2.0 * std::f32::consts::PI).sin();
                let s2 = (v.phase * 6.0 * std::f32::consts::PI).sin() * 0.2;
                let s3 = (v.phase * 8.0 * std::f32::consts::PI).sin() * 0.1;
                (s1 + s2 + s3) * env * 0.4
            };
            v.phase = (v.phase + v.phase_inc) % 1.0;
            left[i] += sample;
            right[i] += sample;
        }
        v.age_samples = end_age;
    }
    voices.retain(|v| v.age_samples < v.decay_samples);
}

/// Tiny looping sine SF2 for tests. Not a published instrument pack.
pub fn write_minimal_sf2(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let rate = 48_000u32;
    let n = 64u32;
    let mut pcm = Vec::with_capacity(((n + 46) * 2) as usize);
    for i in 0..n {
        let s = ((i as f32 / n as f32) * 2.0 * std::f32::consts::PI).sin();
        pcm.extend_from_slice(&((s * 16_000.0).round() as i16).to_le_bytes());
    }
    for _ in 0..46 {
        pcm.extend_from_slice(&0i16.to_le_bytes());
    }
    let mut info = Vec::new();
    info.extend(chunk(b"ifil", &[2, 0, 1, 0]));
    info.extend(chunk(b"isng", b"EMU8000\0"));
    info.extend(chunk(b"INAM", b"jam-fixture\0"));
    let mut sdta = Vec::new();
    sdta.extend(chunk(b"smpl", &pcm));
    let mut phdr = Vec::new();
    phdr.extend(preset_header(b"preset", 0, 0, 0));
    phdr.extend(preset_header(b"EOP", 0, 0, 1));
    let mut pbag = Vec::new();
    pbag.extend(u16::to_le_bytes(0));
    pbag.extend(u16::to_le_bytes(0));
    pbag.extend(u16::to_le_bytes(1));
    pbag.extend(u16::to_le_bytes(0));
    let pmod = vec![0u8; 10];
    let mut pgen = Vec::new();
    pgen.extend(u16::to_le_bytes(41));
    pgen.extend(u16::to_le_bytes(0));
    pgen.extend(u16::to_le_bytes(0));
    pgen.extend(u16::to_le_bytes(0));
    let mut inst = Vec::new();
    inst.extend(inst_header(b"sine", 0));
    inst.extend(inst_header(b"EOI", 1));
    let mut ibag = Vec::new();
    ibag.extend(u16::to_le_bytes(0));
    ibag.extend(u16::to_le_bytes(0));
    ibag.extend(u16::to_le_bytes(2));
    ibag.extend(u16::to_le_bytes(0));
    let imod = vec![0u8; 10];
    let mut igen = Vec::new();
    igen.extend(u16::to_le_bytes(43));
    igen.extend(u16::to_le_bytes(127u16 << 8));
    igen.extend(u16::to_le_bytes(53));
    igen.extend(u16::to_le_bytes(0));
    igen.extend(u16::to_le_bytes(0));
    igen.extend(u16::to_le_bytes(0));
    let mut shdr = Vec::new();
    shdr.extend(sample_header(b"sine", 0, n, n / 8, n - 8, rate));
    shdr.extend([0u8; 46]);
    let mut pdta = Vec::new();
    pdta.extend(chunk(b"phdr", &phdr));
    pdta.extend(chunk(b"pbag", &pbag));
    pdta.extend(chunk(b"pmod", &pmod));
    pdta.extend(chunk(b"pgen", &pgen));
    pdta.extend(chunk(b"inst", &inst));
    pdta.extend(chunk(b"ibag", &ibag));
    pdta.extend(chunk(b"imod", &imod));
    pdta.extend(chunk(b"igen", &igen));
    pdta.extend(chunk(b"shdr", &shdr));
    let mut body = Vec::new();
    body.extend(list(b"INFO", &info));
    body.extend(list(b"sdta", &sdta));
    body.extend(list(b"pdta", &pdta));
    let mut riff = Vec::new();
    riff.extend(b"RIFF");
    riff.extend(&(body.len() as u32 + 4).to_le_bytes());
    riff.extend(b"sfbk");
    riff.extend(body);
    std::fs::write(path, riff).map_err(|e| e.to_string())
}

fn chunk(id: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + data.len() + 1);
    out.extend(id);
    out.extend(&(data.len() as u32).to_le_bytes());
    out.extend(data);
    if data.len() % 2 == 1 {
        out.push(0);
    }
    out
}

fn list(id: &[u8; 4], data: &[u8]) -> Vec<u8> {
    let mut inner = Vec::with_capacity(4 + data.len());
    inner.extend(id);
    inner.extend(data);
    chunk(b"LIST", &inner)
}

fn preset_header(name: &[u8], preset: u16, bank: u16, bag: u16) -> Vec<u8> {
    let mut out = vec![0u8; 38];
    out[..name.len().min(19)].copy_from_slice(&name[..name.len().min(19)]);
    out[20..22].copy_from_slice(&preset.to_le_bytes());
    out[22..24].copy_from_slice(&bank.to_le_bytes());
    out[24..26].copy_from_slice(&bag.to_le_bytes());
    out
}

fn inst_header(name: &[u8], bag: u16) -> Vec<u8> {
    let mut out = vec![0u8; 22];
    out[..name.len().min(19)].copy_from_slice(&name[..name.len().min(19)]);
    out[20..22].copy_from_slice(&bag.to_le_bytes());
    out
}

fn sample_header(
    name: &[u8],
    start: u32,
    end: u32,
    loop_start: u32,
    loop_end: u32,
    rate: u32,
) -> Vec<u8> {
    let mut out = vec![0u8; 46];
    out[..name.len().min(19)].copy_from_slice(&name[..name.len().min(19)]);
    out[20..24].copy_from_slice(&start.to_le_bytes());
    out[24..28].copy_from_slice(&end.to_le_bytes());
    out[28..32].copy_from_slice(&loop_start.to_le_bytes());
    out[32..36].copy_from_slice(&loop_end.to_le_bytes());
    out[36..40].copy_from_slice(&rate.to_le_bytes());
    out[40] = 60;
    out[44..46].copy_from_slice(&1u16.to_le_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sf2_synth_bass_and_comp_render() {
        let mut synth = Sf2Synth::new(48_000);
        synth.note_on(0, 33, 0.9);
        synth.note_on(1, 57, 0.7);
        synth.note_on(1, 61, 0.7);
        synth.note_on(1, 67, 0.7);
        let mut left = vec![0.0f32; 512];
        let mut right = vec![0.0f32; 512];
        synth.render(&mut left, &mut right);
        assert!(left.iter().any(|&s| s.abs() > 0.05));
        assert!(right.iter().any(|&s| s.abs() > 0.05));
        assert_eq!(synth.source, SINE);
    }

    #[test]
    fn missing_sf2_stays_sine_and_says_so() {
        let _lock = crate::kit::TEST_ENV.lock().unwrap();
        let dir = std::env::temp_dir().join(format!("jam-sf2-missing-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::env::remove_var("JAM_SYNTHETIC_KIT");
        std::env::set_var("JAM_SF2_DIR", &dir);
        let synth = Sf2Synth::open(48_000);
        assert_eq!(synth.source, SINE);
        assert!(synth.message.contains("JAM_LIVE=1"), "{}", synth.message);
        std::env::remove_var("JAM_SF2_DIR");
    }

    #[test]
    fn file_sf2_plays_fixture_not_sine() {
        let _lock = crate::kit::TEST_ENV.lock().unwrap();
        let dir = std::env::temp_dir().join(format!("jam-sf2-play-{}", std::process::id()));
        write_minimal_sf2(&dir.join("bass.sf2")).expect("bass sf2");
        write_minimal_sf2(&dir.join("comp.sf2")).expect("comp sf2");
        std::env::remove_var("JAM_SYNTHETIC_KIT");
        std::env::set_var("JAM_SF2_DIR", &dir);
        let mut synth = Sf2Synth::open(48_000);
        assert_eq!(synth.source, crate::kit::SF2, "{}", synth.message);
        synth.note_on(0, 60, 1.0);
        let mut left = vec![0.0f32; 1024];
        let mut right = vec![0.0f32; 1024];
        synth.render_channel(0, &mut left, &mut right);
        assert!(left.iter().any(|s| s.abs() > 0.001), "file SF2 was silent");
        let mut sine = Sf2Synth::new(48_000);
        sine.note_on(0, 60, 1.0);
        let mut sl = vec![0.0f32; 1024];
        let mut sr = vec![0.0f32; 1024];
        sine.render_channel(0, &mut sl, &mut sr);
        assert!((left[8] - sl[8]).abs() > 1e-4);
        std::env::remove_var("JAM_SF2_DIR");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn probe_real_freepats_pack_when_env_set() {
        let Ok(dir) = std::env::var("JAM_SF2_PROBE") else {
            return;
        };
        let mut synth = Sf2Synth::from_dir(std::path::Path::new(&dir), 48_000)
            .expect("FreePats pack must load");
        synth.note_on(0, 36, 1.0);
        synth.note_on(1, 60, 0.8);
        let mut left = vec![0.0f32; 2048];
        let mut right = vec![0.0f32; 2048];
        synth.render(&mut left, &mut right);
        assert!(
            left.iter().any(|s| s.abs() > 0.001),
            "FreePats pack was silent"
        );
    }
}
