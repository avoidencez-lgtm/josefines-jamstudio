//! Rig, foot controller and media through the IPC layer: the bundled rig profiles,
//! scene, knob and program changes logged by the monitor while no MIDI port is open,
//! section mappings and follow-sections persisted to settings.json, the pedal
//! configuration round trip on disk, and the file-backed music-video library
//! (projects, jobs, warnings) without FFmpeg or a provider. MIDI hardware is never
//! assumed: port listing may return an empty list or a subsystem error, and the
//! tests accept both while asserting the shape of each answer.
mod common;

use common::{unique, user_dir, Studio};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

const NO_PORT: &str = "no MIDI port open (messages are only logged)";

#[test]
fn native_song_import_normalizes_preserves_and_loads_audio_without_external_tools() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    assert!(studio.err("song_pick_file", json!({})).contains("headless"));
    let source = user_dir().join(format!("{}.wav", unique("mono-import")));
    let mut wav = hound::WavWriter::create(
        &source,
        hound::WavSpec {
            channels: 1,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .unwrap();
    for _ in 0..44100 {
        wav.write_sample(4096i16).unwrap();
    }
    wav.finalize().unwrap();
    let before = std::fs::read(&source).unwrap();
    let invalid_id = unique("invalid-duration");
    let invalid = media_root()
        .join("assets")
        .join(format!("{invalid_id}.json"));
    std::fs::create_dir_all(invalid.parent().unwrap()).unwrap();
    let legacy_source = invalid.with_extension("wav");
    std::fs::copy(&source, &legacy_source).unwrap();
    std::fs::write(&invalid, serde_json::to_vec(&json!({"schemaVersion":1,"id":invalid_id,"kind":"audio","path":legacy_source,"seconds":0.0,"label":"Invalid duration"})).unwrap()).unwrap();
    assert_eq!(
        studio.err("media_store_song", json!({"assetId":invalid_id})),
        "Choose an audio reference up to twenty minutes."
    );
    std::fs::remove_file(invalid).unwrap();
    std::fs::remove_file(legacy_source).unwrap();
    let asset = studio.ok("media_import", json!({"path":source,"kind":"audio"}));
    assert_eq!(asset["seconds"], 1.0);
    let saved = Path::new(asset["path"].as_str().unwrap());
    let folder = saved.parent().unwrap();
    assert_eq!(saved.file_name().unwrap(), "source.wav");
    assert_eq!(std::fs::read(folder.join("original.wav")).unwrap(), before);
    assert_eq!(std::fs::read(&source).unwrap(), before);
    let normalized = hound::WavReader::open(saved).unwrap();
    assert_eq!(normalized.spec().sample_rate, 48000);
    assert_eq!(normalized.spec().channels, 2);
    assert_eq!(normalized.duration(), 48000);
    let doc = read_json(&folder.join("song.json"));
    assert_eq!(doc["durationMs"], 1000.0);
    assert_eq!(doc["sourceHash"].as_str().unwrap().len(), 64);
    studio.ok("media_reference_load", json!({"assetId":asset["id"]}));
    assert_eq!(
        studio.ok("audio_get_telemetry", json!({}))["reference"]["asset_id"],
        asset["id"]
    );
    let state = studio.app().state::<app_lib::AppState>();
    state
        .engine
        .lock()
        .recorder_start("import-guard".into())
        .unwrap();
    assert!(studio
        .err("media_import", json!({"path":source,"kind":"audio"}))
        .contains("Save the take"));
    state.engine.lock().recorder_stop().unwrap();
    studio.ok("media_reference_unload", json!({}));
    std::fs::remove_dir_all(folder).unwrap();
    std::fs::remove_file(source).unwrap();
}

#[test]
fn reference_sections_use_native_downbeats_and_record_the_confirmed_grid() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let state = studio.app().state::<app_lib::AppState>();
    let grid: jam_audio::song::grid::Grid = serde_json::from_str(include_str!(
        "../../tests/fixtures/seams/reference-grid.json"
    ))
    .unwrap();
    let mut song = jam_audio::song::ReferenceSong::new(
        "grid-fixture".into(),
        "Fixture".into(),
        vec![0.1; 480_000],
    )
    .unwrap();
    song.set_grid(grid).unwrap();
    state.engine.lock().load_reference(song).unwrap();
    studio.err(
        "media_reference_loop_section",
        json!({"assetId":"stale","sectionId":"chorus"}),
    );
    studio.err(
        "media_reference_loop_section",
        json!({"assetId":"grid-fixture","sectionId":"missing"}),
    );
    studio.ok(
        "media_reference_loop_section",
        json!({"assetId":"grid-fixture","sectionId":"chorus"}),
    );
    let before = studio.ok("audio_get_telemetry", json!({}));
    assert_eq!(before["reference"]["loop_start"], 2.2);
    assert_eq!(before["reference"]["loop_end"], 4.6);
    assert_eq!(before["reference"]["grid"]["bars"], 2);
    assert_eq!(
        before["reference"]["grid"]["position"]["section_id"],
        "chorus"
    );
    state
        .engine
        .lock()
        .recorder_start("grid-fixture".into())
        .unwrap();
    studio.err(
        "media_reference_loop_section",
        json!({"assetId":"grid-fixture","sectionId":"verse"}),
    );
    let take = state.engine.lock().recorder_stop().unwrap();
    assert_eq!(take.snapshot["beatGrid"]["origin"], "confirmed-local");
    assert_eq!(take.snapshot["beatGrid"]["beats"][4], 2.2);
    assert_eq!(take.snapshot["beatGrid"]["sections"][1]["label"], "Chorus");
    studio.ok("media_reference_unload", json!({}));
    studio.err("media_reference_grid_save",json!({"assetId":"missing","confirmation":{"sourceHash":"stale","expectedBeats":[],"firstDownbeat":0,"beatsPerBar":4,"sections":[],"confirmed":false}}));
}

