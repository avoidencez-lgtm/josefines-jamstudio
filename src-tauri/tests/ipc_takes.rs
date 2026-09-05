//! Recording and takes through the IPC layer on the headless engine: the latency
//! knob and where it is remembered, a real headless recording and the stems it
//! leaves on disk, listing, deleting, damaged manifests, and analysis, melody,
//! DAW export and soundtrack mixing of a synthetic take written straight into
//! the takes folder.
mod common;

use common::{unique, user_dir, Studio};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Listener, Manager};

const RATE: u32 = 48_000;

/// Where the engine records and `scan_takes` looks: `JAM_DATA_DIR/takes`.
fn takes_root() -> PathBuf {
    user_dir().join("data").join("takes")
}

/// A 16-bit mono PCM WAV written with std only; returns the number of frames.
fn write_sine_wav(path: &Path, hz: f32, seconds: f32, amplitude: f32) -> usize {
    let frames = (RATE as f32 * seconds) as usize;
    let data_len = (frames * 2) as u32;
    let mut bytes = Vec::with_capacity(44 + data_len as usize);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend_from_slice(b"fmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
    bytes.extend_from_slice(&1u16.to_le_bytes()); // mono
    bytes.extend_from_slice(&RATE.to_le_bytes());
    bytes.extend_from_slice(&(RATE * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    for i in 0..frames {
        let v = amplitude * (2.0 * std::f32::consts::PI * hz * i as f32 / RATE as f32).sin();
        bytes.extend_from_slice(&((v * 32_767.0) as i16).to_le_bytes());
    }
    std::fs::write(path, bytes).unwrap();
    frames
}

struct SyntheticTake {
    id: String,
    dir: PathBuf,
    input: PathBuf,
    band: PathBuf,
    master: PathBuf,
    frames: usize,
}

/// A take folder in the layout the recorder produces: a 220 Hz (A3) guitar DI stem,
/// silent band and master stems, and a valid take.json manifest.
fn synthetic_take(seconds: f32, timestamp: &str) -> SyntheticTake {
    let id = unique("take-synthetic");
    let dir = takes_root().join(&id);
    std::fs::create_dir_all(&dir).unwrap();
    let input = dir.join("guitar-di.wav");
    let band = dir.join("band.wav");
    let master = dir.join("master.wav");
    let frames = write_sine_wav(&input, 220.0, seconds, 0.4);
    write_sine_wav(&band, 0.0, seconds, 0.0);
    write_sine_wav(&master, 0.0, seconds, 0.0);
    let manifest = json!({
        "id": id,
        "sessionId": format!("session-of-{id}"),
        "timestamp": timestamp,
        "durationSecs": frames as f64 / RATE as f64,
        "styleId": "blues-shuffle",
        "chartId": "blues-12-bar",
        "tempo": 120.0,
        "sampleCount": frames,
        "pathInput": input.to_string_lossy(),
        "pathBand": band.to_string_lossy(),
        "pathMaster": master.to_string_lossy(),
        "waveformPeaks": [0.4],
        "notes": "synthetic A3 sine",
        "stems": {
            "guitar-di": input.to_string_lossy(),
            "band": band.to_string_lossy(),
            "master": master.to_string_lossy(),
        },
        "snapshot": {"timeSignature": [4, 4]},
        "sampleRate": RATE,
        "schemaVersion": 1,
    });
    std::fs::write(
        dir.join("take.json"),
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .unwrap();
    SyntheticTake {
        id,
        dir,
        input,
        band,
        master,
        frames,
    }
}

fn manifest(dir: &Path) -> Value {
    serde_json::from_slice(&std::fs::read(dir.join("take.json")).unwrap()).unwrap()
}

fn find<'a>(list: &'a Value, id: &str) -> Option<&'a Value> {
    list.as_array().unwrap().iter().find(|t| t["id"] == id)
}

fn settings_on_disk() -> Value {
    serde_json::from_slice(&std::fs::read(user_dir().join("settings.json")).unwrap()).unwrap()
}

/// Collects every `app:error` payload the studio emits.
fn app_errors(studio: &Studio) -> Arc<Mutex<Vec<String>>> {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&seen);
    studio.app().listen_any("app:error", move |event| {
        let text: String = serde_json::from_str(event.payload()).unwrap();
        sink.lock().unwrap().push(text);
    });
    seen
}

/// Waits until `path` holds at least `bytes` (the recorder flushes in chunks).
fn wait_for_file(path: &Path, bytes: u64) {
    let deadline = Instant::now() + Duration::from_secs(3);
    while std::fs::metadata(path).map(|m| m.len()).unwrap_or(0) < bytes {
        assert!(
            Instant::now() < deadline,
            "{} did not reach {bytes} bytes within 3 s",
            path.display()
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}

#[test]
fn latency_offset_round_trips_clamps_and_is_remembered_in_settings_json() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    assert_eq!(
        studio.ok("recorder_set_latency", json!({"samples": 1234})),
        1234
    );
    assert_eq!(studio.ok("recorder_get_latency", json!({})), 1234);
    assert_eq!(settings_on_disk()["recorder"]["latency_samples"], 1234);
    assert_eq!(
        studio.ok("settings_get", json!({}))["recorder"]["latency_samples"],
        1234
    );

    // A whole second of offset is the ceiling; anything above is clamped, not refused.
    assert_eq!(
        studio.ok("recorder_set_latency", json!({"samples": 60_000})),
        48_000
    );
    assert_eq!(studio.ok("recorder_get_latency", json!({})), 48_000);
    assert_eq!(settings_on_disk()["recorder"]["latency_samples"], 48_000);

    // Wrong types never reach the engine and the stored value is untouched.
    let err = studio.err("recorder_set_latency", json!({"samples": -1}));
    assert!(err.contains("samples"), "{err}");
    let err = studio.err("recorder_set_latency", json!({"samples": "lots"}));
    assert!(err.contains("samples"), "{err}");
    assert_eq!(studio.ok("recorder_get_latency", json!({})), 48_000);

    // A fresh studio boots with the remembered offset.
    let later = Studio::boot();
    assert_eq!(later.ok("recorder_get_latency", json!({})), 48_000);

    assert_eq!(studio.ok("recorder_set_latency", json!({"samples": 0})), 0);
    assert_eq!(settings_on_disk()["recorder"]["latency_samples"], 0);
}

#[test]
fn a_headless_recording_writes_six_stems_a_manifest_and_the_sine_input() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("recorder_set_latency", json!({"samples": 0}));
    let session = unique("session");
    let id = studio.ok("recorder_start", json!({"sessionId": session}));
    let id = id.as_str().unwrap().to_string();
    assert!(id.starts_with("take-"), "{id}");
    let dir = takes_root().join(&id);
    assert!(dir.is_dir(), "{} is created at start", dir.display());
    let state = studio.app().state::<app_lib::AppState>();
    assert!(state.engine.lock().recorder_is_recording());

    // At least a quarter second of 24-bit mono input on disk before stopping.
    wait_for_file(&dir.join("guitar-di.wav"), 3 * (RATE as u64) / 4);
    let meta = studio.ok("recorder_stop", json!({}));
    assert!(!state.engine.lock().recorder_is_recording());

    assert_eq!(meta["id"], id);
    assert_eq!(meta["sessionId"], session);
    assert_eq!(meta["styleId"], "blues-shuffle");
    assert_eq!(meta["chartId"], "blues-12-bar");
    assert_eq!(meta["tempo"], 120.0);
    assert_eq!(meta["sampleRate"], RATE);
    assert_eq!(meta["schemaVersion"], 1);
    assert_eq!(meta["snapshot"], json!({"timeSignature": [4, 4]}));
    assert_eq!(meta["notes"], "");
    let frames = meta["sampleCount"].as_u64().unwrap();
    assert!(frames >= RATE as u64 / 4, "recorded {frames} frames");
    assert!((meta["durationSecs"].as_f64().unwrap() - frames as f64 / RATE as f64).abs() < 1e-9);
    let peaks = meta["waveformPeaks"].as_array().unwrap();
    assert!(!peaks.is_empty() && peaks.len() <= 100);
    assert!(peaks
        .iter()
        .all(|p| (0.0..=1.0).contains(&p.as_f64().unwrap())));
    // The headless input is an 0.8 amplitude sine, so the input peaks are not silence.
    assert!(peaks.iter().any(|p| p.as_f64().unwrap() > 0.5), "{peaks:?}");

    let stems = meta["stems"].as_object().unwrap();
    let mut names: Vec<&str> = stems.keys().map(String::as_str).collect();
    names.sort_unstable();
    assert_eq!(
        names,
        ["band", "bass", "comp", "drums", "guitar-di", "master"]
    );
    for (name, path) in stems {
        let path = Path::new(path.as_str().unwrap());
        assert_eq!(path.parent(), Some(dir.as_path()), "{name}");
        let (samples, rate) = jam_audio::recorder::read_wav_mono(path).unwrap();
        assert_eq!(rate, RATE, "{name}");
        assert_eq!(samples.len() as u64, frames, "{name} has every frame");
    }
    assert_eq!(meta["pathInput"], stems["guitar-di"]);
    assert_eq!(meta["pathBand"], stems["band"]);
    assert_eq!(meta["pathMaster"], stems["master"]);
    assert_eq!(manifest(&dir)["id"], id);
    assert_eq!(manifest(&dir)["sampleCount"], frames);

    let listed = studio.ok("takes_list", json!({}));
    let listed = find(&listed, &id).expect("the new take is listed");
    assert_eq!(listed["sessionId"], session);
    assert_eq!(listed["sampleCount"], frames);
    assert_eq!(listed["stems"], meta["stems"]);

    // What was recorded is the engine's headless 440 Hz input: A4 in the melody sketch.
    let notes = studio.ok(
        "takes_melody",
        json!({"takeId": id, "startSeconds": 0.0, "lengthSeconds": 0.25}),
    );
    let midi: Vec<u64> = notes
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["midi"].as_u64().unwrap())
        .collect();
    if midi.is_empty() || midi.iter().any(|m| *m != 69) {
        let (samples, rate) =
            jam_audio::recorder::read_wav_mono(&dir.join("guitar-di.wav")).unwrap();
        let window = &samples[..samples.len().min(rate as usize / 4)];
        // Synthetic input only: retain compact signal evidence in CI logs, not user audio.
        let blocks: Vec<_> = window
            .chunks(512)
            .map(|block| {
                let rms = (block.iter().map(|s| s * s).sum::<f32>() / block.len() as f32).sqrt();
                let zeros = block.iter().filter(|s| **s == 0.0).count();
                (rms, zeros)
            })
            .collect();
        panic!(
            "expected sustained A4; notes={notes}, rate={rate}, frames={}, input_gaps={}, \
             first-quarter-second 512-frame blocks (RMS, exact zeros)={blocks:?}",
            samples.len(),
            state.engine.lock().status().input_gaps
        );
    }
}

