//! Original songs through the IPC layer: saving and listing song documents under the
//! user folder, loading a song into the band and transport, recording it on the
//! headless engine, the rolling capture buffer, take favourites and guitar-clip
//! auditioning. Every assertion reads a real value back: the returned document, the
//! file on disk, the engine telemetry or the take manifest.
mod common;

use common::{unique, user_dir, Studio};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Listener, Manager};

const FIXTURE: &str = include_str!("../../tests/fixtures/seams/original.json");

/// The fixture song under a fresh id: one "Verse" section of one Am bar, arranged twice.
fn song(id: &str) -> Value {
    let mut doc: Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    doc["id"] = json!(id);
    doc["body"]["chart"]["id"] = json!(format!("{id}-chart"));
    doc
}

/// A song whose chord, tempo and section name differ from every engine default.
fn distinctive_song(id: &str, chord: &str, bpm: f64) -> Value {
    let mut doc = song(id);
    doc["body"]["chart"]["defaultBpm"] = json!(bpm);
    doc["body"]["chart"]["sections"][0]["name"] = json!("Bridge");
    doc["body"]["chart"]["sections"][0]["bars"] =
        json!([[{ "chord": chord, "beats": 4 }], [{ "chord": "D", "beats": 4 }]]);
    doc["body"]["chart"]["arrangement"] = json!([{ "sectionId": "verse", "repeats": 3 }]);
    doc
}

fn clip_spec(take_id: &str, trim_end: f64) -> Value {
    json!({
        "takeId": take_id,
        "trimStart": 0.0,
        "trimEnd": trim_end,
        "startBar": 1,
        "repeats": 1,
        "gain": 1.0,
        "muted": false,
        "label": "Guitar 1"
    })
}

fn song_dir() -> PathBuf {
    user_dir().join("originals")
}

fn song_file(id: &str) -> PathBuf {
    song_dir().join(format!("{id}.json"))
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(
        &std::fs::read(path).unwrap_or_else(|e| panic!("{}: {e}", path.display())),
    )
    .unwrap_or_else(|e| panic!("{} is not JSON: {e}", path.display()))
}

fn telemetry(studio: &Studio) -> Value {
    studio.ok("audio_get_telemetry", json!({}))
}

