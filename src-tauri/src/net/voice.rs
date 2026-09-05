//! ElevenLabs speech requests. Only text returns to the WebView.
use super::{provider, provider_client, CostEntry, CostLog};
use crate::keys::SecretStore;
use serde_json::{json, Value};
use std::time::Instant;

#[derive(Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prices {
    pub stt_usd_per_hour: Option<f64>,
    pub tts_usd_per1k: Option<f64>,
}

impl Prices {
    pub fn validate(&self) -> Result<(), String> {
        for rate in [self.stt_usd_per_hour, self.tts_usd_per1k]
            .into_iter()
            .flatten()
        {
            if !rate.is_finite() || !(0.0..=10_000.0).contains(&rate) {
                return Err("Speech prices must be blank or between 0 and 10000 USD.".into());
            }
        }
        Ok(())
    }
}

fn request(path: &str, store: &dyn SecretStore) -> Result<reqwest::RequestBuilder, String> {
    let entry = provider("elevenlabs").ok_or("Voice provider is not registered.")?;
    let key = store.require(entry.id)?;
    super::live_guard("ElevenLabs voice")?;
    Ok(provider_client()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not initialise the voice client.")?
        .post(format!("{}{path}", entry.base_url))
        .header("xi-api-key", key))
}

async fn send(
    req: reqwest::RequestBuilder,
    mut entry: CostEntry,
    limit: usize,
    content_type: &str,
    log: &CostLog,
) -> Result<Vec<u8>, String> {
    let started = Instant::now();
    let mut status = 0;
    let result = async {
        let mut response = req.send().await.map_err(|_| "Voice request failed. Check your connection; it was not retried.")?;
        status = response.status().as_u16();
        if !response.status().is_success() {
            return Err(format!("ElevenLabs returned HTTP {status}. Check the key, voice access and quota in Settings."));
        }
        let mime = response.headers().get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok()).unwrap_or("")
            .split(';').next().unwrap_or("").trim();
        if mime != content_type && !(content_type == "audio/pcm" && mime == "application/octet-stream") {
            return Err("Voice provider returned an unexpected audio or transcript format.".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "Voice response was interrupted.")? {
            if bytes.len() + chunk.len() > limit { return Err("Voice response exceeds the limit.".into()); }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }.await;
    entry.at_ms = super::now_ms();
    entry.provider = "elevenlabs".into();
    entry.method = "POST".into();
    entry.status = status;
    entry.duration_ms = started.elapsed().as_millis() as u64;
    entry.bytes_in = result.as_ref().map_or(0, |b: &Vec<u8>| b.len() as u64);
    entry.error = result.as_ref().err().cloned();
    // Failure to record usage is a visible error; it never triggers a paid retry.
    log.append(&entry).map_err(|_| {
        "Could not save voice usage. Check the data folder; do not retry automatically."
    })?;
    result
}

pub async fn transcribe(
    wav: Vec<u8>,
    seconds: f64,
    prices: &Prices,
    store: &dyn SecretStore,
    log: &CostLog,
) -> Result<String, String> {
    let size = wav.len() as u64;
    prices.validate()?;
    if !seconds.is_finite() || !(0.1..=20.0).contains(&seconds) || size > 192_000 * 20 * 2 + 44 {
        return Err("Microphone recording exceeds 20 seconds.".into());
    }
    let part = reqwest::multipart::Part::bytes(wav)
        .file_name("microphone.wav")
        .mime_str("audio/wav")
        .map_err(|_| "Invalid audio type.")?;
    let form = reqwest::multipart::Form::new()
        .text("model_id", "scribe_v2")
        .text("tag_audio_events", "false")
        .text("timestamps_granularity", "none")
        .part("file", part);
    let req = request("/v1/speech-to-text", store)?.multipart(form);
    let bytes = send(
        req,
        CostEntry {
            path: "/v1/speech-to-text".into(),
            model: Some("scribe_v2".into()),
            bytes_out: size,
            stt_seconds: Some(seconds),
            estimated_cost_usd: prices.stt_usd_per_hour.map(|rate| seconds * rate / 3600.0),
            ..CostEntry::default()
        },
        64 * 1024,
        "application/json",
        log,
    )
    .await?;
    transcript(&bytes)
}

pub fn transcript(bytes: &[u8]) -> Result<String, String> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| "Invalid transcript response.")?;
    let text = value["text"]
        .as_str()
        .ok_or("Voice response has no transcript.")?
        .trim();
    if text.is_empty() {
        return Err("No speech detected. Check your microphone and try again.".into());
    }
    if text.len() > 4000 {
        return Err("Transcript is too long. Try a shorter command.".into());
    }
    Ok(text.into())
}

