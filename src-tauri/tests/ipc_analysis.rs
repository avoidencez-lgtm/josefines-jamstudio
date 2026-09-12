//! Music.ai estimates persist from the recorded fixture without touching the grid
//! until an explicit fixture-grid replace.
mod common;
use common::{unique, user_dir, Studio};
use serde_json::json;
use std::path::{Path, PathBuf};

fn write_tone(path: &Path) {
    let mut wav = hound::WavWriter::create(
        path,
        hound::WavSpec {
            channels: 1,
            sample_rate: 48000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .unwrap();
    for i in 0..48000 {
        wav.write_sample((4000.0 * (i as f64 * 0.1).sin()) as i16)
            .unwrap();
    }
    wav.finalize().unwrap();
}

#[test]
fn analysis_start_is_not_configured_without_a_live_job() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let kinds = studio.err(
        "analysis_start",
        json!({"assetId": "song-1", "kinds": ["stems"]}),
    );
    assert!(kinds.contains("beats, chords, key or sections"), "{kinds}");
    let gate = studio.err(
        "analysis_start",
        json!({"assetId": "song-1", "kinds": ["beats"]}),
    );
    assert!(
        gate.contains("not configured") && gate.contains("JAM_LIVE=1"),
        "{gate}"
    );
    studio.ok("analysis_cancel", json!({}));
}

fn write_stereo_tone(path: &Path, freq: f32) {
    let mut wav = hound::WavWriter::create(
        path,
        hound::WavSpec {
            channels: 2,
            sample_rate: 48000,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        },
    )
    .unwrap();
    for i in 0..48000 {
        let sample = (i as f32 * freq * std::f32::consts::TAU / 48000.0).sin() * 0.2;
        wav.write_sample(sample).unwrap();
        wav.write_sample(-sample).unwrap();
    }
    wav.finalize().unwrap();
}

#[test]
fn guitar_residual_is_not_configured_without_marked_stems() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let source = user_dir().join(format!("{}.wav", unique("residual")));
    write_tone(&source);
    let asset = studio.ok("media_import", json!({"path":source,"kind":"audio"}));
    let residual = studio.err("media_guitar_residual", json!({"assetId": asset["id"]}));
    assert!(
        residual.contains("not configured") && residual.contains("-6"),
        "{residual}"
    );
}

#[test]
fn guitar_residual_writes_minus_guitar_mix_when_stems_are_marked() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let source = user_dir().join(format!("{}.wav", unique("minus")));
    write_tone(&source);
    let asset = studio.ok("media_import", json!({"path":source,"kind":"audio"}));
    let id = asset["id"].as_str().unwrap();
    let dir = Path::new(asset["path"].as_str().unwrap()).parent().unwrap();
    let guitar = dir.join("guitar.wav");
    let band = dir.join("band.wav");
    write_stereo_tone(&guitar, 440.0);
    write_stereo_tone(&band, 0.0);
    let manifest = dir.join("song.json");
    let mut doc =
        serde_json::from_slice::<serde_json::Value>(&std::fs::read(&manifest).unwrap()).unwrap();
    let hash = doc["sourceHash"].as_str().unwrap().to_string();
    doc["stemSet"] = json!({
        "schemaVersion": 1,
        "id": "set",
        "sourceHash": hash,
        "provider": "local-import",
        "model": "fixture",
        "seconds": 1.0,
        "stems": [
            {"id":"g","label":"Guitar","gain":1.0,"muted":false,"guitar":true,"path":"guitar.wav","sha256":"0".repeat(64)},
            {"id":"b","label":"Band","gain":1.0,"muted":false,"guitar":false,"path":"band.wav","sha256":"1".repeat(64)}
        ]
    });
    std::fs::write(&manifest, serde_json::to_vec_pretty(&doc).unwrap()).unwrap();
    let residual = studio.ok("media_guitar_residual", json!({"assetId": id}));
    assert!(residual["pass"].as_bool().unwrap(), "{residual}");
    assert!(residual["db"].as_f64().unwrap() <= -6.0, "{residual}");
    let mix = PathBuf::from(residual["mixPath"].as_str().unwrap());
    assert_eq!(mix.file_name().unwrap(), "minus-guitar.wav");
    assert!(mix.exists(), "{}", mix.display());
    assert_eq!(
        mix.canonicalize().unwrap(),
        dir.join("minus-guitar.wav").canonicalize().unwrap()
    );
    let saved =
        serde_json::from_slice::<serde_json::Value>(&std::fs::read(&manifest).unwrap()).unwrap();
    assert_eq!(saved["minusGuitar"]["path"], "minus-guitar.wav");
    assert_eq!(saved["minusGuitar"]["pass"], true);
    studio.ok(
        "media_reference_load",
        json!({"assetId": id, "useMinusGuitar": true}),
    );
    let listed = studio.ok("media_list", json!({}));
    let song = listed["assets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|a| a["id"] == id)
        .unwrap();
    assert_eq!(song["minusGuitar"]["pass"], true);
}