#[test]
fn reference_processing_preserves_partial_settings_metadata_and_rejects_stale_sources() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("reference-practice");
    let folder = app_lib::media::root().join("assets");
    std::fs::create_dir_all(&folder).unwrap();
    let source = folder.join(format!("{id}.wav"));
    let manifest = folder.join(format!("{id}.json"));
    // The decoded source comes through the native test seam; FFmpeg reload is
    // covered separately by the opt-in media scenario.
    std::fs::write(&source, b"source must stay unchanged").unwrap();
    std::fs::write(&manifest, serde_json::to_vec(&json!({"schemaVersion":1,"id":id,"kind":"audio","path":source.to_string_lossy(),"seconds":1.0,"label":"Synthetic reference","future":42,"referencePractice":{"schemaVersion":1,"future":true}})).unwrap()).unwrap();
    let state = studio.app().state::<app_lib::AppState>();
    state
        .engine
        .lock()
        .load_reference(
            jam_audio::song::ReferenceSong::new(id.clone(), "Test".into(), vec![0.1; 96_000])
                .unwrap(),
        )
        .unwrap();
    let fixture: Value = serde_json::from_str(include_str!(
        "../../tests/fixtures/seams/reference-practice.json"
    ))
    .unwrap();
    let speed = fixture["speed"]["arguments"]["speedPercent"]
        .as_f64()
        .unwrap()
        / 100.0;
    assert_eq!(
        studio.ok(
            "media_reference_processing",
            json!({"assetId":id,"speed":speed})
        ),
        json!({"speed":0.75,"semitones":0})
    );
    assert_eq!(
        studio.ok(
            "media_reference_processing",
            json!({"assetId":id,"semitones":2})
        ),
        fixture["applied"]
    );
    let saved: Value = serde_json::from_slice(&std::fs::read(&manifest).unwrap()).unwrap();
    assert_eq!(saved["future"], 42);
    assert_eq!(saved["referencePractice"]["future"], true);
    assert_eq!(saved["referencePractice"]["speed"], 0.75);
    assert_eq!(saved["referencePractice"]["semitones"], 2);
    for args in [
        json!({"assetId":"stale","speed":1}),
        json!({"assetId":id}),
        json!({"assetId":id,"speed":0.49}),
        json!({"assetId":id,"semitones":13}),
    ] {
        studio.err("media_reference_processing", args);
        assert_eq!(
            serde_json::from_slice::<Value>(&std::fs::read(&manifest).unwrap()).unwrap(),
            saved
        );
    }
    assert_eq!(
        std::fs::read(&source).unwrap(),
        b"source must stay unchanged"
    );
    assert_eq!(
        studio.ok("audio_get_telemetry", json!({}))["reference"]["speed"],
        0.75
    );
    studio.ok("media_reference_unload", json!({}));
    std::fs::remove_file(manifest).unwrap();
    std::fs::remove_file(source).unwrap();
}

#[test]
fn native_reference_uses_shared_transport_and_refuses_unanalysed_grid_edits() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    assert!(studio
        .err("media_reference_load", json!({"assetId":"../outside"}))
        .contains("Invalid media ID"));
    assert!(studio
        .err("media_reference_seek", json!({"seconds":0}))
        .contains("Load a reference"));
    let state = studio.app().state::<app_lib::AppState>();
    state
        .engine
        .lock()
        .load_reference(
            jam_audio::song::ReferenceSong::new(
                "fixture".into(),
                "Stereo fixture".into(),
                vec![0.1; 96_000],
            )
            .unwrap(),
        )
        .unwrap();
    studio.ok("transport_play", json!({}));
    assert_eq!(
        studio.ok("audio_get_telemetry", json!({}))["reference"]["state"],
        "playing"
    );
    studio.ok("transport_pause", json!({}));
    studio.ok("media_reference_seek", json!({"seconds":0.25}));
    studio.ok(
        "media_reference_loop",
        json!({"start":0.2,"end":0.5,"enabled":true}),
    );
    let tel = studio.ok("audio_get_telemetry", json!({}));
    assert_eq!(tel["reference"]["position"], 0.25);
    assert_eq!(tel["reference"]["state"], "paused");
    assert_eq!(tel["band"]["current_chord"], "");
    assert!(studio
        .err("media_reference_seek", json!({"seconds":2}))
        .contains("inside"));
    assert!(studio
        .err(
            "media_reference_loop",
            json!({"start":0.5,"end":0.2,"enabled":true})
        )
        .contains("0.1"));
    for (command, args) in [
        ("transport_set_tempo", json!({"bpm":90})),
        ("transport_seek_bar", json!({"bar":2})),
        (
            "transport_set_loop",
            json!({"startBar":1,"endBar":3,"enabled":true}),
        ),
        ("transport_set_count_in", json!({"bars":1})),
        (
            "transport_set_time_signature",
            json!({"numerator":4,"denominator":4}),
        ),
        ("metronome_set", json!({"on":true,"bpm":90})),
    ] {
        assert!(studio.err(command, args).contains("no analysed beat grid"));
    }
    studio.ok("transport_stop", json!({}));
    assert_eq!(
        studio.ok("audio_get_telemetry", json!({}))["reference"]["position"],
        0.0
    );
    studio.ok("media_reference_unload", json!({}));
    assert!(studio.ok("audio_get_telemetry", json!({}))["reference"].is_null());
    studio.ok("transport_set_tempo", json!({"bpm":90}));
    state
        .engine
        .lock()
        .load_reference(
            jam_audio::song::ReferenceSong::new(
                "second".into(),
                "Second reference".into(),
                vec![0.1; 9600],
            )
            .unwrap(),
        )
        .unwrap();
    studio.ok(
        "band_load_chart",
        json!({"chartId":"blues-12-bar","followChart":true}),
    );
    assert!(studio.ok("audio_get_telemetry", json!({}))["reference"].is_null());
}

#[test]
fn practice_copy_validates_parameters_and_source_before_running_tools() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    assert!(studio
        .err("media_analyze", json!({"assetId":"../outside"}))
        .contains("Invalid media ID"));
    assert!(studio
        .err("media_analyze", json!({"assetId":"missing"}))
        .contains("Cannot read media document"));
    for (speed, semitones) in [(0.49, 0), (1.51, 0), (1.0, 13)] {
        assert!(studio
            .err(
                "media_stretch",
                json!({"assetId":"missing", "speed":speed,"semitones":semitones})
            )
            .contains("50–150%"));
    }
    assert!(studio
        .err(
            "media_stretch",
            json!({"assetId":"../outside", "speed":0.75,"semitones":2})
        )
        .contains("Invalid media ID"));
    assert!(studio
        .err(
            "media_stretch",
            json!({"assetId":"missing", "speed":0.75,"semitones":2})
        )
        .contains("Cannot read media document"));
    assert!(!media_root().join("work").exists());
}