/// Polls with a three-second deadline instead of sleeping for a fixed time.
fn wait_until(what: &str, mut ready: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(3);
    while !ready() {
        assert!(Instant::now() < deadline, "timed out waiting for {what}");
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// Loads `doc` into the band, records at least one beat on the headless engine
/// (its input is a 440 Hz sine) and returns the saved take.
fn record_take(studio: &Studio, doc: &Value, session: &str) -> Value {
    studio.ok("originals_load", json!({ "document": doc }));
    let take_id = studio.ok("originals_record", json!({ "sessionId": session }));
    wait_until("one beat of recording", || {
        let t = telemetry(studio)["transport"].clone();
        t["state"] == "playing" && t["position_beats"].as_f64() >= Some(1.0)
    });
    let take = studio.ok("recorder_stop", json!({}));
    assert_eq!(take["id"], take_id);
    take
}

/// A take manifest on disk whose audio files were never written.
fn orphan_take(id: &str) -> PathBuf {
    let dir = user_dir().join("data").join("takes").join(id);
    std::fs::create_dir_all(&dir).unwrap();
    let wav = dir.join("guitar-di.wav");
    let meta = json!({
        "id": id,
        "sessionId": "orphan",
        "timestamp": "1.000",
        "durationSecs": 1.0,
        "styleId": "rock-straight",
        "chartId": "free-time",
        "tempo": 120.0,
        "sampleCount": 48000,
        "pathInput": wav.to_string_lossy(),
        "pathBand": dir.join("band.wav").to_string_lossy(),
        "pathMaster": dir.join("master.wav").to_string_lossy(),
        "waveformPeaks": [],
        "notes": ""
    });
    std::fs::write(
        dir.join("take.json"),
        serde_json::to_vec_pretty(&meta).unwrap(),
    )
    .unwrap();
    wav
}

#[test]
fn save_returns_the_stored_document_and_writes_it_under_the_user_folder() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("song");
    let first = studio.ok("originals_save", json!({ "document": song(&id) }));
    assert_eq!(first["id"], id);
    assert_eq!(first["revision"], 1, "write_document bumps the revision");
    assert_eq!(first["customNote"], "keep me", "unknown fields survive");
    assert_eq!(
        first["body"]["sections"]["verse"]["parts"][0]["locked"],
        false
    );
    assert_eq!(
        first["body"]["chart"]["sections"][0]["bars"][0][0]["chord"],
        "Am"
    );
    assert_eq!(read_json(&song_file(&id)), first);

    let mut edited = first.clone();
    edited["body"]["lyrics"] = json!({ "verse": "First line of the verse" });
    let second = studio.ok("originals_save", json!({ "document": edited }));
    assert_eq!(second["revision"], 2);
    assert_eq!(second["body"]["lyrics"]["verse"], "First line of the verse");
    assert_eq!(second["customNote"], "keep me");
    assert_eq!(read_json(&song_file(&id)), second);
    assert_eq!(
        read_json(&song_file(&id).with_extension("json.bak")),
        first,
        "the previous revision is kept as a backup"
    );
    assert!(!song_file(&id).with_extension("json.tmp").exists());
}

#[test]
fn save_checks_the_revision_against_the_file_on_disk() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let moved = unique("moved");
    let mut doc = song(&moved);
    doc["revision"] = json!(1);
    assert_eq!(
        studio.err("originals_save", json!({ "document": doc })),
        "The song file was moved. Save a copy to keep your edits."
    );
    assert!(!song_file(&moved).exists());

    let id = unique("song");
    let first = studio.ok("originals_save", json!({ "document": song(&id) }));
    let current = studio.ok("originals_save", json!({ "document": first.clone() }));
    assert_eq!(current["revision"], 2);
    let mut stale = first;
    stale["body"]["lyrics"] = json!({ "verse": "typed in a second window" });
    assert_eq!(
        studio.err("originals_save", json!({ "document": stale })),
        "This song changed in another window. Reopen it before saving."
    );
    let on_disk = read_json(&song_file(&id));
    assert_eq!(on_disk["revision"], 2);
    assert_eq!(
        on_disk["body"]["lyrics"],
        Value::Null,
        "the stale edit never reached the disk"
    );
}

#[test]
fn save_refuses_invalid_ids_without_touching_the_disk() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    for id in ["../escape", "my song", "", "sång", &"a".repeat(101)] {
        assert_eq!(
            studio.err("originals_save", json!({ "document": song(id) })),
            "Invalid song or take id.",
            "id {id:?}"
        );
    }
    let longest = "a".repeat(100);
    assert_eq!(
        studio.ok("originals_save", json!({ "document": song(&longest) }))["id"],
        longest,
        "100 characters is the longest accepted id"
    );
    assert!(song_file(&longest).exists());
    assert!(!user_dir().join("escape.json").exists());
    assert!(!song_dir().join("escape.json").exists());
    assert!(!song_dir().join("my song.json").exists());
    assert!(!song_dir().join(".json").exists());

    let mut no_id = song(&unique("song"));
    no_id["id"] = Value::Null;
    assert_eq!(
        studio.err("originals_save", json!({ "document": no_id })),
        "Song id missing"
    );
    let mut no_revision = song(&unique("song"));
    no_revision["revision"] = json!("1");
    assert_eq!(
        studio.err("originals_save", json!({ "document": no_revision })),
        "Song revision missing"
    );
    assert!(studio
        .err("originals_save", json!({ "document": "not an object" }))
        .contains("Song id missing"));
}

