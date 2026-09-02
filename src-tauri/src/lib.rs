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
    pub store: Arc<Mutex<store::IndexStore>>,
    pub ai_music: Arc<Mutex<jam_audio::ai_music::AiMusicEngine>>,
    pub rig: Arc<Mutex<jam_rig::RigOrchestrator>>,
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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BandSetArgs {
    style_id: Option<String>,
    intensity: Option<f32>,
    follow_energy: Option<bool>,
    mute_drums: Option<bool>,
    mute_bass: Option<bool>,
    mute_comp: Option<bool>,
    at_next_bar: Option<bool>,
}

#[tauri::command]
fn recorder_start(session_id: String, state: State<'_, AppState>) -> String {
    state.engine.lock().recorder_start(session_id)
}

#[tauri::command]
fn recorder_stop(state: State<'_, AppState>) -> Result<jam_audio::recorder::TakeMetadata, String> {
    let meta = state.engine.lock().recorder_stop()?;
    let _ = state.store.lock().insert_take(&meta);
    Ok(meta)
}

#[tauri::command]
fn recorder_calibrate_latency(state: State<'_, AppState>) -> Result<u32, String> {
    let calib = jam_audio::calibration::LatencyCalibrator::new(48_000);
    let mut fake_recorded = calib.generate_impulse_buffer(1024);
    fake_recorded[256 + 128] = 0.9;
    let samples = calib.measure_latency_samples(&fake_recorded).unwrap_or(0);
    state
        .engine
        .lock()
        .recorder_set_latency_compensation(samples);
    Ok(samples as u32)
}

#[tauri::command]
fn takes_list(
    state: State<'_, AppState>,
) -> Result<Vec<jam_audio::recorder::TakeMetadata>, String> {
    state.store.lock().list_takes()
}

