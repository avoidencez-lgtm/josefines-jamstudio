//! ARCHITECTURE command names stay additive aliases of the working commands.
mod common;
use common::Studio;
use serde_json::{json, Value};
use std::time::{Duration, Instant};

fn wait_bar(studio: &Studio, bar: i64) -> Value {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let tel = studio.ok("audio_get_telemetry", json!({}));
        if tel["transport"]["bar"] == bar {
            return tel;
        }
        assert!(
            Instant::now() < deadline,
            "transport bar stayed at {}, wanted {bar}",
            tel["transport"]["bar"]
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn transport_locate_moves_by_beats_and_seek_bar_still_works() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("transport_locate", json!({"beats": 4.0}));
    let tel = wait_bar(&studio, 2);
    assert_eq!(tel["transport"]["bar"], 2);
    studio.ok("transport_seek_bar", json!({"bar": 1}));
    let back = wait_bar(&studio, 1);
    assert_eq!(back["transport"]["bar"], 1);
}

#[test]
fn mixer_set_bus_changes_band_gain_and_keeps_volume_commands() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let buses = studio.ok("mixer_set_bus", json!({"id":"band","patch":{"gain":0.25}}));
    assert_eq!(buses[0]["id"], "band");
    assert!(buses[0]["gainDb"].as_f64().unwrap() < -10.0);
    studio.ok("audio_set_band_volume", json!({"volume": 0.8}));
}

#[test]
fn mixer_set_bus_unmutes_band_when_gain_is_omitted() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("mixer_set_bus", json!({"id":"band","patch":{"muted":true}}));
    let muted = studio.ok("audio_get_telemetry", json!({}));
    // Band volume is not in telemetry; mixer payload carries muted.
    let buses = studio.ok(
        "mixer_set_bus",
        json!({"id":"band","patch":{"muted":false}}),
    );
    assert_eq!(buses[0]["muted"], false);
    assert!(buses[0]["gainDb"].as_f64().unwrap() > -1.0, "{buses}");
    let _ = muted;
}

#[test]
fn mixer_set_bus_refuses_unknown_buses_and_gain_only_part_patches() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let err = studio.err("mixer_set_bus", json!({"id":"reverb","patch":{"gain":0.5}}));
    assert!(err.contains("Unknown mixer bus"), "{err}");
    let err = studio.err("mixer_set_bus", json!({"id":"drums","patch":{"gain":0.5}}));
    assert!(err.contains("no gain"), "{err}");
    studio.ok(
        "mixer_set_bus",
        json!({"id":"drums","patch":{"muted":true}}),
    );
}

#[test]
fn generate_track_and_lyria_vibe_stay_gated() {
    let _scenario = common::scenario();
    std::env::remove_var("JAM_LYRIA_FIXTURE");
    let studio = Studio::boot();
    let gen = studio.err(
        "generate_track",
        json!({"prompt":"instrumental funk","provider":"lyria3","lengthMs":8000}),
    );
    assert!(
        gen.contains("key") || gen.contains("not configured") || gen.contains("lyria3"),
        "{gen}"
    );
    let vibe = studio.err(
        "lyria_vibe",
        json!({"prompts":[{"text":"funk rhythm section","weight":1.0}]}),
    );
    assert!(
        vibe.contains("Start Lyria") || vibe.contains("not configured"),
        "{vibe}"
    );
}