pub async fn speak(
    text: &str,
    voice_id: &str,
    prices: &Prices,
    store: &dyn SecretStore,
    log: &CostLog,
) -> Result<Vec<u8>, String> {
    prices.validate()?;
    if text.trim().is_empty() || text.chars().count() > 2000 {
        return Err("Spoken replies must contain 1–2000 characters.".into());
    }
    if voice_id.is_empty()
        || voice_id.len() > 100
        || !voice_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("Choose an ElevenLabs voice before speaking.".into());
    }
    let path = format!("/v1/text-to-speech/{voice_id}");
    let body = json!({"text": text, "model_id": "eleven_flash_v2_5"});
    let req = request(&format!("{path}?output_format=pcm_24000"), store)?.json(&body);
    send(
        req,
        CostEntry {
            path,
            model: Some("eleven_flash_v2_5".into()),
            bytes_out: body.to_string().len() as u64,
            tts_characters: Some(text.chars().count() as u64),
            estimated_cost_usd: prices
                .tts_usd_per1k
                .map(|rate| text.chars().count() as f64 * rate / 1000.0),
            ..CostEntry::default()
        },
        48_000 * 60,
        "audio/pcm",
        log,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn bounded_speech_response_rejects_json_and_logs_no_bodies() {
        use std::io::{Read, Write};
        let dir = std::env::temp_dir().join(format!("jam-voice-net-{}", std::process::id()));
        let log = CostLog::new(dir.join("usage.jsonl"));
        for (mime, body, limit, succeeds) in [
            ("audio/pcm", vec![0, 1, 0, 2], 4, true),
            ("application/octet-stream", vec![0, 1], 4, true),
            (
                "application/json",
                b"private transcript".to_vec(),
                100,
                false,
            ),
            ("audio/pcm", vec![0; 8], 4, false),
        ] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                    .unwrap();
                let mut request = [0; 4096];
                let _ = stream.read(&mut request).unwrap();
                write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).unwrap();
                stream.write_all(&body).unwrap();
            });
            let req = provider_client()
                .timeout(std::time::Duration::from_secs(2))
                .build()
                .unwrap()
                .post(format!("http://{address}/voice"));
            assert_eq!(
                send(
                    req,
                    CostEntry {
                        path: "/voice".into(),
                        model: Some("fixture".into()),
                        tts_characters: Some(3),
                        estimated_cost_usd: Some(0.0015),
                        ..CostEntry::default()
                    },
                    limit,
                    "audio/pcm",
                    &log
                )
                .await
                .is_ok(),
                succeeds
            );
            server.join().unwrap();
        }
        let entries = log.list(10);
        assert_eq!(entries.len(), 4);
        assert_eq!(log.totals()[0].tts_characters, 12);
        assert_eq!(log.totals()[0].unpriced_calls, 0);
        assert!(!serde_json::to_string(&entries)
            .unwrap()
            .contains("private transcript"));
        let _ = std::fs::remove_dir_all(dir);
    }
    #[test]
    fn speech_prices_reject_invalid_values_and_allow_explicit_zero() {
        assert!(Prices::default().validate().is_ok());
        for rate in [-1.0, f64::NAN, f64::INFINITY, 10001.0] {
            assert!(Prices {
                stt_usd_per_hour: Some(rate),
                tts_usd_per1k: None
            }
            .validate()
            .is_err());
        }
        let prices: Prices =
            serde_json::from_str(r#"{"sttUsdPerHour":0,"ttsUsdPer1k":0.5}"#).unwrap();
        assert_eq!(prices.tts_usd_per1k, Some(0.5));
        assert!(prices.validate().is_ok());
    }
    #[test]
    fn documented_transcript_fixture_and_empty_speech() {
        let fixture = include_bytes!("../../tests/fixtures/voice-transcript.json");
        assert_eq!(
            transcript(fixture).unwrap(),
            "Set the tempo to one hundred."
        );
        assert!(transcript(br#"{"text":"  "}"#).is_err());
        assert!(transcript(br#"{"error":"bad"}"#).is_err());
        assert!(transcript(b"not json").is_err());
    }
}