#[test]
fn failed_rig_persistence_keeps_the_runtime_state_unchanged() {
    struct ConnectedSink;
    impl jam_rig::MidiSink for ConnectedSink {
        fn send(&mut self, _: &[u8]) -> Result<(), String> {
            Ok(())
        }
        fn describe(&self) -> String {
            "test MIDI connection".into()
        }
        fn is_live(&self) -> bool {
            true
        }
    }
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio
        .app()
        .state::<app_lib::AppState>()
        .rig
        .lock()
        .set_sink(Box::new(ConnectedSink));
    studio.ok(
        "rig_set_section_mapping",
        json!({"section": "Verse", "sceneIdx": 1}),
    );
    let before = studio.ok("rig_get_state", json!({}));
    let path = user_dir().join("settings.json");
    let valid = std::fs::read_to_string(&path).unwrap();
    for corrupt in [true, false] {
        let original = if corrupt { "broken settings" } else { &valid };
        std::fs::write(&path, original).unwrap();
        if !corrupt {
            std::fs::create_dir(path.with_extension("json.tmp")).unwrap();
        }
        for (command, args) in [
            ("rig_set_follow_sections", json!({"enabled": false})),
            (
                "rig_set_section_mapping",
                json!({"section": "Verse", "sceneIdx": null}),
            ),
            ("rig_select_profile", json!({"profileId": "quad-cortex"})),
            ("rig_open_port", json!({"port": null})),
        ] {
            let error = studio.err(command, args);
            assert!(!error.is_empty());
            if corrupt {
                assert!(error.contains("settings.json"), "{error}");
            }
            assert_eq!(studio.ok("rig_get_state", json!({})), before, "{command}");
            assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
        }
        if !corrupt {
            std::fs::remove_dir(path.with_extension("json.tmp")).unwrap();
        }
    }
    std::fs::write(&path, valid).unwrap();
}

fn read_json(path: &Path) -> Value {
    let bytes = std::fs::read(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_slice(&bytes).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

fn settings_on_disk() -> Value {
    read_json(&user_dir().join("settings.json"))
}

fn media_root() -> PathBuf {
    user_dir().join("music-videos")
}

fn json_files(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
                .count()
        })
        .unwrap_or(0)
}

fn entries(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .map(|entries| entries.count())
        .unwrap_or(0)
}

fn binding(action: &str, kind: &str, channel: u8, number: u8) -> Value {
    json!({"action": action, "press": {"kind": kind, "channel": channel, "number": number}})
}

#[test]
fn bundled_rig_profiles_are_listed_with_their_midi_facts() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let profiles = studio.ok("rig_list_profiles", json!({}));
    let profiles = profiles.as_array().expect("a list of profiles");
    let ids: Vec<&str> = profiles.iter().map(|p| p["id"].as_str().unwrap()).collect();
    for wanted in [
        "headrush-pedalboard",
        "black-spirit-200",
        "quad-cortex",
        "helix",
        "kemper",
        "axe-fx",
    ] {
        assert!(ids.contains(&wanted), "{wanted} missing from {ids:?}");
    }
    for p in profiles {
        assert_eq!(p["schemaVersion"], 1, "{}", p["id"]);
        assert!(p["targetDevice"].is_string(), "{}", p["id"]);
        assert!(
            p["midiChannel"].as_u64().is_some_and(|c| c <= 15),
            "{}",
            p["id"]
        );
        assert!(
            p["scenes"].as_array().is_some_and(|s| !s.is_empty()),
            "{}",
            p["id"]
        );
        assert!(p["supports"]["programChange"].is_boolean(), "{}", p["id"]);
        assert!(p["supports"]["midiClock"].is_boolean(), "{}", p["id"]);
    }
    let by_id = |id: &str| profiles.iter().find(|p| p["id"] == id).unwrap();

    let headrush = by_id("headrush-pedalboard");
    assert_eq!(headrush["midiChannel"], 0);
    assert_eq!(headrush["sceneCc"], Value::Null);
    assert_eq!(headrush["scenes"].as_array().unwrap().len(), 8);
    assert_eq!(
        headrush["scenes"][1]["commands"],
        json!([{"type": "programChange", "program": 1}])
    );
    assert_eq!(headrush["supports"]["midiClock"], true);
    assert_eq!(headrush["controls"], json!([]));

    let quad = by_id("quad-cortex");
    assert_eq!(quad["sceneCc"], 43);
    assert_eq!(quad["scenes"].as_array().unwrap().len(), 8);
    assert_eq!(quad["scenes"][0]["commands"], json!([]));
    let scene_knob = quad["controls"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["cc"] == 43)
        .expect("scene knob");
    assert_eq!(scene_knob["max"], 7);
    assert_eq!(scene_knob["toggle"], false);

    let black_spirit = by_id("black-spirit-200");
    assert_eq!(black_spirit["midiChannel"], 1);
    let gain = black_spirit["controls"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["cc"] == 20)
        .expect("gain knob");
    assert_eq!(gain["name"], "Gain");
    assert_eq!(gain["default"], 64);
    assert_eq!(black_spirit["scenes"][2]["name"], "Lead");
    assert_eq!(
        black_spirit["scenes"][2]["commands"][1],
        json!({"type": "wait", "ms": 20})
    );
}

#[test]
fn selecting_a_profile_resets_scene_and_controls_and_rejects_unknown_ids() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let state = studio.ok(
        "rig_select_profile",
        json!({"profileId": "black-spirit-200"}),
    );
    assert_eq!(state["currentProfile"]["id"], "black-spirit-200");
    assert_eq!(state["currentProfile"]["midiChannel"], 1);
    assert_eq!(state["currentScene"], 0);
    assert_eq!(state["controlValues"]["20"], 64, "gain default");
    assert_eq!(state["controlValues"]["7"], 90, "volume default");
    assert_eq!(state["controlValues"]["64"], 0, "boost default");
    assert_eq!(state["controlValues"].as_object().unwrap().len(), 17);
    assert_eq!(state["followSections"], true);
    assert_eq!(state["live"], false);
    assert_eq!(state["port"], Value::Null);
    assert_eq!(state["portDescription"], NO_PORT);
    assert_eq!(state["monitor"], json!([]));
    assert_eq!(settings_on_disk()["rig"]["profile_id"], "black-spirit-200");
    assert_eq!(
        studio.ok("settings_get", json!({}))["rig"]["profile_id"],
        "black-spirit-200"
    );

    // Move one scene along so a refused switch is visibly a no-op.
    studio.ok("rig_select_scene", json!({"sceneIdx": 1}));
    let bogus = unique("no-such-rig");
    let err = studio.err("rig_select_profile", json!({"profileId": bogus}));
    assert_eq!(err, format!("unknown rig profile \"{bogus}\""));
    let after = studio.ok("rig_get_state", json!({}));
    assert_eq!(after["currentProfile"]["id"], "black-spirit-200");
    assert_eq!(after["currentScene"], 1);
    assert_eq!(settings_on_disk()["rig"]["profile_id"], "black-spirit-200");

    let headrush = studio.ok(
        "rig_select_profile",
        json!({"profileId": "headrush-pedalboard"}),
    );
    assert_eq!(headrush["currentProfile"]["id"], "headrush-pedalboard");
    assert_eq!(
        headrush["currentScene"], 0,
        "a new profile starts on its first scene"
    );
    assert_eq!(
        headrush["controlValues"],
        json!({}),
        "the HeadRush declares no knobs"
    );
    assert_eq!(
        settings_on_disk()["rig"]["profile_id"],
        "headrush-pedalboard"
    );
}