#[test]
fn lyria_vibe_patches_prompts_only_and_keeps_bpm() {
    let _scenario = common::scenario();
    std::env::set_var("JAM_LYRIA_FIXTURE", "1");
    let studio = Studio::boot();
    studio.ok("lyria_start", json!({}));
    studio.ok(
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
    let vibe = studio.ok(
        "lyria_vibe",
        json!({"prompts":[{"text":"dry funk pocket, space for guitar","weight":1.0}]}),
    );
    assert_eq!(vibe["requestedBpm"], 110.0);
    assert_eq!(vibe["scale"], "G_MAJOR_E_MINOR");
    studio.ok("lyria_stop", json!({}));
    std::env::remove_var("JAM_LYRIA_FIXTURE");
}

#[test]
fn band_render_offline_writes_wav_under_user_dir() {
    let _scenario = common::scenario();
    std::env::set_var("JAM_SYNTHETIC_KIT", "1");
    let studio = Studio::boot();
    let root = std::env::var("JAM_USER_DIR").expect("scenario sets JAM_USER_DIR");
    let out = std::path::PathBuf::from(&root)
        .join("renders")
        .join("offline.wav");
    let result = studio.ok(
        "band_render_offline",
        json!({
            "styleId": "rock-straight",
            "bars": 1,
            "tempoBpm": 120.0,
            "seed": 1,
            "outPath": out.to_string_lossy(),
        }),
    );
    assert_eq!(result["frames"], 96_000);
    let drums = result["drumsRmsDb"].as_f64().expect("drums");
    let bass = result["bassRmsDb"].as_f64().expect("bass");
    let comp = result["compRmsDb"].as_f64().expect("comp");
    assert!(drums > -60.0 && bass > -60.0 && comp > -60.0, "{result}");
    let again = studio.ok(
        "band_render_offline",
        json!({
            "styleId": "rock-straight",
            "bars": 1,
            "tempoBpm": 120.0,
            "seed": 1,
            "outPath": out.to_string_lossy(),
        }),
    );
    assert!((again["drumsRmsDb"].as_f64().unwrap() - drums).abs() <= 0.05);
    assert!((again["bassRmsDb"].as_f64().unwrap() - bass).abs() <= 0.05);
    assert!((again["compRmsDb"].as_f64().unwrap() - comp).abs() <= 0.05);
    assert!(out.is_file(), "{}", out.display());
    let spec = hound::WavReader::open(&out).expect("wav").spec();
    assert_eq!(spec.sample_rate, 48_000);
    assert_eq!(spec.channels, 2);
    assert_eq!(spec.bits_per_sample, 24);
}

#[test]
fn band_render_offline_onsets_within_one_sample() {
    let _scenario = common::scenario();
    std::env::set_var("JAM_SYNTHETIC_KIT", "1");
    let root = std::path::PathBuf::from(std::env::var("JAM_USER_DIR").expect("scenario"));
    std::fs::create_dir_all(root.join("styles")).expect("styles dir");
    std::fs::write(
        root.join("styles").join("onset-grid.json"),
        include_str!("../../tests/fixtures/band/onset-grid.json"),
    )
    .expect("user style");
    let studio = Studio::boot();
    let out = root.join("renders").join("onset.wav");
    let result = studio.ok(
        "band_render_offline",
        json!({
            "styleId": "onset-grid",
            "bars": 1,
            "tempoBpm": 120.0,
            "seed": 1,
            "outPath": out.to_string_lossy(),
        }),
    );
    assert_eq!(result["frames"], 96_000);
    let found: Vec<i64> = result["onsets"]
        .as_array()
        .expect("onsets")
        .iter()
        .map(|v| v.as_i64().expect("sample"))
        .collect();
    for expect in [0i64, 24_000, 48_000, 72_000] {
        assert!(
            found.iter().any(|&o| (o - expect).abs() <= 1),
            "expected onset at {expect} ±1, got {found:?}"
        );
    }
}

#[test]
fn keys_test_stays_not_configured() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let err = studio.err("keys_test", json!({"provider": "gemini"}));
    assert!(
        err.contains("not configured") && err.contains("keychain"),
        "{err}"
    );
}

#[test]
fn fixture_provider_is_not_on_the_allow_list() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let err = studio.err(
        "provider_fetch",
        json!({
            "provider": "fixture-llm",
            "path": "/",
            "method": "GET"
        }),
    );
    assert!(err.to_ascii_lowercase().contains("provider"), "{err}");
}
