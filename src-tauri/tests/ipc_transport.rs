//! Transport behaviour through the IPC layer on the headless engine: the tempo, meter,
//! loop, count-in and seek rules (what is normalised, what is refused and with which
//! words); play / pause / stop transitions as seen in `audio_get_telemetry` and in the
//! `transport:state` events of the 30 Hz telemetry thread; the band cues that act on
//! the transport; and the lock a recording take puts on every transport command.
//!
//! The headless `NullOutput` advances the clock in real time, so bars really pass here
//! (one second per bar at 240 bpm in 4/4); every wait polls the telemetry with a
//! three-second deadline instead of sleeping.
mod common;

use common::{unique, Studio};
use serde_json::{json, Value};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::Listener;

/// Longest wait for the render or telemetry thread to catch up with a command.
const DEADLINE: Duration = Duration::from_secs(3);
const REFUSED_WHILE_RECORDING: &str = "Save the take before changing playback or timing.";
const METER_REFUSED: &str = "Load a chart with a matching style to change meter.";

fn telemetry(studio: &Studio) -> Value {
    studio.ok("audio_get_telemetry", json!({}))
}

/// Polls `audio_get_telemetry` until `pred` holds and returns that telemetry; panics
/// with the last telemetry once [`DEADLINE`] has passed.
fn wait_for(studio: &Studio, what: &str, pred: impl Fn(&Value) -> bool) -> Value {
    let deadline = Instant::now() + DEADLINE;
    loop {
        let tel = telemetry(studio);
        if pred(&tel) {
            return tel;
        }
        assert!(
            Instant::now() < deadline,
            "timed out waiting for {what}; last telemetry: {tel}"
        );
        thread::sleep(Duration::from_millis(10));
    }
}

fn beats(tel: &Value) -> f64 {
    tel["transport"]["position_beats"]
        .as_f64()
        .expect("position_beats is a number")
}

fn bar(tel: &Value) -> u64 {
    tel["transport"]["bar"].as_u64().expect("bar is a number")
}

/// No count-in and the given tempo, confirmed in telemetry before the test goes on.
fn arm(studio: &Studio, bpm: f64) {
    studio.ok("transport_set_count_in", json!({"bars": 0}));
    studio.ok("transport_set_tempo", json!({"bpm": bpm}));
    wait_for(studio, "tempo and count-in to land", |t| {
        t["transport"]["bpm"] == bpm && t["transport"]["count_in_bars"] == 0
    });
}

/// Bars a chart resolves to: every arrangement item repeats its section's bars.
fn chart_bars(chart: &Value) -> u64 {
    let sections = chart["sections"].as_array().expect("sections");
    chart["arrangement"]
        .as_array()
        .expect("arrangement")
        .iter()
        .map(|item| {
            let section = sections
                .iter()
                .find(|s| s["id"] == item["sectionId"])
                .expect("arrangement names a section");
            section["bars"].as_array().expect("bars").len() as u64
                * item["repeats"].as_u64().expect("repeats")
        })
        .sum()
}

#[test]
fn tempo_is_clamped_to_20_300_and_wrong_types_are_refused() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let bpm = |t: &Value| t["transport"]["bpm"].as_f64().expect("bpm");
    assert_eq!(bpm(&telemetry(&studio)), 120.0, "engine default tempo");

    studio.ok("transport_set_tempo", json!({"bpm": 240.0}));
    wait_for(&studio, "240 bpm", |t| bpm(t) == 240.0);

    // Out-of-range tempos are clamped by the timeline, never refused; the frontend
    // store clamps to the same 20..300 range before it calls.
    studio.ok("transport_set_tempo", json!({"bpm": 1000.0}));
    wait_for(&studio, "clamp down to 300", |t| bpm(t) == 300.0);
    studio.ok("transport_set_tempo", json!({"bpm": 5.0}));
    wait_for(&studio, "clamp up to 20", |t| bpm(t) == 20.0);
    // An integer literal is a valid f64 on the wire.
    studio.ok("transport_set_tempo", json!({"bpm": 100}));
    wait_for(&studio, "100 bpm from an integer", |t| bpm(t) == 100.0);
    studio.ok("transport_set_tempo", json!({"bpm": -10.0}));
    wait_for(&studio, "negative tempo clamps to 20", |t| bpm(t) == 20.0);

    // The IPC layer refuses a wrong type or a missing argument, naming both.
    let err = studio.err("transport_set_tempo", json!({"bpm": "fast"}));
    assert!(
        err.contains("invalid args `bpm` for command `transport_set_tempo`")
            && err.contains("expected f64"),
        "{err}"
    );
    let err = studio.err("transport_set_tempo", json!({}));
    assert!(err.contains("missing required key bpm"), "{err}");
    assert_eq!(
        bpm(&telemetry(&studio)),
        20.0,
        "refused calls change nothing"
    );
}

