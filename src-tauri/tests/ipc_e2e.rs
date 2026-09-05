//! Startup handshake of the desktop app through the IPC layer. The scenario tests
//! per area live next to this file; `common` holds the harness.
mod common;

use common::Studio;
use serde_json::{json, Value};

#[test]
fn boots_headless_and_answers_the_startup_handshake() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let status = studio.ok("engine_status", json!({}));
    assert_eq!(status["mode"], "Headless");
    assert_eq!(status["sample_rate"], 48000);
    let settings = studio.ok("settings_get", json!({}));
    assert_eq!(settings["schemaVersion"], 1);
    assert_eq!(
        studio.ok("settings_recovery_notice", json!({})),
        Value::Null
    );
    let charts = studio.ok("band_list_charts", json!({}));
    assert!(charts.as_array().is_some_and(|c| c.len() >= 8));
    assert!(studio
        .err("band_load_chart", json!({"chartId": "no-such-chart"}))
        .contains("no-such-chart"));
}

#[test]
fn the_handshake_marks_the_ui_ready_for_smoke_runs() {
    let _scenario = common::scenario();
    use tauri::Manager;
    let studio = Studio::boot();
    let state = studio.app().state::<app_lib::AppState>();
    assert!(!state.ui_ready.load(std::sync::atomic::Ordering::SeqCst));
    studio.ok("engine_status", json!({}));
    assert!(state.ui_ready.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn several_studios_can_boot_in_one_process() {
    let _scenario = common::scenario();
    let first = Studio::boot();
    let second = Studio::boot();
    assert_eq!(first.ok("engine_status", json!({}))["mode"], "Headless");
    assert_eq!(second.ok("engine_status", json!({}))["mode"], "Headless");
}