#[test]
fn selecting_a_scene_logs_its_midi_and_rejects_indices_out_of_range() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok(
        "rig_select_profile",
        json!({"profileId": "black-spirit-200"}),
    );

    // Lead: PC 2, a 20 ms wait (never logged, never slept without a port), then three CCs.
    let state = studio.ok("rig_select_scene", json!({"sceneIdx": 2}));
    assert_eq!(state["currentScene"], 2);
    let monitor = state["monitor"].as_array().unwrap();
    let bytes: Vec<&Value> = monitor.iter().map(|m| &m["bytes"]).collect();
    assert_eq!(
        bytes,
        vec![
            &json!([0xC1, 2]),
            &json!([0xB1, 9, 0]),
            &json!([0xB1, 20, 100]),
            &json!([0xB1, 64, 127]),
        ]
    );
    assert_eq!(monitor[0]["text"], "PC 2 ch2");
    assert_eq!(monitor[2]["text"], "CC 20 = 100 ch2");
    assert!(
        monitor.iter().all(|m| m["reason"] == "scene Lead"),
        "{monitor:?}"
    );
    assert!(monitor.iter().all(|m| m["live"] == false), "{monitor:?}");
    assert!(
        monitor
            .windows(2)
            .all(|w| w[0]["atMs"].as_u64() <= w[1]["atMs"].as_u64()),
        "monitor timestamps are ordered: {monitor:?}"
    );
    assert_eq!(state["controlValues"]["9"], 0);
    assert_eq!(state["controlValues"]["20"], 100, "the scene pushed gain");
    assert_eq!(state["controlValues"]["64"], 127, "the scene engaged boost");

    let err = studio.err("rig_select_scene", json!({"sceneIdx": 5}));
    assert_eq!(
        err,
        "scene 5 does not exist on Hughes & Kettner Black Spirit 200"
    );
    let err = studio.err("rig_select_scene", json!({"sceneIdx": -1}));
    assert!(err.contains("sceneIdx"), "{err}");
    let unchanged = studio.ok("rig_get_state", json!({}));
    assert_eq!(unchanged["currentScene"], 2);
    assert_eq!(unchanged["monitor"].as_array().unwrap().len(), 4);

    // The last scene is index 4 (Mute): a single CC.
    let mute = studio.ok("rig_select_scene", json!({"sceneIdx": 4}));
    assert_eq!(mute["currentScene"], 4);
    assert_eq!(mute["monitor"].as_array().unwrap().len(), 5);
    assert_eq!(mute["monitor"][4]["bytes"], json!([0xB1, 9, 127]));
    assert_eq!(mute["monitor"][4]["reason"], "scene Mute");

    let cleared = studio.ok("rig_clear_monitor", json!({}));
    assert_eq!(cleared["monitor"], json!([]));
    assert_eq!(
        cleared["currentScene"], 4,
        "clearing the log keeps the scene"
    );
    assert_eq!(
        cleared["controlValues"]["20"], 100,
        "clearing the log keeps knob values"
    );
    assert_eq!(studio.ok("rig_get_state", json!({}))["monitor"], json!([]));
}

#[test]
fn section_mappings_and_follow_sections_reach_state_and_settings() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("rig_select_profile", json!({"profileId": "quad-cortex"}));
    let section = unique("Chorus");

    let state = studio.ok(
        "rig_set_section_mapping",
        json!({"section": section, "sceneIdx": 3}),
    );
    assert_eq!(state["sectionMappings"][&section], 3);
    assert_eq!(
        studio.ok("rig_get_state", json!({}))["sectionMappings"][&section],
        3
    );
    assert_eq!(
        settings_on_disk()["rig"]["section_mappings"]["quad-cortex"][&section],
        3
    );

    let err = studio.err(
        "rig_set_section_mapping",
        json!({"section": section, "sceneIdx": 8}),
    );
    assert_eq!(err, "scene 8 does not exist on Neural DSP Quad Cortex");
    assert_eq!(
        studio.ok("rig_get_state", json!({}))["sectionMappings"][&section],
        3,
        "a refused mapping leaves the old one"
    );
    // Scene H is index 7, the last one that exists.
    let last = studio.ok(
        "rig_set_section_mapping",
        json!({"section": section, "sceneIdx": 7}),
    );
    assert_eq!(last["sectionMappings"][&section], 7);

    let cleared = studio.ok(
        "rig_set_section_mapping",
        json!({"section": section, "sceneIdx": null}),
    );
    assert!(
        cleared["sectionMappings"].get(&section).is_none(),
        "{cleared}"
    );
    assert!(
        settings_on_disk()["rig"]["section_mappings"]["quad-cortex"]
            .get(&section)
            .is_none(),
        "a cleared mapping is gone from settings.json"
    );

    let off = studio.ok("rig_set_follow_sections", json!({"enabled": false}));
    assert_eq!(off["followSections"], false);
    assert_eq!(
        studio.ok("rig_get_state", json!({}))["followSections"],
        false
    );
    assert_eq!(settings_on_disk()["rig"]["follow_sections"], false);
    let on = studio.ok("rig_set_follow_sections", json!({"enabled": true}));
    assert_eq!(on["followSections"], true);
    assert_eq!(settings_on_disk()["rig"]["follow_sections"], true);
    let err = studio.err("rig_set_follow_sections", json!({"enabled": "yes"}));
    assert!(err.contains("enabled"), "{err}");
    assert_eq!(
        studio.ok("rig_get_state", json!({}))["followSections"],
        true
    );
}

