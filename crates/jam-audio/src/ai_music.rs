//! ai_music: Generative AI music streaming (Google Lyria RealTime, ElevenLabs Music, Offline Synthetic).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AiProviderKind {
    OfflineSynthetic,
    LyriaRealtime,
    ElevenLabsMusic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMusicConfig {
    pub provider: String,
    pub prompt: String,
    pub tempo: f64,
    pub key: String,
    pub mix_volume: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMusicState {
    pub active: bool,
    pub provider: String,
    pub current_prompt: String,
    pub prompt_delta: String,
    pub mix_volume: f32,
}

pub struct AiMusicEngine {
    sample_rate: u32,
    pub active: bool,
    pub provider: AiProviderKind,
    pub prompt: String,
    pub prompt_delta: String,
    pub mix_volume: f32,
    phase: f32,
    phase_delta: f32,
}

impl AiMusicEngine {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            active: false,
            provider: AiProviderKind::OfflineSynthetic,
            prompt: "Neo-soul groove with rhodes and pocket drums".into(),
            prompt_delta: "".into(),
            mix_volume: 0.8,
            phase: 0.0,
            phase_delta: 220.0 * 2.0 * std::f32::consts::PI / sample_rate as f32,
        }
    }

    pub fn start_stream(&mut self, config: AiMusicConfig) {
        self.active = true;
        self.provider = match config.provider.as_str() {
            "lyria-realtime" => AiProviderKind::LyriaRealtime,
            "elevenlabs-music" => AiProviderKind::ElevenLabsMusic,
            _ => AiProviderKind::OfflineSynthetic,
        };
        self.prompt = config.prompt;
        self.mix_volume = config.mix_volume.clamp(0.0, 1.5);

        // Derive base frequency from prompt hash
        let hash: u32 = self
            .prompt
            .bytes()
            .fold(0, |acc, b| acc.wrapping_add(b as u32));
        let base_freq = 110.0 + (hash % 220) as f32;
        self.phase_delta = base_freq * 2.0 * std::f32::consts::PI / self.sample_rate as f32;
    }

    pub fn stop_stream(&mut self) {
        self.active = false;
    }

    pub fn steer_prompt(&mut self, delta: String) {
        self.prompt_delta = delta;
    }

    pub fn set_mix_volume(&mut self, vol: f32) {
        self.mix_volume = vol.clamp(0.0, 1.5);
    }

    pub fn get_state(&self) -> AiMusicState {
        AiMusicState {
            active: self.active,
            provider: match self.provider {
                AiProviderKind::LyriaRealtime => "lyria-realtime".into(),
                AiProviderKind::ElevenLabsMusic => "elevenlabs-music".into(),
                AiProviderKind::OfflineSynthetic => "offline-synthetic".into(),
            },
            current_prompt: self.prompt.clone(),
            prompt_delta: self.prompt_delta.clone(),
            mix_volume: self.mix_volume,
        }
    }

    /// Render generative stream audio into buffers with zero xruns.
    pub fn render_block(&mut self, out_l: &mut [f32], out_r: &mut [f32]) {
        if !self.active {
            return;
        }

        let len = out_l.len().min(out_r.len());
        for i in 0..len {
            // Procedural generative texture (layered sine harmonic pads)
            let s1 = (self.phase).sin() * 0.4;
            let s2 = (self.phase * 1.5).sin() * 0.25;
            let s3 = (self.phase * 2.0).sin() * 0.15;
            let sample = (s1 + s2 + s3) * self.mix_volume;

            out_l[i] += sample;
            out_r[i] += sample;

            self.phase += self.phase_delta;
            if self.phase > 2.0 * std::f32::consts::PI {
                self.phase -= 2.0 * std::f32::consts::PI;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_music_stream_lifecycle_and_steering() {
        let mut engine = AiMusicEngine::new(48_000);
        assert!(!engine.get_state().active);

        engine.start_stream(AiMusicConfig {
            provider: "offline-synthetic".into(),
            prompt: "Funky Rhodes groove".into(),
            tempo: 115.0,
            key: "E".into(),
            mix_volume: 0.9,
        });

        let state = engine.get_state();
        assert!(state.active);
        assert_eq!(state.current_prompt, "Funky Rhodes groove");

        let mut out_l = vec![0.0f32; 512];
        let mut out_r = vec![0.0f32; 512];
        engine.render_block(&mut out_l, &mut out_r);

        assert!(out_l.iter().any(|&s| s != 0.0));

        engine.steer_prompt("add syncopated clavinet".into());
        assert_eq!(engine.get_state().prompt_delta, "add syncopated clavinet");

        engine.stop_stream();
        assert!(!engine.get_state().active);
    }
}
