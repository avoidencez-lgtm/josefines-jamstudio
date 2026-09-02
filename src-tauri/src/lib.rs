//! src-tauri: Tauri application library and command dispatch.

pub mod keys;
pub mod settings;
pub mod store;

use jam_audio::devices::{list_devices, AudioConfig, AudioDevices};
use jam_audio::engine::{AudioEngine, EngineTelemetry};
use jam_band::sequencer::Cue;
use jam_core::chart::Chart;
use jam_core::style::Style;
use keys::{KeyringStore, MemoryStore, SecretStore};
use parking_lot::Mutex;
use settings::{load_settings, save_settings, AppSettings};
use std::sync::Arc;
use tauri::{Emitter, State};

pub struct AppState {
    pub secret_store: Box<dyn SecretStore>,
    pub engine: Arc<Mutex<AudioEngine>>,
}

#[tauri::command]
fn keys_set(provider: String, key: String, state: State<'_, AppState>) -> Result<(), String> {
    state.secret_store.set(&provider, &key)
}

#[tauri::command]
fn keys_has(provider: String, state: State<'_, AppState>) -> bool {
    state.secret_store.has(&provider)
}

#[tauri::command]
fn keys_delete(provider: String, state: State<'_, AppState>) -> Result<(), String> {
    state.secret_store.delete(&provider)
}

#[tauri::command]
fn settings_get() -> AppSettings {
    load_settings()
}

#[tauri::command]
fn settings_set(settings: AppSettings) -> Result<(), String> {
    save_settings(&settings)
}

#[tauri::command]
fn audio_list_devices() -> AudioDevices {
    list_devices()
}

#[tauri::command]
fn tone_set(on: bool, hz: f32, state: State<'_, AppState>) {
    state.engine.lock().set_tone(on, hz);
}

#[tauri::command]
fn metronome_set(on: bool, bpm: f64, state: State<'_, AppState>) {
    let eng = state.engine.lock();
    if on {
        eng.transport_set_tempo(bpm);
        eng.transport_play();
    } else {
        eng.transport_stop();
    }
}

#[tauri::command]
fn tuner_set(on: bool, state: State<'_, AppState>) {
    state.engine.lock().set_tuner(on);
}

#[tauri::command]
fn audio_get_telemetry(state: State<'_, AppState>) -> EngineTelemetry {
    state.engine.lock().get_telemetry()
}

#[tauri::command]
fn transport_play(state: State<'_, AppState>) {
    state.engine.lock().transport_play();
}

#[tauri::command]
fn transport_pause(state: State<'_, AppState>) {
    state.engine.lock().transport_pause();
}

#[tauri::command]
fn transport_stop(state: State<'_, AppState>) {
    state.engine.lock().transport_stop();
}

#[tauri::command]
fn transport_seek_bar(bar: u32, state: State<'_, AppState>) {
    state.engine.lock().transport_seek_bar(bar);
}

#[tauri::command]
fn transport_set_loop(start_bar: u32, end_bar: u32, enabled: bool, state: State<'_, AppState>) {
    state
        .engine
        .lock()
        .transport_set_loop(start_bar, end_bar, enabled);
}

#[tauri::command]
fn transport_set_count_in(bars: u32, state: State<'_, AppState>) {
    state.engine.lock().transport_set_count_in(bars);
}

#[tauri::command]
fn transport_set_tempo(bpm: f64, state: State<'_, AppState>) {
    state.engine.lock().transport_set_tempo(bpm);
}

#[tauri::command]
fn transport_set_time_signature(numerator: u8, denominator: u8, state: State<'_, AppState>) {
    state
        .engine
        .lock()
        .transport_set_time_signature((numerator, denominator));
}

#[tauri::command]
fn transport_set_click_volume(volume: f32, state: State<'_, AppState>) {
    state.engine.lock().set_click_volume(volume);
}

#[tauri::command]
fn band_set_style(style_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let style_str = match style_id.as_str() {
        "blues-shuffle" => include_str!("../../styles/blues-shuffle.json"),
        "rock-straight" => include_str!("../../styles/rock-straight.json"),
        "funk-16" => include_str!("../../styles/funk-16.json"),
        "jazz-swing" => include_str!("../../styles/jazz-swing.json"),
        "ballad-68" => include_str!("../../styles/ballad-68.json"),
        "metal-gallop" => include_str!("../../styles/metal-gallop.json"),
        _ => return Err(format!("Unknown style id: {}", style_id)),
    };
    let style: Style = serde_json::from_str(style_str).map_err(|e| e.to_string())?;
    state.engine.lock().band_set_style(style);
    Ok(())
}