#[test]
fn switching_profiles_keeps_fitting_mappings_and_a_fresh_studio_restores_them() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("rig_select_profile", json!({"profileId": "quad-cortex"}));
    let high = unique("Solo");
    let low = unique("Verse");
    studio.ok(
        "rig_set_section_mapping",
        json!({"section": high, "sceneIdx": 7}),
    );
    studio.ok(
        "rig_set_section_mapping",
        json!({"section": low, "sceneIdx": 1}),
    );

    // The Black Spirit has five scenes: index 7 no longer fits, index 1 does.
    let state = studio.ok(
        "rig_select_profile",
        json!({"profileId": "black-spirit-200"}),
    );
    assert_eq!(state["sectionMappings"][&low], 1);
    assert!(
        state["sectionMappings"].get(&high).is_none(),
        "{}",
        state["sectionMappings"]
    );
    let saved = settings_on_disk();
    assert_eq!(saved["rig"]["profile_id"], "black-spirit-200");
    assert_eq!(
        saved["rig"]["section_mappings"]["black-spirit-200"][&low],
        1
    );
    assert_eq!(
        saved["rig"]["section_mappings"]["quad-cortex"][&high], 7,
        "the Quad Cortex keeps its own mapping for later"
    );

    let fresh = Studio::boot();
    let restored = fresh.ok("rig_get_state", json!({}));
    assert_eq!(restored["currentProfile"]["id"], "black-spirit-200");
    assert_eq!(restored["sectionMappings"][&low], 1);
    assert!(restored["sectionMappings"].get(&high).is_none());
    assert_eq!(restored["currentScene"], 0);
    assert_eq!(restored["monitor"], json!([]));
    assert_eq!(restored["live"], false);

    let back = fresh.ok("rig_select_profile", json!({"profileId": "quad-cortex"}));
    assert_eq!(back["sectionMappings"][&high], 7);
    assert_eq!(back["sectionMappings"][&low], 1);
}

#[test]
fn knobs_clamp_to_the_profile_range_and_are_logged_without_a_port() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let start = studio.ok("rig_select_profile", json!({"profileId": "quad-cortex"}));
    assert_eq!(start["controlValues"], json!({"43": 0, "44": 0, "45": 0}));
    studio.ok("rig_clear_monitor", json!({}));

    let state = studio.ok("rig_set_control", json!({"cc": 43, "value": 100}));
    assert_eq!(
        state["controlValues"]["43"], 7,
        "the scene knob is declared 0..7"
    );
    let monitor = state["monitor"].as_array().unwrap();
    assert_eq!(monitor.len(), 1);
    assert_eq!(monitor[0]["bytes"], json!([0xB0, 43, 7]));
    assert_eq!(monitor[0]["text"], "CC 43 = 7 ch1");
    assert_eq!(monitor[0]["reason"], "knob Scene (A-H)");
    assert_eq!(monitor[0]["live"], false);
    assert_eq!(state["live"], false);
    assert_eq!(state["port"], Value::Null);

    // A CC the profile does not declare is still allowed, clamped to the MIDI range.
    let state = studio.ok("rig_set_control", json!({"cc": 90, "value": 200}));
    assert_eq!(state["controlValues"]["90"], 127);
    assert_eq!(state["monitor"][1]["bytes"], json!([0xB0, 90, 127]));
    assert_eq!(state["monitor"][1]["reason"], "knob CC 90");
    // 127 is the last CC number.
    let state = studio.ok("rig_set_control", json!({"cc": 127, "value": 1}));
    assert_eq!(state["monitor"][2]["text"], "CC 127 = 1 ch1");

    let err = studio.err("rig_set_control", json!({"cc": 200, "value": 1}));
    assert_eq!(err, "CC 200 is above 127");
    let err = studio.err("rig_set_control", json!({"cc": 300, "value": 1}));
    assert!(err.contains("300"), "{err}");
    let err = studio.err("rig_set_control", json!({"cc": 43, "value": 256}));
    assert!(err.contains("256"), "{err}");
    let after = studio.ok("rig_get_state", json!({}));
    assert_eq!(
        after["monitor"].as_array().unwrap().len(),
        3,
        "refused knobs send nothing"
    );
    assert_eq!(after["controlValues"]["43"], 7);
    assert!(after["controlValues"].get("200").is_none());
}

#[test]
fn program_changes_name_the_declared_program_and_are_logged_without_a_port() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok(
        "rig_select_profile",
        json!({"profileId": "headrush-pedalboard"}),
    );
    studio.ok("rig_select_scene", json!({"sceneIdx": 1}));
    studio.ok("rig_clear_monitor", json!({}));

    let state = studio.ok("rig_send_program", json!({"program": 3}));
    let monitor = state["monitor"].as_array().unwrap();
    assert_eq!(monitor.len(), 1);
    assert_eq!(monitor[0]["bytes"], json!([0xC0, 3]));
    assert_eq!(monitor[0]["text"], "PC 3 ch1");
    assert_eq!(monitor[0]["reason"], "manual Rig 4");
    assert_eq!(monitor[0]["live"], false);
    assert_eq!(
        state["currentScene"], 1,
        "a manual program change is not a scene change"
    );
    assert_eq!(state["live"], false);

    let state = studio.ok("rig_send_program", json!({"program": 99}));
    assert_eq!(state["monitor"][1]["bytes"], json!([0xC0, 99]));
    assert_eq!(state["monitor"][1]["reason"], "manual program 99");
    // 127 is the last program number.
    let state = studio.ok("rig_send_program", json!({"program": 127}));
    assert_eq!(state["monitor"][2]["text"], "PC 127 ch1");

    let err = studio.err("rig_send_program", json!({"program": 256}));
    assert!(err.contains("256"), "{err}");
    let err = studio.err("rig_send_program", json!({"program": "three"}));
    assert!(err.contains("program"), "{err}");
    assert_eq!(
        studio.ok("rig_get_state", json!({}))["monitor"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
}

#[test]
fn rig_send_program_refuses_a_program_above_127() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok(
        "rig_select_profile",
        json!({"profileId": "headrush-pedalboard"}),
    );
    studio.ok("rig_clear_monitor", json!({}));
    let err = studio.err("rig_send_program", json!({"program": 200}));
    assert!(err.contains("200"), "{err}");
    assert_eq!(studio.ok("rig_get_state", json!({}))["monitor"], json!([]));
}