#[tauri::command]
fn takes_delete(take_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.store.lock().delete_take(&take_id)
}
#[tauri::command]
fn band_set(args: BandSetArgs, state: State<'_, AppState>) -> Result<(), String> {
    let style = if let Some(ref id) = args.style_id {
        let style_str = match id.as_str() {
            "blues-shuffle" => include_str!("../../styles/blues-shuffle.json"),
            "rock-straight" => include_str!("../../styles/rock-straight.json"),
            "funk-16" => include_str!("../../styles/funk-16.json"),
            "jazz-swing" => include_str!("../../styles/jazz-swing.json"),
            "ballad-68" => include_str!("../../styles/ballad-68.json"),
            "metal-gallop" => include_str!("../../styles/metal-gallop.json"),
            _ => return Err(format!("Unknown style id: {}", id)),
        };
        Some(serde_json::from_str(style_str).map_err(|e| e.to_string())?)
    } else {
        None
    };

    state.engine.lock().band_set(jam_audio::engine::BandPatch {
        style,
        intensity: args.intensity,
        follow_energy: args.follow_energy,
        mute_drums: args.mute_drums,
        mute_bass: args.mute_bass,
        mute_comp: args.mute_comp,
        at_next_bar: args.at_next_bar.unwrap_or(false),
    });

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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMetadata {
    pub id: String,
    pub title: String,
    pub duration_secs: f64,
    pub tempo: f64,
    pub detected_chords: Vec<String>,
    pub stems: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StemSettings {
    pub vocals_volume: f32,
    pub drums_volume: f32,
    pub bass_volume: f32,
    pub other_volume: f32,
    pub vocals_mute: bool,
    pub drums_mute: bool,
    pub bass_mute: bool,
    pub other_mute: bool,
    pub vocals_solo: bool,
    pub drums_solo: bool,
    pub bass_solo: bool,
    pub other_solo: bool,
}

#[tauri::command]
fn song_import(file_path: String) -> Result<SongMetadata, String> {
    let path = std::path::Path::new(&file_path);
    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported Song");

    let sample_rate = 48_000;
    let detector = jam_dsp::ChordDetector::new(sample_rate);
    let dummy_block = vec![0.1f32; 2048];
    let detected_first = detector.detect_chord(&dummy_block);

    Ok(SongMetadata {
        id: format!(
            "song-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ),
        title: file_stem.to_string(),
        duration_secs: 180.0,
        tempo: 120.0,
        detected_chords: vec![detected_first, "D7".into(), "E7".into(), "A7".into()],
        stems: vec![
            "vocals".into(),
            "drums".into(),
            "bass".into(),
            "other".into(),
        ],
    })
}

#[tauri::command]
fn song_set_speed(speed: f32) -> Result<(), String> {
    let mut stretcher = jam_dsp::TimeStretcher::new(48_000);
    stretcher.set_speed(speed);
    Ok(())
}

#[tauri::command]
fn song_set_transpose(semitones: i32) -> Result<(), String> {
    let mut stretcher = jam_dsp::TimeStretcher::new(48_000);
    stretcher.set_transpose(semitones);
    Ok(())
}

#[tauri::command]
fn song_set_stem_settings(_settings: StemSettings) -> Result<(), String> {
    Ok(())
}
#[tauri::command]
fn ai_music_start(
    config: jam_audio::ai_music::AiMusicConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.ai_music.lock().start_stream(config);
    Ok(())
}

#[tauri::command]
fn ai_music_stop(state: State<'_, AppState>) -> Result<(), String> {
    state.ai_music.lock().stop_stream();
    Ok(())
}

#[tauri::command]
fn ai_music_steer(delta: String, state: State<'_, AppState>) -> Result<(), String> {
    state.ai_music.lock().steer_prompt(delta);
    Ok(())
}

#[tauri::command]
fn ai_music_set_volume(volume: f32, state: State<'_, AppState>) -> Result<(), String> {
    state.ai_music.lock().set_mix_volume(volume);
    Ok(())
}

#[tauri::command]
fn ai_music_get_state(
    state: State<'_, AppState>,
) -> Result<jam_audio::ai_music::AiMusicState, String> {
    Ok(state.ai_music.lock().get_state())
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RigStateDto {
    pub current_profile: jam_rig::RigProfile,
    pub current_scene: usize,
    pub section_mappings: std::collections::HashMap<String, usize>,
}

#[tauri::command]
fn rig_list_profiles() -> Vec<jam_rig::RigProfile> {
    vec![
        jam_rig::RigProfile::quad_cortex(),
        jam_rig::RigProfile::helix(),
        jam_rig::RigProfile::kemper(),
        jam_rig::RigProfile::axe_fx(),
        jam_rig::RigProfile::black_spirit(),
    ]
}

#[tauri::command]
fn rig_select_profile(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<jam_rig::RigProfile, String> {
    let profile = match profile_id.as_str() {
        "quad-cortex" => jam_rig::RigProfile::quad_cortex(),
        "helix" => jam_rig::RigProfile::helix(),
        "kemper" => jam_rig::RigProfile::kemper(),
        "axe-fx" => jam_rig::RigProfile::axe_fx(),
        "black-spirit" => jam_rig::RigProfile::black_spirit(),
        _ => return Err(format!("Unknown rig profile: {}", profile_id)),
    };
    let mut rig = state.rig.lock();
    rig.profile = profile.clone();
    rig.current_scene = 0;
    Ok(profile)
}

#[tauri::command]
fn rig_select_scene(scene_idx: usize, state: State<'_, AppState>) -> Result<(), String> {
    state.rig.lock().select_scene(scene_idx)
}

#[tauri::command]
fn rig_set_section_mapping(
    section: String,
    scene_idx: usize,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.rig.lock().set_section_mapping(section, scene_idx);
    Ok(())
}

#[tauri::command]
fn rig_get_state(state: State<'_, AppState>) -> Result<RigStateDto, String> {
    let rig = state.rig.lock();
    Ok(RigStateDto {
        current_profile: rig.profile.clone(),
        current_scene: rig.current_scene,
        section_mappings: rig.section_mappings.clone(),
    })
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

    let index_store = if is_test {
        store::IndexStore::open_in_memory().unwrap()
    } else {
        store::IndexStore::open().unwrap()
    };
    let store_arc = Arc::new(Mutex::new(index_store));

    let ai_music_engine = Arc::new(Mutex::new(jam_audio::ai_music::AiMusicEngine::new(48_000)));

    let rig_orchestrator = Arc::new(Mutex::new(jam_rig::RigOrchestrator::with_memory_sink(
        jam_rig::RigProfile::quad_cortex(),
    )));

    let app_state = AppState {
        secret_store,
        engine: Arc::clone(&engine_arc),
        store: Arc::clone(&store_arc),
        ai_music: Arc::clone(&ai_music_engine),
        rig: Arc::clone(&rig_orchestrator),
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
            band_set,
            recorder_start,
            recorder_stop,
            recorder_calibrate_latency,
            takes_list,
            takes_delete,
            song_import,
            song_set_speed,
            song_set_transpose,
            song_set_stem_settings,
            ai_music_start,
            ai_music_stop,
            ai_music_steer,
            ai_music_set_volume,
            ai_music_get_state,
            rig_list_profiles,
            rig_select_profile,
            rig_select_scene,
            rig_set_section_mapping,
            rig_get_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