#[test]
fn the_recorder_refuses_a_second_take_and_a_stop_without_one() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    assert_eq!(
        studio.err("recorder_stop", json!({})),
        "No active recording"
    );
    let err = studio.err("recorder_start", json!({}));
    assert!(err.contains("sessionId"), "{err}");
    let first = studio.ok("recorder_start", json!({"sessionId": unique("session")}));
    assert_eq!(
        studio.err("recorder_start", json!({"sessionId": unique("session")})),
        "A take is already recording. Stop and save it first."
    );
    let saved = studio.ok("recorder_stop", json!({}));
    assert_eq!(saved["id"], first);
    assert_eq!(
        studio.err("recorder_stop", json!({})),
        "No active recording"
    );
    // Recording again after saving is fine and yields a new id.
    let second = studio.ok("recorder_start", json!({"sessionId": unique("session")}));
    assert_ne!(second, first);
    assert_eq!(studio.ok("recorder_stop", json!({}))["id"], second);
}

#[test]
fn takes_list_merges_the_files_on_disk_newest_first_with_their_metadata() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let older = synthetic_take(0.2, "1000000000.000");
    let newer = synthetic_take(0.2, "2000000000.000");
    let list = studio.ok("takes_list", json!({}));
    let ids: Vec<&str> = list
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["id"].as_str().unwrap())
        .filter(|id| *id == older.id || *id == newer.id)
        .collect();
    assert_eq!(ids, [newer.id.as_str(), older.id.as_str()]);
    let take = find(&list, &older.id).unwrap();
    assert_eq!(take["sessionId"], format!("session-of-{}", older.id));
    assert_eq!(take["sampleCount"], older.frames);
    assert_eq!(take["durationSecs"], older.frames as f64 / RATE as f64);
    assert_eq!(take["tempo"], 120.0);
    assert_eq!(take["sampleRate"], RATE);
    assert_eq!(take["schemaVersion"], 1);
    assert_eq!(take["pathInput"], older.input.to_string_lossy().as_ref());
    assert_eq!(take["stems"]["band"], older.band.to_string_lossy().as_ref());
    assert_eq!(take["notes"], "synthetic A3 sine");
    assert_eq!(take["hidden"], Value::Null);
}

