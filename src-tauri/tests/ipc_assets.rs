//! Sample packs: recorded assets-v1 checksum, download gated on JAM_LIVE=1.
mod common;
use common::{user_dir, Studio};
use serde_json::json;

#[test]
fn assets_ensure_needs_live_after_the_release_hash_is_recorded() {
    let _scenario = common::scenario();
    std::env::remove_var("JAM_ASSETS_FIXTURE");
    std::env::remove_var("JAM_LIVE");
    let studio = Studio::boot();
    let packs = studio.ok("assets_status", json!({}));
    assert_eq!(packs[0]["id"], "standard-rock-kit");
    assert_eq!(packs[0]["live"], false);
    assert_eq!(packs[0]["state"], "recorded");
    let gate = studio.err("assets_ensure", json!({}));
    assert!(
        gate.contains("JAM_LIVE=1") && gate.contains("sample pack"),
        "{gate}"
    );
    assert_eq!(std::env::var_os("JAM_LIVE"), None);
}

#[test]
fn assets_fixture_reports_the_synthetic_kit_only() {
    let _scenario = common::scenario();
    std::env::set_var("JAM_ASSETS_FIXTURE", "1");
    let studio = Studio::boot();
    let packs = studio.ok("assets_ensure", json!({}));
    assert_eq!(packs[0]["state"], "synthetic");
    assert_eq!(packs[0]["live"], false);
    assert!(
        packs[0]["message"]
            .as_str()
            .unwrap()
            .contains("No GitHub Release zip"),
        "{packs}"
    );
    std::env::remove_var("JAM_ASSETS_FIXTURE");
}

/// Live GitHub Release download. Not CI. `JAM_LIVE=1 cargo test -p src-tauri --test ipc_assets -- --ignored --nocapture`
#[test]
#[ignore = "live GitHub download; requires JAM_LIVE=1"]
fn live_assets_ensure_unpacks_release_zips_and_play_reports_file_sources() {
    let _scenario = common::scenario();
    std::env::remove_var("JAM_ASSETS_FIXTURE");
    std::env::remove_var("JAM_ASSETS_LOCAL");
    std::env::remove_var("JAM_SYNTHETIC_KIT");
    std::env::remove_var("JAM_KIT_DIR");
    std::env::remove_var("JAM_SF2_DIR");
    std::env::set_var("JAM_LIVE", "1");
    let root = common::user_dir();
    let studio = Studio::boot();
    let packs = studio.ok("assets_ensure", json!({}));
    eprintln!("JAM_USER_DIR={}", root.display());
    eprintln!("assets_ensure={packs}");
    assert_eq!(std::env::var("JAM_LIVE").as_deref(), Ok("1"));
    let kit_dir = root.join("assets/standard-rock-kit");
    let sf2_dir = root.join("assets/freepats-bass-comp");
    assert!(
        kit_dir.join("kit.json").is_file(),
        "kit.json missing in {}",
        kit_dir.display()
    );
    assert!(
        sf2_dir.join("bass.sf2").is_file() && sf2_dir.join("comp.sf2").is_file(),
        "sf2 missing in {}",
        sf2_dir.display()
    );
    let kit_zip = root.join("assets/standard-rock-kit.zip");
    let sf2_zip = root.join("assets/freepats-bass-comp.zip");
    assert_eq!(kit_zip.metadata().unwrap().len(), 334392, "{}", kit_zip.display());
    assert_eq!(
        sf2_zip.metadata().unwrap().len(),
        11_286_874,
        "{}",
        sf2_zip.display()
    );
    let kit = packs
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == "standard-rock-kit")
        .unwrap();
    let sf2 = packs
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == "freepats-bass-comp")
        .unwrap();
    assert_eq!(kit["state"], "ready", "{kit}");
    assert_eq!(sf2["state"], "ready", "{sf2}");

    studio.ok("transport_set_count_in", json!({"bars": 0}));
    studio.ok("transport_play", json!({}));
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    let tel = loop {
        let tel = studio.ok("audio_get_telemetry", json!({}));
        let band = &tel["band"];
        if band["kit_source"] == "file" && band["bass_source"] == "sf2" {
            break tel;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "play did not report file kit + sf2; last band: {}",
            tel["band"]
        );
        std::thread::sleep(std::time::Duration::from_millis(20));
    };
    eprintln!("band={}", tel["band"]);
    assert_eq!(tel["band"]["kit_source"], "file");
    assert_eq!(tel["band"]["bass_source"], "sf2");
    std::env::remove_var("JAM_LIVE");
}

#[test]
fn diagnostics_idle_cpu_stays_unproven() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let sample = studio.ok("diagnostics_idle_cpu", json!({}));
    assert_eq!(sample["proven"], false, "{sample}");
    assert_eq!(sample["headless"], true, "{sample}");
    let message = sample["message"].as_str().unwrap();
    assert!(message.contains("Idle CPU is not proven"), "{message}");
    assert!(message.contains("WebView+engine"), "{message}");
}

#[test]
fn diagnostics_report_fps_appends_the_user_log() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let text = studio.ok(
        "diagnostics_report_fps",
        json!({ "meter": 59.6, "playhead": 60.2 }),
    );
    let line = text.as_str().unwrap();
    assert!(line.contains("meter=59.6"), "{line}");
    assert!(line.contains("playhead=60.2"), "{line}");
    let log = user_dir().join("logs").join("jamstudio.log");
    let body = std::fs::read_to_string(&log).unwrap();
    assert!(body.contains("canvas fps meter=59.6 playhead=60.2"), "{body}");
}

#[test]
fn logs_export_is_not_configured_without_a_log_folder() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let gate = studio.err("logs_export", json!({}));
    assert!(gate.contains("not configured") && gate.contains("logs"), "{gate}");
    let version = studio.ok("app_version", json!({}));
    assert!(version.as_str().unwrap().chars().any(|c| c.is_ascii_digit()));
}
