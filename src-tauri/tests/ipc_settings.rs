//! Settings and audio configuration through the IPC layer: the settings file under
//! the user folder (defaults, round trip, backup and startup recovery, unknown keys,
//! refused payloads), the device configuration applied to the headless engine
//! (what changes, what is floored, what is refused), device listing, engine status
//! and restart, and the mixer knobs (band, click, monitor, tone, tuner, metronome)
//! observed through the telemetry the render thread publishes.
//!
//! Every test boots on a fresh settings file under one process-wide lock: the file
//! is shared by the whole process, the engines are not.
mod common;

use common::{unique, user_dir, Studio};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant};

fn settings_path() -> PathBuf {
    user_dir().join("settings.json")
}

fn backup_path() -> PathBuf {
    user_dir().join("settings.json.bak")
}

fn default_settings() -> Value {
    json!({
        "schemaVersion": 1,
        "input_device": null,
        "output_device": null,
        "input_channel": 2,
        "sample_rate": 48000,
        "buffer_size": 256,
        "rig": {
            "profile_id": null,
            "midi_port": null,
            "follow_sections": true,
            "section_mappings": {}
        },
        "recorder": { "latency_samples": 0 }
    })
}

fn default_config() -> Value {
    json!({
        "input_device": null,
        "output_device": null,
        "input_channel": 2,
        "sample_rate": 48000,
        "buffer_size": 256
    })
}

fn read_json(path: &PathBuf) -> Value {
    let text = fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{} is not JSON: {e}", path.display()))
}

/// Polls the condition every few milliseconds for at most three seconds.
fn wait_until(what: &str, mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(3);
    while !condition() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        std::thread::sleep(Duration::from_millis(3));
    }
}

fn telemetry(studio: &Studio) -> Value {
    studio.ok("audio_get_telemetry", json!({}))
}

fn output_peak_db(studio: &Studio) -> f64 {
    telemetry(studio)["output_level"]["peak_db"]
        .as_f64()
        .expect("output peak")
}

/// The loudest output block seen while polling for the given window.
fn loudest_output_db(studio: &Studio, window: Duration) -> f64 {
    let end = Instant::now() + window;
    let mut loudest = f64::NEG_INFINITY;
    while Instant::now() < end {
        loudest = loudest.max(output_peak_db(studio));
        std::thread::sleep(Duration::from_millis(3));
    }
    loudest
}

fn transport_state(studio: &Studio) -> String {
    telemetry(studio)["transport"]["state"]
        .as_str()
        .expect("transport state")
        .to_string()
}

fn transport_bpm(studio: &Studio) -> f64 {
    telemetry(studio)["transport"]["bpm"].as_f64().expect("bpm")
}

// ---------------------------------------------------------------------------
// settings file
// ---------------------------------------------------------------------------

