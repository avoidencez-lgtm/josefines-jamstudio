//! src-tauri: Tauri application library and command dispatch.

pub mod agents;
pub mod aliases;
pub mod assets;
pub mod clips;
pub mod controller;
pub mod keys;
pub mod library;
pub mod lyria;
pub mod media;
pub mod net;
pub mod originals;
pub mod platform;
pub mod settings;
pub mod store;
pub mod voice;

use jam_audio::devices::{list_devices, AudioConfig, AudioDevices};
use jam_audio::engine::{AudioEngine, EngineStatus, EngineTelemetry};
use jam_audio::LatencyCalibration;
use jam_band::sequencer::Cue;
use jam_core::chart::Chart;
use jam_core::style::Style;
use jam_core::timeline::beats_to_samples;
use keys::{KeyringStore, MemoryStore, SecretStore};
use library::Library;
use parking_lot::Mutex;
use settings::{load_settings, save_settings, AppSettings};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

/// Warnings about damaged files are shown once per session, not on every refresh
/// (issues #32 and #51): the file stays on disk and the message stays true.
#[derive(Default)]
pub struct WarnOnce(Mutex<std::collections::HashSet<String>>);

impl WarnOnce {
    /// Keeps only the warnings that have not been shown before.
    pub fn fresh(&self, warnings: Vec<String>) -> Vec<String> {
        let mut seen = self.0.lock();
        warnings
            .into_iter()
            .filter(|w| seen.insert(w.clone()))
            .collect()
    }
}

