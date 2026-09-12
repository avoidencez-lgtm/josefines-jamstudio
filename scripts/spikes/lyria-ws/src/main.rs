//! S4 probe. No provider traffic unless explicitly enabled; no playback or app mutation.
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{io::Write, time::Duration};
use tokio::{
    net::TcpStream,
    time::{timeout, Instant},
};
use tokio_tungstenite::{
    tungstenite::{protocol::WebSocketConfig, Message},
    MaybeTlsStream, WebSocketStream,
};

// Reuse the app's secret seam; never accept a credential in argv, files or environment.
use jam_probe_keys as keys;
use keys::SecretStore;

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
type Result<T> = std::result::Result<T, String>;
const MAX_MESSAGE: usize = 4 * 1024 * 1024;
const RATE: u32 = 48_000;
const MODEL: &str = "models/lyria-realtime-exp";

fn connect_error(error: tokio_tungstenite::tungstenite::Error) -> String {
    match error {
        tokio_tungstenite::tungstenite::Error::Http(response) => format!(
            "WebSocket handshake rejected with HTTP {}",
            response.status().as_u16()
        ),
        tokio_tungstenite::tungstenite::Error::Tls(_) => "WebSocket TLS validation failed".into(),
        _ => "WebSocket connection failed (details suppressed to protect credentials)".into(),
    }
}

fn log(file: &mut std::fs::File, value: Value) -> Result<()> {
    writeln!(file, "{value}")
        .and_then(|()| file.flush())
        .map_err(|_| "Cannot write probe trace".into())
}

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../../tests/fixtures/providers/lyria/protocol.json"
    ))
    .unwrap()
}

async fn connect(url: &str) -> Result<Socket> {
    let config = WebSocketConfig::default()
        .max_message_size(Some(MAX_MESSAGE))
        .max_frame_size(Some(MAX_MESSAGE));
    // Never format a tungstenite error: it may contain the credential-bearing URL.
    timeout(
        Duration::from_secs(15),
        tokio_tungstenite::connect_async_with_config(url, Some(config), true),
    )
    .await
    .map_err(|_| "WebSocket connection timed out")?
    .map(|(socket, _)| socket)
    .map_err(connect_error)
}

async fn send(socket: &mut Socket, message: &Value) -> Result<()> {
    timeout(
        Duration::from_secs(5),
        socket.send(Message::Text(message.to_string().into())),
    )
    .await
    .map_err(|_| "WebSocket send timed out")?
    .map_err(|_| "WebSocket send failed".into())
}