#[test]
fn minus_guitar_load_is_not_configured_without_a_passed_residual() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let source = user_dir().join(format!("{}.wav", unique("noload")));
    write_tone(&source);
    let asset = studio.ok("media_import", json!({"path":source,"kind":"audio"}));
    let err = studio.err(
        "media_reference_load",
        json!({"assetId": asset["id"], "useMinusGuitar": true}),
    );
    assert!(
        err.contains("not configured")
            && err.contains("Check this guitar residual, then Load this mix"),
        "{err}"
    );
}

#[test]
fn minus_guitar_load_is_loud_when_the_mix_file_is_gone() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let source = user_dir().join(format!("{}.wav", unique("gone")));
    write_tone(&source);
    let asset = studio.ok("media_import", json!({"path":source,"kind":"audio"}));
    let id = asset["id"].as_str().unwrap();
    let dir = Path::new(asset["path"].as_str().unwrap()).parent().unwrap();
    write_stereo_tone(&dir.join("guitar.wav"), 440.0);
    write_stereo_tone(&dir.join("band.wav"), 0.0);
    let manifest = dir.join("song.json");
    let mut doc =
        serde_json::from_slice::<serde_json::Value>(&std::fs::read(&manifest).unwrap()).unwrap();
    let hash = doc["sourceHash"].as_str().unwrap().to_string();
    doc["stemSet"] = json!({
        "schemaVersion": 1,
        "id": "set",
        "sourceHash": hash,
        "provider": "local-import",
        "model": "fixture",
        "seconds": 1.0,
        "stems": [
            {"id":"g","label":"Guitar","gain":1.0,"muted":false,"guitar":true,"path":"guitar.wav","sha256":"0".repeat(64)},
            {"id":"b","label":"Band","gain":1.0,"muted":false,"guitar":false,"path":"band.wav","sha256":"1".repeat(64)}
        ]
    });
    std::fs::write(&manifest, serde_json::to_vec_pretty(&doc).unwrap()).unwrap();
    studio.ok("media_guitar_residual", json!({"assetId": id}));
    std::fs::remove_file(dir.join("minus-guitar.wav")).unwrap();
    let err = studio.err(
        "media_reference_load",
        json!({"assetId": id, "useMinusGuitar": true}),
    );
    assert!(
        err.contains("minus-guitar.wav is missing")
            && err.contains("Check this guitar residual again"),
        "{err}"
    );
}

#[test]
fn recorded_musicai_fixture_persists_without_writing_the_grid() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let source = user_dir().join(format!("{}.wav", unique("musicai")));
    write_tone(&source);
    let asset = studio.ok("media_import", json!({"path":source,"kind":"audio"}));
    let id = asset["id"].as_str().unwrap();
    let manifest = Path::new(asset["path"].as_str().unwrap())
        .parent()
        .unwrap()
        .join("song.json");
    let before =
        serde_json::from_slice::<serde_json::Value>(&std::fs::read(&manifest).unwrap()).unwrap();
    assert!(before.get("referenceGrid").is_none());
    std::env::set_var("JAM_MUSICAI_FIXTURE", "1");
    let saved = studio.ok(
        "analysis_start",
        json!({"assetId": id, "kinds": ["beats", "chords", "key", "sections"]}),
    );
    std::env::remove_var("JAM_MUSICAI_FIXTURE");
    assert_eq!(saved["providerAnalysis"]["provider"], "musicai");
    assert_eq!(saved["providerAnalysis"]["confidence"], "unverified");
    assert_eq!(saved["providerAnalysis"]["drivesGrid"], false);
    assert_eq!(saved["providerAnalysis"]["bpm"], 120.0);
    assert_eq!(saved["providerAnalysis"]["key"], "C Major");
    assert!(saved.get("referenceGrid").is_none());
    let after =
        serde_json::from_slice::<serde_json::Value>(&std::fs::read(&manifest).unwrap()).unwrap();
    assert!(after.get("referenceGrid").is_none());
    assert_eq!(after["providerAnalysis"]["sourceHash"], after["sourceHash"]);
}