#[test]
fn time_signature_must_match_the_current_style_meter() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let meter = |t: &Value| t["transport"]["time_signature"].clone();
    assert_eq!(meter(&telemetry(&studio)), json!([4, 4]));

    // The default style (blues-shuffle) is in 4/4, so only 4/4 is accepted.
    studio.ok(
        "transport_set_time_signature",
        json!({"numerator": 4, "denominator": 4}),
    );
    for (n, d) in [(3, 4), (6, 8), (0, 4), (4, 0)] {
        let err = studio.err(
            "transport_set_time_signature",
            json!({"numerator": n, "denominator": d}),
        );
        assert_eq!(err, METER_REFUSED, "{n}/{d}");
    }
    let err = studio.err(
        "transport_set_time_signature",
        json!({"numerator": 300, "denominator": 4}),
    );
    assert!(
        err.contains("invalid args `numerator` for command `transport_set_time_signature`")
            && err.contains("expected u8"),
        "{err}"
    );
    assert_eq!(meter(&telemetry(&studio)), json!([4, 4]));

    // A chart on a 6/8 style moves the meter; from then on 6/8 is the only value the
    // transport accepts and the 4/4 style is refused in turn.
    let chart = json!({
        "schemaVersion": 1,
        "id": unique("six-eight"),
        "name": "Six eight",
        "keyTonic": 0,
        "mode": "major",
        "timeSig": [6, 8],
        "defaultBpm": 60.0,
        "defaultStyleId": "ballad-68",
        "sections": [{"id": "a", "name": "A", "bars": [[{"chord": "C", "beats": 6.0}]]}],
        "arrangement": [{"sectionId": "a", "repeats": 2}],
    });
    studio.ok("band_load_chart_inline", json!({"chart": chart}));
    wait_for(&studio, "6/8 in telemetry", |t| {
        meter(t) == json!([6, 8]) && t["band"]["style_id"] == "ballad-68"
    });
    studio.ok(
        "transport_set_time_signature",
        json!({"numerator": 6, "denominator": 8}),
    );
    assert_eq!(
        studio.err(
            "transport_set_time_signature",
            json!({"numerator": 4, "denominator": 4}),
        ),
        METER_REFUSED
    );
    assert_eq!(
        studio.err("band_set_style", json!({"styleId": "blues-shuffle"})),
        "Style and transport meters differ. Load a chart with a matching style and meter."
    );
    assert_eq!(meter(&telemetry(&studio)), json!([6, 8]));
}