async fn receive(socket: &mut Socket) -> Result<Value> {
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
                // tungstenite queued the pong; flush even if the peer sends no further frames.
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

async fn setup(socket: &mut Socket, f: &Value) -> Result<()> {
    send(socket, &f["setup"]).await?;
    let reply = timeout(Duration::from_secs(15), receive(socket))
        .await
        .map_err(|_| "Setup timed out")??;
    if !reply["setupComplete"].is_object() {
        return Err("Expected setupComplete before sending prompts".into());
    }
    for name in ["prompts", "config", "play"] {
        send(socket, &f[name]).await?;
    }
    Ok(())
}

/// The alpha contract is stereo PCM16 at 48 kHz. Reject other formats instead of guessing.
fn audio(value: &Value) -> Result<Vec<i16>> {
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

async fn offline() -> Result<Value> {
    let started = Instant::now();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| "Cannot bind loopback")?;
    let address = listener
        .local_addr()
        .map_err(|_| "Cannot read loopback address")?;
    let f = fixture();
    let server = tokio::spawn(async move {
        for _ in 0..2 {
            let (tcp, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(tcp).await.unwrap();
            let message = socket.next().await.unwrap().unwrap();
            assert_eq!(
                serde_json::from_slice::<Value>(&message.into_data()).unwrap(),
                f["setup"]
            );
            // The client must not send any controls before setupComplete.
            assert!(timeout(Duration::from_millis(10), socket.next())
                .await
                .is_err());
            socket
                .send(Message::Text(f["setupReply"].to_string().into()))
                .await
                .unwrap();
            for name in ["prompts", "config", "play"] {
                let message = socket.next().await.unwrap().unwrap();
                assert_eq!(
                    serde_json::from_slice::<Value>(&message.into_data()).unwrap(),
                    f[name]
                );
            }
            // Ten minutes of known PCM across two connections, transferred as fast as possible.
            // This measures framing/decoding only, not realtime pacing, jitter or Google availability.
            let bytes: Vec<u8> = (0..4800).flat_map(|_| [0x00, 0x40, 0x00, 0xc0]).collect();
            let message = json!({"serverContent":{"audioChunks":[{"data":base64::engine::general_purpose::STANDARD.encode(bytes),"mimeType":"audio/pcm;rate=48000"}]}}).to_string();
            for i in 0..3000 {
                socket
                    .send(if i % 2 == 0 {
                        Message::Text(message.clone().into())
                    } else {
                        Message::Binary(message.as_bytes().to_vec().into())
                    })
                    .await
                    .unwrap();
            }
            for name in ["pause", "config", "reset", "play", "stop"] {
                let message = socket.next().await.unwrap().unwrap();
                assert_eq!(
                    serde_json::from_slice::<Value>(&message.into_data()).unwrap(),
                    f[name]
                );
            }
            socket.close(None).await.unwrap();
        }
    });
    let mut frames = 0u64;
    for _ in 0..2 {
        let mut socket = connect(&format!("ws://{address}")).await?;
        setup(&mut socket, &fixture()).await?;
        for _ in 0..3000 {
            let data = audio(&receive(&mut socket).await?)?;
            if data
                .as_chunks::<2>()
                .0
                .iter()
                .any(|s| *s != [16_384, -16_384])
            {
                return Err("PCM mismatch".into());
            }
            frames += data.len() as u64 / 2;
        }
        for name in ["pause", "config", "reset", "play", "stop"] {
            send(&mut socket, &fixture()[name]).await?;
        }
    }
    server
        .await
        .map_err(|_| "Loopback protocol assertion failed")?;
    if frames != 600 * u64::from(RATE) {
        return Err("Frame loss or duplication".into());
    }
    Ok(
        json!({"mode":"synthetic-loopback","frames":frames,"audioSeconds":600,"connections":2,"pcmMismatches":0,"elapsedMs":started.elapsed().as_millis(),"providerVerified":false}),
    )
}

async fn live(output: &std::path::Path) -> Result<Value> {
    if std::env::var("JAM_LIVE").as_deref() != Ok("1")
        || std::env::var("JAM_RECORD_FIXTURES").as_deref() != Ok("1")
    {
        return Err("Live probe requires JAM_LIVE=1 and JAM_RECORD_FIXTURES=1 after explicit approval of provider usage.".into());
    }
    let key = keys::KeyringStore::default().require("gemini")?;
    if key.is_empty()
        || !key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
    {
        return Err("Stored Gemini credential has an unsupported format".into());
    }
    // create_dir refuses reuse; original probes and recordings are never replaced.
    std::fs::create_dir(output)
        .map_err(|_| "Choose a new probe directory under an existing parent")?;
    let mut trace =
        std::fs::File::create(output.join("session.jsonl")).map_err(|_| "Cannot create trace")?;
    let mut wav = hound::WavWriter::create(
        output.join("output.wav"),
        hound::WavSpec {
            channels: 2,
            sample_rate: RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .map_err(|_| "Cannot create WAV")?;
    let started = Instant::now();
    let f = fixture();
    let url = format!("{}?key={key}", f["endpoint"].as_str().unwrap());
    log(
        &mut trace,
        json!({"kind":"attempt","provider":"gemini","model":MODEL,"endpoint":f["endpoint"],"estimatedCostUsd":null,"billingUnverified":true}),
    )?;
    let mut socket = match connect(&url).await {
        Ok(socket) => socket,
        Err(error) => {
            log(
                &mut trace,
                json!({"kind":"failed","error":error,"elapsedMs":started.elapsed().as_millis()}),
            )?;
            wav.finalize().map_err(|_| "Cannot finalise empty WAV")?;
            return Err(error);
        }
    };
    let result = async {
        setup(&mut socket, &f).await?;
        log(&mut trace, json!({"direction":"client","kind":"setup-prompts-config-play","fixture":"protocol.json","setupComplete":true}))?;
        let mut frames = 0u64;
        let mut first_audio_ms = None;
        let mut reset = false;
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline && frames < u64::from(RATE) * 30 {
            let message = tokio::time::timeout_at(deadline, receive(&mut socket)).await.map_err(|_| "No audio before probe deadline")??;
            if message.get("serverContent").is_some() {
                let samples = audio(&message)?;
                first_audio_ms.get_or_insert(started.elapsed().as_millis());
                writeln!(trace, "{}", json!({"direction":"server","kind":"serverContent","atMs":started.elapsed().as_millis(),"chunks":message["serverContent"]["audioChunks"].as_array().unwrap().iter().map(|c| json!({"mimeType":c["mimeType"],"base64Bytes":c["data"].as_str().unwrap().len()})).collect::<Vec<_>>(),"frames":samples.len()/2})).map_err(|_| "Cannot write trace")?;
                for sample in samples.iter().take(((u64::from(RATE)*30-frames)*2) as usize) { wav.write_sample(*sample).map_err(|_| "Cannot write PCM")?; }
                frames += samples.len() as u64 / 2;
                if !reset && frames >= u64::from(RATE)*5 {
                    let mut config = f["config"].clone(); config["musicGenerationConfig"]["bpm"] = json!(110);
                    for control in [&f["pause"], &config, &f["reset"], &f["play"]] { send(&mut socket, control).await?; }
                    writeln!(trace, "{}", json!({"direction":"client","kind":"pause-config-reset-play","bpm":110})).map_err(|_| "Cannot write trace")?;
                    reset = true;
                }
            } else if message.get("filteredPrompt").is_some() {
                return Err("Provider filtered the probe prompt; raw text is not logged".into());
            } else if message.get("warning").is_some() {
                writeln!(trace, "{}", json!({"direction":"server","kind":"warning","detailsOmitted":true})).map_err(|_| "Cannot write trace")?;
            } else { return Err("Unexpected server message".into()); }
        }
        Ok(json!({"mode":"live","provider":"gemini","model":MODEL,"receivedFrames":frames,"savedFrames":frames.min(u64::from(RATE)*30),"firstAudioMs":first_audio_ms,"elapsedMs":started.elapsed().as_millis(),"resetSent":reset,"estimatedCostUsd":null,"billingUnverified":true}))
    }.await;
    let _ = send(&mut socket, &f["stop"]).await;
    let _ = timeout(Duration::from_secs(2), socket.close(None)).await;
    wav.finalize().map_err(|_| "Cannot finalise WAV")?;
    log(
        &mut trace,
        match &result {
            Ok(report) => report.clone(),
            Err(error) => {
                json!({"kind":"failed","error":error,"elapsedMs":started.elapsed().as_millis(),"estimatedCostUsd":null})
            }
        },
    )?;
    result
}

#[tokio::main]
async fn main() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let args: Vec<_> = std::env::args().skip(1).collect();
    let result = match args.as_slice() {
        [] => timeout(Duration::from_secs(120), offline())
            .await
            .unwrap_or_else(|_| Err("Offline probe timed out".into())),
        [flag] if flag == "--key-status" => keys::KeyringStore::default()
            .has("gemini")
            .map(|present| json!({"geminiKeyPresent":present})),
        [flag, output] if flag == "--live" => live(std::path::Path::new(output)).await,
        _ => Err("Usage: jam-lyria-probe [--key-status | --live NEW_OUTPUT_DIRECTORY]".into()),
    };
    match result {
        Ok(report) => println!("{report}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn handshake_errors_never_reveal_credentials_headers_or_server_body() {
        let response = tokio_tungstenite::tungstenite::http::Response::builder()
            .status(403)
            .header("x-secret", "never-print-this")
            .body(Some(b"private response".to_vec()))
            .unwrap();
        assert_eq!(
            connect_error(tokio_tungstenite::tungstenite::Error::Http(Box::new(
                response
            ))),
            "WebSocket handshake rejected with HTTP 403"
        );
    }
    #[test]
    fn all_chunks_decode_and_unknown_formats_or_partial_stereo_frames_fail() {
        let f = fixture();
        assert_eq!(audio(&f["audio"]).unwrap(), [16_384, -16_384, 8192, -8192]);
        for (field, value) in [
            ("mimeType", "audio/pcm;rate=44100"),
            ("mimeType", "audio/wav"),
            ("data", "AA=="),
            ("data", "!bad!"),
        ] {
            let mut bad = f["audio"].clone();
            bad["serverContent"]["audioChunks"][0][field] = json!(value);
            assert!(audio(&bad).is_err());
        }
    }
    #[tokio::test]
    async fn websocket_setup_controls_reconnect_and_pcm_are_lossless() {
        let report = timeout(Duration::from_secs(120), offline())
            .await
            .unwrap()
            .unwrap();
        println!("{report}");
        assert_eq!(report["frames"], 28_800_000);
    }
}