#[test]
fn takes_delete_drops_the_take_from_the_list_and_refuses_an_unknown_id() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let take = synthetic_take(0.2, "1500000000.000");
    assert!(find(&studio.ok("takes_list", json!({})), &take.id).is_some());

    assert_eq!(
        studio.ok("takes_delete", json!({"takeId": take.id})),
        Value::Null
    );
    assert!(
        find(&studio.ok("takes_list", json!({})), &take.id).is_none(),
        "deleted take is no longer listed"
    );
    assert!(
        !take.dir.exists() && !take.input.exists() && !take.band.exists() && !take.master.exists(),
        "delete removes the take folder"
    );

    let ghost = unique("no-such-take");
    let err = studio.err("takes_delete", json!({"takeId": ghost}));
    assert_eq!(err, format!("take {ghost} is not in the library"));
    let err = studio.err("takes_delete", json!({}));
    assert!(err.contains("takeId"), "{err}");
}

#[test]
fn takes_delete_removes_the_take_folder_from_disk() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let take = synthetic_take(0.2, "1500000000.000");
    studio.ok("takes_delete", json!({"takeId": take.id}));
    assert!(
        !take.dir.exists(),
        "{} still exists after delete",
        take.dir.display()
    );
    assert!(find(&studio.ok("takes_list", json!({})), &take.id).is_none());
}