#[test]
fn loopback_estimate_preserves_offsets_and_device_profiles_restore_after_switching() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("recorder_set_latency", json!({"samples": 1234}));
    let before = fs::read(settings_path()).unwrap();
    let result = studio.ok("audio_calibrate_latency", json!({}));
    assert_eq!(result["estimated"], true);
    assert_eq!(result["confidence"].as_f64(), Some(0.0));
    assert_eq!(result["roundTripFrames"], 512);
    assert!(result["reason"].as_str().unwrap().contains("No hardware"));
    assert_eq!(fs::read(settings_path()).unwrap(), before);
    assert_eq!(studio.ok("recorder_get_latency", json!({})), 1234);

    let mut config = default_config();
    config["buffer_size"] = json!(512);
    studio.ok("audio_set_config", json!({"config": config}));
    assert_eq!(studio.ok("recorder_get_latency", json!({})), 0);
    studio.ok("recorder_set_latency", json!({"samples": 2000}));
    studio.ok("audio_set_config", json!({"config": default_config()}));
    assert_eq!(studio.ok("recorder_get_latency", json!({})), 1234);
    studio.ok("engine_restart", json!({}));
    assert_eq!(studio.ok("recorder_get_latency", json!({})), 1234);
    let mut saved = studio.ok("settings_get", json!({}));
    saved["recorder"]["future"] = json!(true);
    let profiles = saved["recorder"]["latency_profiles"]
        .as_object_mut()
        .unwrap();
    assert_eq!(profiles.len(), 2);
    for profile in profiles.values_mut() {
        profile["futureMeasurement"] = json!("kept");
    }
    studio.ok("settings_set", json!({"settings": saved}));
    studio.ok("recorder_set_latency", json!({"samples": 900}));
    let saved = studio.ok("settings_get", json!({}));
    assert_eq!(saved["recorder"]["future"], true);
    assert!(saved["recorder"]["latency_profiles"]
        .as_object()
        .unwrap()
        .values()
        .all(|p| p["futureMeasurement"] == "kept"));
    studio.ok("transport_play", json!({}));
    assert!(studio
        .err("audio_calibrate_latency", json!({}))
        .contains("Stop playback"));
    studio.ok("transport_stop", json!({}));
    studio.ok(
        "recorder_start",
        json!({"sessionId": unique("calibration-refusal")}),
    );
    assert!(studio
        .err("audio_calibrate_latency", json!({}))
        .contains("save the recording"));
    assert!(studio
        .err("recorder_set_latency", json!({"samples": 2}))
        .contains("Save the recording"));
    studio.ok("recorder_stop", json!({}));
    assert_eq!(studio.ok("recorder_get_latency", json!({})), 900);
    studio.ok("audio_set_input_monitor", json!({"gain": 0.5}));
    assert!(studio
        .err("audio_calibrate_latency", json!({}))
        .contains("Turn off input monitoring"));
    studio.ok("audio_set_input_monitor", json!({"gain": 0.0}));
}

#[test]
fn a_clean_install_reports_default_settings_and_no_recovery_notice() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    assert!(
        !settings_path().exists(),
        "reading defaults must not create the file"
    );
    assert_eq!(studio.ok("settings_get", json!({})), default_settings());
    assert_eq!(
        studio.ok("settings_recovery_notice", json!({})),
        Value::Null
    );
    assert_eq!(studio.ok("audio_get_config", json!({})), default_config());
    assert_eq!(studio.ok("recorder_get_latency", json!({})), 0);
    let status = studio.ok("engine_status", json!({}));
    assert_eq!(status["mode"], "Headless");
    assert_eq!(status["sample_rate"], 48000);
    assert_eq!(status["buffer_size"], 256);
    assert!(!settings_path().exists(), "settings_get does not write");
}

#[test]
fn settings_set_round_trips_through_the_file_and_keeps_the_previous_version_as_backup() {
    let _scenario = common::scenario();
    let studio = Studio::boot();

    let mut first = default_settings();
    first["buffer_size"] = json!(512);
    studio.ok("settings_set", json!({ "settings": first }));
    assert_eq!(read_json(&settings_path()), first);
    assert!(
        !backup_path().exists(),
        "the first save has nothing to back up"
    );
    assert_eq!(studio.ok("settings_get", json!({})), first);

    let second = json!({
        "schemaVersion": 1,
        "input_device": "Scarlett 2i2",
        "output_device": null,
        "input_channel": 1,
        "sample_rate": 44100,
        "buffer_size": 1024,
        "rig": {
            "profile_id": "hx-stomp",
            "midi_port": "HX Stomp MIDI 1",
            "follow_sections": false,
            "section_mappings": { "hx-stomp": { "Chorus": 2, "Verse": 0 } }
        },
        "recorder": { "latency_samples": 96 },
        "futureField": { "keep": true },
        "themeName": "dusk"
    });
    studio.ok("settings_set", json!({ "settings": second }));
    assert_eq!(studio.ok("settings_get", json!({})), second);
    assert_eq!(read_json(&settings_path()), second);
    assert_eq!(
        read_json(&backup_path()),
        first,
        "the backup is the previous version"
    );
    assert!(
        !user_dir().join("settings.json.tmp").exists(),
        "the temp file is renamed into place"
    );
    assert_eq!(studio.ok("recorder_get_latency", json!({})), 96);
    // The engine keeps running on its own configuration; settings_set is storage only.
    assert_eq!(studio.ok("audio_get_config", json!({})), default_config());
    assert_eq!(studio.ok("engine_status", json!({}))["buffer_size"], 256);
}

