//! Documented Lyria RealTime protocol. Live WebSocket is not configured.
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::VecDeque;

pub const NOT_CONFIGURED: &str = "Lyria RealTime is not configured. Add a Google Gemini key in Settings, set JAM_LIVE=1, and record a provider session before this command may open a WebSocket. Band mode stays available. Lyria BPM is a request, not the band clock.";

const MAX_MESSAGE: usize = 4 * 1024 * 1024;
const MODEL: &str = "models/lyria-realtime-exp";

pub fn protocol() -> Value {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/providers/lyria/protocol.json"
    ))
    .expect("lyria protocol fixture")
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub text: String,
    pub weight: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub prompts: Vec<Prompt>,
    pub bpm: f64,
    pub scale: String,
    #[serde(default = "half")]
    pub density: f64,
    #[serde(default = "half")]
    pub brightness: f64,
    #[serde(default)]
    pub mute_bass: bool,
    #[serde(default)]
    pub mute_drums: bool,
}

fn half() -> f64 {
    0.5
}

impl Default for Config {
    fn default() -> Self {
        Self {
            prompts: vec![Prompt {
                text: "Original instrumental funk rhythm section, space for lead guitar".into(),
                weight: 1.0,
            }],
            bpm: 100.0,
            scale: "G_MAJOR_E_MINOR".into(),
            density: 0.5,
            brightness: 0.5,
            mute_bass: false,
            mute_drums: false,
        }
    }
}

pub fn validate(config: &Config) -> Result<(), String> {
    if config.prompts.is_empty()
        || config.prompts.len() > 8
        || config.prompts.iter().any(|p| {
            p.text.trim().is_empty()
                || p.text.len() > 300
                || !p.weight.is_finite()
                || !(0.0..=2.0).contains(&p.weight)
        })
        || !config.bpm.is_finite()
        || !(40.0..=240.0).contains(&config.bpm)
        || config.scale.trim().is_empty()
        || config.scale.len() > 40
        || !config.density.is_finite()
        || !(0.0..=1.0).contains(&config.density)
        || !config.brightness.is_finite()
        || !(0.0..=1.0).contains(&config.brightness)
    {
        return Err(
            "Choose 1–8 prompts, 40–240 BPM as a request, and density/brightness from 0 to 1."
                .into(),
        );
    }
    Ok(())
}

pub fn setup_message() -> Value {
    json!({ "setup": { "model": MODEL } })
}

pub fn prompt_message(prompts: &[Prompt]) -> Value {
    json!({
        "clientContent": {
            "weightedPrompts": prompts
        }
    })
}

pub fn config_message(config: &Config) -> Value {
    json!({
        "musicGenerationConfig": {
            "bpm": config.bpm,
            "scale": config.scale,
            "density": config.density,
            "brightness": config.brightness,
            "guidance": 4.0,
            "muteBass": config.mute_bass,
            "muteDrums": config.mute_drums
        }
    })
}

pub fn playback(control: &str) -> Value {
    json!({ "playbackControl": control })
}

/// The documented alpha contract is interleaved stereo PCM16 at 48 kHz.
pub fn decode_audio(value: &Value) -> Result<Vec<i16>, String> {
    let chunks = value["serverContent"]["audioChunks"]
        .as_array()
        .ok_or("Missing audioChunks")?;
    if chunks.is_empty() || chunks.len() > 64 {
        return Err("Invalid audio chunk count".into());
    }
    let mut samples = Vec::new();
    for chunk in chunks {
        let mime = chunk["mimeType"]
            .as_str()
            .ok_or("Missing audio MIME type")?;
        let parts: Vec<_> = mime.split(';').map(str::trim).collect();
        if parts[0] != "audio/pcm"
            || !parts.contains(&"rate=48000")
            || parts
                .iter()
                .skip(1)
                .any(|p| !["rate=48000", "channels=2"].contains(p))
        {
            return Err(
                "Expected explicit 48 kHz stereo PCM; inspect provider format before integrating"
                    .into(),
            );
        }
        let encoded = chunk["data"].as_str().ok_or("Missing audio bytes")?;
        if encoded.len() > MAX_MESSAGE {
            return Err("Audio chunk exceeds bound".into());
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| "Invalid base64 audio")?;
        if bytes.is_empty()
            || !bytes.len().is_multiple_of(4)
            || samples.len() * 2 + bytes.len() > MAX_MESSAGE
        {
            return Err("Audio is empty, unaligned or exceeds the message bound".into());
        }
        samples.extend(
            bytes
                .as_chunks::<2>()
                .0
                .iter()
                .map(|s| i16::from_le_bytes([s[0], s[1]])),
        );
    }
    Ok(samples)
}