#[test]
fn midi_output_ports_and_port_commands_tolerate_a_machine_without_hardware() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let ports = studio.invoke("rig_list_ports", json!({}));
    match &ports {
        Ok(list) => {
            let list = list.as_array().expect("a list of ports");
            for port in list {
                assert!(
                    port["name"].as_str().is_some_and(|n| !n.is_empty()),
                    "{port}"
                );
            }
        }
        Err(e) => assert!(
            e.as_str()
                .is_some_and(|e| e.contains("MIDI output unavailable")),
            "{e}"
        ),
    }

    let closed = studio.ok("rig_open_port", json!({"port": null}));
    assert_eq!(closed["live"], false);
    assert_eq!(closed["port"], Value::Null);
    assert_eq!(closed["portDescription"], NO_PORT);
    assert_eq!(settings_on_disk()["rig"]["midi_port"], Value::Null);

    let bogus = unique("no-such-port");
    let err = studio.err("rig_open_port", json!({"port": bogus}));
    if ports.is_ok() {
        assert!(
            err.starts_with(&format!("MIDI port \"{bogus}\" not found. Available: ")),
            "{err}"
        );
    } else {
        assert!(err.contains("MIDI output unavailable"), "{err}");
    }
    let after = studio.ok("rig_get_state", json!({}));
    assert_eq!(after["live"], false);
    assert_eq!(after["port"], Value::Null);
    assert_eq!(after["portDescription"], NO_PORT);
    assert_eq!(settings_on_disk()["rig"]["midi_port"], Value::Null);

    // Without a port, sending still works and every entry says so.
    let sent = studio.ok("rig_send_program", json!({"program": 1}));
    let last = sent["monitor"].as_array().unwrap().last().expect("logged");
    assert_eq!(last["live"], false);
    assert_eq!(last["text"], "PC 1 ch1");
}

#[test]
fn controller_ports_and_open_tolerate_a_machine_without_hardware() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let ports = studio.invoke("controller_ports", json!({}));
    match &ports {
        Ok(list) => assert!(
            list.as_array()
                .is_some_and(|l| l.iter().all(|p| p.is_string())),
            "{list}"
        ),
        Err(e) => assert!(e.as_str().is_some_and(|e| !e.is_empty()), "{e}"),
    }
    assert_eq!(
        studio.ok("controller_open", json!({"port": null})),
        Value::Null
    );
    let state = studio.app().state::<app_lib::AppState>();
    assert!(state.controller.lock().is_none());

    let bogus = unique("no-such-input");
    let err = studio.err("controller_open", json!({"port": bogus}));
    if ports.is_ok() {
        assert_eq!(
            err,
            "MIDI input disappeared. Rescan and choose the port again."
        );
    } else {
        assert!(!err.is_empty());
    }
    assert!(
        state.controller.lock().is_none(),
        "a failed open leaves no input"
    );
    let err = studio.err("controller_open", json!({"port": 7}));
    assert!(err.contains("port"), "{err}");
    assert!(state.controller.lock().is_none());
}

#[test]
fn pedal_bindings_round_trip_through_controller_json_and_invalid_documents_are_refused() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let file = user_dir().join("controller.json");
    assert!(
        !file.exists(),
        "this test is the only writer of {}",
        file.display()
    );
    assert_eq!(
        studio.ok("controller_config", json!({})),
        json!({"schemaVersion": 1, "bindings": []})
    );

    // Channel 16 and number 127 are the last valid values.
    let document = json!({
        "schemaVersion": 1,
        "bindings": [
            binding("keep", "program", 1, 12),
            binding("record", "cc", 16, 127),
            binding("loop", "note", 2, 60),
        ],
        "customNote": "labels survive the round trip"
    });
    assert_eq!(
        studio.ok("controller_save", json!({"document": document})),
        Value::Null
    );
    assert_eq!(studio.ok("controller_config", json!({})), document);
    assert_eq!(read_json(&file), document);
    assert!(!user_dir().join("controller.json.tmp").exists());

    let press = "A pedal press must have one valid action.";
    let too_many: Vec<Value> = (0..17).map(|n| binding("keep", "cc", 1, n)).collect();
    let cases: Vec<(Value, &str)> = vec![
        (json!({"schemaVersion": 1}), "Missing pedal bindings"),
        (
            json!({"schemaVersion": 2, "bindings": []}),
            "Invalid pedal configuration",
        ),
        (
            json!({"schemaVersion": 1, "bindings": too_many}),
            "Invalid pedal configuration",
        ),
        (
            json!({"schemaVersion": 1, "bindings": [binding("delete", "cc", 1, 1)]}),
            press,
        ),
        (
            json!({"schemaVersion": 1, "bindings": [binding("keep", "sysex", 1, 1)]}),
            press,
        ),
        (
            json!({"schemaVersion": 1, "bindings": [binding("keep", "cc", 0, 1)]}),
            press,
        ),
        (
            json!({"schemaVersion": 1, "bindings": [binding("keep", "cc", 17, 1)]}),
            press,
        ),
        (
            json!({"schemaVersion": 1, "bindings": [binding("keep", "cc", 1, 128)]}),
            press,
        ),
        (
            json!({"schemaVersion": 1, "bindings": [binding("keep", "cc", 1, 1), binding("play", "cc", 1, 1)]}),
            press,
        ),
    ];
    for (doc, expected) in cases {
        let err = studio.err("controller_save", json!({"document": doc}));
        assert_eq!(err, expected, "{doc}");
    }
    let err = studio.err(
        "controller_save",
        json!({"document": {"schemaVersion": 1, "bindings": [{"action": "keep"}]}}),
    );
    assert!(err.contains("PedalPress"), "{err}");

    assert_eq!(studio.ok("controller_config", json!({})), document);
    assert_eq!(
        read_json(&file),
        document,
        "refused saves never touch the file"
    );
    assert!(!user_dir().join("controller.json.tmp").exists());
}

