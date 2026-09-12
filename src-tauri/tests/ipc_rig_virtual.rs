//! Virtual MIDI monitor is not configured without a loopMIDI/IAC port.
mod common;
use common::Studio;
use serde_json::json;

#[test]
fn virtual_midi_is_not_configured_without_a_port() {
    let _scenario = common::scenario();
    std::env::remove_var("JAM_MIDI_FIXTURE");
    std::env::remove_var("JAM_MIDI_VIRTUAL");
    let studio = Studio::boot();
    let gate = studio.err("rig_virtual_check", json!({}));
    assert!(
        gate.contains("not configured") && gate.contains("loopMIDI"),
        "{gate}"
    );
    assert!(!gate.contains("HeadRush owner"));
}

#[test]
fn memory_sink_fixture_shows_the_expected_monitor_bytes() {
    let _scenario = common::scenario();
    std::env::set_var("JAM_MIDI_FIXTURE", "1");
    let studio = Studio::boot();
    let check = studio.ok("rig_virtual_check", json!({}));
    assert_eq!(check["live"], false);
    assert_eq!(check["expected"], check["monitor"]);
    assert_eq!(check["expected"].as_array().unwrap().len(), 2);
    std::env::remove_var("JAM_MIDI_FIXTURE");
}