#[tauri::command]
fn band_set_intensity(intensity: f32, state: State<'_, AppState>) {
    state.engine.lock().band_set_intensity(intensity);
}

#[tauri::command]
fn band_cue(cue: String, state: State<'_, AppState>) -> Result<(), String> {
    let c = match cue.as_str() {
        "fill" => Cue::Fill,
        "crash" => Cue::Crash,
        "stop" => Cue::Stop,
        "ending" => Cue::Ending,
        "none" => Cue::None,
        _ => return Err(format!("Unknown cue: {}", cue)),
    };
    state.engine.lock().band_cue(c);
    Ok(())
}

#[tauri::command]
fn band_list_styles() -> Vec<Style> {
    vec![
        serde_json::from_str(include_str!("../../styles/blues-shuffle.json")).unwrap(),
        serde_json::from_str(include_str!("../../styles/rock-straight.json")).unwrap(),
        serde_json::from_str(include_str!("../../styles/funk-16.json")).unwrap(),
        serde_json::from_str(include_str!("../../styles/jazz-swing.json")).unwrap(),
        serde_json::from_str(include_str!("../../styles/ballad-68.json")).unwrap(),
        serde_json::from_str(include_str!("../../styles/metal-gallop.json")).unwrap(),
    ]
}

#[tauri::command]
fn band_load_chart(chart_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let chart_str = match chart_id.as_str() {
        "blues-12-bar" => include_str!("../../charts/blues-12-bar.json"),
        "blues-quick-change" => include_str!("../../charts/blues-quick-change.json"),
        "blues-8-bar" => include_str!("../../charts/blues-8-bar.json"),
        "blues-minor" => include_str!("../../charts/blues-minor.json"),
        "i-v-vi-iv" => include_str!("../../charts/i-v-vi-iv.json"),
        "ii-v-i" => include_str!("../../charts/ii-v-i.json"),
        "rock-16-bar" => include_str!("../../charts/rock-16-bar.json"),
        "one-chord-vamp" => include_str!("../../charts/one-chord-vamp.json"),
        _ => return Err(format!("Unknown chart id: {}", chart_id)),
    };
    let chart: Chart = serde_json::from_str(chart_str).map_err(|e| e.to_string())?;
    state.engine.lock().band_load_chart(chart.resolve());
    Ok(())
}

#[tauri::command]
fn band_list_charts() -> Vec<Chart> {
    vec![
        serde_json::from_str(include_str!("../../charts/blues-12-bar.json")).unwrap(),
        serde_json::from_str(include_str!("../../charts/blues-quick-change.json")).unwrap(),
        serde_json::from_str(include_str!("../../charts/blues-8-bar.json")).unwrap(),
        serde_json::from_str(include_str!("../../charts/blues-minor.json")).unwrap(),
        serde_json::from_str(include_str!("../../charts/i-v-vi-iv.json")).unwrap(),
        serde_json::from_str(include_str!("../../charts/ii-v-i.json")).unwrap(),
        serde_json::from_str(include_str!("../../charts/rock-16-bar.json")).unwrap(),
        serde_json::from_str(include_str!("../../charts/one-chord-vamp.json")).unwrap(),
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = AudioConfig::default();
    let mut engine = AudioEngine::new(config);
    let _ = engine.start();
    let engine_arc = Arc::new(Mutex::new(engine));

    let is_test = std::env::var("JAM_HEADLESS").unwrap_or_default() == "1";
    let secret_store: Box<dyn SecretStore> = if is_test {
        Box::new(MemoryStore::default())
    } else {
        Box::new(KeyringStore::default())
    };

    let app_state = AppState {
        secret_store,
        engine: Arc::clone(&engine_arc),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(app_state)
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let eng = Arc::clone(&engine_arc);

            // Emit telemetry at 30 Hz
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_millis(33));
                let tel = eng.lock().get_telemetry();
                let _ = app_handle.emit("meters", &tel.output_level);
                let _ = app_handle.emit("transport.state", &tel.transport);
                let _ = app_handle.emit("band.state", &tel.band);
                if let Some(t) = &tel.tuner {
                    let _ = app_handle.emit("tuner.state", t);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            keys_set,
            keys_has,
            keys_delete,
            settings_get,
            settings_set,
            audio_list_devices,
            tone_set,
            metronome_set,
            tuner_set,
            audio_get_telemetry,
            transport_play,
            transport_pause,
            transport_stop,
            transport_seek_bar,
            transport_set_loop,
            transport_set_count_in,
            transport_set_tempo,
            transport_set_time_signature,
            transport_set_click_volume,
            band_set_style,
            band_set_intensity,
            band_cue,
            band_list_styles,
            band_load_chart,
            band_list_charts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