pub struct AppState {
    pub voice: Arc<Mutex<voice::VoiceSession>>,
    pub lyria: Arc<Mutex<lyria::Session>>,
    pub recovery_notice: Mutex<Option<String>>,
    pub warnings: WarnOnce,
    /// Decoded guitar clips, keyed by file and checked against size and mtime (#44).
    pub clips: Mutex<clips::ClipCache>,
    /// Set by `app_exit` once the UI has run its close guard, so the quit handler lets the app go.
    pub exit_confirmed: std::sync::atomic::AtomicBool,
    /// Set by the first `engine_status` call: the frontend loaded and IPC works (smoke runs read it).
    pub ui_ready: std::sync::atomic::AtomicBool,
    pub agents: agents::AgentRunner,
    pub secret_store: Arc<dyn SecretStore>,
    pub engine: Arc<Mutex<AudioEngine>>,
    pub library: Arc<Mutex<Library>>,
    pub store: Arc<Mutex<store::IndexStore>>,
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

/// The UI has run its close guard (nothing recording, drafts saved or discarded):
/// exit for real. Both the window's close button and an app-level quit end here.
/// Refuses while a take is still rolling so `app_exit` cannot throw away the WAV
/// headers (#152). `finalize_on_exit` is the last-resort save on `RunEvent::Exit`.
#[tauri::command]
fn app_exit<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if state.engine.lock().recorder_is_recording() {
        return Err("Finish the recording before closing.".into());
    }
    state
        .exit_confirmed
        .store(true, std::sync::atomic::Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

/// Save an in-flight take when the process is actually leaving. Tao does not
/// drop `AppState`, so `TakeRecorder::drop` never runs.
pub fn finalize_on_exit(state: &AppState) {
    let meta = {
        let eng = state.engine.lock();
        if !eng.recorder_is_recording() {
            return;
        }
        eng.recorder_stop()
    };
    match meta {
        Ok(meta) => {
            let _ = state.store.lock().insert_take(&meta);
        }
        Err(e) => tracing::error!("could not save the take on exit: {e}"),
    }
}

/// Hold an app-level quit only after the UI handshake. Early Cmd+Q must not
/// sit forever waiting for a listener that is not mounted yet.
pub fn should_defer_quit(ui_ready: bool, exit_confirmed: bool, window_open: bool) -> bool {
    ui_ready && window_open && !exit_confirmed
}

/// Opens an allowlisted https URL in the OS browser. `target="_blank"` is dead in WebView2/WKWebView.
#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    platform::open_https(&url).await
}

/// The only network command. The WebView names a provider; Rust adds the key.
#[tauri::command]
async fn provider_fetch<R: tauri::Runtime>(
    request: net::FetchRequest,
    state: State<'_, AppState>,
    app: tauri::AppHandle<R>,
) -> Result<net::FetchResponse, String> {
    let store = Arc::clone(&state.secret_store);
    let log = Arc::clone(&state.cost_log);
    let result = net::provider_fetch_notifying(request, store.as_ref(), &log, |error| {
        let _ = app.emit(
            "app:error",
            format!("Could not save the usage log. {error}"),
        );
    })
    .await;
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
async fn audio_set_config(
    config: AudioConfig,
    state: State<'_, AppState>,
) -> Result<EngineStatus, String> {
    let mut settings = load_settings()?;
    settings.set_audio_config(&config);
    let mut eng = state.engine.lock();
    eng.apply_config(config)?;
    let status = eng.status();
    let key = settings::RecorderSettings::device_key(
        settings.input_device.as_deref(),
        settings.output_device.as_deref(),
        settings.input_channel,
        settings.sample_rate,
        settings.buffer_size,
    );
    if let Some(stored) = settings.recorder.latency_by_device.get(&key).cloned() {
        settings.recorder.latency_samples = stored.round_trip_frames;
        settings.recorder.latency_estimated = stored.estimated;
        settings.recorder.latency_confidence = stored.confidence;
        eng.recorder_set_latency_compensation(stored.round_trip_frames as usize);
    } else {
        settings.recorder.latency_samples = 0;
        settings.recorder.latency_estimated = false;
        settings.recorder.latency_confidence = 0.0;
        eng.recorder_set_latency_compensation(0);
    }
    if status.last_error.is_none() {
        save_settings(&settings)?;
    }
    Ok(status)
}

#[tauri::command]
fn engine_status(state: State<'_, AppState>) -> EngineStatus {
    state
        .ui_ready
        .store(true, std::sync::atomic::Ordering::SeqCst);
    let eng = state.engine.lock();
    eng.poll_stream_errors();
    eng.status()
}

/// Restart the engine on the current configuration (after plugging a device back in).
#[tauri::command]
async fn engine_restart(state: State<'_, AppState>) -> Result<EngineStatus, String> {
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
    if net::provider(&provider).is_none() || key.trim().is_empty() {
        return Err("Choose a supported provider and enter a non-empty API key.".into());
    }
    state.secret_store.set(&provider, &key)
}

#[tauri::command]
fn keys_has(provider: String, state: State<'_, AppState>) -> Result<bool, String> {
    state.secret_store.has(&provider)
}

#[tauri::command]
fn keys_delete(provider: String, state: State<'_, AppState>) -> Result<(), String> {
    state.secret_store.delete(&provider)
}

#[tauri::command]
fn keys_test(provider: String) -> Result<(), String> {
    if net::provider(&provider).is_none() {
        return Err("Choose a supported provider.".into());
    }
    Err(format!(
        "A cheapest-endpoint test for {provider} is not configured. Check this key status looks only in the OS keychain. This is not a live provider pass."
    ))
}

#[tauri::command]
fn settings_get() -> Result<AppSettings, String> {
    load_settings()
}

#[tauri::command]
fn settings_recovery_notice(state: State<'_, AppState>) -> Option<String> {
    state.recovery_notice.lock().take()
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
        eng.ensure_band_grid()?;
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
    let eng = state.engine.lock();
    let tel = eng.get_telemetry();
    let now = beats_to_samples(
        tel.transport.position_beats,
        tel.transport.bpm,
        eng.sample_rate(),
    );
    let bpm = tel.transport.bpm;
    let playing = tel.transport.state == "playing";
    drop(eng);
    if playing {
        let _ = state.rig.lock().on_transport_tick(now, bpm);
    }
    tel
}

#[tauri::command]
fn transport_play<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    lyria::stop_and_emit(&app, &state);
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    let tel = eng.get_telemetry();
    let now = beats_to_samples(
        tel.transport.position_beats,
        tel.transport.bpm,
        eng.sample_rate(),
    );
    let bpm = tel.transport.bpm;
    eng.transport_play();
    // A fresh run should fire the first section's scene again.
    let mut rig = state.rig.lock();
    rig.reset_section_tracking();
    rig.on_transport_play(now, bpm)?;
    Ok(())
}

#[tauri::command]
fn transport_pause(state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.transport_pause();
    drop(eng);
    state.rig.lock().on_transport_pause()?;
    Ok(())
}

#[tauri::command]
fn transport_stop(state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.transport_stop();
    drop(eng);
    state.rig.lock().on_transport_stop()?;
    Ok(())
}

fn notify_rig_playhead(state: &AppState) -> Result<(), String> {
    let eng = state.engine.lock();
    let tel = eng.get_telemetry();
    let now = beats_to_samples(
        tel.transport.position_beats,
        tel.transport.bpm,
        eng.sample_rate(),
    );
    let bpm = tel.transport.bpm;
    drop(eng);
    state.rig.lock().on_transport_tick(now, bpm)
}

#[tauri::command]
fn transport_seek_bar(bar: u32, state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.ensure_band_grid()?;
    eng.transport_seek_bar(bar);
    drop(eng);
    notify_rig_playhead(&state)
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
    eng.ensure_band_grid()?;
    eng.transport_set_loop(start_bar, end_bar, enabled);
    Ok(())
}

#[tauri::command]
fn transport_set_count_in(bars: u32, state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.ensure_band_grid()?;
    eng.transport_set_count_in(bars);
    Ok(())
}

#[tauri::command]
fn transport_set_tempo(bpm: f64, state: State<'_, AppState>) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.ensure_band_grid()?;
    eng.transport_set_tempo(bpm);
    drop(eng);
    notify_rig_playhead(&state)
}

#[tauri::command]
fn transport_set_time_signature(
    numerator: u8,
    denominator: u8,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.ensure_band_grid()?;
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

fn contained_dir(root: &std::path::Path, parent: &std::path::Path) -> Result<PathBuf, String> {
    let mut probe = parent.to_path_buf();
    let mut missing = Vec::new();
    while !probe.exists() {
        let name = probe.file_name().map(|s| s.to_os_string());
        let next = probe.parent().map(PathBuf::from);
        match (name, next) {
            (Some(name), Some(next)) if next.as_os_str() != probe.as_os_str() => {
                missing.push(name);
                probe = next;
            }
            _ => return Err("Offline render path has no folder.".into()),
        }
    }
    let mut resolved = probe.canonicalize().map_err(|e| e.to_string())?;
    for name in missing.into_iter().rev() {
        if name == "." {
            continue;
        }
        if name == ".." {
            resolved.pop();
            continue;
        }
        resolved.push(name);
    }
    if !resolved.starts_with(root) {
        return Err("Offline render must stay under JosefinesJamstudio.".into());
    }
    Ok(resolved)
}

fn render_out_path(
    user_root: &std::path::Path,
    out_path: Option<String>,
    style_id: &str,
    seed: u64,
) -> Result<PathBuf, String> {
    let root = user_root.canonicalize().or_else(|_| {
        std::fs::create_dir_all(user_root).map_err(|e| e.to_string())?;
        user_root.canonicalize().map_err(|e| e.to_string())
    })?;
    if let Some(raw) = out_path {
        let path = PathBuf::from(raw);
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .ok_or("Offline render path has no folder.")?;
        let parent = contained_dir(&root, parent)?;
        std::fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
        return Ok(parent.join(
            path.file_name()
                .ok_or("Offline render path has no file name.")?,
        ));
    }
    let safe: String = style_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let dir = root.join("renders");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{safe}-{seed}.wav")))
}

#[tauri::command]
fn band_render_offline(
    style_id: Option<String>,
    chart_id: Option<String>,
    seed: Option<u64>,
    bars: Option<u32>,
    tempo_bpm: Option<f64>,
    out_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let lib = state.library.lock();
    let chart = match chart_id.as_deref() {
        Some(id) => Some(lib.chart(id)?),
        None => None,
    };
    let style = if let Some(id) = style_id.as_deref() {
        lib.style(id)?
    } else if let Some(chart) = &chart {
        lib.style_for_chart(chart)?
    } else {
        return Err("Offline render needs a styleId or chartId.".into());
    };
    let bars = bars.unwrap_or(8);
    let bpm = tempo_bpm
        .or_else(|| chart.as_ref().map(|c| c.default_bpm))
        .filter(|bpm| *bpm > 0.0)
        .unwrap_or(120.0);
    let seed = seed.unwrap_or(42);
    let out = render_out_path(lib.user_root(), out_path, &style.id, seed)?;
    drop(lib);
    let resolved = chart.map(|c| c.resolve());
    let buses = jam_band::offline::bus_rms_db(style.clone(), bars, bpm, seed, resolved.clone())?;
    let (left, right) = jam_band::offline::render_style(style, bars, bpm, seed, resolved)?;
    let frames = jam_band::offline::write_wav(&out, &left, &right)?;
    Ok(serde_json::json!({
        "path": out.to_string_lossy(),
        "frames": frames,
        "drumsRmsDb": buses.0,
        "bassRmsDb": buses.1,
        "compRmsDb": buses.2,
        "onsets": buses.3,
    }))
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
        _ => return Err(format!("The cue {cue} is unknown.")),
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
    // Jam record only. Write's Record uses `originals_record` → `record_song`.
    // A leftover song_snapshot must not rewind, clear the loop or auto-play (#201).
    state.engine.lock().recorder_start(session_id)
}

#[tauri::command]
fn recorder_stop(state: State<'_, AppState>) -> Result<jam_audio::recorder::TakeMetadata, String> {
    let meta = state.engine.lock().recorder_stop()?;
    let _ = state.store.lock().insert_take(&meta);
    Ok(meta)
}

/// Sets the round-trip offset (in samples) trimmed from the start of the guitar stem so
/// it lines up with the band. `audio_calibrate_latency` measures this from a cable loopback;
/// this command is the manual override.
#[tauri::command]
fn recorder_set_latency(samples: u32, state: State<'_, AppState>) -> Result<u32, String> {
    let samples = samples.min(48_000);
    state
        .engine
        .lock()
        .recorder_set_latency_compensation(samples as usize);
    let mut settings = load_settings()?;
    settings.recorder.remember(
        settings::RecorderSettings::device_key(
            settings.input_device.as_deref(),
            settings.output_device.as_deref(),
            settings.input_channel,
            settings.sample_rate,
            settings.buffer_size,
        ),
        samples,
        false,
        1.0,
    );
    save_settings(&settings)?;
    Ok(samples)
}

#[tauri::command]
fn recorder_get_latency() -> Result<u32, String> {
    Ok(load_settings()?.recorder.latency_samples)
}

/// Plays three clicks, listens on the guitar input, and stores the round-trip offset.
/// Without a loopback this returns `2 × buffer` flagged `estimated`. Synthetic FileInput
/// never applies an estimate (headless tests keep a zero offset).
#[tauri::command]
fn audio_calibrate_latency(state: State<'_, AppState>) -> Result<LatencyCalibration, String> {
    let engine = Arc::clone(&state.engine);
    engine.lock().start_latency_calibration()?;
    let deadline = Instant::now() + Duration::from_secs(8);
    let result = loop {
        if let Some(result) = engine.lock().take_latency_calibration() {
            break result;
        }
        if Instant::now() >= deadline {
            engine.lock().abort_latency_calibration();
            return Err(
                "Loopback measurement timed out. Check the output and guitar input, then try again."
                    .into(),
            );
        }
        thread::sleep(Duration::from_millis(15));
    };
    if !result.estimated || engine.lock().status().mode == jam_audio::engine::EngineMode::Hardware {
        let mut settings = load_settings()?;
        settings.recorder.remember(
            settings::RecorderSettings::device_key(
                settings.input_device.as_deref(),
                settings.output_device.as_deref(),
                settings.input_channel,
                settings.sample_rate,
                settings.buffer_size,
            ),
            result.round_trip_frames,
            result.estimated,
            result.confidence,
        );
        save_settings(&settings)?;
        if result.estimated {
            engine
                .lock()
                .recorder_set_latency_compensation(result.round_trip_frames as usize);
        }
    }
    Ok(result)
}

#[tauri::command]
async fn takes_list<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<jam_audio::recorder::TakeMetadata>, String> {
    let (takes, warnings) = all_takes(&state)?;
    for warning in state.warnings.fresh(warnings) {
        let _ = app.emit("app:error", warning);
    }
    Ok(takes
        .into_iter()
        .filter(|t| t.extra.get("hidden") != Some(&serde_json::Value::Bool(true)))
        .collect())
}

#[tauri::command]
fn takes_delete(take_id: String, state: State<'_, AppState>) -> Result<(), String> {
    // Validate the ID and require a known take. Manifest audio paths are untrusted.
    find_take(&state, &take_id)?;
    // Only the recorder's root/<validated ID> directory belongs to this deletion.
    let root = originals::takes_root();
    let dir = root.join(&take_id);
    match std::fs::symlink_metadata(&dir) {
        Ok(meta) => {
            let root = root.canonicalize().map_err(|e| e.to_string())?;
            let resolved = dir.canonicalize().map_err(|e| e.to_string())?;
            if !meta.is_dir() || meta.file_type().is_symlink() || resolved != root.join(&take_id) {
                return Err(format!(
                    "take {take_id} is not a regular directory under the takes root"
                ));
            }
            std::fs::remove_dir_all(&resolved)
                .map_err(|e| format!("Could not delete take {take_id}. {e}"))?;
        }
        // Files may already be gone; the ghost cache row must still be removed.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("Could not inspect take {take_id}. {e}")),
    }
    state.store.lock().delete_take(&take_id)
}

#[tauri::command]
fn takes_reindex(state: State<'_, AppState>) -> Result<usize, String> {
    let (files, _) = originals::file_takes()?;
    let store = state.store.lock();
    let (cached, _) = store.list_takes()?;
    let file_ids: std::collections::BTreeSet<_> = files.iter().map(|t| t.id.clone()).collect();
    for t in cached {
        if !file_ids.contains(&t.id) {
            store.delete_take(&t.id)?;
        }
    }
    for t in &files {
        store.insert_take(t)?;
    }
    Ok(files.len())
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
        apply_chart_timing(&eng, &chart);
    } else {
        eng.validate_transport_meter(chart.time_sig)?;
    }
    let section_styles = chart_section_styles(&state.library.lock(), &chart);
    eng.band_load_chart(chart.resolve());
    eng.band_set_section_styles(section_styles);
    restore_rig_mappings(&state);
    Ok(chart)
}

/// Loads a chart directly from a JSON value (chart editor) without saving it.
#[tauri::command]
fn band_load_chart_inline(chart: Chart, state: State<'_, AppState>) -> Result<(), String> {
    library::validate_chart(&chart)?;
    let style = state.library.lock().style_for_chart(&chart)?;
    let section_styles = chart_section_styles(&state.library.lock(), &chart);
    let mut eng = state.engine.lock();
    eng.ensure_timing_editable()?;
    eng.band_set_style(style);
    apply_chart_timing(&eng, &chart);
    eng.band_load_chart(chart.resolve());
    eng.band_set_section_styles(section_styles);
    restore_rig_mappings(&state);
    Ok(())
}

fn apply_chart_timing(eng: &AudioEngine, chart: &Chart) {
    eng.transport_set_time_signature(chart.time_sig);
    if chart.default_bpm > 0.0 {
        eng.transport_set_tempo(chart.default_bpm);
    }
}

fn chart_section_styles(
    library: &Library,
    chart: &Chart,
) -> std::collections::BTreeMap<String, Style> {
    let mut map = std::collections::BTreeMap::new();
    for section in &chart.sections {
        let Some(id) = section.style_override_id.as_deref() else {
            continue;
        };
        let Ok(style) = library.style(id) else {
            continue;
        };
        if style.feel.time_sig != chart.time_sig {
            continue;
        }
        map.insert(section.id.clone(), style);
    }
    map
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
    control_maps: Vec<String>,
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
        control_maps: lib.control_maps().into_iter().map(|m| m.id).collect(),
    }
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
    pub send_clock: bool,
    pub dry_run: bool,
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
        send_clock: rig.send_clock,
        dry_run: rig.dry_run,
        port: rig.is_live().then(|| rig.port_description()),
        port_description: rig.port_description(),
        live: rig.is_live(),
        monitor: rig.monitor(),
    }
}