#[test]
fn loop_bounds_are_normalised_but_not_checked_against_the_chart() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let chart = studio.ok("band_load_chart", json!({"chartId": "blues-12-bar"}));
    assert_eq!(chart_bars(&chart), 24);
    let range = |t: &Value| {
        (
            t["transport"]["loop_start_bar"].as_u64().unwrap(),
            t["transport"]["loop_end_bar"].as_u64().unwrap(),
            t["transport"]["loop_enabled"].as_bool().unwrap(),
        )
    };
    assert_eq!(range(&telemetry(&studio)), (1, 5, false), "engine default");

    studio.ok(
        "transport_set_loop",
        json!({"startBar": 3, "endBar": 7, "enabled": true}),
    );
    wait_for(&studio, "loop 3..7", |t| range(t) == (3, 7, true));
    // Bar 0 becomes bar 1 and an end at or before the start becomes start + 1.
    studio.ok(
        "transport_set_loop",
        json!({"startBar": 0, "endBar": 0, "enabled": true}),
    );
    wait_for(&studio, "loop 1..2", |t| range(t) == (1, 2, true));
    studio.ok(
        "transport_set_loop",
        json!({"startBar": 9, "endBar": 4, "enabled": false}),
    );
    wait_for(&studio, "loop 9..10 off", |t| range(t) == (9, 10, false));
    // Beyond the 24-bar chart is accepted verbatim: the transport knows no chart length.
    studio.ok(
        "transport_set_loop",
        json!({"startBar": 100, "endBar": 200, "enabled": true}),
    );
    wait_for(&studio, "loop 100..200", |t| range(t) == (100, 200, true));

    let err = studio.err(
        "transport_set_loop",
        json!({"startBar": -1, "endBar": 4, "enabled": true}),
    );
    assert!(
        err.contains("invalid args `startBar` for command `transport_set_loop`")
            && err.contains("expected u32"),
        "{err}"
    );
    let err = studio.err(
        "transport_set_loop",
        json!({"startBar": 1, "endBar": 4, "enabled": "yes"}),
    );
    assert!(
        err.contains("invalid args `enabled` for command `transport_set_loop`")
            && err.contains("expected a boolean"),
        "{err}"
    );
    assert_eq!(range(&telemetry(&studio)), (100, 200, true));
}

#[test]
fn enabling_a_loop_behind_the_playhead_wraps_it_back_while_playing() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    arm(&studio, 240.0);
    studio.ok("transport_seek_bar", json!({"bar": 20}));
    studio.ok("transport_play", json!({}));
    let tel = wait_for(&studio, "playing from bar 20", |t| {
        t["transport"]["state"] == "playing" && bar(t) >= 20
    });
    assert!(!tel["transport"]["loop_enabled"].as_bool().unwrap());
    assert!(beats(&tel) >= 76.0, "bar 20 starts at beat 76: {tel}");

    studio.ok(
        "transport_set_loop",
        json!({"startBar": 1, "endBar": 3, "enabled": true}),
    );
    let tel = wait_for(&studio, "the wrap back into bars 1-2", |t| {
        t["transport"]["loop_enabled"] == true && bar(t) <= 2
    });
    assert_eq!(tel["transport"]["state"], "playing");
    assert!(beats(&tel) < 8.0, "inside the two-bar loop: {tel}");
    studio.ok("transport_stop", json!({}));
}

#[test]
fn count_in_holds_the_song_position_until_the_band_comes_in() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    assert_eq!(
        telemetry(&studio)["transport"]["count_in_bars"],
        1,
        "engine default"
    );
    studio.ok("transport_set_count_in", json!({"bars": 2}));
    wait_for(&studio, "two bars of count-in", |t| {
        t["transport"]["count_in_bars"] == 2
    });
    let err = studio.err("transport_set_count_in", json!({"bars": -1}));
    assert!(
        err.contains("invalid args `bars` for command `transport_set_count_in`")
            && err.contains("expected u32"),
        "{err}"
    );
    let err = studio.err("transport_set_count_in", json!({"bars": 1.5}));
    assert!(err.contains("expected u32"), "{err}");

    studio.ok("transport_set_count_in", json!({"bars": 1}));
    studio.ok("transport_set_tempo", json!({"bpm": 240.0}));
    wait_for(&studio, "one bar at 240", |t| {
        t["transport"]["count_in_bars"] == 1 && t["transport"]["bpm"] == 240.0
    });
    studio.ok("transport_play", json!({}));
    let counting = wait_for(&studio, "the count-in", |t| {
        t["transport"]["state"] == "counting_in"
    });
    assert_eq!(beats(&counting), 0.0, "song position waits: {counting}");
    assert_eq!(counting["transport"]["bar"], 1);
    let playing = wait_for(&studio, "the band to come in", |t| {
        t["transport"]["state"] == "playing"
    });
    assert!(
        beats(&playing) < 4.0,
        "the song starts from bar 1: {playing}"
    );
    studio.ok("transport_stop", json!({}));
}

