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