#[test]
fn save_enforces_the_songwriting_scope_bounds() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    const SCOPE: &str =
        "Songwriting supports 4/4, 40–240 BPM, up to 64 sections and 16 guitar clips.";
    let refused = |edit: fn(&mut Value)| {
        let mut doc = song(&unique("song"));
        edit(&mut doc);
        studio.err("originals_save", json!({ "document": doc }))
    };
    let accepted = |edit: fn(&mut Value)| {
        let mut doc = song(&unique("song"));
        edit(&mut doc);
        studio.ok("originals_save", json!({ "document": doc }))
    };

    assert_eq!(
        refused(|d| d["body"]["chart"]["timeSig"] = json!([3, 4])),
        SCOPE
    );
    assert_eq!(
        refused(|d| d["body"]["chart"]["defaultBpm"] = json!(39.99)),
        SCOPE
    );
    assert_eq!(
        refused(|d| d["body"]["chart"]["defaultBpm"] = json!(240.01)),
        SCOPE
    );
    assert_eq!(
        accepted(|d| d["body"]["chart"]["defaultBpm"] = json!(40))["body"]["chart"]["defaultBpm"],
        40
    );
    assert_eq!(
        accepted(|d| d["body"]["chart"]["defaultBpm"] = json!(240))["body"]["chart"]["defaultBpm"],
        240
    );
    assert_eq!(
        refused(|d| d["body"]["chart"]["arrangement"][0]["repeats"] = json!(0)),
        SCOPE
    );
    assert_eq!(
        refused(|d| d["body"]["chart"]["arrangement"][0]["repeats"] = json!(65)),
        SCOPE
    );

    let clip = clip_spec("some-take", 1.0);
    let sixteen: Vec<Value> = (0..16).map(|_| clip.clone()).collect();
    let seventeen: Vec<Value> = (0..17).map(|_| clip.clone()).collect();
    let mut doc = song(&unique("song"));
    doc["body"]["clips"] = Value::Array(sixteen);
    assert_eq!(
        studio.ok("originals_save", json!({ "document": doc }))["body"]["clips"]
            .as_array()
            .map(Vec::len),
        Some(16)
    );
    let mut doc = song(&unique("song"));
    doc["body"]["clips"] = Value::Array(seventeen);
    assert_eq!(
        studio.err("originals_save", json!({ "document": doc })),
        SCOPE
    );

    // Two bars per section, arranged 64 + 64 times, is exactly the 256-bar ceiling.
    let two_bars = json!([[{ "chord": "Am", "beats": 4 }], [{ "chord": "E7", "beats": 4 }]]);
    let mut doc = song(&unique("song"));
    doc["body"]["chart"]["sections"][0]["bars"] = two_bars.clone();
    doc["body"]["chart"]["arrangement"] = json!([
        { "sectionId": "verse", "repeats": 64 },
        { "sectionId": "verse", "repeats": 64 }
    ]);
    assert_eq!(
        studio.ok("originals_save", json!({ "document": doc }))["revision"],
        1
    );
    let mut doc = song(&unique("song"));
    doc["body"]["chart"]["sections"][0]["bars"] = two_bars;
    doc["body"]["chart"]["arrangement"] = json!([
        { "sectionId": "verse", "repeats": 64 },
        { "sectionId": "verse", "repeats": 64 },
        { "sectionId": "verse", "repeats": 1 }
    ]);
    assert_eq!(
        studio.err("originals_save", json!({ "document": doc })),
        "Keep the song within 256 bars."
    );

    assert_eq!(
        refused(|d| d["body"]["chart"]["sections"][0]["bars"][0][0]["beats"] = json!(0)),
        "Invalid chord or beat count."
    );
    assert_eq!(
        refused(|d| d["schemaVersion"] = json!(2)),
        "Unsupported song version. Update the app before editing this file."
    );
    let no_chart = refused(|d| {
        d["body"].as_object_mut().unwrap().remove("chart");
    });
    assert!(
        no_chart.starts_with("Song: ") && no_chart.contains("chart"),
        "{no_chart}"
    );
}