#[test]
fn settings_set_refuses_bad_payloads_and_leaves_the_file_untouched() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let mut saved = default_settings();
    saved["buffer_size"] = json!(512);
    studio.ok("settings_set", json!({ "settings": saved }));

    let wrong_type = studio.err(
        "settings_set",
        json!({ "settings": { "schemaVersion": 1, "buffer_size": "big" } }),
    );
    assert!(
        wrong_type.contains("invalid args `settings` for command `settings_set`")
            && wrong_type.contains("invalid type: string \"big\", expected u32"),
        "{wrong_type}"
    );

    let negative = studio.err(
        "settings_set",
        json!({ "settings": { "schemaVersion": 1, "sample_rate": -1 } }),
    );
    assert!(
        negative.contains("invalid value: integer `-1`, expected u32"),
        "{negative}"
    );

    let no_version = studio.err(
        "settings_set",
        json!({ "settings": { "buffer_size": 128 } }),
    );
    assert!(
        no_version.contains("missing field `schemaVersion`"),
        "{no_version}"
    );

    let not_an_object = studio.err("settings_set", json!({ "settings": "nope" }));
    assert!(
        not_an_object.contains("invalid type: string \"nope\", expected struct AppSettings"),
        "{not_an_object}"
    );

    let missing_key = studio.err("settings_set", json!({}));
    assert!(
        missing_key.contains("settings_set") && missing_key.contains("settings"),
        "{missing_key}"
    );

    assert_eq!(studio.ok("settings_get", json!({})), saved);
    assert_eq!(read_json(&settings_path()), saved);
}

#[test]
fn a_corrupt_settings_file_is_never_overwritten_and_the_next_start_recovers_the_backup() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let mut good = default_settings();
    good["buffer_size"] = json!(512);
    studio.ok("settings_set", json!({ "settings": good }));
    let mut newer = good.clone();
    newer["buffer_size"] = json!(1024);
    studio.ok("settings_set", json!({ "settings": newer }));
    assert_eq!(read_json(&backup_path()), good);

    fs::write(settings_path(), "not json").unwrap();
    let path_text = settings_path().display().to_string();

    let read = studio.err("settings_get", json!({}));
    assert!(
        read.starts_with(&format!("Cannot read {path_text}:"))
            && read.contains("Restore settings.json.bak"),
        "{read}"
    );
    let write = studio.err("settings_set", json!({ "settings": good }));
    assert!(
        write.starts_with(&format!("Cannot read {path_text}:")),
        "{write}"
    );
    assert_eq!(
        fs::read_to_string(settings_path()).unwrap(),
        "not json",
        "a refused save leaves the damaged bytes alone"
    );

    // Startup is the only place that repairs: it archives the damage first.
    let restarted = Studio::boot();
    let notice = restarted.ok("settings_recovery_notice", json!({}));
    let notice = notice.as_str().expect("a recovery notice");
    assert!(
        notice.starts_with("Recovered settings using the last valid backup."),
        "{notice}"
    );
    let archive = user_dir()
        .read_dir()
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("settings.json.broken-"))
        })
        .find(|p| notice.contains(&p.display().to_string()))
        .expect("the notice names the archived file");
    assert_eq!(fs::read_to_string(&archive).unwrap(), "not json");
    assert_eq!(
        restarted.ok("settings_recovery_notice", json!({})),
        Value::Null,
        "the notice is shown once"
    );
    assert_eq!(restarted.ok("settings_get", json!({})), good);
    assert_eq!(read_json(&settings_path()), good);
    assert_eq!(
        read_json(&backup_path()),
        good,
        "recovery does not touch the backup"
    );
    assert_eq!(restarted.ok("engine_status", json!({}))["buffer_size"], 512);
    // The first studio reads the repaired file too: the file is the source of truth.
    assert_eq!(studio.ok("settings_get", json!({})), good);
}

