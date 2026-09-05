//! One bounded, cancellable Jo voice turn. Cancellation invalidates late results;
//! a request already sent may still be billed and is never automatically retried.
use crate::{net, AppState};
use jam_audio::{engine::EngineMode, io::CpalInput, voice::Microphone};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, State};

#[derive(Default)]
pub struct VoiceSession {
    generation: u32,
    microphone: Option<Microphone>,
    phase: &'static str,
    error: Option<String>,
    shortcut: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    #[serde(default)]
    microphone: Option<String>,
    #[serde(default)]
    voice_id: String,
    #[serde(default = "default_duck")]
    duck_db: f32,
}
fn default_duck() -> f32 {
    -9.0
}

fn config() -> Result<Config, String> {
    let settings = crate::settings::load_settings()?;
    let value = settings
        .extra
        .get("voice")
        .cloned()
        .unwrap_or(serde_json::json!({}));
    let cfg: Config = serde_json::from_value(value).map_err(|_| "Check the voice settings.")?;
    if cfg.voice_id.is_empty()
        || cfg.voice_id.len() > 100
        || !cfg
            .voice_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        || cfg.microphone.as_ref().is_some_and(|s| s.len() > 400)
        || !cfg.duck_db.is_finite()
        || !(-24.0..=0.0).contains(&cfg.duck_db)
    {
        return Err("Choose a voice and microphone in Jo's voice setup.".into());
    }
    Ok(cfg)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    generation: u32,
    phase: String,
    error: Option<String>,
    shortcut: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceTurn {
    generation: u32,
    transcript: Option<String>,
    seconds: f64,
}

#[tauri::command]
pub fn voice_status(state: State<'_, AppState>) -> VoiceStatus {
    let mut session = state.voice.lock();
    if session.phase == "speaking" && !state.engine.lock().voice.lock().speaking() {
        session.phase = "idle";
    }
    VoiceStatus {
        generation: session.generation,
        phase: if session.phase.is_empty() {
            "idle"
        } else {
            session.phase
        }
        .into(),
        error: session.error.clone(),
        shortcut: session.shortcut.clone(),
    }
}

#[tauri::command]
pub fn voice_shortcut<R: tauri::Runtime>(
    shortcut: Option<String>,
    state: State<'_, AppState>,
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    let mut session = state.voice.lock();
    crate::platform::voice_shortcut::set(&app, &mut session.shortcut, shortcut)?;
    Ok(session.shortcut.clone())
}

#[tauri::command]
pub async fn voice_cancel(
    generation: Option<u32>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let voice = Arc::clone(&state.voice);
    let engine = Arc::clone(&state.engine);
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = voice.lock();
        if generation.is_some_and(|expected| expected != session.generation) {
            return;
        }
        session.generation = session.generation.wrapping_add(1);
        session.microphone = None;
        session.phase = "idle";
        session.error = None;
        engine.lock().voice.lock().stop();
    })
    .await
    .map_err(|_| "Could not stop voice capture.".to_string())
}

#[tauri::command]
pub async fn voice_ptt<R: tauri::Runtime>(
    down: bool,
    state: State<'_, AppState>,
    app: tauri::AppHandle<R>,
) -> Result<VoiceTurn, String> {
    let voice = Arc::clone(&state.voice);
    if down {
        state.secret_store.require("elevenlabs")?;
        net::live_guard("microphone transcription")?;
        let cfg = config()?;
        let engine = Arc::clone(&state.engine);
        let start_voice = Arc::clone(&voice);
        let generation = tauri::async_runtime::spawn_blocking(move || {
            let mut session = start_voice.lock();
            if session.microphone.is_some() {
                return Err("Microphone is already listening.".to_string());
            }
            if engine.lock().status().mode != EngineMode::Hardware {
                return Err("Start an audio output before talking to Jo.".into());
            }
            engine.lock().voice.lock().stop();
            session.generation = session.generation.wrapping_add(1);
            session.error = None;
            session.phase = "opening";
            match Microphone::start(Box::new(CpalInput::new(cfg.microphone, 0, 16_000, 256))) {
                Ok(mic) => {
                    session.microphone = Some(mic);
                    session.phase = "listening";
                    Ok(session.generation)
                }
                Err(e) => {
                    session.phase = "idle";
                    session.error = Some(e.clone());
                    Err(e)
                }
            }
        })
        .await
        .map_err(|_| "Microphone worker stopped.")??;
        // Close the OS stream even if the UI loses focus, unmounts or disappears.
        // The bounded captured buffer remains available for the release command.
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(20)).await;
            let _ = tauri::async_runtime::spawn_blocking(move || {
                let mut session = voice.lock();
                if session.generation == generation {
                    if let Some(mic) = &mut session.microphone {
                        let _ = mic.stop_stream();
                    }
                }
            })
            .await;
        });
        return Ok(VoiceTurn {
            generation,
            transcript: None,
            seconds: 0.0,
        });
    }
    let (generation, audio) = tauri::async_runtime::spawn_blocking(move || {
        let mut session = voice.lock();
        let mic = session
            .microphone
            .take()
            .ok_or("No microphone recording is active.")?;
        let audio = mic.finish();
        session.phase = if audio.is_ok() {
            "transcribing"
        } else {
            "idle"
        };
        session.error = audio.as_ref().err().cloned();
        Ok::<_, String>((session.generation, audio?))
    })
    .await
    .map_err(|_| "Microphone worker stopped.")??;
    let (wav, seconds) = audio;
    let result = net::voice::transcribe(wav, state.secret_store.as_ref(), &state.cost_log).await;
    let _ = app.emit("cost:state", state.cost_log.totals());
    let mut session = state.voice.lock();
    if session.generation != generation {
        return Err("Voice turn cancelled.".into());
    }
    session.phase = if result.is_ok() { "thinking" } else { "idle" };
    session.error = result.as_ref().err().cloned();
    Ok(VoiceTurn {
        generation,
        transcript: Some(result?),
        seconds,
    })
}

#[tauri::command]
pub async fn voice_speak<R: tauri::Runtime>(
    text: String,
    generation: u32,
    state: State<'_, AppState>,
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    let cfg = config()?;
    {
        let mut session = state.voice.lock();
        if session.generation != generation || session.phase != "thinking" {
            return Err("Voice turn is no longer active.".into());
        }
        session.phase = "synthesizing";
    }
    let result = net::voice::speak(
        &text,
        &cfg.voice_id,
        state.secret_store.as_ref(),
        &state.cost_log,
    )
    .await;
    let _ = app.emit("cost:state", state.cost_log.totals());
    let mut session = state.voice.lock();
    if session.generation != generation {
        return Err("Voice turn cancelled.".into());
    }
    let result = result.and_then(|pcm| {
        let engine = state.engine.lock();
        if engine.status().mode != EngineMode::Hardware {
            return Err("Audio output stopped before Jo could speak.".into());
        }
        let outcome = engine.voice.lock().play(&pcm, cfg.duck_db);
        outcome
    });
    session.phase = if result.is_ok() { "speaking" } else { "idle" };
    session.error = result.as_ref().err().cloned();
    result
}
