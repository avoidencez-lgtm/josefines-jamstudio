//! Lyria stays not configured without a recorded session and never drives the clock.
mod common;
use common::Studio;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri::{Listener, Manager};

#[test]
fn lyria_start_is_not_configured_without_a_recorded_session() {
    let _scenario = common::scenario();
    std::env::remove_var("JAM_LYRIA_FIXTURE");
    let studio = Studio::boot();
    let idle = studio.ok("lyria_status", json!({}));
    assert_eq!(idle["phase"], "idle");
    assert_eq!(idle["live"], false);
    assert_eq!(idle["drivesClock"], false);
    studio.ok(
        "keys_set",
        json!({"provider": "gemini", "key": "fixture-only-not-a-real-key"}),
    );
    let gate = studio.err("lyria_start", json!({}));
    assert!(
        gate.contains("not configured") && gate.contains("JAM_LIVE=1"),
        "{gate}"
    );
    let refused = studio.err(
        "lyria_set",
        json!({"patch":{"prompts":[{"text":"x","weight":1.0}],"bpm":100.0,"scale":"G_MAJOR_E_MINOR"}}),
    );
    assert!(refused.contains("Start Lyria"), "{refused}");
    assert_eq!(studio.ok("lyria_stop", json!({}))["phase"], "idle");
    assert_eq!(std::env::var_os("JAM_LIVE"), None);
}

#[test]
fn recorded_protocol_fixture_is_exclusive_and_does_not_drive_the_clock() {
    let _scenario = common::scenario();
    std::env::set_var("JAM_LYRIA_FIXTURE", "1");
    let studio = Studio::boot();
    let started = studio.ok("lyria_start", json!({}));
    assert_eq!(started["phase"], "playing");
    assert_eq!(started["live"], false);
    assert_eq!(started["drivesClock"], false);
    assert_eq!(started["buffering"], true);
    assert_eq!(started["requestedBpm"], 100.0);
    let state = studio.app().state::<app_lib::AppState>();
    let audio = state.engine.lock().lyria_status();
    assert!(audio.active);
    assert!(audio.buffering);
    assert!(audio.queued_frames > 0);
    let patched = studio.ok(
        "lyria_set",
        json!({"patch":{
            "prompts":[{"text":"Original instrumental funk rhythm section, space for lead guitar","weight":1.0}],
            "bpm":110.0,
            "scale":"G_MAJOR_E_MINOR",
            "density":0.5,
            "brightness":0.5,
            "muteBass":false,
            "muteDrums":false
        }}),
    );
    assert_eq!(patched["requestedBpm"], 110.0);
    assert_eq!(patched["drivesClock"], false);
    assert_eq!(patched["phase"], "counting-in");
    let seen: Arc<Mutex<Vec<Value>>> = Arc::default();
    let sink = Arc::clone(&seen);
    studio.app().listen_any("lyria:state", move |event| {
        sink.lock()
            .unwrap()
            .push(serde_json::from_str(event.payload()).unwrap());
    });
    studio.ok("transport_play", json!({}));
    let after_band = studio.ok("lyria_status", json!({}));
    assert_eq!(after_band["phase"], "idle");
    assert_eq!(after_band["drivesClock"], false);
    let events = seen.lock().unwrap();
    assert!(
        events.iter().any(|status| status["phase"] == "idle"),
        "transport_play must emit lyria:state idle, got {events:?}"
    );
    drop(events);
    studio.ok("transport_stop", json!({}));
    let again = studio.ok("lyria_start", json!({}));
    assert_eq!(again["phase"], "playing");
    studio.ok("lyria_stop", json!({}));
    assert_eq!(studio.ok("lyria_status", json!({}))["phase"], "idle");
    assert_eq!(
        state.engine.lock().lyria_status(),
        jam_audio::lyria::LyriaBusStatus::default()
    );
    std::env::remove_var("JAM_LYRIA_FIXTURE");
}