// ---------------------------------------------------------------------------
// audio configuration
// ---------------------------------------------------------------------------

#[test]
fn audio_set_config_restarts_the_headless_engine_and_persists_the_devices() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("transport_set_count_in", json!({ "bars": 0 }));
    studio.ok("metronome_set", json!({ "on": true, "bpm": 200.0 }));
    wait_until("transport playing", || {
        transport_state(&studio) == "playing"
    });

    let config = json!({
        "input_device": "no-such-input",
        "output_device": "no-such-output",
        "input_channel": 0,
        "sample_rate": 44100,
        "buffer_size": 128
    });
    let status = studio.ok("audio_set_config", json!({ "config": config }));
    assert_eq!(status["mode"], "Headless");
    assert_eq!(status["running"], true);
    assert_eq!(status["sample_rate"], 44100);
    assert_eq!(status["buffer_size"], 128);
    assert_eq!(
        status["last_error"],
        Value::Null,
        "headless ignores device names"
    );
    assert_eq!(
        status["output"],
        json!({
            "device_name": "headless",
            "sample_rate": 44100,
            "channels": 2,
            "buffer_frames": 128,
            "sample_format": "f32"
        })
    );
    assert_eq!(status["input"]["device_name"], "file");
    assert_eq!(status["input"]["sample_rate"], 44100);

    assert_eq!(studio.ok("audio_get_config", json!({})), config);
    let mut current = studio.ok("engine_status", json!({}));
    // The render thread can count more input gaps between these two IPC reads.
    assert!(current["input_gaps"].as_u64().unwrap() >= status["input_gaps"].as_u64().unwrap());
    current["input_gaps"] = status["input_gaps"].clone();
    assert_eq!(current, status);
    let mut expected = default_settings();
    for key in [
        "input_device",
        "output_device",
        "input_channel",
        "sample_rate",
        "buffer_size",
    ] {
        expected[key] = config[key].clone();
    }
    assert_eq!(studio.ok("settings_get", json!({})), expected);
    assert_eq!(read_json(&settings_path()), expected);
    // A restart stops the transport; the tempo survives (the clock is kept).
    wait_until("transport stopped by the restart", || {
        transport_state(&studio) == "stopped"
    });
    assert_eq!(transport_bpm(&studio), 200.0);

    // The next launch starts on the persisted configuration.
    let relaunched = Studio::boot();
    assert_eq!(relaunched.ok("audio_get_config", json!({})), config);
    let status = relaunched.ok("engine_status", json!({}));
    assert_eq!(status["sample_rate"], 44100);
    assert_eq!(status["buffer_size"], 128);
}

#[test]
fn audio_set_config_floors_the_rate_and_buffer_the_engine_can_run_at() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let tiny = json!({
        "input_device": null,
        "output_device": null,
        "input_channel": 2,
        "sample_rate": 100,
        "buffer_size": 1
    });
    let status = studio.ok("audio_set_config", json!({ "config": tiny }));
    assert_eq!(status["mode"], "Headless");
    assert_eq!(status["running"], true);
    assert_eq!(status["sample_rate"], 8000, "8 kHz is the lowest rate");
    assert_eq!(
        status["buffer_size"], 32,
        "32 frames is the smallest buffer"
    );
    assert_eq!(status["output"]["sample_rate"], 8000);
    assert_eq!(status["output"]["buffer_frames"], 32);
    // The requested values are what gets stored; the status says what runs.
    assert_eq!(studio.ok("audio_get_config", json!({})), tiny);
    assert_eq!(studio.ok("settings_get", json!({}))["sample_rate"], 100);
    let telemetry = telemetry(&studio);
    assert_eq!(telemetry["status"]["sample_rate"], 8000);

    // Zero is the extreme of the same rule and must not break the next launch.
    let zero = json!({
        "input_device": null,
        "output_device": null,
        "input_channel": 2,
        "sample_rate": 0,
        "buffer_size": 0
    });
    let status = studio.ok("audio_set_config", json!({ "config": zero }));
    assert_eq!(status["sample_rate"], 8000);
    assert_eq!(status["buffer_size"], 32);
    let relaunched = Studio::boot();
    let status = relaunched.ok("engine_status", json!({}));
    assert_eq!(status["mode"], "Headless");
    assert_eq!(status["running"], true);
    assert_eq!(status["sample_rate"], 8000);
    assert_eq!(status["buffer_size"], 32);
    assert_eq!(relaunched.ok("audio_get_config", json!({})), zero);
}