#[test]
fn save_checks_lyrics_and_band_settings() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    const LYRICS: &str = "Lyrics must belong to a song section and stay within 12,000 characters.";
    const BAND: &str = "Check section swing, intensity and volumes.";
    let refused = |edit: fn(&mut Value)| {
        let mut doc = song(&unique("song"));
        edit(&mut doc);
        studio.err("originals_save", json!({ "document": doc }))
    };

    assert_eq!(
        refused(|d| d["body"]["lyrics"] = json!({ "chorus": "no such section" })),
        LYRICS
    );
    assert_eq!(
        refused(|d| d["body"]["lyrics"] = json!({ "verse": "x".repeat(12_001) })),
        LYRICS
    );
    let mut doc = song(&unique("song"));
    doc["body"]["lyrics"] = json!({ "verse": "y".repeat(12_000) });
    let saved = studio.ok("originals_save", json!({ "document": doc }));
    assert_eq!(
        saved["body"]["lyrics"]["verse"].as_str().map(str::len),
        Some(12_000)
    );
    assert_eq!(
        read_json(&song_file(saved["id"].as_str().unwrap()))["body"]["lyrics"]["verse"]
            .as_str()
            .map(str::len),
        Some(12_000)
    );

    assert_eq!(
        refused(|d| d["body"]["sections"] = json!({})),
        "Missing band settings for Verse"
    );
    assert_eq!(
        refused(|d| d["body"]["sections"]["verse"]["swing"] = json!(0.76)),
        BAND
    );
    assert_eq!(
        refused(|d| d["body"]["sections"]["verse"]["swing"] = json!(0.49)),
        BAND
    );
    assert_eq!(
        refused(|d| d["body"]["sections"]["verse"]["parts"][1]["gain"] = json!(2.01)),
        BAND
    );
    assert_eq!(
        refused(|d| d["body"]["sections"]["verse"]["parts"][2]["intensity"] = json!(1.01)),
        BAND
    );
    assert_eq!(
        refused(|d| d["body"]["sections"]["verse"]["parts"][0]["intensity"] = json!(-0.01)),
        BAND
    );
    let mut doc = song(&unique("song"));
    doc["body"]["sections"]["verse"]["swing"] = json!(0.75);
    doc["body"]["sections"]["verse"]["parts"][1]["gain"] = json!(2.0);
    assert_eq!(
        studio.ok("originals_save", json!({ "document": doc }))["body"]["sections"]["verse"]
            ["swing"],
        0.75
    );
    let two_parts = refused(|d| {
        d["body"]["sections"]["verse"]["parts"]
            .as_array_mut()
            .unwrap()
            .pop();
    });
    assert!(two_parts.starts_with("Song: "), "{two_parts}");
}

#[test]
fn list_returns_saved_songs_and_reports_a_corrupt_file_once_per_session() {
    let _scenario = common::scenario();
    let writer = Studio::boot();
    let id = unique("song");
    let saved = writer.ok("originals_save", json!({ "document": song(&id) }));
    let broken_name = format!("{}.json", unique("broken"));
    std::fs::create_dir_all(song_dir()).unwrap();
    std::fs::write(song_dir().join(&broken_name), b"broken").unwrap();

    // A fresh studio has not warned about anything yet.
    let studio = Studio::boot();
    let errors: Arc<Mutex<Vec<String>>> = Arc::default();
    let sink = Arc::clone(&errors);
    studio.app().listen_any("app:error", move |event| {
        sink.lock().unwrap().push(event.payload().to_string());
    });

    let first = studio.ok("originals_list", json!({}));
    let listed: Vec<&Value> = first
        .as_array()
        .unwrap()
        .iter()
        .filter(|d| d["id"] == id)
        .collect();
    assert_eq!(
        listed,
        vec![&saved],
        "the saved document is listed verbatim"
    );
    assert!(first
        .as_array()
        .unwrap()
        .iter()
        .all(|d| d["id"].is_string()));
    let after_first = errors.lock().unwrap().clone();
    let about_broken: Vec<&String> = after_first
        .iter()
        .filter(|e| e.contains(&broken_name))
        .collect();
    assert_eq!(
        about_broken.len(),
        1,
        "one warning for the damaged file: {after_first:?}"
    );
    assert!(
        about_broken[0].contains("Cannot read"),
        "{}",
        about_broken[0]
    );
    assert!(
        about_broken[0].contains("this file was left intact"),
        "{}",
        about_broken[0]
    );

    let second = studio.ok("originals_list", json!({}));
    assert_eq!(
        second
            .as_array()
            .unwrap()
            .iter()
            .filter(|d| d["id"] == id)
            .count(),
        1
    );
    assert_eq!(
        *errors.lock().unwrap(),
        after_first,
        "a second refresh in the same session repeats no warning"
    );
    assert_eq!(
        std::fs::read(song_dir().join(&broken_name)).unwrap(),
        b"broken"
    );
}