#[test]
fn media_list_shows_saved_projects_flags_broken_files_and_hides_download_receipts() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let root = media_root();
    let listing = studio.ok("media_list", json!({}));
    for key in ["projects", "assets", "jobs", "warnings"] {
        assert!(listing[key].is_array(), "{key} in {listing}");
    }
    let id = unique("video");
    assert!(!listing["projects"]
        .as_array()
        .unwrap()
        .iter()
        .any(|p| p["id"] == id));

    let saved = studio.ok(
        "media_save",
        json!({"document": {
            "schemaVersion": 1, "id": id, "revision": 0, "title": "First cut",
            "audioId": null, "ratio": "16:9", "shots": [], "future": {"keep": true}
        }}),
    );
    assert_eq!(saved["id"], id);
    assert_eq!(saved["revision"], 1);
    assert_eq!(
        saved["future"],
        json!({"keep": true}),
        "unknown fields survive"
    );
    let file = root.join("projects").join(format!("{id}.json"));
    let on_disk = read_json(&file);
    assert_eq!(on_disk["revision"], 1);
    assert_eq!(on_disk["title"], "First cut");

    let broken = root
        .join("projects")
        .join(format!("{}.json", unique("broken")));
    std::fs::write(&broken, b"not json").unwrap();
    let stale = root
        .join("projects")
        .join(format!("{}.json", unique("stale")));
    std::fs::write(&stale, br#"{"schemaVersion": 2, "id": "stale"}"#).unwrap();
    let job_id = unique("job");
    let job_file = root.join("jobs").join(format!("{job_id}.json"));
    std::fs::create_dir_all(job_file.parent().unwrap()).unwrap();
    std::fs::write(
        &job_file,
        serde_json::to_vec(&json!({
            "schemaVersion": 1, "id": job_id, "status": "download", "extension": "mp4",
            "downloadUri": "https://example.invalid/receipt", "request": {}
        }))
        .unwrap(),
    )
    .unwrap();

    let listing = studio.ok("media_list", json!({}));
    let project = listing["projects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == id)
        .expect("the saved project is listed");
    assert_eq!(project["revision"], 1);
    assert_eq!(project["title"], "First cut");
    let warnings = listing["warnings"].as_array().unwrap();
    let warning_for = |path: &Path| {
        let name = path.file_name().unwrap().to_str().unwrap();
        warnings
            .iter()
            .filter_map(Value::as_str)
            .find(|w| w.contains(name))
            .unwrap_or_else(|| panic!("no warning names {name}: {warnings:?}"))
    };
    assert!(warning_for(&broken).ends_with("File left intact."));
    assert_eq!(std::fs::read(&broken).unwrap(), b"not json");
    assert!(warning_for(&stale).contains("Unsupported version"));
    assert!(!listing["projects"]
        .as_array()
        .unwrap()
        .iter()
        .any(|p| p["id"] == "stale"));
    let job = listing["jobs"]
        .as_array()
        .unwrap()
        .iter()
        .find(|j| j["id"] == job_id)
        .expect("the job is listed");
    assert_eq!(job["status"], "download");
    assert_eq!(job["extension"], "mp4");
    assert!(
        job.get("downloadUri").is_none(),
        "receipts stay in Rust: {job}"
    );
    assert!(
        read_json(&job_file).get("downloadUri").is_some(),
        "but stay on disk"
    );
}

#[test]
fn media_save_enforces_revisions_and_project_rules() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("film");
    let doc = |revision: u64| {
        json!({
            "schemaVersion": 1, "id": id, "revision": revision, "title": "Take one",
            "audioId": null, "ratio": "16:9", "shots": []
        })
    };
    let file = media_root().join("projects").join(format!("{id}.json"));
    assert_eq!(
        studio.ok("media_save", json!({"document": doc(0)}))["revision"],
        1
    );
    let err = studio.err("media_save", json!({"document": doc(0)}));
    assert_eq!(
        err,
        "This video changed in another window. Reopen it before saving."
    );
    assert_eq!(read_json(&file)["revision"], 1);
    assert_eq!(
        studio.ok("media_save", json!({"document": doc(1)}))["revision"],
        2
    );
    assert_eq!(read_json(&file)["revision"], 2);
    assert_eq!(
        read_json(&file.with_extension("bak"))["revision"],
        1,
        "the previous version is kept next to the file"
    );

    let moved = unique("moved");
    let err = studio.err(
        "media_save",
        json!({"document": {
            "schemaVersion": 1, "id": moved, "revision": 3, "title": "Moved",
            "audioId": null, "ratio": "16:9", "shots": []
        }}),
    );
    assert_eq!(err, "Video project was moved. Save a new copy.");
    assert!(!media_root()
        .join("projects")
        .join(format!("{moved}.json"))
        .exists());

    let shot = |id: &str, seconds: f64, trim: f64| json!({"id": id, "seconds": seconds, "assetId": null, "trimStart": trim});
    let with = |patch: &dyn Fn(&mut Value)| {
        let mut d = doc(2);
        patch(&mut d);
        d
    };
    let too_many: Vec<Value> = (0..121).map(|n| shot(&format!("s{n}"), 0.1, 0.0)).collect();
    let too_long: Vec<Value> = (0..6).map(|n| shot(&format!("s{n}"), 120.0, 0.0)).collect();
    let checks = "Check video title, version, ratio and shot count (up to 120).";
    let shots = "Check unique shots, durations (0.1–120 s) and clip offsets.";
    let cases: Vec<(Value, &str)> = vec![
        (with(&|d| d["ratio"] = json!("4:3")), checks),
        (with(&|d| d["title"] = json!("   ")), checks),
        (with(&|d| d["shots"] = json!(too_many)), checks),
        (with(&|d| d["shots"] = json!([shot("a", 0.05, 0.0)])), shots),
        (
            with(&|d| d["shots"] = json!([shot("a", 1.0, 0.0), shot("a", 1.0, 0.0)])),
            shots,
        ),
        (
            with(&|d| d["shots"] = json!([shot("a", 1.0, 601.0)])),
            shots,
        ),
        (
            with(&|d| d["shots"] = json!(too_long)),
            "Keep videos within 10 minutes.",
        ),
        (with(&|d| d["id"] = json!("../outside")), "Invalid media ID"),
        (
            with(&|d| d["audioId"] = json!("bad id!")),
            "Invalid media ID",
        ),
        (
            with(&|d| {
                d["shots"] =
                    json!([{"id": "a", "seconds": 1.0, "assetId": "no/such", "trimStart": 0.0}])
            }),
            "Invalid media ID",
        ),
    ];
    for (document, expected) in cases {
        let err = studio.err("media_save", json!({"document": document}));
        assert_eq!(err, expected, "{document}");
    }
    let err = studio.err(
        "media_save",
        json!({"document": with(&|d| {
            d.as_object_mut().unwrap().remove("title");
        })}),
    );
    assert!(
        err.starts_with("Video project:") && err.contains("title"),
        "{err}"
    );

    // A well-formed 120-second shot at the edge of the range is accepted.
    let edge = with(&|d| d["shots"] = json!([shot("edge", 120.0, 600.0)]));
    assert_eq!(
        studio.ok("media_save", json!({"document": edge}))["revision"],
        3
    );
    let final_doc = read_json(&file);
    assert_eq!(final_doc["revision"], 3);
    assert_eq!(final_doc["title"], "Take one");
    assert_eq!(final_doc["shots"][0]["id"], "edge");
}