/// Persists the parts of the rig state worth remembering (profile, port, mappings).
fn persist_rig(
    rig: &jam_rig::RigOrchestrator,
    update: impl FnOnce(&mut settings::RigSettings),
) -> Result<(), String> {
    let mut settings = load_settings()?;
    settings.rig.profile_id = Some(rig.profile.id.clone());
    settings.rig.midi_port = rig.is_live().then(|| rig.port_description());
    settings.rig.follow_sections = rig.follow_sections;
    settings.rig.send_clock = rig.send_clock;
    settings
        .rig
        .section_mappings
        .insert(rig.profile.id.clone(), rig.section_mappings.clone());
    update(&mut settings.rig);
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
        .get(&profile_id)
        .cloned()
        .unwrap_or_default();
    let mut rig = state.rig.lock();
    let mut mappings = std::collections::HashMap::new();
    for (section, idx) in saved {
        if idx < profile.scenes.len() {
            mappings.insert(section, idx);
        }
    }
    persist_rig(&rig, |settings| {
        settings.profile_id = Some(profile.id.clone());
        settings
            .section_mappings
            .insert(profile.id.clone(), mappings.clone());
    })?;
    rig.set_profile(profile);
    rig.section_mappings = mappings;
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
    if let Some(idx) = scene_idx {
        if idx >= rig.profile.scenes.len() {
            return Err(format!(
                "scene {idx} does not exist on {}",
                rig.profile.name
            ));
        }
    }
    persist_rig(&rig, |settings| {
        let mappings = settings
            .section_mappings
            .entry(rig.profile.id.clone())
            .or_default();
        match scene_idx {
            Some(idx) => {
                mappings.insert(section.clone(), idx);
            }
            None => {
                mappings.remove(&section);
            }
        }
    })?;
    match scene_idx {
        Some(idx) => {
            rig.set_section_mapping(section, idx);
        }
        None => rig.clear_section_mapping(&section),
    }
    Ok(rig_state_dto(&rig))
}