#[test]
fn count_in_then_plays_from_the_seeked_bar() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("band_load_chart", json!({"chartId": "blues-12-bar"}));
    studio.ok("transport_set_count_in", json!({"bars": 1}));
    studio.ok("transport_set_tempo", json!({"bpm": 240.0}));
    wait_for(&studio, "count-in and tempo", |t| {
        t["transport"]["count_in_bars"] == 1 && t["transport"]["bpm"] == 240.0
    });
    studio.ok("transport_seek_bar", json!({"bar": 9}));
    wait_for(&studio, "seek bar 9", |t| bar(t) == 9);

    studio.ok("transport_play", json!({}));
    wait_for(&studio, "the count-in", |t| {
        t["transport"]["state"] == "counting_in"
    });
    let playing = wait_for(&studio, "the band to come in at bar 9", |t| {
        t["transport"]["state"] == "playing"
    });
    assert_eq!(
        bar(&playing),
        9,
        "count-in must not rewind the seek: {playing}"
    );
    studio.ok("transport_stop", json!({}));
}

#[test]
fn seek_bar_clamps_to_bar_one_and_accepts_bars_beyond_the_chart() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let chart = studio.ok("band_load_chart", json!({"chartId": "blues-8-bar"}));
    assert_eq!(chart_bars(&chart), 16);
    arm(&studio, 120.0);

    studio.ok("transport_seek_bar", json!({"bar": 5}));
    let tel = wait_for(&studio, "bar 5", |t| bar(t) == 5);
    assert_eq!(tel["transport"]["state"], "stopped");
    assert_eq!(tel["transport"]["beat"], 1);
    assert_eq!(beats(&tel), 16.0, "four bars of 4/4 lie before bar 5");
    assert_eq!(tel["transport"]["bar_progress"], 0.0);

    studio.ok("transport_seek_bar", json!({"bar": 0}));
    let tel = wait_for(&studio, "bar 0 clamps to bar 1", |t| bar(t) == 1);
    assert_eq!(beats(&tel), 0.0);

    // Past the 16-bar chart is accepted and reported as such: no chart bound here.
    studio.ok("transport_seek_bar", json!({"bar": 100}));
    let tel = wait_for(&studio, "bar 100", |t| bar(t) == 100);
    assert_eq!(beats(&tel), 396.0);

    let err = studio.err("transport_seek_bar", json!({"bar": "five"}));
    assert!(
        err.contains("invalid args `bar` for command `transport_seek_bar`")
            && err.contains("expected u32"),
        "{err}"
    );
    assert_eq!(bar(&telemetry(&studio)), 100);
}

#[test]
fn play_pause_and_stop_transitions_are_visible_in_telemetry() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    arm(&studio, 240.0);
    let idle = telemetry(&studio);
    assert_eq!(idle["transport"]["state"], "stopped");
    assert_eq!(idle["transport"]["bar"], 1);
    assert_eq!(idle["transport"]["beat"], 1);

    // Pausing a stopped transport is a no-op.
    studio.ok("transport_pause", json!({}));
    thread::sleep(Duration::from_millis(50));
    assert_eq!(telemetry(&studio)["transport"]["state"], "stopped");

    // The headless NullOutput drives the clock in real time: bar 2 after one second.
    studio.ok("transport_play", json!({}));
    let tel = wait_for(&studio, "bar 2 while playing", |t| {
        t["transport"]["state"] == "playing" && bar(t) >= 2
    });
    assert!(beats(&tel) >= 4.0, "{tel}");

    studio.ok("transport_pause", json!({}));
    let paused = wait_for(&studio, "paused", |t| t["transport"]["state"] == "paused");
    let held = beats(&paused);
    assert!(held >= 4.0, "{paused}");
    thread::sleep(Duration::from_millis(150));
    let still = telemetry(&studio);
    assert_eq!(still["transport"]["state"], "paused");
    assert_eq!(beats(&still), held, "pause holds the position");
    assert_eq!(still["transport"]["bar"], paused["transport"]["bar"]);
    assert_eq!(still["transport"]["beat"], paused["transport"]["beat"]);

    // Play resumes from the held position, not from the top and without a count-in.
    studio.ok("transport_play", json!({}));
    let resumed = wait_for(&studio, "resume", |t| {
        t["transport"]["state"] == "playing" && beats(t) > held
    });
    assert!(
        beats(&resumed) < held + 4.0,
        "resumed near {held}: {resumed}"
    );

    studio.ok("transport_stop", json!({}));
    let stopped = wait_for(&studio, "stopped", |t| t["transport"]["state"] == "stopped");
    assert_eq!(stopped["transport"]["bar"], 1);
    assert_eq!(stopped["transport"]["beat"], 1);
    assert_eq!(beats(&stopped), 0.0);
    assert_eq!(stopped["transport"]["bar_progress"], 0.0);
}