#[test]
fn load_puts_the_song_chart_into_the_band_and_the_transport() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("song");
    let doc = distinctive_song(&id, "F#m7", 133.0);
    let saved = studio.ok("originals_save", json!({ "document": doc }));
    assert_ne!(telemetry(&studio)["band"]["current_chord"], "F#m7");

    studio.ok("originals_load", json!({ "document": saved }));
    wait_until("the band to show the song chord", || {
        telemetry(&studio)["band"]["current_chord"] == "F#m7"
    });
    let tel = telemetry(&studio);
    assert_eq!(tel["band"]["next_chord"], "D");
    assert_eq!(tel["band"]["current_section"], "Bridge");
    assert_eq!(tel["band"]["follow_energy"], false);
    assert_eq!(tel["transport"]["state"], "stopped");
    assert_eq!(tel["transport"]["bpm"], 133.0);
    assert_eq!(tel["transport"]["time_signature"], json!([4, 4]));
    assert_eq!(tel["transport"]["loop_enabled"], false);
    assert_eq!(tel["transport"]["loop_start_bar"], 1);
    assert_eq!(
        tel["transport"]["loop_end_bar"], 7,
        "three repeats of two bars"
    );

    let state = studio.app().state::<app_lib::AppState>();
    let snapshot = state.engine.lock().song_snapshot.clone();
    assert_eq!(snapshot["id"], id);
    assert_eq!(snapshot["revision"], 1);
    assert!(
        snapshot.get("versions").is_none(),
        "version history stays out of takes"
    );
    assert!(state.engine.lock().clips.lock().is_empty());
    let rig = state.rig.lock();
    assert!(rig.song_mappings.as_ref().is_some_and(|m| m.is_empty()));
}

#[test]
fn load_refuses_songs_the_band_cannot_play_and_keeps_the_previous_song() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("song");
    studio.ok(
        "originals_load",
        json!({ "document": distinctive_song(&id, "Bb", 90.0) }),
    );
    wait_until("the first song", || {
        telemetry(&studio)["band"]["current_chord"] == "Bb"
    });

    let refused = |edit: fn(&mut Value)| {
        let mut doc = song(&unique("song"));
        edit(&mut doc);
        studio.err("originals_load", json!({ "document": doc }))
    };
    let no_chart = refused(|d| {
        d["body"].as_object_mut().unwrap().remove("chart");
    });
    assert!(
        no_chart.starts_with("Song: ") && no_chart.contains("chart"),
        "{no_chart}"
    );
    assert_eq!(
        refused(|d| d["body"]["sections"]["verse"]["parts"][0]["styleId"] = json!("no-such-style")),
        "unknown style \"no-such-style\""
    );
    assert_eq!(
        refused(|d| d["body"]["sections"]["verse"]["parts"][2]["styleId"] = json!("ballad-68")),
        "Choose 4/4 styles for this original song."
    );
    assert_eq!(
        refused(|d| d["body"]["toneProfileId"] = json!("headrush-pedalboard")),
        "Open the headrush-pedalboard profile and a MIDI output in Rig, or switch off song tone changes."
    );
    let ghost = unique("ghost");
    let mut doc = song(&unique("song"));
    doc["body"]["clips"] = json!([clip_spec(&ghost, 1.0)]);
    assert_eq!(
        studio.err("originals_load", json!({ "document": doc })),
        format!("take {ghost} is not in the library")
    );
    let mut doc = song(&unique("song"));
    doc["body"]["clips"] = json!([clip_spec("../escape", 1.0)]);
    assert_eq!(
        studio.err("originals_load", json!({ "document": doc })),
        "Invalid song or take id."
    );
    assert!(studio.err("originals_load", json!({})).contains("document"));

    let tel = telemetry(&studio);
    assert_eq!(tel["band"]["current_chord"], "Bb");
    assert_eq!(tel["transport"]["bpm"], 90.0);
    let state = studio.app().state::<app_lib::AppState>();
    assert_eq!(state.engine.lock().song_snapshot["id"], id);
}