#[test]
fn audio_set_config_is_refused_for_bad_payloads_and_while_a_take_is_recording() {
    let _scenario = common::scenario();
    let studio = Studio::boot();

    let partial = studio.err(
        "audio_set_config",
        json!({ "config": { "sample_rate": 48000, "buffer_size": 256 } }),
    );
    assert!(
        partial.contains("invalid args `config` for command `audio_set_config`")
            && partial.contains("missing field `input_channel`"),
        "{partial}"
    );
    let negative_channel = studio.err(
        "audio_set_config",
        json!({ "config": {
            "input_device": null, "output_device": null,
            "input_channel": -1, "sample_rate": 48000, "buffer_size": 256
        } }),
    );
    assert!(
        negative_channel.contains("invalid value: integer `-1`, expected u16"),
        "{negative_channel}"
    );
    assert!(
        !settings_path().exists(),
        "a refused payload writes nothing"
    );

    let session = unique("settings-session");
    let take_id = studio.ok("recorder_start", json!({ "sessionId": session }));
    assert!(take_id.as_str().is_some_and(|id| !id.is_empty()));
    let mut config = default_config();
    config["buffer_size"] = json!(512);
    assert_eq!(
        studio.err("audio_set_config", json!({ "config": config })),
        "Save the recording before changing audio devices."
    );
    assert_eq!(
        studio.err("engine_restart", json!({})),
        "Save the recording before changing audio devices."
    );
    assert_eq!(
        studio.err("metronome_set", json!({ "on": true, "bpm": 120.0 })),
        "Save the take before changing playback or timing."
    );
    assert_eq!(studio.ok("audio_get_config", json!({})), default_config());
    assert!(
        !settings_path().exists(),
        "a refused device change is not persisted"
    );
    assert_eq!(studio.ok("engine_status", json!({}))["running"], true);

    let meta = studio.ok("recorder_stop", json!({}));
    assert_eq!(meta["id"], take_id);
    assert_eq!(meta["sessionId"], session);
    let status = studio.ok("engine_restart", json!({}));
    assert_eq!(status["mode"], "Headless");
    assert_eq!(status["running"], true);
}

// ---------------------------------------------------------------------------
// devices, status, restart
// ---------------------------------------------------------------------------

#[test]
fn audio_list_devices_returns_well_formed_descriptor_lists() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let devices = studio.ok("audio_list_devices", json!({}));
    assert_eq!(devices.as_object().map(|o| o.len()), Some(2));
    for kind in ["inputs", "outputs"] {
        // CI runners have no sound card; an empty list is a valid answer.
        let list = devices[kind]
            .as_array()
            .unwrap_or_else(|| panic!("{kind} is a list"));
        let mut defaults = 0;
        for device in list {
            assert!(
                device["name"].as_str().is_some_and(|n| !n.is_empty()),
                "{kind}: {device}"
            );
            assert!(device["is_default"].is_boolean(), "{kind}: {device}");
            if device["is_default"] == true {
                defaults += 1;
            }
            assert!(device["channels"].as_u64().is_some(), "{kind}: {device}");
            let rates: Vec<u64> = device["supported_sample_rates"]
                .as_array()
                .unwrap_or_else(|| panic!("{kind}: rates of {device}"))
                .iter()
                .map(|r| r.as_u64().expect("a rate"))
                .collect();
            let mut sorted = rates.clone();
            sorted.sort_unstable();
            sorted.dedup();
            assert_eq!(rates, sorted, "{kind}: rates sorted and unique");
        }
        assert!(defaults <= 1, "{kind}: at most one default device");
    }
}

