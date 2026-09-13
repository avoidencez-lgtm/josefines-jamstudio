//! Lyria RealTime protocol and credential-safe WebSocket transport.
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::{net::TcpStream, time::timeout};
use tokio_tungstenite::{
    tungstenite::{protocol::WebSocketConfig, Message},
    MaybeTlsStream, WebSocketStream,
};

pub const NOT_CONFIGURED: &str = "Lyria RealTime is not configured. Add a Google Gemini key in Settings and set JAM_LIVE=1 before this command may open a WebSocket. Band mode stays available. Lyria BPM is a request, not the band clock.";

const MAX_MESSAGE: usize = 4 * 1024 * 1024;
pub const MODEL: &str = "models/lyria-realtime-exp";
pub const USAGE_PATH: &str =
    "/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateMusic";
const ENDPOINT: &str = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateMusic";
const SCALES: &[&str] = &[
    "C_MAJOR_A_MINOR",
    "D_FLAT_MAJOR_B_FLAT_MINOR",
    "D_MAJOR_B_MINOR",
    "E_FLAT_MAJOR_C_MINOR",
    "E_MAJOR_D_FLAT_MINOR",
    "F_MAJOR_D_MINOR",
    "G_FLAT_MAJOR_E_FLAT_MINOR",
    "G_MAJOR_E_MINOR",
    "A_FLAT_MAJOR_F_MINOR",
    "A_MAJOR_G_FLAT_MINOR",
    "B_FLAT_MAJOR_G_MINOR",
    "B_MAJOR_A_FLAT_MINOR",
    "SCALE_UNSPECIFIED",
];

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
                || p.weight == 0.0
        })
        || !config.bpm.is_finite()
        || config.bpm.fract() != 0.0
        || !(60.0..=200.0).contains(&config.bpm)
        || !SCALES.contains(&config.scale.as_str())
        || !config.density.is_finite()
        || !(0.0..=1.0).contains(&config.density)
        || !config.brightness.is_finite()
        || !(0.0..=1.0).contains(&config.brightness)
    {
        return Err(
            "Choose 1–8 nonzero-weight prompts, an allowed scale, whole-number BPM from 60 to 200, and density/brightness from 0 to 1."
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

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub struct LiveSocket(Socket);

fn socket_error(error: tokio_tungstenite::tungstenite::Error) -> String {
    match error {
        tokio_tungstenite::tungstenite::Error::Http(response) => format!(
            "WebSocket handshake rejected with HTTP {}",
            response.status().as_u16()
        ),
        tokio_tungstenite::tungstenite::Error::Tls(_) => "WebSocket TLS validation failed".into(),
        _ => "WebSocket connection failed (details suppressed to protect credentials)".into(),
    }
}

pub fn should_reconnect(error: &str) -> bool {
    matches!(
        error,
        "WebSocket closed"
            | "WebSocket receive failed"
            | "Pong failed"
            | "WebSocket send timed out"
            | "WebSocket send failed"
    )
}

async fn send(socket: &mut Socket, value: &Value) -> Result<(), String> {
    timeout(
        Duration::from_secs(5),
        socket.send(Message::Text(value.to_string().into())),
    )
    .await
    .map_err(|_| "WebSocket send timed out")?
    .map_err(|_| "WebSocket send failed".into())
}

async fn receive(socket: &mut Socket) -> Result<Value, String> {
    loop {
        let message = socket
            .next()
            .await
            .ok_or("WebSocket closed")?
            .map_err(|_| "WebSocket receive failed")?;
        let bytes = match message {
            Message::Text(text) => text.as_bytes().to_vec(),
            Message::Binary(bytes) => bytes.to_vec(),
            Message::Ping(_) => {
                socket.flush().await.map_err(|_| "Pong failed")?;
                continue;
            }
            Message::Pong(_) => continue,
            Message::Close(_) => return Err("WebSocket closed".into()),
            _ => return Err("Unexpected WebSocket frame".into()),
        };
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| "Invalid server JSON")?;
        if value.get("error").is_some() {
            return Err("Provider rejected the session (details suppressed)".into());
        }
        return Ok(value);
    }
}

impl LiveSocket {
    pub async fn connect(config: Config, key: &str) -> Result<(Self, Machine), String> {
        if key.is_empty()
            || !key
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
        {
            return Err("Stored Gemini credential has an unsupported format".into());
        }
        Self::connect_to(&format!("{ENDPOINT}?key={key}"), config).await
    }

    async fn connect_to(url: &str, config: Config) -> Result<(Self, Machine), String> {
        validate(&config)?;
        let _ = rustls::crypto::ring::default_provider().install_default();
        let limits = WebSocketConfig::default()
            .max_message_size(Some(MAX_MESSAGE))
            .max_frame_size(Some(MAX_MESSAGE));
        // Never format a tungstenite error: it may contain the credential-bearing URL.
        let mut socket = timeout(
            Duration::from_secs(15),
            tokio_tungstenite::connect_async_with_config(url, Some(limits), true),
        )
        .await
        .map_err(|_| "WebSocket connection timed out")?
        .map(|(socket, _)| socket)
        .map_err(socket_error)?;
        send(&mut socket, &setup_message()).await?;
        let reply = timeout(Duration::from_secs(15), receive(&mut socket))
            .await
            .map_err(|_| "Lyria setup timed out")??;
        if !reply["setupComplete"].is_object() {
            return Err("Expected setupComplete before sending controls".into());
        }
        let machine = Machine::live(config);
        for message in machine.outbound.iter().skip(1) {
            send(&mut socket, message).await?;
        }
        Ok((Self(socket), machine))
    }

    pub async fn send_all(&mut self, messages: &[Value]) -> Result<(), String> {
        for message in messages {
            send(&mut self.0, message).await?;
        }
        Ok(())
    }

    pub async fn next_audio(&mut self) -> Result<Vec<i16>, String> {
        loop {
            let message = receive(&mut self.0).await?;
            if message["serverContent"]["audioChunks"].is_array() {
                return decode_audio(&message);
            }
            if message.get("filteredPrompt").is_some() {
                return Err("Provider filtered the Lyria prompt; raw text is not logged".into());
            }
            if message.get("warning").is_some() {
                continue;
            }
            return Err("Unexpected Lyria server message".into());
        }
    }

    pub async fn stop(mut self) {
        let _ = send(&mut self.0, &playback("STOP")).await;
        let _ = timeout(Duration::from_secs(2), self.0.close(None)).await;
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
    pub buffering: bool,
    live: bool,
}

impl Default for Machine {
    fn default() -> Self {
        Self {
            phase: "idle",
            config: Config::default(),
            outbound: Vec::new(),
            buffering: false,
            live: false,
        }
    }
}

impl Machine {
    fn live(config: Config) -> Self {
        Self {
            phase: "playing",
            outbound: vec![
                setup_message(),
                prompt_message(&config.prompts),
                config_message(&config),
                playback("PLAY"),
            ],
            config,
            buffering: true,
            live: true,
        }
    }

    pub fn from_fixture() -> Result<Self, String> {
        let doc = protocol();
        let mut machine = Self::default();
        machine.send(doc["setup"].clone());
        machine.receive(&doc["setupReply"])?;
        machine.send(doc["prompts"].clone());
        machine.send(doc["config"].clone());
        machine.send(doc["play"].clone());
        decode_audio(&doc["audio"])?;
        machine.buffering = true;
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
            decode_audio(message)?;
            self.buffering = true;
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
            live: self.live,
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

pub fn recorded_audio() -> Result<Vec<i16>, String> {
    match std::env::var("JAM_LYRIA_FIXTURE") {
        Ok(value) if value == "1" => decode_audio(&protocol()["audio"]),
        _ => Err(NOT_CONFIGURED.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_matches_the_provider_contract() {
        let valid = Config {
            prompts: vec![Prompt {
                text: "Funk".into(),
                weight: -1.0,
            }],
            bpm: 60.0,
            scale: "SCALE_UNSPECIFIED".into(),
            ..Config::default()
        };
        assert!(validate(&valid).is_ok());

        for bpm in [59.0, 60.5, 201.0] {
            assert!(validate(&Config {
                bpm,
                ..valid.clone()
            })
            .is_err());
        }
        assert!(validate(&Config {
            prompts: vec![Prompt {
                text: "Funk".into(),
                weight: 0.0,
            }],
            ..valid.clone()
        })
        .is_err());
        assert!(validate(&Config {
            scale: "CHROMATIC".into(),
            ..valid
        })
        .is_err());
    }

    #[test]
    fn handshake_errors_never_reveal_credentials_or_server_bodies() {
        let response = tokio_tungstenite::tungstenite::http::Response::builder()
            .status(403)
            .header("x-secret", "never-print-this")
            .body(Some(b"private response".to_vec()))
            .unwrap();
        assert_eq!(
            socket_error(tokio_tungstenite::tungstenite::Error::Http(Box::new(
                response
            ))),
            "WebSocket handshake rejected with HTTP 403"
        );
        assert!(!USAGE_PATH.contains('?'));
        assert!(should_reconnect("WebSocket closed"));
        assert!(!should_reconnect(
            "Provider filtered the Lyria prompt; raw text is not logged"
        ));
    }

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

    #[tokio::test]
    async fn live_socket_waits_for_setup_and_yields_pcm() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let fixture = protocol();
        let server_fixture = fixture.clone();
        let expected = Machine::live(Config::default()).outbound;
        let server = tokio::spawn(async move {
            let (tcp, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(tcp).await.unwrap();
            let setup = socket.next().await.unwrap().unwrap();
            assert_eq!(
                serde_json::from_slice::<Value>(&setup.into_data()).unwrap(),
                expected[0]
            );
            socket
                .send(Message::Text(
                    server_fixture["setupReply"].to_string().into(),
                ))
                .await
                .unwrap();
            for expected in expected.iter().skip(1) {
                let message = socket.next().await.unwrap().unwrap();
                assert_eq!(
                    serde_json::from_slice::<Value>(&message.into_data()).unwrap(),
                    *expected
                );
            }
            socket
                .send(Message::Text(server_fixture["audio"].to_string().into()))
                .await
                .unwrap();
            let stop = socket.next().await.unwrap().unwrap();
            assert_eq!(
                serde_json::from_slice::<Value>(&stop.into_data()).unwrap(),
                server_fixture["stop"]
            );
        });

        let (mut socket, machine) =
            LiveSocket::connect_to(&format!("ws://{address}"), Config::default())
                .await
                .unwrap();
        assert!(machine.status().live);
        assert_eq!(
            socket.next_audio().await.unwrap(),
            [16_384, -16_384, 8192, -8192]
        );
        socket.stop().await;
        server.await.unwrap();
    }
}