#[test]
fn takes_delete_ignores_a_manifest_path_pointing_at_another_take() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let keep = synthetic_take(0.2, "1500000000.000");
    let take = synthetic_take(0.2, "1500000001.000");
    let mut meta = manifest(&take.dir);
    meta["pathInput"] = json!(keep.input.to_string_lossy());
    std::fs::write(
        take.dir.join("take.json"),
        serde_json::to_vec(&meta).unwrap(),
    )
    .unwrap();

    studio.ok("takes_delete", json!({"takeId": take.id}));
    assert!(
        !take.dir.exists(),
        "only the requested take folder is deleted"
    );
    assert!(keep.input.is_file() && keep.band.is_file() && keep.master.is_file());
    assert!(find(&studio.ok("takes_list", json!({})), &keep.id).is_some());
}

#[test]
fn a_damaged_manifest_is_skipped_with_one_warning_and_hides_no_other_take() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let errors = app_errors(&studio);
    let good = synthetic_take(0.2, "1600000000.000");
    let damaged_dir = takes_root().join(unique("take-damaged"));
    std::fs::create_dir_all(&damaged_dir).unwrap();
    let damaged_manifest = damaged_dir.join("take.json");
    std::fs::write(&damaged_manifest, b"{\"id\": \"broken\", ").unwrap();

    let list = studio.ok("takes_list", json!({}));
    assert!(
        find(&list, &good.id).is_some(),
        "the healthy take is listed"
    );
    assert!(
        list.as_array().unwrap().iter().all(|t| t["id"] != "broken"),
        "the damaged manifest is not listed"
    );
    let mine = |errors: &Arc<Mutex<Vec<String>>>| -> Vec<String> {
        errors
            .lock()
            .unwrap()
            .iter()
            .filter(|e| e.contains(&damaged_manifest.to_string_lossy().to_string()))
            .cloned()
            .collect()
    };
    let first = mine(&errors);
    assert_eq!(first.len(), 1, "{first:?}");
    assert!(first[0].starts_with("Cannot read "), "{}", first[0]);
    assert!(
        first[0].contains("Other takes remain available; this file was left intact."),
        "{}",
        first[0]
    );

    // Refreshing the list does not repeat the warning, and the file is untouched.
    studio.ok("takes_list", json!({}));
    assert_eq!(mine(&errors).len(), 1);
    assert_eq!(
        std::fs::read(&damaged_manifest).unwrap(),
        b"{\"id\": \"broken\", "
    );
    // The damaged folder never blocks deleting or finding a healthy take.
    studio.ok("takes_delete", json!({"takeId": good.id}));
}

