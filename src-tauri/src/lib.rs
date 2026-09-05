//! src-tauri: Tauri application library and command dispatch.

pub mod agents;
pub mod controller;
pub mod keys;
pub mod library;
pub mod media;
pub mod net;
pub mod originals;
pub mod platform;
pub mod settings;
pub mod store;

use jam_audio::devices::{list_devices, AudioConfig, AudioDevices};
use jam_audio::engine::{AudioEngine, EngineStatus, EngineTelemetry};
use jam_band::sequencer::Cue;
use jam_core::chart::Chart;
use jam_core::style::Style;
use keys::{KeyringStore, MemoryStore, SecretStore};
use library::Library;
use parking_lot::Mutex;
use settings::{load_settings, save_settings, AppSettings};
use std::sync::Arc;
use tauri::{Emitter, State};

pub struct AppState {
    pub agents: agents::AgentRunner,
    pub secret_store: Arc<dyn SecretStore>,
    pub engine: Arc<Mutex<AudioEngine>>,
    pub library: Arc<Mutex<Library>>,
    pub store: Arc<Mutex<store::IndexStore>>,
    pub ai_music: Arc<Mutex<jam_audio::ai_music::AiMusicEngine>>,
    pub rig: Arc<Mutex<jam_rig::RigOrchestrator>>,
    pub controller: Arc<Mutex<Option<jam_rig::controller::ControllerInput>>>,
    pub cost_log: Arc<net::CostLog>,
}

#[tauri::command]
async fn agent_status(provider: String, executable: String) -> agents::AgentStatus {
    agents::AgentRunner::status(&provider, &executable).await
}

#[tauri::command]
async fn agent_request(
    request: agents::AgentRequest,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    state.agents.run(request, &state.cost_log).await
}

#[tauri::command]
fn agent_cancel(state: State<'_, AppState>) {
    state.agents.cancel();
}

