//! Additive ARCHITECTURE names. Existing commands stay registered.
use crate::lyria;
use crate::media;
use crate::net::lyria::{Config, Prompt, Status};
use crate::net::media::Generate;
use crate::AppState;
use jam_audio::engine::BandPatch;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime, State};

#[tauri::command]
pub fn transport_locate(beats: f64, state: State<'_, AppState>) -> Result<(), String> {
    if !beats.is_finite() || beats < 0.0 {
        return Err("Locate needs a non-negative beat position.".into());
    }
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.ensure_band_grid()?;
    eng.transport_locate(beats);
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixerPatch {
    pub gain_db: Option<f32>,
    pub gain: Option<f32>,
    pub muted: Option<bool>,
}

fn linear_gain(patch: &MixerPatch) -> Option<f32> {
    if let Some(gain) = patch.gain {
        return Some(gain.clamp(0.0, 1.0));
    }
    patch
        .gain_db
        .map(|db| 10f32.powf(db / 20.0).clamp(0.0, 1.0))
}

#[tauri::command]
pub fn mixer_set_bus<R: Runtime>(
    id: String,
    patch: MixerPatch,
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let muted = patch.muted.unwrap_or(false);
    let gain = linear_gain(&patch);
    match id.as_str() {
        "band" => {
            if let Some(gain) = gain {
                state
                    .engine
                    .lock()
                    .set_band_volume(if muted { 0.0 } else { gain });
            } else if muted {
                state.engine.lock().set_band_volume(0.0);
            }
        }
        "click" => {
            if let Some(gain) = gain {
                state
                    .engine
                    .lock()
                    .set_click_volume(if muted { 0.0 } else { gain });
            } else if muted {
                state.engine.lock().set_click_volume(0.0);
            }
        }
        "drums" | "bass" | "comp" => {
            state.engine.lock().band_set(BandPatch {
                style: None,
                intensity: None,
                follow_energy: None,
                mute_drums: (id == "drums").then_some(muted),
                mute_bass: (id == "bass").then_some(muted),
                mute_comp: (id == "comp").then_some(muted),
                at_next_bar: false,
            });
        }
        _ => {
            return Err(format!(
                "Unknown mixer bus '{id}'. Use band, click, drums, bass or comp."
            ))
        }
    }
    let (band, click) = state.engine.lock().mix_levels();
    let buses = json!([
        {"id":"band","gainDb": 20.0 * band.max(1e-6).log10(), "muted": band == 0.0, "soloed": false},
        {"id":"click","gainDb": 20.0 * click.max(1e-6).log10(), "muted": click == 0.0, "soloed": false},
    ]);
    let _ = app.emit("mixer.state", &buses);
    Ok(buses)
}

#[tauri::command]
pub async fn generate_track(
    prompt: String,
    provider: String,
    length_ms: u32,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let (catalog_id, model) = match provider.as_str() {
        "lyria3" | "lyria" => ("lyria", "lyria-3.5"),
        "elevenlabs" | "eleven" => ("eleven", "music_v2"),
        _ => return Err("generate_track provider must be lyria3 or elevenlabs.".into()),
    };
    let seconds = length_ms.div_ceil(1000).clamp(2, 180);
    let job = media::media_generate(
        Generate {
            catalog_id: catalog_id.into(),
            model: model.into(),
            prompt,
            seconds,
            ratio: "16:9".into(),
            instrumental: true,
            ..Default::default()
        },
        state,
    )
    .await?;
    Ok(json!({
        "jobId": job.get("id").cloned().unwrap_or(json!(null)),
        "job": job,
    }))
}

#[tauri::command]
pub fn lyria_vibe<R: Runtime>(
    prompts: Vec<Prompt>,
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Status, String> {
    let patch = Config {
        prompts,
        ..Config::default()
    };
    lyria::lyria_set(patch, app, state)
}