#[test]
fn originals_load_and_record_stop_lyria() {
    let _scenario = common::scenario();
    std::env::set_var("JAM_LYRIA_FIXTURE", "1");
    let studio = Studio::boot();
    assert_eq!(studio.ok("lyria_start", json!({}))["phase"], "playing");
    let mut doc: Value =
        serde_json::from_str(include_str!("../../tests/fixtures/seams/original.json"))
            .expect("fixture parses");
    doc["id"] = json!(common::unique("song"));
    studio.ok("originals_load", json!({ "document": doc }));
    assert_eq!(studio.ok("lyria_status", json!({}))["phase"], "idle");
    assert_eq!(studio.ok("lyria_start", json!({}))["phase"], "playing");
    studio.ok(
        "originals_record",
        json!({ "sessionId": common::unique("session") }),
    );
    assert_eq!(studio.ok("lyria_status", json!({}))["phase"], "idle");
    std::env::remove_var("JAM_LYRIA_FIXTURE");
}

fn lyria_spend_from_log(studio: &Studio) -> f64 {
    studio
        .ok("cost_log_list", json!({"limit": 1_000_000}))
        .as_array()
        .unwrap()
        .iter()
        .filter(|entry| entry["path"] == app_lib::net::lyria::USAGE_PATH)
        .filter_map(|entry| entry["estimatedCostUsd"].as_f64())
        .sum()
}

#[test]
fn spend_meter_matches_the_logged_lyria_cost_entries() {
    let _scenario = common::scenario();
    std::env::set_var("JAM_LYRIA_FIXTURE", "1");
    let studio = Studio::boot();
    let started = studio.ok("lyria_start", json!({}));
    let from_log = lyria_spend_from_log(&studio);
    assert!(
        from_log > 0.0 && started["spend"] == from_log,
        "start spend {} must equal CostLog sum {from_log}",
        started["spend"]
    );

    studio
        .app()
        .state::<app_lib::AppState>()
        .cost_log
        .append(&app_lib::net::CostEntry {
            at_ms: 4_000_000_000_000,
            provider: "gemini".into(),
            method: "WEBSOCKET".into(),
            path: app_lib::net::lyria::USAGE_PATH.into(),
            status: 101,
            estimated_cost_usd: Some(1.25),
            ..app_lib::net::CostEntry::default()
        })
        .unwrap();
    let after_append = lyria_spend_from_log(&studio);
    assert_eq!(studio.ok("lyria_status", json!({}))["spend"], after_append);
    assert!(after_append > from_log);
    studio.ok("lyria_stop", json!({}));
    std::env::remove_var("JAM_LYRIA_FIXTURE");
}

#[test]
fn session_cap_stops_the_fixture_session_when_elapsed_time_is_injected() {
    let _scenario = common::scenario();
    std::env::set_var("JAM_LYRIA_FIXTURE", "1");
    let studio = Studio::boot();
    let mut settings = studio.ok("settings_get", json!({}));
    settings["lyria"] = json!({"sessionMinutes": 0});
    studio.ok("settings_set", json!({ "settings": settings }));
    let tiny = studio.err("lyria_start", json!({}));
    assert!(
        tiny.contains("minute cap") && tiny.contains("Start a new session"),
        "{tiny}"
    );
    assert_eq!(studio.ok("lyria_status", json!({}))["phase"], "idle");
    settings["lyria"] = json!({"sessionMinutes": 10});
    studio.ok("settings_set", json!({ "settings": settings }));
    let stopped = studio.err("lyria_start", json!({ "elapsedMs": 10 * 60 * 1000 }));
    assert!(
        stopped.contains("minute cap") && stopped.contains("Start a new session"),
        "{stopped}"
    );
    assert_eq!(studio.ok("lyria_status", json!({}))["phase"], "idle");
    std::env::remove_var("JAM_LYRIA_FIXTURE");
}

#[test]
fn monthly_cap_refuses_without_confirm_and_proceeds_with_confirm() {
    let _scenario = common::scenario();
    std::env::set_var("JAM_LYRIA_FIXTURE", "1");
    let studio = Studio::boot();
    let mut settings = studio.ok("settings_get", json!({}));
    settings["lyria"] = json!({"sessionMinutes": 10, "monthlyUsd": 0.0});
    studio.ok("settings_set", json!({ "settings": settings }));
    let refused = studio.err("lyria_start", json!({}));
    assert_eq!(refused, app_lib::net::lyria::MONTHLY_CAP_REFUSED);
    assert_eq!(studio.ok("lyria_status", json!({}))["phase"], "idle");
    let started = studio.ok("lyria_start", json!({ "confirm": true }));
    assert_eq!(started["phase"], "playing");
    assert_eq!(started["drivesClock"], false);
    studio.ok("lyria_stop", json!({}));
    std::env::remove_var("JAM_LYRIA_FIXTURE");
}