fn write_tone_seconds(path: &Path, seconds: u32) {
    let mut wav = hound::WavWriter::create(
        path,
        hound::WavSpec {
            channels: 1,
            sample_rate: 48000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .unwrap();
    for i in 0..48000 * seconds {
        wav.write_sample((4000.0 * (i as f64 * 0.1).sin()) as i16)
            .unwrap();
    }
    wav.finalize().unwrap();
}

#[test]
fn recorded_fixture_replace_writes_the_confirmed_grid_or_fails_loud() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let source = user_dir().join(format!("{}.wav", unique("gridfix")));
    write_tone_seconds(&source, 5);
    let asset = studio.ok("media_import", json!({"path":source,"kind":"audio"}));
    let id = asset["id"].as_str().unwrap();
    let hash = asset["sourceHash"].as_str().unwrap();
    let refused = studio.err(
        "media_reference_grid_replace",
        json!({"assetId": id, "replacement": {
            "sourceHash": hash,
            "firstDownbeat": 0,
            "beatsPerBar": 4,
            "sections": [{"id":"verse","label":"Verse","startBar":1,"endBar":2}],
            "confirmed": true
        }}),
    );
    assert!(
        refused.contains("not configured") && refused.contains("JAM_LIVE=1"),
        "{refused}"
    );
    std::env::set_var("JAM_MUSICAI_FIXTURE", "1");
    let saved = studio.ok(
        "media_reference_grid_replace",
        json!({"assetId": id, "replacement": {
            "sourceHash": hash,
            "firstDownbeat": 0,
            "beatsPerBar": 4,
            "sections": [{"id":"verse","label":"Verse","startBar":1,"endBar":2}],
            "confirmed": true
        }}),
    );
    std::env::remove_var("JAM_MUSICAI_FIXTURE");
    assert_eq!(saved["referenceGrid"]["origin"], "confirmed-local");
    assert_eq!(saved["providerAnalysis"]["drivesGrid"], true);
    let beats = saved["referenceGrid"]["beats"].as_array().unwrap();
    assert_eq!(beats.len(), 9);
    assert!((beats[4].as_f64().unwrap() - 2.0).abs() <= 0.001);
}

#[test]
fn recorded_fixture_song_writes_stems_and_chord_chart_or_fails_loud() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let source = user_dir().join(format!("{}.wav", unique("fixsong")));
    write_tone_seconds(&source, 5);
    let asset = studio.ok("media_import", json!({"path":source,"kind":"audio"}));
    let id = asset["id"].as_str().unwrap();
    let manifest = Path::new(asset["path"].as_str().unwrap())
        .parent()
        .unwrap()
        .join("song.json");
    let refused = studio.err("media_fixture_song", json!({"assetId": id}));
    assert!(
        refused.contains("not configured") && refused.contains("JAM_LIVE=1"),
        "{refused}"
    );
    let before =
        serde_json::from_slice::<serde_json::Value>(&std::fs::read(&manifest).unwrap()).unwrap();
    assert!(before.get("stemSet").is_none());
    std::env::set_var("JAM_SONG_FIXTURE", "1");
    let saved = studio.ok("media_fixture_song", json!({"assetId": id}));
    std::env::remove_var("JAM_SONG_FIXTURE");
    assert_eq!(saved["stemSet"]["provider"], "recorded-fixture");
    assert_eq!(saved["stemSet"]["stems"].as_array().unwrap().len(), 2);
    assert_eq!(saved["stemSet"]["stems"][0]["id"], "guitar");
    assert_eq!(saved["stemSet"]["stems"][1]["id"], "band");
    assert_eq!(saved["songAnalysis"]["chords"][0]["chord"], "C");
    assert_eq!(saved["songAnalysis"]["chords"][1]["chord"], "F");
    assert_eq!(saved["songAnalysis"]["sourceHash"], saved["sourceHash"]);
    let after =
        serde_json::from_slice::<serde_json::Value>(&std::fs::read(&manifest).unwrap()).unwrap();
    assert_eq!(after["stemSet"]["stems"].as_array().unwrap().len(), 2);
    assert_eq!(after["songAnalysis"]["chords"][0]["chord"], "C");
    assert_eq!(after["songAnalysis"]["chords"][1]["chord"], "F");
    assert!(after.get("referenceGrid").is_none());
}