#[derive(Clone, Debug)]
pub struct Jitter {
    queued: VecDeque<i16>,
    prefill: usize,
    primed: bool,
}

impl Jitter {
    pub fn new(prefill_frames: usize) -> Self {
        Self {
            queued: VecDeque::new(),
            prefill: prefill_frames.saturating_mul(2),
            primed: false,
        }
    }

    fn cap(&self) -> usize {
        // At least ~0.5 s of 48 kHz interleaved stereo, or 32× the prefill window.
        self.prefill.saturating_mul(32).max(48_000)
    }

    pub fn push(&mut self, samples: &[i16]) {
        self.queued.extend(samples);
        let extra = self.queued.len().saturating_sub(self.cap());
        if extra > 0 {
            self.queued.drain(..extra);
        }
        if !self.primed && self.queued.len() >= self.prefill {
            self.primed = true;
        }
    }

    /// Returns interleaved stereo and whether the buffer is starving.
    pub fn take(&mut self, frames: usize) -> (Vec<i16>, bool) {
        let need = frames.saturating_mul(2);
        if !self.primed || self.queued.len() < need {
            self.primed = false;
            self.queued.clear();
            return (vec![0; need], true);
        }
        let mut out = Vec::with_capacity(need);
        for _ in 0..need {
            out.push(self.queued.pop_front().unwrap_or(0));
        }
        (out, false)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub phase: String,
    pub requested_bpm: f64,
    pub scale: String,
    pub buffering: bool,
    pub live: bool,
    pub drives_clock: bool,
    pub outbound: usize,
}

#[derive(Clone, Debug)]
pub struct Machine {
    pub phase: &'static str,
    pub config: Config,
    pub outbound: Vec<Value>,
    pub jitter: Jitter,
    pub buffering: bool,
}

impl Default for Machine {
    fn default() -> Self {
        Self {
            phase: "idle",
            config: Config::default(),
            outbound: Vec::new(),
            jitter: Jitter::new(8),
            buffering: false,
        }
    }
}

impl Machine {
    pub fn from_fixture() -> Result<Self, String> {
        let doc = protocol();
        let mut machine = Self::default();
        machine.send(doc["setup"].clone());
        machine.receive(&doc["setupReply"])?;
        machine.send(doc["prompts"].clone());
        machine.send(doc["config"].clone());
        machine.send(doc["play"].clone());
        let samples = decode_audio(&doc["audio"])?;
        machine.jitter.push(&samples);
        let (_, starving) = machine.jitter.take(1);
        machine.buffering = starving;
        machine.phase = "playing";
        machine.config.bpm = doc["config"]["musicGenerationConfig"]["bpm"]
            .as_f64()
            .unwrap_or(100.0);
        Ok(machine)
    }

    fn send(&mut self, message: Value) {
        self.outbound.push(message);
    }

    pub fn receive(&mut self, message: &Value) -> Result<(), String> {
        if message["setupComplete"].is_object() {
            if self.outbound.first() != Some(&setup_message())
                && self.outbound.first() != Some(&protocol()["setup"])
            {
                return Err("Expected setup before setupComplete".into());
            }
            if self
                .outbound
                .iter()
                .any(|m| m.get("playbackControl").is_some() || m.get("clientContent").is_some())
            {
                return Err("Controls must wait for setupComplete".into());
            }
            self.phase = "ready";
            return Ok(());
        }
        if message["serverContent"]["audioChunks"].is_array() {
            let samples = decode_audio(message)?;
            self.jitter.push(&samples);
            return Ok(());
        }
        Err("Unsupported Lyria message".into())
    }

    pub fn apply(&mut self, patch: Config) -> Result<(), String> {
        if self.phase == "idle" {
            return Err("Controls must wait for setupComplete".into());
        }
        validate(&patch)?;
        let reset =
            (patch.bpm - self.config.bpm).abs() > f64::EPSILON || patch.scale != self.config.scale;
        self.config = patch;
        self.send(prompt_message(&self.config.prompts));
        self.send(config_message(&self.config));
        if reset {
            self.send(playback("RESET_CONTEXT"));
        }
        Ok(())
    }