#[test]
fn engine_status_describes_the_headless_streams_and_restart_keeps_them() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let status = studio.ok("engine_status", json!({}));
    assert_eq!(
        status,
        json!({
            "mode": "Headless",
            "running": true,
            "output": {
                "device_name": "headless",
                "sample_rate": 48000,
                "channels": 2,
                "buffer_frames": 256,
                "sample_format": "f32"
            },
            "input": {
                "device_name": "file",
                "sample_rate": 48000,
                "channels": 1,
                "buffer_frames": 256,
                "sample_format": "f32"
            },
            "sample_rate": 48000,
            "buffer_size": 256,
            "last_error": null,
            "stream_errors": 0,
            "input_gaps": status["input_gaps"]
        })
    );
    assert!(status["input_gaps"].as_u64().is_some());

    studio.ok("transport_set_count_in", json!({ "bars": 0 }));
    studio.ok("metronome_set", json!({ "on": true, "bpm": 150.0 }));
    wait_until("transport playing", || {
        transport_state(&studio) == "playing"
    });

    let restarted = studio.ok("engine_restart", json!({}));
    assert_eq!(restarted["mode"], "Headless");
    assert_eq!(restarted["running"], true);
    assert_eq!(restarted["output"], status["output"]);
    assert_eq!(restarted["input"], status["input"]);
    assert_eq!(restarted["last_error"], Value::Null);
    assert_eq!(studio.ok("audio_get_config", json!({})), default_config());
    wait_until("transport stopped by the restart", || {
        transport_state(&studio) == "stopped"
    });
    assert_eq!(transport_bpm(&studio), 150.0);
    assert_eq!(studio.ok("engine_status", json!({}))["running"], true);
}

// ---------------------------------------------------------------------------
// mixer and telemetry
// ---------------------------------------------------------------------------

#[test]
fn audio_get_telemetry_has_the_documented_shape_and_meters_the_headless_input() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let tel = telemetry(&studio);
    let mut keys: Vec<&str> = tel
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    assert_eq!(
        keys,
        [
            "band",
            "input_level",
            "output_level",
            "reference",
            "status",
            "transport",
            "tuner",
            "xruns"
        ]
    );
    assert!(tel["xruns"].as_u64().is_some());
    assert!(tel["reference"].is_null());
    for meter in ["input_level", "output_level"] {
        assert!(tel[meter]["peak_db"].is_number(), "{meter}: {tel}");
        assert!(tel[meter]["rms_db"].is_number(), "{meter}: {tel}");
    }
    let transport = &tel["transport"];
    assert!(
        ["stopped", "counting_in", "playing", "paused"]
            .contains(&transport["state"].as_str().unwrap()),
        "{transport}"
    );
    assert_eq!(transport["bar"], 1);
    assert_eq!(transport["beat"], 1);
    assert_eq!(transport["position_beats"], 0.0);
    assert_eq!(transport["bpm"], 120.0);
    assert_eq!(transport["time_signature"], json!([4, 4]));
    assert_eq!(transport["loop_enabled"], false);
    assert_eq!(transport["loop_start_bar"], 1);
    assert_eq!(transport["loop_end_bar"], 5);
    assert_eq!(transport["count_in_bars"], 1);
    let band = &tel["band"];
    assert_eq!(band["style_id"], "blues-shuffle");
    assert_eq!(band["style_name"], "Blues Shuffle");
    assert_eq!(band["active_cue"], "none");
    assert_eq!(band["pending_cue"], "none");
    assert!(band["intensity"].is_number());
    for flag in [
        "mute_drums",
        "mute_bass",
        "mute_comp",
        "follow_energy",
        "is_stopped",
    ] {
        assert!(band[flag].is_boolean(), "{flag}: {band}");
    }
    assert!(band["current_chord"].is_string());
    assert!(band["current_section"].is_string());
    let status = studio.ok("engine_status", json!({}));
    assert_eq!(tel["status"]["mode"], status["mode"]);
    assert_eq!(tel["status"]["sample_rate"], status["sample_rate"]);

    // The headless input is a 440 Hz sine at 0.8 (-1.94 dBFS): the meter sees it.
    wait_until("input meter reading the sine", || {
        let peak = telemetry(&studio)["input_level"]["peak_db"]
            .as_f64()
            .unwrap();
        (-2.5..=-1.5).contains(&peak)
    });
}