#[test]
fn record_on_the_headless_engine_writes_a_take_with_the_song_snapshot() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("song");
    let saved = studio.ok(
        "originals_save",
        json!({ "document": distinctive_song(&id, "G", 120.0) }),
    );
    studio.ok("originals_load", json!({ "document": saved }));
    let session = unique("session");
    let take_id = studio.ok("originals_record", json!({ "sessionId": session }));
    assert!(
        take_id.as_str().is_some_and(|t| t.starts_with("take-")),
        "{take_id}"
    );
    assert_eq!(
        studio.err("originals_record", json!({ "sessionId": "again" })),
        "Save the current take first."
    );
    assert_eq!(
        studio.err("transport_set_tempo", json!({ "bpm": 100.0 })),
        "Save the take before changing playback or timing."
    );
    assert_eq!(
        studio.err(
            "originals_load",
            json!({ "document": song(&unique("song")) })
        ),
        "Save the recording before changing the song."
    );
    wait_until("one beat of recording", || {
        let t = telemetry(&studio)["transport"].clone();
        t["state"] == "playing" && t["position_beats"].as_f64() >= Some(1.0)
    });
    let tel = telemetry(&studio)["transport"].clone();
    assert_eq!(
        tel["count_in_bars"], 0,
        "song recording starts at bar 1 without a count-in"
    );
    assert_eq!(tel["bpm"], 120.0);

    let take = studio.ok("recorder_stop", json!({}));
    assert_eq!(take["id"], take_id);
    assert_eq!(take["sessionId"], session);
    assert_eq!(take["chartId"], format!("{id}-chart"));
    assert_eq!(take["tempo"], 120.0);
    assert_eq!(take["sampleRate"], 48000);
    assert!(
        take["sampleCount"].as_u64() >= Some(20_000),
        "{}",
        take["sampleCount"]
    );
    assert_eq!(take["snapshot"]["id"], id);
    assert_eq!(take["snapshot"]["timeSignature"], json!([4, 4]));
    assert!(take["snapshot"].get("versions").is_none());
    assert_eq!(take["stems"].as_object().map(|s| s.len()), Some(6));
    let input = PathBuf::from(take["pathInput"].as_str().unwrap());
    assert!(
        input.starts_with(user_dir().join("data").join("takes")),
        "{}",
        input.display()
    );
    let (samples, rate) = jam_audio::recorder::read_wav_mono(&input).unwrap();
    assert_eq!(rate, 48000);
    assert_eq!(samples.len() as u64, take["sampleCount"].as_u64().unwrap());
    assert!(
        samples.iter().any(|s| s.abs() > 0.1),
        "the headless sine input reached the DI stem"
    );
    let manifest = read_json(&input.parent().unwrap().join("take.json"));
    assert_eq!(manifest["id"], take_id);
    assert_eq!(manifest["snapshot"]["id"], id);
    assert!(studio
        .ok("takes_list", json!({}))
        .as_array()
        .unwrap()
        .iter()
        .any(|t| t["id"] == take_id));
    assert_eq!(
        studio.err("recorder_stop", json!({})),
        "No active recording"
    );
}

#[test]
fn record_without_a_loaded_song_records_the_default_band() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let take_id = studio.ok("originals_record", json!({ "sessionId": "free-play" }));
    wait_until("playback", || {
        telemetry(&studio)["transport"]["state"] == "playing"
    });
    let take = studio.ok("recorder_stop", json!({}));
    assert_eq!(take["id"], take_id);
    assert_eq!(take["chartId"], "blues-12-bar");
    assert_eq!(take["styleId"], "blues-shuffle");
    assert_eq!(take["tempo"], 120.0);
    assert_eq!(take["snapshot"], json!({ "timeSignature": [4, 4] }));
    assert!(take["sampleCount"].as_u64() > Some(0));
    studio.ok("transport_stop", json!({}));
}