/// The only network command. The WebView names a provider; Rust adds the key.
#[tauri::command]
async fn provider_fetch(
    request: net::FetchRequest,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<net::FetchResponse, String> {
    let store = Arc::clone(&state.secret_store);
    let log = Arc::clone(&state.cost_log);
    let result = net::provider_fetch(request, store.as_ref(), &log).await;
    let _ = app.emit("cost:state", &log.totals());
    result
}

#[tauri::command]
fn providers_list(state: State<'_, AppState>) -> Vec<net::ProviderInfo> {
    net::providers_info(state.secret_store.as_ref())
}

#[tauri::command]
fn cost_log_list(limit: Option<usize>, state: State<'_, AppState>) -> Vec<net::CostEntry> {
    state.cost_log.list(limit.unwrap_or(50))
}

#[tauri::command]
fn cost_log_totals(state: State<'_, AppState>) -> Vec<net::CostTotal> {
    state.cost_log.totals()
}

impl AppSettings {
    pub fn audio_config(&self) -> AudioConfig {
        AudioConfig {
            input_device: self.input_device.clone(),
            output_device: self.output_device.clone(),
            input_channel: self.input_channel,
            sample_rate: self.sample_rate,
            buffer_size: self.buffer_size,
        }
    }

    pub fn set_audio_config(&mut self, cfg: &AudioConfig) {
        self.input_device = cfg.input_device.clone();
        self.output_device = cfg.output_device.clone();
        self.input_channel = cfg.input_channel;
        self.sample_rate = cfg.sample_rate;
        self.buffer_size = cfg.buffer_size;
    }
}

#[tauri::command]
fn audio_get_config(state: State<'_, AppState>) -> AudioConfig {
    state.engine.lock().config().clone()
}

/// Applies a new device configuration live (the engine restarts on the new devices)
/// and persists it. Returns the resulting status so the UI can show what actually
/// happened, including a headless fallback.
#[tauri::command]
fn audio_set_config(
    config: AudioConfig,
    state: State<'_, AppState>,
) -> Result<EngineStatus, String> {
    let mut settings = load_settings()?;
    settings.set_audio_config(&config);
    let mut eng = state.engine.lock();
    eng.apply_config(config)?;
    let status = eng.status();
    if status.last_error.is_none() {
        save_settings(&settings)?;
    }
    Ok(status)
}

#[tauri::command]
fn engine_status(state: State<'_, AppState>) -> EngineStatus {
    let eng = state.engine.lock();
    eng.poll_stream_errors();
    eng.status()
}

/// Restart the engine on the current configuration (after plugging a device back in).
#[tauri::command]
fn engine_restart(state: State<'_, AppState>) -> Result<EngineStatus, String> {
    let mut eng = state.engine.lock();
    let cfg = eng.config().clone();
    let result = eng.apply_config(cfg);
    let status = eng.status();
    result.map(|_| status)
}

#[tauri::command]
fn audio_set_band_volume(volume: f32, state: State<'_, AppState>) {
    state.engine.lock().set_band_volume(volume);
}

#[tauri::command]
fn audio_set_input_monitor(gain: f32, state: State<'_, AppState>) {
    state.engine.lock().set_input_monitor(gain);
}

#[tauri::command]
fn keys_set(provider: String, key: String, state: State<'_, AppState>) -> Result<(), String> {
    if net::provider(&provider).is_none() || key.trim().is_empty() || key.len() > 4096 {
        return Err("Choose a supported provider and enter a non-empty API key.".into());
    }
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
fn settings_get() -> Result<AppSettings, String> {
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
fn metronome_set(on: bool, bpm: f64, state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    if on {
        eng.transport_set_tempo(bpm);
        eng.transport_play();
    } else {
        eng.transport_stop();
    }
    Ok(())
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
fn transport_play(state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.transport_play();
    // A fresh run should fire the first section's scene again.
    state.rig.lock().reset_section_tracking();
    Ok(())
}

#[tauri::command]
fn transport_pause(state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.transport_pause();
    Ok(())
}

#[tauri::command]
fn transport_stop(state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.transport_stop();
    Ok(())
}

#[tauri::command]
fn transport_seek_bar(bar: u32, state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.transport_seek_bar(bar);
    Ok(())
}

#[tauri::command]
fn transport_set_loop(
    start_bar: u32,
    end_bar: u32,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.transport_set_loop(start_bar, end_bar, enabled);
    Ok(())
}

#[tauri::command]
fn transport_set_count_in(bars: u32, state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.transport_set_count_in(bars);
    Ok(())
}

#[tauri::command]
fn transport_set_tempo(bpm: f64, state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.transport_set_tempo(bpm);
    Ok(())
}

#[tauri::command]
fn transport_set_time_signature(
    numerator: u8,
    denominator: u8,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.validate_transport_meter((numerator, denominator))?;
    eng.transport_set_time_signature((numerator, denominator));
    Ok(())
}

#[tauri::command]
fn transport_set_click_volume(volume: f32, state: State<'_, AppState>) {
    state.engine.lock().set_click_volume(volume);
}

#[tauri::command]
fn band_set_style(style_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let style = state.library.lock().style(&style_id)?;
    let eng = state.engine.lock();
    eng.validate_style_meter(&style)?;
    eng.band_set_style(style);
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
fn recorder_start(session_id: String, state: State<'_, AppState>) -> Result<String, String> {
    let eng = state.engine.lock();
    if eng.song_snapshot.is_null() {
        eng.recorder_start(session_id)
    } else {
        eng.record_song(session_id)
    }
}

#[tauri::command]
fn recorder_stop(state: State<'_, AppState>) -> Result<jam_audio::recorder::TakeMetadata, String> {
    let meta = state.engine.lock().recorder_stop()?;
    let _ = state.store.lock().insert_take(&meta);
    Ok(meta)
}

/// Sets the round-trip offset (in samples) trimmed from the start of the guitar stem so
/// it lines up with the band. Automatic loopback measurement is not built yet, so this
/// is the honest manual knob; the value is remembered in settings.
#[tauri::command]
fn recorder_set_latency(samples: u32, state: State<'_, AppState>) -> Result<u32, String> {
    let samples = samples.min(48_000);
    state
        .engine
        .lock()
        .recorder_set_latency_compensation(samples as usize);
    let mut settings = load_settings()?;
    settings.recorder.latency_samples = samples;
    save_settings(&settings)?;
    Ok(samples)
}

#[tauri::command]
fn recorder_get_latency() -> Result<u32, String> {
    Ok(load_settings()?.recorder.latency_samples)
}

#[tauri::command]
fn takes_list(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<jam_audio::recorder::TakeMetadata>, String> {
    let (takes, warnings) = all_takes(&state)?;
    for warning in warnings {
        let _ = app.emit("app:error", warning);
    }
    Ok(takes
        .into_iter()
        .filter(|t| t.extra.get("hidden") != Some(&serde_json::Value::Bool(true)))
        .collect())
}

#[tauri::command]
fn takes_delete(take_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut take = find_take(&state, &take_id)?;
    take.extra
        .insert("hidden".into(), serde_json::Value::Bool(true));
    jam_audio::recorder::save_manifest(&take)?;
    state.store.lock().delete_take(&take_id)
}
#[tauri::command]
fn band_set(args: BandSetArgs, state: State<'_, AppState>) -> Result<(), String> {
    let style = match &args.style_id {
        Some(id) => Some(state.library.lock().style(id)?),
        None => None,
    };

    let eng = state.engine.lock();
    if let Some(style) = &style {
        eng.validate_style_meter(style)?;
    }
    eng.band_set(jam_audio::engine::BandPatch {
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
fn band_list_styles(state: State<'_, AppState>) -> Vec<Style> {
    state.library.lock().styles()
}

/// Loads a chart into the band and, when `follow_chart` is set, also adopts its time
/// signature, default tempo and default style so one click sets up the whole jam.
#[tauri::command]
fn band_load_chart(
    chart_id: String,
    follow_chart: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Chart, String> {
    let chart = state.library.lock().chart(&chart_id)?;
    let mut eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    if follow_chart.unwrap_or(true) {
        let style = state.library.lock().style_for_chart(&chart)?;
        eng.band_set_style(style);
        eng.transport_set_time_signature(chart.time_sig);
        if chart.default_bpm > 0.0 {
            eng.transport_set_tempo(chart.default_bpm);
        }
    } else {
        eng.validate_transport_meter(chart.time_sig)?;
    }
    eng.band_load_chart(chart.resolve());
    restore_rig_mappings(&state);
    Ok(chart)
}

/// Loads a chart directly from a JSON value (chart editor) without saving it.
#[tauri::command]
fn band_load_chart_inline(chart: Chart, state: State<'_, AppState>) -> Result<(), String> {
    library::validate_chart(&chart)?;
    let style = state.library.lock().style_for_chart(&chart)?;
    let mut eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.band_set_style(style);
    eng.transport_set_time_signature(chart.time_sig);
    eng.band_load_chart(chart.resolve());
    restore_rig_mappings(&state);
    Ok(())
}

fn restore_rig_mappings(state: &AppState) {
    let mut rig = state.rig.lock();
    rig.song_mappings = None;
    rig.reset_section_tracking();
}

#[tauri::command]
fn charts_save(chart: Chart, state: State<'_, AppState>) -> Result<String, String> {
    let path = state.library.lock().save_chart(&chart)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn charts_import_file(path: String, state: State<'_, AppState>) -> Result<Chart, String> {
    state
        .library
        .lock()
        .import_chart_file(std::path::Path::new(&path))
}

#[tauri::command]
fn charts_delete_user(chart_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.library.lock().delete_user_chart(&chart_id)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryInfo {
    styles_dir: String,
    charts_dir: String,
    user_chart_ids: Vec<String>,
    load_errors: Vec<String>,
}

#[tauri::command]
fn library_reload(state: State<'_, AppState>) -> LibraryInfo {
    let mut lib = state.library.lock();
    lib.reload();
    LibraryInfo {
        styles_dir: lib.styles_dir().to_string_lossy().into_owned(),
        charts_dir: lib.charts_dir().to_string_lossy().into_owned(),
        user_chart_ids: lib.user_chart_ids().to_vec(),
        load_errors: lib.load_errors().to_vec(),
    }
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

const SONGS_NOT_BUILT: &str = "Real-song playback (stem separation, beat and chord analysis, \
time-stretch) is not built yet; this is milestone M3 on the plan. Nothing was imported.";

/// M3 is open. Until the analysis pipeline exists this refuses honestly instead of
/// returning invented tempo, chords and stems.
#[tauri::command]
fn song_import(file_path: String) -> Result<SongMetadata, String> {
    let path = std::path::Path::new(&file_path);
    if !path.is_file() {
        return Err(format!("{file_path} is not a file. {SONGS_NOT_BUILT}"));
    }
    Err(SONGS_NOT_BUILT.to_string())
}

#[tauri::command]
fn song_set_speed(_speed: f32) -> Result<(), String> {
    Err(SONGS_NOT_BUILT.to_string())
}

#[tauri::command]
fn song_set_transpose(_semitones: i32) -> Result<(), String> {
    Err(SONGS_NOT_BUILT.to_string())
}

#[tauri::command]
fn song_set_stem_settings(_settings: StemSettings) -> Result<(), String> {
    Err(SONGS_NOT_BUILT.to_string())
}
const AI_MUSIC_NOT_BUILT: &str = "Generative AI music is not connected yet; this is milestone M4 \
on the plan. Neither Lyria RealTime, ElevenLabs Music nor the offline generator is wired into the \
audio engine, so nothing would be heard. The stream was not started.";

/// M4 is open. The generator exists as a stub but is not mixed into the output, so
/// starting it would only flip a status light; refuse honestly instead.
#[tauri::command]
fn ai_music_start(
    config: jam_audio::ai_music::AiMusicConfig,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    let _ = config;
    Err(AI_MUSIC_NOT_BUILT.to_string())
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
fn band_list_charts(state: State<'_, AppState>) -> Vec<Chart> {
    state.library.lock().charts()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RigStateDto {
    pub current_profile: jam_rig::RigProfile,
    pub current_scene: usize,
    pub section_mappings: std::collections::HashMap<String, usize>,
    pub control_values: std::collections::HashMap<u8, u8>,
    pub follow_sections: bool,
    /// Port name when a real port is open, otherwise `None`.
    pub port: Option<String>,
    pub port_description: String,
    pub live: bool,
    pub monitor: Vec<jam_rig::SentMessage>,
}

fn rig_state_dto(rig: &jam_rig::RigOrchestrator) -> RigStateDto {
    RigStateDto {
        current_profile: rig.profile.clone(),
        current_scene: rig.current_scene,
        section_mappings: rig.section_mappings.clone(),
        control_values: rig.control_values.clone(),
        follow_sections: rig.follow_sections,
        port: rig.is_live().then(|| rig.port_description()),
        port_description: rig.port_description(),
        live: rig.is_live(),
        monitor: rig.monitor(),
    }
}

/// Persists the parts of the rig state worth remembering (profile, port, mappings).
fn persist_rig(rig: &jam_rig::RigOrchestrator) -> Result<(), String> {
    let mut settings = load_settings()?;
    settings.rig.profile_id = Some(rig.profile.id.clone());
    settings.rig.midi_port = rig.is_live().then(|| rig.port_description());
    settings.rig.follow_sections = rig.follow_sections;
    settings
        .rig
        .section_mappings
        .insert(rig.profile.id.clone(), rig.section_mappings.clone());
    save_settings(&settings)
}

#[tauri::command]
fn rig_list_profiles(state: State<'_, AppState>) -> Vec<jam_rig::RigProfile> {
    state.library.lock().rigs()
}

#[tauri::command]
fn rig_select_profile(
    profile_id: String,
    state: State<'_, AppState>,
) -> Result<RigStateDto, String> {
    let profile = state.library.lock().rig(&profile_id)?;
    let saved = load_settings()?
        .rig
        .section_mappings
        .remove(&profile_id)
        .unwrap_or_default();
    let mut rig = state.rig.lock();
    rig.set_profile(profile);
    for (section, idx) in saved {
        if idx < rig.profile.scenes.len() {
            rig.set_section_mapping(section, idx);
        }
    }
    persist_rig(&rig)?;
    Ok(rig_state_dto(&rig))
}

#[tauri::command]
fn rig_select_scene(scene_idx: usize, state: State<'_, AppState>) -> Result<RigStateDto, String> {
    let mut rig = state.rig.lock();
    rig.select_scene(scene_idx)?;
    Ok(rig_state_dto(&rig))
}

#[tauri::command]
fn rig_set_section_mapping(
    section: String,
    scene_idx: Option<usize>,
    state: State<'_, AppState>,
) -> Result<RigStateDto, String> {
    let mut rig = state.rig.lock();
    match scene_idx {
        Some(idx) => {
            if idx >= rig.profile.scenes.len() {
                return Err(format!(
                    "scene {idx} does not exist on {}",
                    rig.profile.name
                ));
            }
            rig.set_section_mapping(section, idx);
        }
        None => rig.clear_section_mapping(&section),
    }
    persist_rig(&rig)?;
    Ok(rig_state_dto(&rig))
}

#[tauri::command]
fn rig_set_follow_sections(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<RigStateDto, String> {
    let mut rig = state.rig.lock();
    rig.follow_sections = enabled;
    persist_rig(&rig)?;
    Ok(rig_state_dto(&rig))
}

#[tauri::command]
fn rig_get_state(state: State<'_, AppState>) -> RigStateDto {
    rig_state_dto(&state.rig.lock())
}

#[tauri::command]
fn rig_list_ports() -> Result<Vec<jam_rig::MidiPortInfo>, String> {
    jam_rig::list_output_ports()
}

/// Opens a MIDI output port (or closes the current one when `port` is `None`).
#[tauri::command]
fn rig_open_port(port: Option<String>, state: State<'_, AppState>) -> Result<RigStateDto, String> {
    let mut rig = state.rig.lock();
    match port {
        Some(name) => {
            rig.open_port(&name)?;
        }
        None => rig.close_port(),
    }
    persist_rig(&rig)?;
    Ok(rig_state_dto(&rig))
}

#[tauri::command]
fn rig_set_control(cc: u8, value: u8, state: State<'_, AppState>) -> Result<RigStateDto, String> {
    let mut rig = state.rig.lock();
    rig.set_control(cc, value)?;
    Ok(rig_state_dto(&rig))
}

#[tauri::command]
fn rig_send_program(program: u8, state: State<'_, AppState>) -> Result<RigStateDto, String> {
    let mut rig = state.rig.lock();
    rig.send_program(program)?;
    Ok(rig_state_dto(&rig))
}

#[tauri::command]
fn rig_clear_monitor(state: State<'_, AppState>) -> RigStateDto {
    let mut rig = state.rig.lock();
    rig.clear_monitor();
    rig_state_dto(&rig)
}
fn all_takes(
    state: &AppState,
) -> Result<(Vec<jam_audio::recorder::TakeMetadata>, Vec<String>), String> {
    let mut takes: std::collections::BTreeMap<_, _> = state
        .store
        .lock()
        .list_takes()?
        .into_iter()
        .map(|t| (t.id.clone(), t))
        .collect();
    let (files, warnings) = originals::file_takes()?;
    for t in files {
        takes.insert(t.id.clone(), t);
    }
    let mut list: Vec<_> = takes.into_values().collect();
    list.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok((list, warnings))
}

fn find_take(state: &AppState, take_id: &str) -> Result<jam_audio::recorder::TakeMetadata, String> {
    all_takes(state)?
        .0
        .into_iter()
        .find(|t| t.id == take_id)
        .ok_or_else(|| format!("take {take_id} is not in the library"))
}

/// Analyses the guitarist's recorded DI stem against the tempo the take was played at.
#[tauri::command]
fn takes_analyze(
    take_id: String,
    state: State<'_, AppState>,
) -> Result<jam_audio::analysis::TakeAnalysis, String> {
    let take = find_take(&state, &take_id)?;
    let (samples, sample_rate) =
        jam_audio::recorder::read_wav_mono(std::path::Path::new(&take.path_input))?;
    let analyzer = jam_audio::analysis::TakeAnalyzer::new(sample_rate);
    Ok(analyzer.analyze(&samples, take.tempo))
}

/// Section markers for a chart in playing order: `(name, first bar)`.
fn chart_sections(chart: &Chart) -> Vec<(String, u32)> {
    let resolved = chart.resolve();
    let mut out: Vec<(String, u32)> = Vec::new();
    for bar in &resolved.bars {
        if out
            .last()
            .map(|(name, _)| name != &bar.section_name)
            .unwrap_or(true)
        {
            out.push((bar.section_name.clone(), bar.bar_index));
        }
    }
    out
}

/// Exports recorded stems, layers, MIDI, markers and an optional REAPER session builder.
#[tauri::command]
fn takes_export_daw(
    take_id: String,
    output_dir: Option<String>,
    state: State<'_, AppState>,
) -> Result<jam_audio::export::ExportReport, String> {
    let take = find_take(&state, &take_id)?;
    let base_dir = output_dir.map(std::path::PathBuf::from).unwrap_or_else(|| {
        dirs::document_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("JosefinesJamstudio")
            .join("Exports")
    });
    let export_path = base_dir.join(&take_id);

    let chart: Option<Chart> = serde_json::from_value(take.snapshot["body"]["chart"].clone())
        .ok()
        .or_else(|| state.library.lock().chart(&take.chart_id).ok());
    let sections_owned = chart.as_ref().map(chart_sections).unwrap_or_default();
    let sections: Vec<(&str, u32)> = sections_owned
        .iter()
        .map(|(n, b)| (n.as_str(), *b))
        .collect();
    let time_sig = serde_json::from_value::<(u8, u8)>(take.snapshot["timeSignature"].clone())
        .ok()
        .or_else(|| chart.as_ref().map(|c| c.time_sig))
        .unwrap_or((4, 4));
    let sample_rate = if take.sample_rate > 0 {
        take.sample_rate
    } else {
        jam_audio::recorder::wav_sample_rate(std::path::Path::new(&take.path_master))?
    };

    let mut stem_paths = take.stems.clone();
    if stem_paths.is_empty() {
        stem_paths.extend([
            ("guitar-di".into(), take.path_input.clone()),
            ("band".into(), take.path_band.clone()),
            ("master".into(), take.path_master.clone()),
        ]);
    }
    let stems: Vec<_> = stem_paths
        .iter()
        .map(|(name, p)| (name.as_str(), std::path::Path::new(p)))
        .collect();
    let job = jam_audio::export::ExportJob {
        take_id: &take.id,
        tempo: take.tempo,
        time_sig,
        sample_rate,
        sections: &sections,
        stems: &stems,
    };
    let mut report = jam_audio::export::DawExporter::export_take_bundle(&export_path, &job)
        .map_err(|e| e.to_string())?;
    if !take.midi.is_empty() {
        jam_audio::export::write_performance_midi(
            &export_path.join("band-notes.mid"),
            &take,
            time_sig,
        )
        .map_err(|e| e.to_string())?;
    }
    std::fs::write(
        export_path.join("song-snapshot.json"),
        serde_json::to_vec_pretty(&take.snapshot).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if let Ok(clips) = serde_json::from_value::<Vec<jam_audio::workstation::ClipSpec>>(
        take.snapshot["body"]["clips"].clone(),
    ) {
        for (i, spec) in clips.into_iter().enumerate() {
            if spec.muted {
                continue;
            }
            let clip = originals::read_clip(spec, &state)?;
            let path = export_path.join(format!("guitar-layer-{}.wav", i + 1));
            jam_audio::export::write_clip_stem(
                &path,
                &clip,
                take.sample_count,
                sample_rate,
                take.tempo,
            )
            .map_err(|e| e.to_string())?;
            report
                .copied_stems
                .push(path.to_string_lossy().into_owned());
        }
    }
    let info_path = export_path.join(format!("{}-info.json", take.id));
    if report.missing_stems.is_empty() {
        report.reaper_script = Some(
            jam_audio::export::write_reaper_import(&export_path, &job, &report, &take.midi)
                .map_err(|e| e.to_string())?,
        );
    }
    let mut info: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&info_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    info["schemaVersion"] = serde_json::json!(1);
    info["stems"] = serde_json::json!(report.copied_stems);
    info["missingStems"] = serde_json::json!(report.missing_stems);
    info["reaperScript"] = serde_json::json!(report.reaper_script);
    info["howTo"] = serde_json::json!("Import the tempo map first. Put the individual guitar, drums, bass, comp and guitar-layer stems at bar 1. Band and master are reference mixes: mute them while mixing the individual stems. Import band-notes.mid on separate instrument tracks if wanted.");
    std::fs::write(
        info_path,
        serde_json::to_vec_pretty(&info).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(report)
}

/// Restores the rig from settings: the saved profile (HeadRush by default, since that
/// is the hardware this app is built around), its section mappings, and the MIDI
/// port if it is still present. A missing port is logged, never fatal.
fn build_rig(settings: &AppSettings, library: &Library) -> jam_rig::RigOrchestrator {
    let wanted = settings
        .rig
        .profile_id
        .clone()
        .unwrap_or_else(|| "headrush-pedalboard".to_string());
    let profile = library
        .rig(&wanted)
        .or_else(|_| library.rig("headrush-pedalboard"))
        .unwrap_or_else(|_| jam_rig::RigProfile::generic());
    let mut rig = jam_rig::RigOrchestrator::with_memory_sink(profile);
    rig.follow_sections = settings.rig.follow_sections;
    if let Some(map) = settings.rig.section_mappings.get(&rig.profile.id) {
        let n = rig.profile.scenes.len();
        for (section, idx) in map {
            if *idx < n {
                rig.set_section_mapping(section.clone(), *idx);
            }
        }
    }
    if let Some(port) = &settings.rig.midi_port {
        if let Err(e) = rig.open_port(port) {
            tracing::warn!("rig: saved MIDI port not opened: {e}");
        }
    }
    rig
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let settings = load_settings().unwrap_or_else(|e| {
        tracing::error!("{e}");
        AppSettings::default()
    });
    let mut engine = AudioEngine::new(settings.audio_config());
    if let Err(e) = engine.start() {
        // Never fail to launch because of audio: the status screen shows the reason and
        // offers a retry. The UI stays usable for chart editing and settings.
        tracing::error!("audio engine started degraded: {e}");
    }
    engine.recorder_set_latency_compensation(settings.recorder.latency_samples as usize);
    let engine_arc = Arc::new(Mutex::new(engine));

    let library = Library::load();
    for e in library.load_errors() {
        tracing::warn!("library: {e}");
    }
    let library_arc = Arc::new(Mutex::new(library));

    let is_test = std::env::var("JAM_HEADLESS").unwrap_or_default() == "1";
    let secret_store: Arc<dyn SecretStore> = if is_test {
        Arc::new(MemoryStore::default())
    } else {
        Arc::new(KeyringStore::default())
    };
    let cost_log = Arc::new(net::CostLog::new(if is_test {
        std::env::temp_dir().join("jam-usage-log-test.jsonl")
    } else {
        net::CostLog::default_path()
    }));

    let index_store = if is_test {
        store::IndexStore::open_in_memory().unwrap()
    } else {
        store::IndexStore::open().unwrap()
    };
    let store_arc = Arc::new(Mutex::new(index_store));

    let ai_music_engine = Arc::new(Mutex::new(jam_audio::ai_music::AiMusicEngine::new(48_000)));

    let rig_orchestrator = Arc::new(Mutex::new(build_rig(&settings, &library_arc.lock())));

    let app_state = AppState {
        agents: agents::AgentRunner::default(),
        controller: Arc::new(Mutex::new(None)),
        secret_store,
        engine: Arc::clone(&engine_arc),
        library: Arc::clone(&library_arc),
        store: Arc::clone(&store_arc),
        ai_music: Arc::clone(&ai_music_engine),
        rig: Arc::clone(&rig_orchestrator),
        cost_log,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(app_state)
        .setup(move |app| {
            use tauri::Manager;
            for folder in ["assets", "exports"] {
                let path = media::root().join(folder);
                std::fs::create_dir_all(&path)?;
                app.asset_protocol_scope().allow_directory(path, true)?;
            }
            let controller = Arc::clone(&app.state::<AppState>().controller);
            let app_handle = app.handle().clone();
            let eng = Arc::clone(&engine_arc);
            let rig = Arc::clone(&rig_orchestrator);

            // Emit telemetry at 30 Hz; engine status only when it changes.
            std::thread::spawn(move || {
                let mut last_status: Option<EngineStatus> = None;
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(33));
                    let (tel, status) = {
                        let eng = eng.lock();
                        eng.poll_stream_errors();
                        (eng.get_telemetry(), eng.status())
                    };
                    // Section-bound rig scenes: the orchestrator de-duplicates, so
                    // calling it every tick is cheap and only sends on a change.
                    if tel.transport.state == "playing" && !tel.band.current_section.is_empty() {
                        let mut rig = rig.lock();
                        match rig.on_section_change(&tel.band.current_section) {
                            Ok(Some(_)) => {
                                let _ = app_handle.emit("rig:state", &rig_state_dto(&rig));
                            }
                            Ok(None) => {}
                            Err(e) => {
                                let _ = app_handle.emit("rig:error", &e);
                            }
                        }
                    }
                    let _ = app_handle.emit("meters", &tel.output_level);
                    if let Some(input) = controller.lock().as_ref() {
                        for press in input.drain() {
                            if !rig.lock().is_recent_echo(&press) {
                                let _ = app_handle.emit("controller:press", press);
                            }
                        }
                    }
                    let _ = app_handle.emit("input:meters", &tel.input_level);
                    let _ = app_handle.emit("transport:state", &tel.transport);
                    let _ = app_handle.emit("band:state", &tel.band);
                    if let Some(t) = &tel.tuner {
                        let _ = app_handle.emit("tuner:state", t);
                    }
                    if last_status.as_ref() != Some(&status) {
                        let _ = app_handle.emit("engine:status", &status);
                        last_status = Some(status);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            media::media_list,
            media::media_save,
            media::media_import,
            media::media_from_take,
            media::media_generate,
            media::media_refresh,
            media::media_tools,
            media::media_render,
            media::media_cancel,
            media::media_open,
            agent_status,
            agent_request,
            agent_cancel,
            controller::controller_ports,
            controller::controller_open,
            controller::controller_config,
            controller::controller_save,
            originals::originals_record,
            originals::originals_save,
            originals::originals_list,
            originals::originals_load,
            originals::capture_arm,
            originals::clip_audition,
            originals::capture_keep,
            originals::takes_favourite,
            keys_set,
            keys_has,
            keys_delete,
            provider_fetch,
            providers_list,
            cost_log_list,
            cost_log_totals,
            settings_get,
            settings_set,
            audio_list_devices,
            audio_get_config,
            audio_set_config,
            audio_set_band_volume,
            audio_set_input_monitor,
            engine_status,
            engine_restart,
            library_reload,
            charts_save,
            charts_import_file,
            charts_delete_user,
            band_load_chart_inline,
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
            recorder_set_latency,
            recorder_get_latency,
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
            rig_set_follow_sections,
            rig_get_state,
            rig_list_ports,
            rig_open_port,
            rig_set_control,
            rig_send_program,
            rig_clear_monitor,
            takes_analyze,
            originals::takes_melody,
            takes_export_daw,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod desktop_permissions {
    #[test]
    fn generated_acl_grants_local_main_subscriptions_and_close_only() {
        let acl: serde_json::Value =
            serde_json::from_str(include_str!("../gen/schemas/capabilities.json")).unwrap();
        let cap = &acl["default"];
        assert_eq!(cap["windows"], serde_json::json!(["main"]));
        assert_eq!(cap["local"], true);
        assert!(cap.get("remote").is_none());
        assert_eq!(
            cap["permissions"],
            serde_json::json!([
                "core:event:allow-listen",
                "core:event:allow-unlisten",
                "core:window:allow-destroy"
            ])
        );
    }
}