#[test]
fn tone_and_tuner_show_up_in_the_telemetry_and_switch_off_again() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    // Tuner on by default, tracking the 440 Hz sine the headless input plays.
    // Startup input gaps can skew the first pitch window. Wait for the same
    // accuracy required below, retaining the snapshot that met it.
    let mut tuner = Value::Null;
    wait_until("tuner locked onto 440 Hz within five cents", || {
        tuner = telemetry(&studio)["tuner"].clone();
        tuner["hz"]
            .as_f64()
            .is_some_and(|hz| (438.0..=442.0).contains(&hz))
            && tuner["cents"].as_f64().is_some_and(|c| c.abs() <= 5.0)
    });
    assert_eq!(tuner["note"], "A4", "{tuner}");
    assert!(
        tuner["hz"]
            .as_f64()
            .is_some_and(|hz| (438.0..=442.0).contains(&hz)),
        "{tuner}"
    );
    assert!(
        tuner["cents"].as_f64().is_some_and(|c| c.abs() <= 5.0),
        "{tuner}"
    );
    assert!(
        tuner["confidence"].as_f64().is_some_and(|c| c > 0.0),
        "{tuner}"
    );
    studio.ok("tuner_set", json!({ "on": false }));
    wait_until("tuner switched off", || {
        telemetry(&studio)["tuner"].is_null()
    });
    assert!(studio
        .err("tuner_set", json!({ "on": "yes" }))
        .contains("invalid args `on` for command `tuner_set`"));

    // Silent output until the tone comes on; the tone is a 0.5 sine (-6.02 dBFS).
    wait_until("silent output", || output_peak_db(&studio) <= -170.0);
    studio.ok("tone_set", json!({ "on": true, "hz": 440.0 }));
    wait_until("tone audible", || {
        (-6.5..=-5.5).contains(&output_peak_db(&studio))
    });
    let loudest = loudest_output_db(&studio, Duration::from_millis(150));
    assert!((-6.5..=-5.5).contains(&loudest), "tone peak {loudest} dB");
    studio.ok("tone_set", json!({ "on": false, "hz": 440.0 }));
    wait_until("tone gone", || output_peak_db(&studio) <= -170.0);
    let error = studio.err("tone_set", json!({ "on": true, "hz": "high" }));
    assert!(
        error.contains("invalid args `hz` for command `tone_set`"),
        "{error}"
    );
    assert!(
        output_peak_db(&studio) <= -170.0,
        "a refused call changes nothing"
    );

    studio.ok("tuner_set", json!({ "on": true }));
    wait_until("tuner back", || telemetry(&studio)["tuner"]["note"] == "A4");
}