#[test]
fn transport_state_events_track_play_and_stop() {
    let _scenario = common::scenario();
    let mut studio = Studio::boot();
    studio.start_events();
    arm(&studio, 240.0);
    let (tx, rx) = mpsc::channel::<Value>();
    let listener = studio.app().listen_any("transport:state", move |event| {
        let payload: Value =
            serde_json::from_str(event.payload()).expect("transport:state payload is json");
        let _ = tx.send(payload);
    });
    let next_event = |what: &str, pred: &dyn Fn(&Value) -> bool| -> Value {
        let deadline = Instant::now() + DEADLINE;
        loop {
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(event) if pred(&event) => return event,
                Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => panic!("listener dropped"),
            }
            assert!(
                Instant::now() < deadline,
                "no transport:state event for {what}"
            );
        }
    };

    // The telemetry thread emits while stopped too, with every field of the contract.
    let idle = next_event("the idle transport", &|e| e["state"] == "stopped");
    for key in [
        "state",
        "bar",
        "beat",
        "position_beats",
        "bar_progress",
        "bpm",
        "time_signature",
        "loop_enabled",
        "loop_start_bar",
        "loop_end_bar",
        "count_in_bars",
    ] {
        assert!(
            idle.get(key).is_some(),
            "transport:state lacks {key}: {idle}"
        );
    }
    assert_eq!(idle["bpm"], 240.0);
    assert_eq!(idle["count_in_bars"], 0);
    assert_eq!(idle["time_signature"], json!([4, 4]));

    studio.ok("transport_play", json!({}));
    let playing = next_event("bar 2 while playing", &|e| {
        e["state"] == "playing" && e["bar"].as_u64().unwrap() >= 2
    });
    assert!(
        playing["position_beats"].as_f64().unwrap() >= 4.0,
        "{playing}"
    );
    assert_eq!(playing["bpm"], 240.0);

    studio.ok("transport_stop", json!({}));
    let stopped = next_event("the stop", &|e| e["state"] == "stopped" && e["bar"] == 1);
    assert_eq!(stopped["position_beats"], 0.0);
    assert_eq!(stopped["beat"], 1);
    studio.app().unlisten(listener);
}

#[test]
fn tempo_change_while_playing_keeps_the_musical_position() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    arm(&studio, 120.0);
    studio.ok("transport_play", json!({}));
    let before = wait_for(&studio, "beat 2 at 120", |t| {
        t["transport"]["state"] == "playing" && beats(t) >= 1.0
    });

    studio.ok("transport_set_tempo", json!({"bpm": 240.0}));
    let after = wait_for(&studio, "240 bpm", |t| t["transport"]["bpm"] == 240.0);
    let (b0, b1) = (beats(&before), beats(&after));
    assert!(
        b1 >= b0 && b1 < b0 + 2.0,
        "the position jumped with the tempo: {b0} -> {b1}"
    );
    assert_eq!(after["transport"]["state"], "playing");
    assert!(bar(&after) >= bar(&before));

    // The clamp applies while playing too, and playback goes on.
    studio.ok("transport_set_tempo", json!({"bpm": 1000}));
    let clamped = wait_for(&studio, "300 bpm", |t| t["transport"]["bpm"] == 300.0);
    assert_eq!(clamped["transport"]["state"], "playing");
    assert!(beats(&clamped) >= b1);
    studio.ok("transport_stop", json!({}));
}