#[test]
fn analysis_of_a_synthetic_a3_sine_finds_pitched_frames_in_tune() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let take = synthetic_take(1.5, "1700000000.000");
    let analysis = studio.ok("takes_analyze", json!({"takeId": take.id}));
    let intonation = analysis["intonationAccuracyPct"].as_f64().unwrap();
    assert!(intonation >= 90.0, "{analysis}");
    let transients = analysis["detectedTransients"].as_u64().unwrap();
    assert_eq!(transients, 1, "one sustained note: {analysis}");
    let summary = analysis["summary"].as_str().unwrap();
    assert!(
        summary.starts_with(&format!("Detected {transients} attack candidates.")),
        "{summary}"
    );
    assert!(summary.contains("pitched frames"), "{summary}");
    assert!(!summary.contains("No sustained pitched notes"), "{summary}");
    let timing = analysis["timingAccuracyPct"].as_f64().unwrap();
    assert_eq!(
        timing, 0.0,
        "one attack is insufficient for timing: {analysis}"
    );
    let dynamics = analysis["dynamicConsistencyPct"].as_f64().unwrap();
    assert_eq!(
        dynamics, 0.0,
        "one attack is insufficient for dynamics: {analysis}"
    );
    assert!(analysis["meanGridDistanceMs"].is_null());
    assert!(analysis["attackLevelCvPct"].is_null());
    assert!(analysis["pitchedFrames"].as_u64().unwrap() > 0);
    let cents = analysis["meanAbsCents"].as_f64().unwrap();
    // Expose the unchanged detector measurement behind the existing >=90 score.
    // Rounding that score permits up to 5.25 cents; this is not M6's ±3-cent gate.
    assert!((0.0..=5.25).contains(&cents), "{analysis}");
    assert_eq!(((1.0 - cents / 50.0) * 100.0).round(), intonation);

    let ghost = unique("no-such-take");
    assert_eq!(
        studio.err("takes_analyze", json!({"takeId": ghost})),
        format!("take {ghost} is not in the library")
    );
}

#[test]
fn melody_of_the_synthetic_take_is_a3_and_the_window_is_validated() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let take = synthetic_take(1.5, "1700000000.001");
    let notes = studio.ok(
        "takes_melody",
        json!({"takeId": take.id, "startSeconds": 0.0, "lengthSeconds": 1.0}),
    );
    let notes = notes.as_array().unwrap();
    assert!(!notes.is_empty());
    for note in notes {
        assert_eq!(note["midi"], 57, "{note}");
        assert!(note["confidence"].as_f64().unwrap() >= 0.85, "{note}");
        assert!(note["durationSeconds"].as_f64().unwrap() >= 0.08, "{note}");
    }
    assert!(
        notes[0]["startSeconds"].as_f64().unwrap() < 0.05,
        "{notes:?}"
    );
    let covered: f64 = notes
        .iter()
        .map(|n| n["durationSeconds"].as_f64().unwrap())
        .sum();
    assert!(covered > 0.8, "sketch covers {covered} s of the 1 s window");

    // Boundaries of the window rule: 0.1..=60 seconds, nonnegative start.
    let rule = "Choose a nonnegative start and 0.1–60 seconds of melody.";
    for (start, length) in [(0.0, 0.05), (0.0, 60.5), (-0.1, 1.0), (0.0, 0.0)] {
        assert_eq!(
            studio.err(
                "takes_melody",
                json!({"takeId": take.id, "startSeconds": start, "lengthSeconds": length}),
            ),
            rule,
            "start {start} length {length}"
        );
    }
    assert_eq!(
        studio.err(
            "takes_melody",
            json!({"takeId": take.id, "startSeconds": 1.5, "lengthSeconds": 1.0}),
        ),
        "Choose a start inside a recording no longer than two minutes."
    );
    // The last 0.1 s of a 1.5 s take is a valid window even though it is clipped.
    assert!(studio
        .ok(
            "takes_melody",
            json!({"takeId": take.id, "startSeconds": 1.45, "lengthSeconds": 60.0}),
        )
        .is_array());
    assert_eq!(
        studio.err(
            "takes_melody",
            json!({"takeId": unique("no-such-take"), "startSeconds": 0.0, "lengthSeconds": 1.0}),
        ),
        "Take is not in the recording library."
    );
}