#[test]
fn favourite_marks_the_take_manifest_on_disk_and_rejects_unknown_takes() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let take = record_take(&studio, &song(&unique("song")), &unique("session"));
    let take_id = take["id"].as_str().unwrap().to_string();
    assert!(take.get("favourite").is_none());
    let manifest = Path::new(take["pathInput"].as_str().unwrap()).with_file_name("take.json");

    let marked = studio.ok(
        "takes_favourite",
        json!({ "takeId": take_id, "favourite": true }),
    );
    assert_eq!(marked["id"], take_id);
    assert_eq!(marked["favourite"], true);
    assert_eq!(marked["sessionId"], take["sessionId"]);
    assert_eq!(read_json(&manifest)["favourite"], true);
    let listed = studio.ok("takes_list", json!({}));
    let entry = listed
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["id"] == take_id)
        .unwrap();
    assert_eq!(entry["favourite"], true);

    let cleared = studio.ok(
        "takes_favourite",
        json!({ "takeId": take_id, "favourite": false }),
    );
    assert_eq!(cleared["favourite"], false);
    assert_eq!(read_json(&manifest)["favourite"], false);

    let unknown = unique("nope");
    assert_eq!(
        studio.err(
            "takes_favourite",
            json!({ "takeId": unknown, "favourite": true })
        ),
        format!("take {unknown} is not in the library")
    );
    assert!(studio
        .err(
            "takes_favourite",
            json!({ "takeId": take_id, "favourite": "yes" })
        )
        .contains("favourite"));
    assert_eq!(
        read_json(&manifest)["favourite"],
        false,
        "refusals leave the manifest alone"
    );
}

#[test]
fn capture_arm_bounds_the_rolling_buffer_and_keep_saves_an_idea() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let state = studio.app().state::<app_lib::AppState>();
    let armed_seconds = || state.engine.lock().capture.lock().seconds;

    assert_eq!(
        studio.ok("capture_arm", json!({ "seconds": 0 })),
        Value::Null
    );
    assert_eq!(armed_seconds(), 0);
    assert_eq!(
        studio.err("capture_keep", json!({ "sessionId": "ideas" })),
        "Arm capture, then play something first."
    );
    studio.ok("capture_arm", json!({ "seconds": 60 }));
    assert_eq!(armed_seconds(), 60);
    for huge in [61, 3600, u32::MAX] {
        assert_eq!(
            studio.err("capture_arm", json!({ "seconds": huge })),
            "Capture length must be 0–60 seconds.",
            "{huge}"
        );
    }
    assert!(studio
        .err("capture_arm", json!({ "seconds": -1 }))
        .contains("seconds"));
    assert!(studio
        .err("capture_arm", json!({ "seconds": 1.5 }))
        .contains("seconds"));
    assert_eq!(
        armed_seconds(),
        60,
        "refused lengths leave the buffer armed as before"
    );

    studio.ok("capture_arm", json!({ "seconds": 1 }));
    wait_until("the render thread to fill the buffer", || {
        state.engine.lock().capture.lock().snapshot().is_ok()
    });
    let session = unique("ideas");
    let idea = studio.ok("capture_keep", json!({ "sessionId": session }));
    assert_eq!(idea["sessionId"], session);
    assert_eq!(idea["styleId"], "captured-idea");
    assert_eq!(idea["chartId"], "free-time");
    assert_eq!(idea["snapshot"], json!({ "capture": true }));
    let frames = idea["sampleCount"].as_u64().unwrap();
    assert!(
        (1..=48_000).contains(&frames),
        "one second at 48 kHz holds {frames} frames"
    );
    let input = PathBuf::from(idea["pathInput"].as_str().unwrap());
    let (samples, _) = jam_audio::recorder::read_wav_mono(&input).unwrap();
    assert_eq!(samples.len() as u64, frames);
    assert!(studio
        .ok("takes_list", json!({}))
        .as_array()
        .unwrap()
        .iter()
        .any(|t| t["id"] == idea["id"]));

    studio.ok("capture_arm", json!({ "seconds": 0 }));
    assert_eq!(
        studio.err("capture_keep", json!({ "sessionId": "ideas" })),
        "Arm capture, then play something first.",
        "disarming forgets the buffered audio"
    );
}