#[test]
fn stop_cue_breaks_the_band_at_the_next_bar_and_a_fill_brings_it_back() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("band_load_chart", json!({"chartId": "blues-12-bar"}));
    arm(&studio, 240.0);
    assert_eq!(
        studio.err("band_cue", json!({"cue": "bogus"})),
        "Unknown cue: bogus"
    );
    assert_eq!(
        studio.err("band_cue", json!({"cue": "Stop"})),
        "Unknown cue: Stop",
        "cue names are lower-case"
    );
    studio.ok("transport_play", json!({}));
    let tel = wait_for(&studio, "playing", |t| t["transport"]["state"] == "playing");
    assert_eq!(tel["band"]["is_stopped"], false);

    studio.ok("band_cue", json!({"cue": "stop"}));
    wait_for(&studio, "the cue to be queued or applied", |t| {
        t["band"]["pending_cue"] == "stop" || t["band"]["active_cue"] == "stop"
    });
    let broke = wait_for(&studio, "the break at the bar line", |t| {
        t["band"]["is_stopped"] == true
    });
    assert_eq!(broke["band"]["active_cue"], "stop");
    assert_eq!(broke["band"]["pending_cue"], "none");
    assert_eq!(broke["transport"]["state"], "playing");

    // The transport keeps counting through the break; the band stays out.
    let at_break = bar(&broke);
    wait_for(&studio, "the next bar during the break", |t| {
        bar(t) > at_break && t["band"]["is_stopped"] == true
    });

    studio.ok("band_cue", json!({"cue": "fill"}));
    let back = wait_for(&studio, "the fill", |t| t["band"]["is_stopped"] == false);
    assert_eq!(back["band"]["active_cue"], "fill");
    assert_eq!(back["transport"]["state"], "playing");

    studio.ok("transport_stop", json!({}));
    let stopped = wait_for(&studio, "stopped", |t| t["transport"]["state"] == "stopped");
    assert_eq!(
        stopped["band"]["active_cue"], "none",
        "stop resets the band"
    );
    assert_eq!(stopped["band"]["is_stopped"], false);
}

#[test]
fn ending_cue_plays_its_bar_then_stops_the_transport() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    arm(&studio, 300.0);
    studio.ok("transport_play", json!({}));
    wait_for(&studio, "playing", |t| t["transport"]["state"] == "playing");

    studio.ok("band_cue", json!({"cue": "ending"}));
    let ending = wait_for(&studio, "the ending bar", |t| {
        t["band"]["active_cue"] == "ending"
    });
    assert_eq!(ending["transport"]["state"], "playing");
    assert_eq!(ending["band"]["is_stopped"], false);

    let stopped = wait_for(&studio, "the transport to stop itself", |t| {
        t["transport"]["state"] == "stopped"
    });
    assert_eq!(stopped["transport"]["bar"], 1);
    assert_eq!(stopped["transport"]["beat"], 1);
    assert_eq!(beats(&stopped), 0.0);
    assert_eq!(stopped["band"]["active_cue"], "none");
    assert_eq!(stopped["band"]["pending_cue"], "none");
    assert_eq!(stopped["band"]["is_stopped"], false);
    assert_eq!(stopped["transport"]["bpm"], 300.0, "the tempo survives");
}