#[tauri::command]
fn rig_set_follow_sections(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<RigStateDto, String> {
    let mut rig = state.rig.lock();
    persist_rig(&rig, |settings| settings.follow_sections = enabled)?;
    rig.follow_sections = enabled;
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
    let sink: Box<dyn jam_rig::MidiSink> = match port {
        Some(name) => Box::new(jam_rig::MidirSink::open(&name)?),
        None => Box::new(jam_rig::MemorySink::new()),
    };
    persist_rig(&rig, |settings| {
        settings.midi_port = sink.is_live().then(|| sink.describe());
    })?;
    rig.set_sink(sink);
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

#[tauri::command]
fn rig_panic(state: State<'_, AppState>) -> Result<RigStateDto, String> {
    let mut rig = state.rig.lock();
    rig.panic()?;
    Ok(rig_state_dto(&rig))
}

#[tauri::command]
fn rig_set_clock(on: bool, state: State<'_, AppState>) -> Result<RigStateDto, String> {
    let mut rig = state.rig.lock();
    persist_rig(&rig, |settings| settings.send_clock = on)?;
    rig.set_clock(on);
    Ok(rig_state_dto(&rig))
}

#[tauri::command]
fn rig_dry_run(on: bool, state: State<'_, AppState>) -> Result<RigStateDto, String> {
    let mut rig = state.rig.lock();
    rig.set_dry_run(on);
    Ok(rig_state_dto(&rig))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VirtualMonitorCheck {
    live: bool,
    port: Option<String>,
    expected: Vec<Vec<u8>>,
    monitor: Vec<Vec<u8>>,
}

#[tauri::command]
fn rig_virtual_check(state: State<'_, AppState>) -> Result<VirtualMonitorCheck, String> {
    let expected = {
        let rig = state.rig.lock();
        jam_rig::virtual_monitor::expected_bytes(rig.profile.channel_nibble())
    };
    if std::env::var("JAM_MIDI_FIXTURE").as_deref() == Ok("1") {
        let mut rig = state.rig.lock();
        rig.clear_monitor();
        for program in jam_rig::virtual_monitor::PROGRAMS {
            rig.send_program(program)?;
        }
        let monitor = rig.monitor().into_iter().map(|m| m.bytes).collect();
        return Ok(VirtualMonitorCheck {
            live: false,
            port: Some("MemorySink".into()),
            expected,
            monitor,
        });
    }
    if std::env::var("JAM_LIVE").as_deref() != Ok("1") {
        return Err(jam_rig::virtual_monitor::NOT_CONFIGURED.into());
    }
    let ports = jam_rig::list_output_ports()?;
    let wanted = std::env::var("JAM_MIDI_VIRTUAL")
        .ok()
        .filter(|s| !s.is_empty());
    let Some(port) = wanted
        .as_ref()
        .and_then(|name| {
            ports
                .iter()
                .find(|p| p.name == *name || p.name.contains(name))
                .map(|p| p.name.clone())
        })
        .or_else(|| {
            ports
                .iter()
                .find(|p| jam_rig::virtual_monitor::is_virtual_name(&p.name))
                .map(|p| p.name.clone())
        })
    else {
        return Err(jam_rig::virtual_monitor::NOT_CONFIGURED.into());
    };
    {
        let mut rig = state.rig.lock();
        rig.set_sink(Box::new(jam_rig::MidirSink::open(&port)?));
        rig.clear_monitor();
        for program in jam_rig::virtual_monitor::PROGRAMS {
            rig.send_program(program)?;
        }
    }
    let monitor = state
        .rig
        .lock()
        .monitor()
        .into_iter()
        .map(|m| m.bytes)
        .collect();
    Ok(VirtualMonitorCheck {
        live: true,
        port: Some(port),
        expected,
        monitor,
    })
}
/// Files are truth, SQLite is a cache: a cache that cannot be read is a warning and
/// the takes found on disk are still listed. Missing cache rows are inserted;
/// cached rows whose folder is gone are pruned.
pub(crate) fn all_takes(
    state: &AppState,
) -> Result<(Vec<jam_audio::recorder::TakeMetadata>, Vec<String>), String> {
    let mut warnings = Vec::new();
    let cached = match state.store.lock().list_takes() {
        Ok((rows, skipped)) => {
            warnings.extend(skipped);
            rows
        }
        Err(e) => {
            warnings.push(format!(
                "The take index is unavailable. {e}. Showing the takes found on disk; delete index.sqlite to rebuild the cache."
            ));
            Vec::new()
        }
    };
    let (files, file_warnings) = originals::file_takes()?;
    warnings.extend(file_warnings);
    let file_ids: std::collections::BTreeSet<_> = files.iter().map(|t| t.id.clone()).collect();
    let mut takes: std::collections::BTreeMap<_, _> = std::collections::BTreeMap::new();
    {
        let store = state.store.lock();
        for t in cached {
            if file_ids.contains(&t.id) {
                takes.insert(t.id.clone(), t);
            } else if let Err(e) = store.delete_take(&t.id) {
                warnings.push(format!(
                    "Could not drop vanished take {} from the index. {e}.",
                    t.id
                ));
            }
        }
        for t in files {
            if !takes.contains_key(&t.id) {
                if let Err(e) = store.insert_take(&t) {
                    warnings.push(format!(
                        "Could not cache take {}. {e}. The take on disk is still listed.",
                        t.id
                    ));
                }
            }
            takes.insert(t.id.clone(), t);
        }
    }
    let mut list: Vec<_> = takes.into_values().collect();
    list.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok((list, warnings))
}

pub(crate) fn take_from<'a>(
    takes: &'a [jam_audio::recorder::TakeMetadata],
    take_id: &str,
) -> Result<&'a jam_audio::recorder::TakeMetadata, String> {
    originals::valid_id(take_id)?;
    takes
        .iter()
        .find(|t| t.id == take_id)
        .ok_or_else(|| format!("take {take_id} is not in the library"))
}

fn find_take(state: &AppState, take_id: &str) -> Result<jam_audio::recorder::TakeMetadata, String> {
    let (takes, _) = all_takes(state)?;
    Ok(take_from(&takes, take_id)?.clone())
}

/// Analyses the guitarist's recorded DI stem against the tempo the take was played at.
#[tauri::command]
async fn takes_analyze(
    take_id: String,
    state: State<'_, AppState>,
) -> Result<jam_audio::analysis::TakeAnalysis, String> {
    let mut take = find_take(&state, &take_id)?;
    let path = std::path::Path::new(&take.path_input);
    // Same ceiling as `read_clip`: a 10-minute 48 kHz mono 16-bit stem is ~55 MB.
    if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > 100_000_000 {
        return Err("Take is too large. Use a take shorter than ten minutes.".into());
    }
    let (samples, sample_rate) = jam_audio::recorder::read_wav_mono(path)?;
    let analyzer = jam_audio::analysis::TakeAnalyzer::new(sample_rate);
    let analysis = analyzer.analyze(&samples, take.tempo);
    let mut fields = serde_json::to_value(&analysis).map_err(|e| e.to_string())?;
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    fields["schemaVersion"] = serde_json::json!(1);
    fields["analyzerVersion"] = serde_json::json!(2);
    fields["analyzedAtMs"] = serde_json::json!(at);
    fields["sourceSampleRate"] = serde_json::json!(sample_rate);
    fields["sourceSampleCount"] = serde_json::json!(samples.len());
    fields["sourceTempo"] = serde_json::json!(take.tempo);
    let saved = take.extra.entry("analysis".into()).or_default();
    if !saved.is_object() {
        *saved = serde_json::json!({});
    }
    // Preserve future measurement fields while replacing the fields we own.
    saved
        .as_object_mut()
        .unwrap()
        .extend(fields.as_object().unwrap().clone());
    originals::save_take_manifest(&take).map_err(|e| {
        format!(
            "Cannot save the take analysis beside {}. {e}",
            take.path_input
        )
    })?;
    state.store.lock().insert_take(&take)?;
    Ok(analysis)
}

#[tauri::command]
fn takes_review(take_id: String, state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let mut take = find_take(&state, &take_id)?;
    if let Some(existing) = take.extra.get("review").filter(|v| v.is_object()) {
        persist_session_review(&take.session_id, existing)?;
        return Ok(existing.clone());
    }
    let analysis = take
        .extra
        .get("analysis")
        .filter(|v| v.is_object())
        .cloned()
        .ok_or("Analyze the take first. Review uses those numbers, never audio.")?;
    let review = net::review::recorded(&analysis)?;
    take.extra.insert("review".into(), review.clone());
    originals::save_take_manifest(&take).map_err(|e| {
        format!(
            "Cannot save the take review beside {}. {e}",
            take.path_input
        )
    })?;
    state.store.lock().insert_take(&take)?;
    persist_session_review(&take.session_id, &review)?;
    Ok(review)
}

fn persist_session_review(session_id: &str, review: &serde_json::Value) -> Result<(), String> {
    originals::valid_id(session_id)?;
    let dir = Library::default_user_root()
        .join("sessions")
        .join(session_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create the session folder. {e}"))?;
    let path = dir.join("session.json");
    let mut doc = if path.exists() {
        serde_json::from_slice::<serde_json::Value>(
            &std::fs::read(&path).map_err(|e| format!("Cannot read session.json. {e}"))?,
        )
        .map_err(|e| format!("session.json is not JSON. {e}"))?
    } else {
        serde_json::json!({"schemaVersion": 1, "id": session_id})
    };
    if !doc.is_object() {
        return Err("session.json must be an object.".into());
    }
    doc["review"] = review.clone();
    let bytes = serde_json::to_vec_pretty(&doc).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, &bytes).map_err(|e| format!("Cannot write {}. {e}", temp.display()))?;
    std::fs::OpenOptions::new()
        .write(true)
        .open(&temp)
        .and_then(|f| f.sync_all())
        .map_err(|e| format!("Cannot write {}. {e}", temp.display()))?;
    if path.exists() {
        std::fs::copy(&path, path.with_extension("json.bak"))
            .map_err(|e| format!("Cannot write session.json. {e}"))?;
    }
    std::fs::rename(&temp, &path).map_err(|e| format!("Cannot write session.json. {e}"))?;
    Ok(())
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
async fn takes_export_daw(
    take_id: String,
    state: State<'_, AppState>,
) -> Result<jam_audio::export::ExportReport, String> {
    let (takes, _) = all_takes(&state)?;
    let mut take = take_from(&takes, &take_id)?.clone();
    let export_path = Library::default_user_root().join("exports").join(&take.id);

    let chart: Option<Chart> = serde_json::from_value(take.snapshot["body"]["chart"].clone())
        .ok()
        .or_else(|| state.library.lock().chart(&take.chart_id).ok());
    let sections_owned = chart.as_ref().map(chart_sections).unwrap_or_default();
    let sections: Vec<(&str, u32)> = sections_owned
        .iter()
        .map(|(n, b)| (n.as_str(), *b))
        .collect();
    let time_sig = match take.snapshot.get("timeSignature").filter(|v| !v.is_null()) {
        Some(value) => serde_json::from_value::<(u8, u8)>(value.clone()).map_err(|_| {
            "Invalid recorded time signature. Repair the take snapshot before exporting."
                .to_string()
        })?,
        None => chart.as_ref().map(|c| c.time_sig).unwrap_or((4, 4)),
    };
    let sample_rate = if take.sample_rate > 0 {
        take.sample_rate
    } else {
        jam_audio::recorder::wav_sample_rate(std::path::Path::new(&take.path_master))?
    };

    // Old take manifests may need the rate recovered from the WAV.
    take.sample_rate = sample_rate;
    let reference = take.snapshot["reference"].is_object();
    let recorded_tempo_map = take
        .extra
        .get("referenceTiming")
        .map(|raw| {
            let timing: jam_audio::reference_timing::ReferenceTiming =
                serde_json::from_value(raw.clone())
                    .map_err(|e| format!("The reference timing is invalid. {e}"))?;
            let asset_id = take.snapshot["reference"]["asset_id"]
                .as_str()
                .ok_or("Reference timing has no recorded source identity.")?;
            if asset_id != take.chart_id {
                return Err("Reference timing source identity does not match the take.".into());
            }
            timing.tempo_map(asset_id, sample_rate, take.sample_count as u64)
        })
        .transpose()?;
    if recorded_tempo_map.is_some() && !take.midi.is_empty() {
        return Err("Reference timing cannot be combined with virtual-band MIDI. Repair the take metadata before exporting.".into());
    }
    let time_sig = recorded_tempo_map
        .as_ref()
        .map_or(time_sig, |map| map.time_sig);
    let performance_midi = if take.midi.is_empty() {
        None
    } else {
        Some(
            jam_audio::export::build_performance_midi(&take, time_sig)
                .map_err(|e| e.to_string())?,
        )
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
        reference,
        recorded_tempo_map: recorded_tempo_map.as_ref(),
        tempo: recorded_tempo_map
            .as_ref()
            .map_or(take.tempo, |map| map.tempos[0].bpm),
        time_sig,
        sample_rate,
        sections: if reference { &[] } else { &sections },
        stems: &stems,
        take_dir: Path::new(&take.path_input).parent(),
    };
    let mut report = jam_audio::export::DawExporter::export_take_bundle(&export_path, &job)
        .map_err(|e| e.to_string())?;
    if let Some(bytes) = performance_midi {
        std::fs::write(export_path.join("band-notes.mid"), bytes).map_err(|e| e.to_string())?;
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
            let clip = originals::read_clip(spec, &state, &takes)?;
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
    info["tempoSource"] = serde_json::json!(if recorded_tempo_map.is_some() {
        "recorded-reference"
    } else {
        "constant-take-tempo"
    });
    info["recordedTempoMap"] = serde_json::json!(recorded_tempo_map);
    if let Some(raw) = take.extra.get("referenceTiming") {
        info["referenceTiming"] = raw.clone();
    }
    info["stems"] = serde_json::json!(report.copied_stems);
    info["missingStems"] = serde_json::json!(report.missing_stems);
    info["reaperScript"] = serde_json::json!(report.reaper_script);
    info["howTo"] = serde_json::json!("Import the tempo map first. Put the individual guitar, drums, bass, comp and guitar-layer stems at bar 1. Band and master are reference mixes: mute them while mixing the individual stems. Import band-notes.mid on separate instrument tracks if wanted.");
    if reference {
        info["howTo"] = serde_json::json!("Import the tempo map first. Place Guitar DI and Band at time zero with original speed, and mute Master, Drums, Bass and Comp. All WAVs retain recorded timing. Sections follow source playback, including loops; partial bars and lead-ins mean DAW bar numbers can differ from source bars. Edge tempo outside the confirmed grid is extrapolated, not analysed.");
    }
    std::fs::write(
        info_path,
        serde_json::to_vec_pretty(&info).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(report)
}

#[tauri::command]
async fn export_logic<R: tauri::Runtime>(
    take_id: String,
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let report = takes_export_daw(take_id, state).await?;
    let body = serde_json::json!({
        "folder": report.dir,
        "dir": report.dir,
        "copiedStems": report.copied_stems,
        "missingStems": report.missing_stems,
        "midiFile": report.midi_file,
        "reaperScript": report.reaper_script,
    });
    let _ = app.emit("export:state", &body);
    Ok(body)
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
    rig.send_clock = settings.rig.send_clock;
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

/// Builds the whole application state the way the desktop app does: under
/// `JAM_HEADLESS=1` a headless engine, a memory secret store and an in-memory index;
/// the user's files under `JAM_USER_DIR` (or the home folder). The IPC tests build
/// this same state and drive the same commands through Tauri's mock runtime.
pub fn build_state() -> AppState {
    let (settings, recovery_notice) = settings::recover_settings().unwrap_or_else(|e| {
        tracing::error!("{e}");
        (AppSettings::default(), Some(e))
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
    let cost_log = Arc::new(net::CostLog::new(net::CostLog::default_path()));

    let (index_store, index_notice) = if is_test {
        (
            store::IndexStore::open_in_memory().expect("in-memory index"),
            None,
        )
    } else {
        store::IndexStore::open_cache()
    };
    let recovery_notice = match (recovery_notice, index_notice) {
        (Some(settings), Some(index)) => Some(format!("{settings} {index}")),
        (settings, index) => settings.or(index),
    };
    let store_arc = Arc::new(Mutex::new(index_store));

    let rig_orchestrator = Arc::new(Mutex::new(build_rig(&settings, &library_arc.lock())));

    AppState {
        voice: Arc::new(Mutex::new(voice::VoiceSession::default())),
        lyria: Arc::new(Mutex::new(lyria::Session::default())),
        recovery_notice: Mutex::new(recovery_notice),
        warnings: WarnOnce::default(),
        clips: Mutex::new(clips::ClipCache::new(clips::ClipCache::DEFAULT_BUDGET)),
        exit_confirmed: std::sync::atomic::AtomicBool::new(false),
        ui_ready: std::sync::atomic::AtomicBool::new(false),
        agents: agents::AgentRunner::default(),
        controller: Arc::new(Mutex::new(None)),
        secret_store,
        engine: Arc::clone(&engine_arc),
        library: Arc::clone(&library_arc),
        store: Arc::clone(&store_arc),
        rig: Arc::clone(&rig_orchestrator),
        cost_log,
    }
}

/// Registers the state, the 30 Hz telemetry emitter and every IPC command on a
/// builder. `run` uses it with the real runtime; `tests/ipc_e2e.rs` with
/// `tauri::test::mock_builder`, so a command that works there works in the app.
pub fn configure<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
    state: AppState,
) -> tauri::Builder<R> {
    builder
        .manage(state)
        .setup(move |app| {
            use tauri::Manager;
            for folder in ["assets", "exports"] {
                let path = media::root().join(folder);
                std::fs::create_dir_all(&path)?;
                app.asset_protocol_scope().allow_directory(path, true)?;
            }
            let state = app.state::<AppState>();
            let controller = Arc::clone(&state.controller);
            let eng = Arc::clone(&state.engine);
            let rig = Arc::clone(&state.rig);
            let app_handle = app.handle().clone();

            // High-rate telemetry at 30 Hz while the clock is moving; idle
            // repeats are skipped so a stopped desktop is not a 30 Hz IPC pump.
            std::thread::spawn(move || {
                let mut last_status: Option<EngineStatus> = None;
                let mut last_recording_error: Option<String> = None;
                let mut last_transport: Option<jam_audio::engine::TransportTelemetry> = None;
                let mut last_band: Option<jam_audio::engine::BandTelemetry> = None;
                let mut last_out: Option<jam_audio::engine::MeterTelemetry> = None;
                let mut last_in: Option<jam_audio::engine::MeterTelemetry> = None;
                let mut last_had_reference = false;
                let mut last_tuner_active = false;
                let mut last_busy = false;
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(if last_busy {
                        33
                    } else {
                        250
                    }));
                    let (tel, status, recording_error) = {
                        let eng = eng.lock();
                        eng.poll_stream_errors();
                        (eng.get_telemetry(), eng.status(), eng.recorder_error())
                    };
                    if recording_error != last_recording_error {
                        let _ = app_handle.emit("recorder:error", &recording_error);
                        if let Some(error) = &recording_error {
                            let _ = app_handle.emit("app:error", error);
                        }
                        last_recording_error = recording_error;
                    }
                    // Section-bound rig scenes: the orchestrator de-duplicates, so
                    // calling it every tick is cheap and only sends on a change.
                    if tel.transport.state == "playing" {
                        let now = beats_to_samples(
                            tel.transport.position_beats,
                            tel.transport.bpm,
                            tel.status.sample_rate,
                        );
                        let mut rig = rig.lock();
                        let was_live = rig.is_live();
                        if let Err(e) = rig.on_transport_tick(now, tel.transport.bpm) {
                            let _ = app_handle.emit("rig:error", &e);
                        }
                        if was_live && !rig.is_live() {
                            let _ = app_handle.emit("rig:state", &rig_state_dto(&rig));
                        }
                    }
                    if tel.reference.is_none()
                        && tel.transport.state == "playing"
                        && !tel.band.current_section.is_empty()
                    {
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
                    let clock_busy =
                        matches!(tel.transport.state.as_str(), "playing" | "counting_in")
                            || tel.reference.as_ref().is_some_and(|r| r.state == "playing");
                    if clock_busy || last_out.as_ref() != Some(&tel.output_level) {
                        let _ = app_handle.emit("meters", &tel.output_level);
                        last_out = Some(tel.output_level.clone());
                    }
                    if let Some(input) = controller.lock().as_ref() {
                        for press in input.drain() {
                            if !rig.lock().is_recent_echo(&press) {
                                let _ = app_handle.emit("controller:press", press);
                            }
                        }
                    }
                    if clock_busy || last_in.as_ref() != Some(&tel.input_level) {
                        let _ = app_handle.emit("input:meters", &tel.input_level);
                        last_in = Some(tel.input_level.clone());
                    }
                    let has_ref = tel.reference.is_some();
                    if clock_busy || last_had_reference != has_ref {
                        let _ = app_handle.emit("reference:state", &tel.reference);
                        last_had_reference = has_ref;
                    }
                    if clock_busy || last_transport.as_ref() != Some(&tel.transport) {
                        let _ = app_handle.emit("transport:state", &tel.transport);
                        last_transport = Some(tel.transport.clone());
                    }
                    let band = tel.band.clone().for_emit(clock_busy);
                    if clock_busy || last_band.as_ref() != Some(&band) {
                        let _ = app_handle.emit("band:state", &band);
                        last_band = Some(band);
                    }
                    let tuner_active = tel.tuner.is_some();
                    if let Some(t) = &tel.tuner {
                        let _ = app_handle.emit("tuner:state", t);
                    } else if last_tuner_active {
                        let _ = app_handle.emit("tuner:state", serde_json::Value::Null);
                    }
                    last_tuner_active = tuner_active;
                    if last_status.as_ref() != Some(&status) {
                        let _ = app_handle.emit("engine:status", &status);
                        last_status = Some(status);
                    }
                    last_busy = clock_busy;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            voice::voice_ptt,
            voice::voice_speak,
            voice::voice_cancel,
            voice::voice_status,
            voice::voice_shortcut,
            voice::voice_live_latency,
            lyria::lyria_start,
            lyria::lyria_set,
            lyria::lyria_stop,
            lyria::lyria_status,
            aliases::lyria_vibe,
            aliases::transport_locate,
            aliases::mixer_set_bus,
            export_logic,
            aliases::generate_track,
            assets::assets_status,
            assets::assets_ensure,
            logs_export,
            diagnostics_idle_cpu,
            diagnostics_sample_stage,
            diagnostics_report_fps,
            app_version,
            media::media_list,
            media::media_save,
            media::media_import,
            platform::song_dialog::song_pick_file,
            media::songs::media_store_song,
            media::media_stretch,
            media::media_reference_load,
            media::stems::media_stems_import,
            media::stems::media_separate_stems,
            media::stems::media_reference_mix,
            media::media_analyze,
            media::analysis_start,
            media::analysis_cancel,
            media::media_guitar_residual,
            media::media_reference_unload,
            media::media_reference_seek,
            media::media_reference_loop,
            media::media_reference_processing,
            media::media_reference_ramp,
            media::grid::media_reference_grid_save,
            media::grid::media_reference_loop_section,
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
            app_exit,
            open_url,
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
            originals::clip_audition_stop,
            originals::capture_keep,
            originals::takes_favourite,
            keys_set,
            keys_has,
            keys_delete,
            keys_test,
            provider_fetch,
            providers_list,
            cost_log_list,
            cost_log_totals,
            settings_get,
            settings_recovery_notice,
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
            band_render_offline,
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
            audio_calibrate_latency,
            takes_list,
            takes_delete,
            takes_reindex,
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
            rig_panic,
            rig_set_clock,
            rig_dry_run,
            rig_virtual_check,
            takes_analyze,
            takes_review,
            originals::takes_melody,
            takes_export_daw,
        ])
}

/// `JAM_SMOKE_SECONDS=n`: exit after n seconds with 0 when the frontend completed
/// its startup handshake (`engine_status` was invoked), 2 otherwise. CI runs the
/// real binary this way on Windows and macOS; nothing else changes.
/// Exit code chosen by a smoke run, -1 when none is active. The wry runtime turns
/// `AppHandle::exit(code)` into a plain exit and drops the code, so the run loop
/// applies it on `RunEvent::Exit`, after the app's own shutdown.
static SMOKE_EXIT_CODE: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(-1);

fn smoke_exit(app: tauri::AppHandle) {
    let Some(seconds) = std::env::var("JAM_SMOKE_SECONDS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
    else {
        return;
    };
    std::thread::spawn(move || {
        use tauri::{Emitter, Manager};
        let start = Instant::now();
        let budget = Duration::from_secs(seconds);
        while !app
            .state::<AppState>()
            .ui_ready
            .load(std::sync::atomic::Ordering::SeqCst)
            && start.elapsed() < budget
        {
            std::thread::sleep(Duration::from_millis(50));
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_always_on_top(true);
            let _ = window.set_focus();
        }
        let _ = app.emit("app:open-stage", ());
        std::thread::sleep(Duration::from_millis(750));
        // rAF only counts while the clock is live; Space cannot steal focus here.
        let _ = append_user_log("smoke: transport_play");
        app.state::<AppState>().engine.lock().transport_play();
        for _ in 0..3 {
            let _ = app.emit("app:open-stage", ());
            std::thread::sleep(Duration::from_millis(750));
        }
        if start.elapsed() < budget {
            std::thread::sleep(budget.saturating_sub(start.elapsed()));
        }
        let state = app.state::<AppState>();
        let ready = state.ui_ready.load(std::sync::atomic::Ordering::SeqCst);
        eprintln!(
            "smoke: frontend handshake {} after {seconds} s",
            if ready { "completed" } else { "MISSING" }
        );
        state
            .exit_confirmed
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let code = if ready { 0 } else { 2 };
        SMOKE_EXIT_CODE.store(code, std::sync::atomic::Ordering::SeqCst);
        app.exit(code);
    });
}

/// `~/JosefinesJamstudio/logs` (or `$JAM_USER_DIR/logs`).
pub fn logs_dir() -> PathBuf {
    Library::default_user_root().join("logs")
}

/// Append one line to `jamstudio.log`. Loud if the home folder cannot be created
/// or written; the log plugin only records `log` crate events and a quiet start
/// otherwise leaves a stale empty file.
pub fn append_user_log(line: &str) -> Result<PathBuf, String> {
    let dir = logs_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Logs could not be created at {}. {e}", dir.display()))?;
    let path = dir.join("jamstudio.log");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Logs could not be opened at {}. {e}", path.display()))?;
    use std::io::Write;
    writeln!(file, "{line}")
        .map_err(|e| format!("Logs could not be written to {}. {e}", path.display()))?;
    Ok(path)
}

pub const LOGS_NOT_CONFIGURED: &str = "Log export is not configured. Run the desktop app once so logs write to ~/JosefinesJamstudio/logs/, then retry.";

#[tauri::command]
fn diagnostics_idle_cpu() -> platform::cpu::IdleCpuSample {
    platform::cpu::sample(Duration::from_millis(1000))
}

#[tauri::command]
fn diagnostics_sample_stage() -> bool {
    std::env::var("JAM_SMOKE_SECONDS").is_ok()
}

#[tauri::command]
fn diagnostics_report_fps(meter: f32, playhead: f32) -> Result<String, String> {
    let line = format!("canvas fps meter={meter:.1} playhead={playhead:.1}");
    let path = append_user_log(&line)?;
    Ok(format!("{line} ({})", path.display()))
}

#[tauri::command]
fn logs_export() -> Result<String, String> {
    let dir = logs_dir();
    if !dir.exists() {
        return Err(LOGS_NOT_CONFIGURED.into());
    }
    Ok(dir.display().to_string())
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").into()
}

fn jam_log_level_from(raw: Option<&str>) -> tauri_plugin_log::log::LevelFilter {
    use tauri_plugin_log::log::LevelFilter;
    match raw.map(|s| s.to_ascii_lowercase()).as_deref() {
        Some("trace") => LevelFilter::Trace,
        Some("debug") => LevelFilter::Debug,
        Some("warn") | Some("warning") => LevelFilter::Warn,
        Some("error") => LevelFilter::Error,
        Some("off") => LevelFilter::Off,
        _ => LevelFilter::Info,
    }
}

fn jam_log_level() -> tauri_plugin_log::log::LevelFilter {
    jam_log_level_from(std::env::var("JAM_LOG").ok().as_deref())
}

/// File + stderr logger for the desktop app. IPC tests omit this so they do
/// not install a process-wide logger.
pub fn jam_log_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
    tauri_plugin_log::Builder::new()
        .level(jam_log_level())
        .max_file_size(1_000_000)
        .rotation_strategy(RotationStrategy::KeepAll)
        .targets([
            Target::new(TargetKind::Stderr),
            Target::new(TargetKind::Folder {
                path: logs_dir(),
                file_name: Some("jamstudio".into()),
            }),
        ])
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let built = configure(
        tauri::Builder::default()
            .plugin(jam_log_plugin())
            .plugin(tauri_plugin_dialog::init())
            .plugin(platform::voice_shortcut::plugin()),
        build_state(),
    )
    .build(tauri::generate_context!())
    .expect("error while building tauri application");
    if let Err(e) = append_user_log(&format!(
        "Josefines Jamstudio {} starting",
        env!("CARGO_PKG_VERSION")
    )) {
        use tauri::Manager;
        *built.state::<AppState>().recovery_notice.lock() = Some(e);
    }
    smoke_exit(built.handle().clone());
    built.run(|app, event| {
        use tauri::Manager;
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(state) = app.try_state::<AppState>() {
                finalize_on_exit(&state);
            }
            let code = SMOKE_EXIT_CODE.load(std::sync::atomic::Ordering::SeqCst);
            if code >= 0 {
                std::process::exit(code);
            }
        }
        // An app-level quit (Cmd+Q on macOS) never went through the window's
        // close guard (#35). After the UI handshake, hand the decision to React;
        // it answers with app_exit. Before handshake, or after the last window
        // closed, or when app_exit itself requested the quit (code Some), leave.
        if let tauri::RunEvent::ExitRequested {
            code: None, api, ..
        } = &event
        {
            let state = app.state::<AppState>();
            let window_open = app
                .webview_windows()
                .values()
                .any(|w| w.is_visible().unwrap_or(true));
            if should_defer_quit(
                state.ui_ready.load(std::sync::atomic::Ordering::SeqCst),
                state
                    .exit_confirmed
                    .load(std::sync::atomic::Ordering::SeqCst),
                window_open,
            ) {
                api.prevent_exit();
                let _ = app.emit("app:exit-requested", ());
            }
        }
    });
}

#[cfg(test)]
mod chart_timing {
    use jam_audio::devices::AudioConfig;
    use jam_audio::engine::AudioEngine;
    use jam_core::chart::Chart;

    fn chart(bpm: f64, time_sig: (u8, u8)) -> Chart {
        Chart {
            schema_version: 1,
            id: "timing".into(),
            name: "Timing".into(),
            key_tonic: 0,
            mode: "major".into(),
            time_sig,
            default_bpm: bpm,
            default_style_id: None,
            sections: vec![],
            arrangement: vec![],
            extra: std::collections::HashMap::new(),
        }
    }

    #[test]
    fn inline_play_adopts_the_chart_default_tempo() {
        let eng = AudioEngine::new(AudioConfig::default());
        eng.transport_set_tempo(90.0);
        super::apply_chart_timing(&eng, &chart(140.0, (4, 4)));
        assert!((eng.transport_bpm() - 140.0).abs() < f64::EPSILON);
        super::apply_chart_timing(&eng, &chart(0.0, (4, 4)));
        assert!((eng.transport_bpm() - 140.0).abs() < f64::EPSILON);
    }
}

#[cfg(test)]
mod warnings {
    #[test]
    fn a_damaged_file_is_reported_once_per_session() {
        let once = super::WarnOnce::default();
        let first = once.fresh(vec![
            "Cannot read a.json".into(),
            "Cannot read b.json".into(),
        ]);
        assert_eq!(first.len(), 2);
        assert!(once.fresh(vec!["Cannot read a.json".into()]).is_empty());
        assert_eq!(
            once.fresh(vec![
                "Cannot read b.json".into(),
                "Cannot read c.json".into()
            ]),
            vec!["Cannot read c.json".to_string()]
        );
    }
}

#[cfg(test)]
mod desktop_permissions {
    /// Closing and quitting go through the `app_exit` command after the UI's guard,
    /// so the WebView holds no window-destroy permission at all.
    #[test]
    fn generated_acl_grants_local_main_subscriptions_only() {
        let acl: serde_json::Value =
            serde_json::from_str(include_str!("../gen/schemas/capabilities.json")).unwrap();
        let cap = &acl["default"];
        assert_eq!(cap["windows"], serde_json::json!(["main"]));
        assert_eq!(cap["local"], true);
        assert!(cap.get("remote").is_none());
        assert_eq!(
            cap["permissions"],
            serde_json::json!(["core:event:allow-listen", "core:event:allow-unlisten"])
        );
    }
}

#[cfg(test)]
mod quit {
    #[test]
    fn quit_is_deferred_only_after_the_ui_handshake() {
        assert!(!super::should_defer_quit(false, false, true));
        assert!(super::should_defer_quit(true, false, true));
        assert!(!super::should_defer_quit(true, true, true));
        assert!(!super::should_defer_quit(true, false, false));
    }

    #[test]
    fn app_level_quit_is_forwarded_to_the_ui_close_guard() {
        let src = include_str!("lib.rs");
        assert!(src.contains("RunEvent::ExitRequested"));
        assert!(src.contains("app:exit-requested"));
        assert!(src.contains("prevent_exit"));
        assert!(src.contains("should_defer_quit"));
    }
}

#[cfg(test)]
mod jam_log {
    use super::jam_log_level_from;
    use tauri_plugin_log::log::LevelFilter;

    #[test]
    fn jam_log_defaults_to_info_and_honours_debug() {
        assert_eq!(jam_log_level_from(None), LevelFilter::Info);
        assert_eq!(jam_log_level_from(Some("")), LevelFilter::Info);
        assert_eq!(jam_log_level_from(Some("nope")), LevelFilter::Info);
        assert_eq!(jam_log_level_from(Some("debug")), LevelFilter::Debug);
        assert_eq!(jam_log_level_from(Some("DEBUG")), LevelFilter::Debug);
        assert_eq!(jam_log_level_from(Some("info")), LevelFilter::Info);
        assert_eq!(jam_log_level_from(Some("warn")), LevelFilter::Warn);
        assert_eq!(jam_log_level_from(Some("error")), LevelFilter::Error);
    }
}

#[cfg(test)]
mod home_logs {
    #[test]
    fn export_names_the_real_home_logs_folder_when_present() {
        std::env::remove_var("JAM_USER_DIR");
        let dir = super::logs_dir();
        assert!(
            dir.ends_with("JosefinesJamstudio") || dir.ends_with("logs"),
            "{}",
            dir.display()
        );
        if dir.is_dir() {
            assert_eq!(super::logs_export().unwrap(), dir.display().to_string());
        }
    }

    #[test]
    fn append_user_log_writes_a_line() {
        let root = std::env::temp_dir().join(format!("jam-home-log-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        std::env::set_var("JAM_USER_DIR", &root);
        let path = super::append_user_log("canary-log-line").unwrap();
        assert_eq!(path, root.join("logs").join("jamstudio.log"));
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("canary-log-line"), "{text}");
        std::env::remove_var("JAM_USER_DIR");
        let _ = std::fs::remove_dir_all(&root);
    }
}