#[test]
fn audition_plays_a_trimmed_clip_of_a_take_and_checks_its_spec() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let take = record_take(&studio, &song(&unique("song")), &unique("session"));
    let take_id = take["id"].as_str().unwrap().to_string();
    let duration = take["durationSecs"].as_f64().unwrap();
    assert!(duration >= 0.4, "{duration}");
    let state = studio.app().state::<app_lib::AppState>();
    assert!(state.engine.lock().audition.lock().is_none());
    assert_eq!(
        telemetry(&studio)["transport"]["state"],
        "playing",
        "the transport keeps running after the take is saved"
    );

    studio.ok(
        "clip_audition",
        json!({ "spec": clip_spec(&take_id, duration) }),
    );
    let previewing = state
        .engine
        .lock()
        .audition
        .lock()
        .as_ref()
        .map(|a| a.clip.spec.clone());
    let previewing = previewing.expect("a preview voice is playing");
    assert_eq!(previewing.take_id, take_id);
    assert_eq!(previewing.trim_end, duration);
    wait_until("the transport to stop for the preview", || {
        telemetry(&studio)["transport"]["state"] == "stopped"
    });

    const SPEC: &str = "Check the clip trim, bar, repeats and volume.";
    let refused = |edit: &dyn Fn(&mut Value)| {
        let mut spec = clip_spec(&take_id, duration);
        edit(&mut spec);
        studio.err("clip_audition", json!({ "spec": spec }))
    };
    assert_eq!(refused(&|s| s["trimEnd"] = json!(duration + 1.0)), SPEC);
    assert_eq!(refused(&|s| s["trimStart"] = json!(duration)), SPEC);
    assert_eq!(refused(&|s| s["startBar"] = json!(0)), SPEC);
    assert_eq!(refused(&|s| s["repeats"] = json!(65)), SPEC);
    assert_eq!(refused(&|s| s["gain"] = json!(2.5)), SPEC);
    let unknown = unique("nope");
    assert_eq!(
        studio.err("clip_audition", json!({ "spec": clip_spec(&unknown, 1.0) })),
        format!("take {unknown} is not in the library")
    );
    assert_eq!(
        studio.err(
            "clip_audition",
            json!({ "spec": clip_spec("../escape", 1.0) })
        ),
        "Invalid song or take id."
    );
    assert!(studio
        .err("clip_audition", json!({ "spec": { "takeId": take_id } }))
        .contains("spec"));

    studio.ok("originals_record", json!({ "sessionId": "second" }));
    assert_eq!(
        studio.err(
            "clip_audition",
            json!({ "spec": clip_spec(&take_id, duration) })
        ),
        "Save the recording before listening to another take."
    );
    studio.ok("recorder_stop", json!({}));
    studio.ok("transport_stop", json!({}));
}

#[test]
fn audition_of_a_take_whose_audio_file_is_missing_fails_and_keeps_the_take_listed() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("orphan");
    let wav = orphan_take(&id);
    assert!(!wav.exists());
    let err = studio.err("clip_audition", json!({ "spec": clip_spec(&id, 1.0) }));
    assert!(!err.is_empty());
    let state = studio.app().state::<app_lib::AppState>();
    assert!(
        state.engine.lock().audition.lock().is_none(),
        "no preview voice for missing audio"
    );
    let listed = studio.ok("takes_list", json!({}));
    let entry = listed.as_array().unwrap().iter().find(|t| t["id"] == id);
    assert!(entry.is_some_and(|t| t["pathInput"].as_str() == wav.to_str()));
}

#[test]
fn audition_of_a_take_whose_audio_file_is_missing_names_the_take_or_file() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("orphan");
    orphan_take(&id);
    let err = studio.err("clip_audition", json!({ "spec": clip_spec(&id, 1.0) }));
    assert!(err.contains(&id) || err.contains("guitar-di.wav"), "{err}");
}

#[test]
fn save_refuses_a_document_without_a_version_list() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("song");
    let mut doc = song(&id);
    doc.as_object_mut().unwrap().remove("versions");
    let err = studio.err("originals_save", json!({ "document": doc }));
    assert!(err.contains("version"), "{err}");
    assert!(!song_file(&id).exists());
}

#[test]
fn invalid_version_lists_do_not_overwrite_a_saved_song() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("song");
    let saved = studio.ok("originals_save", json!({"document": song(&id)}));
    let before = std::fs::read(song_file(&id)).unwrap();
    for versions in [Value::Null, json!({}), json!("bad"), json!(1)] {
        let mut doc = saved.clone();
        doc["versions"] = versions;
        let err = studio.err("originals_save", json!({"document": doc}));
        assert!(err.contains("version"), "{err}");
        assert_eq!(std::fs::read(song_file(&id)).unwrap(), before);
    }
    let listed = studio.ok("originals_list", json!({}));
    assert!(listed.as_array().unwrap().iter().any(|doc| doc == &saved));
}