#[test]
fn stop_resets_the_position_cancels_a_count_in_and_forgets_a_pending_cue() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    arm(&studio, 120.0);
    studio.ok("transport_seek_bar", json!({"bar": 5}));
    studio.ok("band_cue", json!({"cue": "stop"}));
    let armed = wait_for(&studio, "bar 5 with a queued break", |t| {
        bar(t) == 5 && t["band"]["pending_cue"] == "stop"
    });
    assert_eq!(armed["transport"]["state"], "stopped");

    studio.ok("transport_stop", json!({}));
    let reset = wait_for(&studio, "the reset", |t| {
        bar(t) == 1 && t["band"]["pending_cue"] == "none"
    });
    assert_eq!(reset["transport"]["state"], "stopped");
    assert_eq!(beats(&reset), 0.0);

    // Stop during a count-in returns to stopped and keeps the count-in setting.
    studio.ok("transport_set_count_in", json!({"bars": 4}));
    wait_for(&studio, "four bars of count-in", |t| {
        t["transport"]["count_in_bars"] == 4
    });
    studio.ok("transport_play", json!({}));
    wait_for(&studio, "counting in", |t| {
        t["transport"]["state"] == "counting_in"
    });
    studio.ok("transport_stop", json!({}));
    let stopped = wait_for(&studio, "stopped again", |t| {
        t["transport"]["state"] == "stopped"
    });
    assert_eq!(stopped["transport"]["count_in_bars"], 4);
    assert_eq!(beats(&stopped), 0.0);
}

#[test]
fn metronome_set_starts_and_stops_the_transport_at_the_given_tempo() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("transport_set_count_in", json!({"bars": 0}));
    studio.ok("metronome_set", json!({"on": true, "bpm": 180.0}));
    wait_for(&studio, "the click running at 180", |t| {
        t["transport"]["state"] == "playing" && t["transport"]["bpm"] == 180.0
    });
    let err = studio.err("metronome_set", json!({"on": true}));
    assert!(err.contains("missing required key bpm"), "{err}");

    studio.ok("metronome_set", json!({"on": false, "bpm": 180.0}));
    let stopped = wait_for(&studio, "the click stopped", |t| {
        t["transport"]["state"] == "stopped"
    });
    assert_eq!(stopped["transport"]["bar"], 1);
    assert_eq!(beats(&stopped), 0.0);
    assert_eq!(stopped["transport"]["bpm"], 180.0);
}

#[test]
fn transport_is_locked_while_a_take_is_recording() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    arm(&studio, 120.0);
    let take_id = studio
        .ok("recorder_start", json!({"sessionId": unique("session")}))
        .as_str()
        .expect("take id")
        .to_string();
    assert!(take_id.starts_with("take-"), "{take_id}");

    let locked: [(&str, Value); 8] = [
        ("transport_play", json!({})),
        ("transport_pause", json!({})),
        ("transport_stop", json!({})),
        ("transport_seek_bar", json!({"bar": 3})),
        (
            "transport_set_loop",
            json!({"startBar": 1, "endBar": 5, "enabled": true}),
        ),
        ("transport_set_count_in", json!({"bars": 2})),
        ("transport_set_tempo", json!({"bpm": 200.0})),
        (
            "transport_set_time_signature",
            json!({"numerator": 4, "denominator": 4}),
        ),
    ];
    for (cmd, args) in locked {
        assert_eq!(studio.err(cmd, args), REFUSED_WHILE_RECORDING, "{cmd}");
    }
    let tel = telemetry(&studio);
    assert_eq!(tel["transport"]["state"], "stopped");
    assert_eq!(tel["transport"]["bpm"], 120.0);
    assert_eq!(tel["transport"]["count_in_bars"], 0);

    // A few blocks of audio, then the saved take lifts the lock.
    thread::sleep(Duration::from_millis(100));
    let meta = studio.ok("recorder_stop", json!({}));
    assert_eq!(meta["id"], take_id.as_str());
    assert!(meta["sampleCount"].as_u64().unwrap() > 0, "{meta}");
    studio.ok("transport_set_tempo", json!({"bpm": 200.0}));
    studio.ok("transport_play", json!({}));
    wait_for(&studio, "playing at 200 after the take", |t| {
        t["transport"]["state"] == "playing" && t["transport"]["bpm"] == 200.0
    });
    studio.ok("transport_stop", json!({}));
}