    pub fn status(&self) -> Status {
        Status {
            phase: self.phase.into(),
            requested_bpm: self.config.bpm,
            scale: self.config.scale.clone(),
            buffering: self.buffering,
            live: false,
            drives_clock: false,
            outbound: self.outbound.len(),
        }
    }
}

pub fn recorded_for_session() -> Result<Machine, String> {
    match std::env::var("JAM_LYRIA_FIXTURE") {
        Ok(value) if value == "1" => Machine::from_fixture(),
        _ => Err(NOT_CONFIGURED.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_orders_setup_before_controls_and_decodes_48k_stereo() {
        let machine = Machine::from_fixture().unwrap();
        assert_eq!(machine.phase, "playing");
        assert!(!machine.status().drives_clock);
        assert!(!machine.status().live);
        assert_eq!(machine.outbound[0], protocol()["setup"]);
        assert_eq!(machine.outbound[1], protocol()["prompts"]);
        assert_eq!(machine.outbound[2], protocol()["config"]);
        assert_eq!(machine.outbound[3], protocol()["play"]);
        let samples = decode_audio(&protocol()["audio"]).unwrap();
        assert_eq!(samples.len() % 2, 0);
        assert!(!samples.is_empty());
        assert!(decode_audio(&json!({"serverContent":{"audioChunks":[{"data":"AEAAwA==","mimeType":"audio/pcm;rate=44100"}]}})).is_err());
    }

    #[test]
    fn bpm_patch_is_a_request_and_asks_for_reset_not_a_clock() {
        let mut machine = Machine::from_fixture().unwrap();
        machine
            .apply(Config {
                bpm: 110.0,
                ..machine.config.clone()
            })
            .unwrap();
        assert_eq!(machine.config.bpm, 110.0);
        assert_eq!(
            machine.outbound.last().unwrap()["playbackControl"],
            "RESET_CONTEXT"
        );
        assert!(!machine.status().drives_clock);
    }

    #[test]
    fn jitter_prefills_then_marks_late_chunks_as_buffering() {
        let mut jitter = Jitter::new(4);
        jitter.push(&[1, 2, 3, 4]);
        let (early, starving) = jitter.take(2);
        assert!(starving);
        assert_eq!(early, vec![0, 0, 0, 0]);
        jitter.push(&[5, 6, 7, 8, 9, 10, 11, 12]);
        let (ready, ok) = jitter.take(2);
        assert!(!ok);
        assert_eq!(ready, vec![5, 6, 7, 8]);
        let (_, late) = jitter.take(8);
        assert!(late);
    }

    #[test]
    fn jitter_drops_stale_samples_on_underflow_and_bounds_the_queue() {
        let mut jitter = Jitter::new(4);
        jitter.push(&(1..100).collect::<Vec<i16>>());
        let (_, starving) = jitter.take(200);
        assert!(starving);
        assert!(jitter.queued.is_empty());
        jitter.push(&[11, 12, 13, 14, 15, 16, 17, 18]);
        let (live, ok) = jitter.take(2);
        assert!(!ok);
        assert_eq!(live, vec![11, 12, 13, 14]);
        for _ in 0..8 {
            jitter.push(&[7; 10_000]);
        }
        assert!(jitter.queued.len() <= jitter.cap());
    }

    #[test]
    fn controls_before_setup_complete_are_refused() {
        let mut machine = Machine::default();
        machine.send(setup_message());
        machine.send(playback("PLAY"));
        assert!(machine.receive(&protocol()["setupReply"]).is_err());
    }

    #[test]
    fn apply_before_setup_complete_is_refused() {
        let mut machine = Machine::default();
        machine.send(setup_message());
        assert_eq!(
            machine.apply(Config::default()).unwrap_err(),
            "Controls must wait for setupComplete"
        );
        assert!(machine
            .outbound
            .iter()
            .all(|m| m.get("playbackControl").is_none() && m.get("clientContent").is_none()));
        machine.receive(&protocol()["setupReply"]).unwrap();
        assert_eq!(machine.phase, "ready");
        machine.apply(Config::default()).unwrap();
        assert!(machine
            .outbound
            .iter()
            .any(|m| m.get("clientContent").is_some()));
    }
}