#[test]
fn daw_export_writes_tempo_map_stems_info_and_reaper_script() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let take = synthetic_take(0.5, "1800000000.000");
    let out = user_dir().join(unique("exports"));
    let report = studio.ok(
        "takes_export_daw",
        json!({"takeId": take.id, "outputDir": out.to_string_lossy()}),
    );
    let dir = PathBuf::from(report["dir"].as_str().unwrap());
    assert_eq!(dir, out.join(&take.id));

    let midi = PathBuf::from(report["midiFile"].as_str().unwrap());
    assert_eq!(midi, dir.join(format!("{}-tempo-map.mid", take.id)));
    let midi_bytes = std::fs::read(&midi).unwrap();
    assert!(midi_bytes.starts_with(b"MThd"), "SMF header");
    assert!(midi_bytes.windows(4).any(|w| w == b"MTrk"), "one track");

    let copied: Vec<PathBuf> = report["copiedStems"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| PathBuf::from(p.as_str().unwrap()))
        .collect();
    let mut names: Vec<String> = copied
        .iter()
        .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(
        names,
        ["band", "guitar-di", "master"].map(|s| format!("{}-{s}.wav", take.id))
    );
    for path in &copied {
        assert_eq!(path.parent(), Some(dir.as_path()));
        assert_eq!(
            std::fs::metadata(path).unwrap().len(),
            std::fs::metadata(&take.input).unwrap().len(),
            "{} is a byte-for-byte copy",
            path.display()
        );
    }
    assert_eq!(report["missingStems"], json!([]));

    let script = PathBuf::from(report["reaperScript"].as_str().expect("REAPER builder"));
    assert_eq!(script.parent(), Some(dir.as_path()));
    let lua = std::fs::read_to_string(&script).unwrap();
    assert!(lua.contains(&format!("{}-guitar-di.wav", take.id)), "{lua}");

    let info: Value =
        serde_json::from_slice(&std::fs::read(dir.join(format!("{}-info.json", take.id))).unwrap())
            .unwrap();
    assert_eq!(info["schemaVersion"], 1);
    assert_eq!(info["takeId"], take.id);
    assert_eq!(info["tempo"], 120.0);
    assert_eq!(info["timeSignature"], "4/4");
    assert_eq!(info["sampleRate"], RATE);
    assert_eq!(info["stems"], report["copiedStems"]);
    assert_eq!(info["missingStems"], json!([]));
    assert_eq!(info["reaperScript"], report["reaperScript"]);
    assert!(
        !info["sections"].as_array().unwrap().is_empty(),
        "markers come from the blues-12-bar chart: {}",
        info["sections"]
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&std::fs::read(dir.join("song-snapshot.json")).unwrap())
            .unwrap(),
        json!({"timeSignature": [4, 4]})
    );

    let ghost = unique("no-such-take");
    assert_eq!(
        studio.err(
            "takes_export_daw",
            json!({"takeId": ghost, "outputDir": out.to_string_lossy()})
        ),
        format!("take {ghost} is not in the library")
    );
}

#[test]
fn daw_export_reports_a_missing_stem_and_skips_the_reaper_script() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let take = synthetic_take(0.5, "1800000000.001");
    std::fs::remove_file(&take.band).unwrap();
    let out = user_dir().join(unique("exports"));
    let report = studio.ok(
        "takes_export_daw",
        json!({"takeId": take.id, "outputDir": out.to_string_lossy()}),
    );
    assert_eq!(
        report["missingStems"],
        json!([take.band.to_string_lossy()]),
        "{report}"
    );
    assert_eq!(report["copiedStems"].as_array().unwrap().len(), 2);
    assert_eq!(report["reaperScript"], Value::Null);
    assert!(Path::new(report["midiFile"].as_str().unwrap()).is_file());
}