#[test]
fn input_monitor_gain_is_clamped_to_unity_not_refused() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    // Nothing plays and the monitor is off: the 0.8 sine on the input stays inaudible.
    wait_until("silent output", || output_peak_db(&studio) <= -170.0);

    // 4.0 would be +10 dBFS if it were applied; the clamp keeps it at 0.8 (-1.94 dB).
    studio.ok("audio_set_input_monitor", json!({ "gain": 4.0 }));
    wait_until("monitor at unity", || {
        (-2.5..=-1.5).contains(&output_peak_db(&studio))
    });
    let loudest = loudest_output_db(&studio, Duration::from_millis(200));
    assert!(
        (-2.5..=-1.5).contains(&loudest),
        "monitor peak {loudest} dB"
    );

    studio.ok("audio_set_input_monitor", json!({ "gain": 0.5 }));
    wait_until("monitor at half", || {
        (-8.5..=-7.5).contains(&output_peak_db(&studio))
    });

    studio.ok("audio_set_input_monitor", json!({ "gain": -1.0 }));
    wait_until("monitor off", || output_peak_db(&studio) <= -170.0);
    let loudest = loudest_output_db(&studio, Duration::from_millis(100));
    assert!(
        loudest <= -170.0,
        "negative gain clamps to silence, got {loudest} dB"
    );

    let error = studio.err("audio_set_input_monitor", json!({ "gain": "loud" }));
    assert!(
        error.contains("invalid args `gain` for command `audio_set_input_monitor`"),
        "{error}"
    );
    let error = studio.err("audio_set_input_monitor", json!({}));
    assert!(error.contains("gain"), "{error}");
}

#[test]
fn metronome_clamps_the_tempo_and_click_and_band_volumes_clamp_to_unity() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("transport_set_count_in", json!({ "bars": 0 }));
    // Both out-of-range values clamp to 0: the band plays into silence.
    studio.ok("transport_set_click_volume", json!({ "volume": -2.0 }));
    studio.ok("audio_set_band_volume", json!({ "volume": -3.0 }));
    studio.ok("metronome_set", json!({ "on": true, "bpm": 1000.0 }));
    wait_until("transport playing", || {
        transport_state(&studio) == "playing"
    });
    assert_eq!(transport_bpm(&studio), 300.0, "300 bpm is the ceiling");
    wait_until("silent output while playing", || {
        output_peak_db(&studio) <= -170.0
    });
    let loudest = loudest_output_db(&studio, Duration::from_millis(250));
    assert!(loudest <= -170.0, "muted band and click, got {loudest} dB");
    assert!(
        telemetry(&studio)["transport"]["position_beats"]
            .as_f64()
            .unwrap()
            > 0.0,
        "the clock runs even when nothing is heard"
    );

    // 7.0 would put the click at +17 dBFS; clamped to 1.0 it peaks at 0 dBFS.
    studio.ok("transport_set_click_volume", json!({ "volume": 7.0 }));
    wait_until("click audible", || output_peak_db(&studio) > -20.0);
    let loudest = loudest_output_db(&studio, Duration::from_millis(300));
    assert!(loudest <= 0.5, "click clamped to unity, got {loudest} dB");

    studio.ok("transport_set_click_volume", json!({ "volume": 0.0 }));
    studio.ok("audio_set_band_volume", json!({ "volume": 5.0 }));
    wait_until("band audible", || output_peak_db(&studio) > -60.0);

    studio.ok("metronome_set", json!({ "on": true, "bpm": 0.0 }));
    wait_until("tempo at the floor", || transport_bpm(&studio) == 20.0);
    assert_eq!(transport_state(&studio), "playing");

    let error = studio.err("metronome_set", json!({ "on": true, "bpm": "fast" }));
    assert!(
        error.contains("invalid args `bpm` for command `metronome_set`"),
        "{error}"
    );
    let error = studio.err("transport_set_click_volume", json!({ "volume": null }));
    assert!(
        error.contains("invalid args `volume` for command `transport_set_click_volume`"),
        "{error}"
    );
    let error = studio.err("audio_set_band_volume", json!({}));
    assert!(error.contains("volume"), "{error}");

    studio.ok("metronome_set", json!({ "on": false, "bpm": 120.0 }));
    wait_until("transport stopped", || {
        transport_state(&studio) == "stopped"
    });
    assert_eq!(
        transport_bpm(&studio),
        20.0,
        "stopping keeps the last tempo"
    );
    assert_eq!(telemetry(&studio)["transport"]["position_beats"], 0.0);
}