#[test]
fn media_tools_reports_a_boolean_and_a_message_that_agree() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let tools = studio.ok("media_tools", json!({}));
    let ready = tools["ready"].as_bool().expect("ready is a boolean");
    let expected = if ready {
        "FFmpeg and ffprobe found. Local MP4 export is available."
    } else {
        "Install FFmpeg with ffprobe, add its folder to PATH, then restart Jamstudio."
    };
    assert_eq!(tools["message"], expected);
    assert_eq!(tools.as_object().unwrap().len(), 2, "{tools}");
}

#[test]
fn media_import_refuses_missing_files_wrong_kinds_and_unknown_extensions_without_creating_assets() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let assets = media_root().join("assets");
    let before = json_files(&assets);
    assert_eq!(
        studio.err("media_store_song", json!({"assetId":"../escape"})),
        "Invalid media ID"
    );
    let local = "Choose a local audio/video file up to 512 MB.";

    let missing = user_dir().join(format!("{}.wav", unique("missing")));
    let missing = missing.to_str().unwrap();
    assert_eq!(
        studio.err("media_import", json!({"path": missing, "kind": "audio"})),
        local
    );

    let text = user_dir().join(format!("{}.txt", unique("notes")));
    std::fs::write(&text, b"lyrics").unwrap();
    let text = text.to_str().unwrap();
    assert_eq!(
        studio.err("media_import", json!({"path": text, "kind": "image"})),
        local,
        "a kind other than audio/video is refused before the file is read"
    );
    assert_eq!(
        studio.err("media_import", json!({"path": text, "kind": "audio"})),
        "Choose MP4/MOV/WebM/MKV video or WAV/MP3/FLAC/M4A/AAC/AIFF/OGG audio."
    );
    assert_eq!(
        studio.err(
            "media_import",
            json!({"path": "relative/song.wav", "kind": "audio"})
        ),
        local
    );
    let err = studio.err("media_import", json!({"path": text}));
    assert!(err.contains("kind"), "{err}");
    let err = studio.err("media_import", json!({"path": 42, "kind": "audio"}));
    assert!(err.contains("path"), "{err}");

    assert_eq!(json_files(&assets), before, "no asset document was written");
}

#[test]
fn media_refresh_cancel_and_render_fail_safely_with_nothing_running() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let jobs = media_root().join("jobs");
    let exports = media_root().join("exports");
    let exports_before = entries(&exports);

    assert_eq!(
        studio.err("media_refresh", json!({"jobId": "../escape"})),
        "Invalid media ID"
    );
    let unknown = unique("job");
    let jobs_before = json_files(&jobs);
    let err = studio.err("media_refresh", json!({"jobId": unknown}));
    assert!(!err.is_empty());
    assert!(!jobs.join(format!("{unknown}.json")).exists());
    assert_eq!(
        json_files(&jobs),
        jobs_before,
        "refreshing an unknown job writes nothing"
    );

    // A finished job is answered from disk: no provider call, the download receipt
    // withheld from the UI, and the file left exactly as it was.
    let done = unique("done");
    let job = json!({
        "schemaVersion": 1, "id": done, "status": "ready", "assetId": "asset-1",
        "downloadUri": "https://example.invalid/never-fetched",
        "request": {
            "catalogId": "minimax-music", "model": "music-3.0", "prompt": "a quiet waltz",
            "seconds": 30, "ratio": "16:9", "instrumental": true
        }
    });
    let job_file = jobs.join(format!("{done}.json"));
    std::fs::create_dir_all(&jobs).unwrap();
    std::fs::write(&job_file, serde_json::to_vec(&job).unwrap()).unwrap();
    let refreshed = studio.ok("media_refresh", json!({"jobId": done}));
    assert_eq!(refreshed["status"], "ready");
    assert_eq!(refreshed["assetId"], "asset-1");
    assert!(refreshed.get("downloadUri").is_none(), "{refreshed}");
    assert_eq!(read_json(&job_file), job);
    // A job whose request no longer matches the catalog is refused by name.
    let orphan = unique("orphan");
    std::fs::write(
        jobs.join(format!("{orphan}.json")),
        serde_json::to_vec(&json!({"schemaVersion": 1, "id": orphan, "status": "pending", "request": {
            "catalogId": "no-such-model", "model": "x", "prompt": "p", "seconds": 10, "ratio": "16:9", "instrumental": false
        }}))
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        studio.err("media_refresh", json!({"jobId": orphan})),
        "Unknown media model"
    );

    // Cancel with nothing running is a no-op that does not poison the next operation.
    assert_eq!(studio.ok("media_cancel", json!({})), Value::Null);
    let err = studio.err("media_render", json!({"document": {"schemaVersion": 1}}));
    assert!(
        err.starts_with("Video project:") && err.contains("missing field"),
        "{err}"
    );
    let render_id = unique("render");
    let base = json!({
        "schemaVersion": 1, "id": render_id, "revision": 0, "title": "Render me",
        "audioId": null, "ratio": "16:9", "shots": []
    });
    assert_eq!(
        studio.err("media_render", json!({"document": base})),
        "Choose a soundtrack first"
    );
    let mut bad_audio = base.clone();
    bad_audio["audioId"] = json!("no/such");
    assert_eq!(
        studio.err("media_render", json!({"document": bad_audio})),
        "Invalid media ID"
    );
    let err = studio.err("media_render", json!({}));
    assert!(err.contains("document"), "{err}");
    assert_eq!(
        entries(&exports),
        exports_before,
        "a refused render creates no export folder"
    );
    assert!(
        !media_root()
            .join("projects")
            .join(format!("{render_id}.json"))
            .exists(),
        "rendering never saves the project"
    );
}

#[test]
fn media_refresh_names_an_unknown_job_id() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let unknown = unique("job");
    let err = studio.err("media_refresh", json!({"jobId": unknown}));
    assert!(err.contains(&unknown), "{err}");
}

#[test]
fn media_render_names_a_missing_soundtrack_asset() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let asset = unique("asset");
    let document = json!({
        "schemaVersion": 1, "id": unique("render"), "revision": 0, "title": "Render me",
        "audioId": asset, "ratio": "16:9", "shots": []
    });
    let err = studio.err("media_render", json!({"document": document}));
    assert!(err.contains(&asset), "{err}");
}