#[test]
fn media_from_take_validates_the_take_before_mixing() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let ghost = unique("no-such-take");
    assert_eq!(
        studio.err("media_from_take", json!({"takeId": ghost})),
        format!("take {ghost} is not in the library")
    );

    let empty = synthetic_take(0.2, "1900000000.000");
    let mut meta = manifest(&empty.dir);
    meta["sampleCount"] = json!(0);
    std::fs::write(
        empty.dir.join("take.json"),
        serde_json::to_vec(&meta).unwrap(),
    )
    .unwrap();
    assert_eq!(
        studio.err("media_from_take", json!({"takeId": empty.id})),
        "Choose a take between one frame and ten minutes."
    );

    let long = synthetic_take(0.2, "1900000000.001");
    let mut meta = manifest(&long.dir);
    meta["sampleCount"] = json!(RATE as u64 * 600 + 1);
    std::fs::write(
        long.dir.join("take.json"),
        serde_json::to_vec(&meta).unwrap(),
    )
    .unwrap();
    assert_eq!(
        studio.err("media_from_take", json!({"takeId": long.id})),
        "Choose a take between one frame and ten minutes."
    );
    // Exactly ten minutes is still allowed past the length rule (it fails later on
    // the stems, which are shorter, or on a missing FFmpeg; never on the length).
    let mut meta = manifest(&long.dir);
    meta["sampleCount"] = json!(RATE as u64 * 600);
    std::fs::write(
        long.dir.join("take.json"),
        serde_json::to_vec(&meta).unwrap(),
    )
    .unwrap();
    match studio.invoke("media_from_take", json!({"takeId": long.id})) {
        Ok(asset) => assert_eq!(asset["kind"], "audio"),
        Err(e) => assert_ne!(e, "Choose a take between one frame and ten minutes."),
    }
}

#[test]
fn media_from_take_mixes_the_clean_stems_into_an_audio_asset() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let take = synthetic_take(1.5, "1900000000.002");
    let tools = studio.ok("media_tools", json!({}));
    let outcome = studio.invoke("media_from_take", json!({"takeId": take.id}));
    if tools["ready"] != true {
        // No FFmpeg on this machine: the failure names the missing tool, nothing is written.
        let err = outcome.expect_err("mixing needs FFmpeg");
        let err = err.as_str().unwrap_or_default().to_lowercase();
        assert!(err.contains("ffmpeg") || err.contains("ffprobe"), "{err}");
        return;
    }
    let asset = outcome.unwrap_or_else(|e| panic!("media_from_take failed: {e}"));
    assert_eq!(asset["kind"], "audio");
    assert_eq!(asset["schemaVersion"], 1);
    assert_eq!(asset["label"], "Clean take mix · 1900000000.002");
    let seconds = asset["seconds"].as_f64().unwrap();
    assert!(
        (seconds - 1.5).abs() < 0.1,
        "mix is as long as the take: {seconds}"
    );
    let path = PathBuf::from(asset["path"].as_str().unwrap());
    assert_eq!(path.extension().unwrap(), "wav");
    let assets = user_dir().join("music-videos").join("assets");
    assert_eq!(path.parent(), Some(assets.as_path()));
    let (mix, rate) = jam_audio::recorder::read_wav_mono(&path).unwrap();
    assert_eq!(rate, RATE);
    assert!(
        (mix.len() as f64 / RATE as f64 - 1.5).abs() < 0.1,
        "{}",
        mix.len()
    );
    // Unity sum, then FFmpeg's mono-to-stereo rematrix at the -3 dB centre pan law:
    // the 0.4 sine sits at 0.4 / sqrt(2) in each channel, not silenced and not doubled.
    let peak = mix.iter().fold(0.0f32, |m, v| m.max(v.abs()));
    assert!(
        (0.26..=0.31).contains(&peak),
        "expected 0.4 * sqrt(1/2) = 0.283, got {peak}"
    );
    let sidecar: Value =
        serde_json::from_slice(&std::fs::read(path.with_extension("json")).unwrap()).unwrap();
    assert_eq!(sidecar["id"], asset["id"]);
    assert_eq!(sidecar["path"], asset["path"]);
}

#[test]
fn a_cached_take_whose_folder_is_gone_can_still_be_deleted() {
    let studio = Studio::boot();
    let id = unique("take-gone-from-disk");
    let gone = takes_root().join(&id);
    // A cache row for a take folder that was deleted outside the app: listed
    // forever, and delete used to fail on the manifest write before reaching
    // the cache row (#88).
    let meta = jam_audio::recorder::TakeMetadata {
        id: id.clone(),
        path_input: gone.join("guitar-di.wav").to_string_lossy().into_owned(),
        ..Default::default()
    };
    studio
        .app()
        .state::<app_lib::AppState>()
        .store
        .lock()
        .insert_take(&meta)
        .unwrap();
    let listed = studio.ok("takes_list", json!({}));
    assert!(find(&listed, &id).is_some(), "ghost row is listed");
    studio.ok("takes_delete", json!({ "takeId": id }));
    let listed = studio.ok("takes_list", json!({}));
    assert!(find(&listed, &id).is_none(), "ghost row is gone");
}
