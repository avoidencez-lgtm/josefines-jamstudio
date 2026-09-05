//! The chart and style library through the IPC layer: the bundled lists, loading a
//! chart into the band (the telemetry follows its style, tempo and first chord), the
//! inline-chart validator, user chart files under the user folder (save, import,
//! reload, delete) and the live band knobs (style, intensity, mutes, cues).
mod common;

use common::{unique, user_dir, Studio};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const BUNDLED_CHARTS: [&str; 9] = [
    "blues-12-bar",
    "blues-8-bar",
    "blues-minor",
    "blues-quick-change",
    "i-v-vi-iv",
    "ii-v-i",
    "one-chord-vamp",
    "rock-16-bar",
    "rock-song-form",
];

/// (id, name, meter) of every bundled style.
const BUNDLED_STYLES: [(&str, &str, [u8; 2]); 6] = [
    ("ballad-68", "Slow 6/8 Ballad", [6, 8]),
    ("blues-shuffle", "Blues Shuffle", [4, 4]),
    ("funk-16", "Funk 16th Groove", [4, 4]),
    ("jazz-swing", "Jazz Swing", [4, 4]),
    ("metal-gallop", "Heavy Metal Gallop", [4, 4]),
    ("rock-straight", "Rock Straight 8th", [4, 4]),
];

const METER_MISMATCH: &str =
    "Style and transport meters differ. Load a chart with a matching style and meter.";

/// The headless render thread refreshes the telemetry a few hundred times a second;
/// polls `audio_get_telemetry` until `pred` holds (3 s deadline) and returns it.
fn telemetry_where(studio: &Studio, what: &str, pred: impl Fn(&Value) -> bool) -> Value {
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        let tel = studio.ok("audio_get_telemetry", json!({}));
        if pred(&tel) {
            return tel;
        }
        assert!(
            Instant::now() < deadline,
            "telemetry never showed {what}; last band {} transport {}",
            tel["band"],
            tel["transport"]
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// The band half of [`telemetry_where`].
fn band_where(studio: &Studio, what: &str, pred: impl Fn(&Value) -> bool) -> Value {
    let tel = telemetry_where(studio, what, |t| pred(&t["band"]));
    tel["band"].clone()
}

fn near(value: &Value, expected: f64) -> bool {
    value.as_f64().is_some_and(|v| (v - expected).abs() < 1e-6)
}

fn charts(studio: &Studio) -> Vec<Value> {
    studio
        .ok("band_list_charts", json!({}))
        .as_array()
        .expect("chart list")
        .clone()
}

fn chart_ids(studio: &Studio) -> Vec<String> {
    charts(studio)
        .iter()
        .map(|c| c["id"].as_str().expect("chart id").to_string())
        .collect()
}

fn find_chart(list: &[Value], id: &str) -> Value {
    list.iter()
        .find(|c| c["id"] == id)
        .unwrap_or_else(|| panic!("chart {id} is not listed"))
        .clone()
}

fn read_json(path: &Path) -> Value {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

fn user_chart_file(id: &str) -> PathBuf {
    user_dir().join("charts").join(format!("{id}.json"))
}

/// A chart as the chart editor sends it: one section `"a"` holding `bars` of
/// (chord symbol, beats), arranged once.
fn chart_value(
    id: &str,
    time_sig: [u8; 2],
    default_style: Option<&str>,
    bars: &[&[(&str, f64)]],
) -> Value {
    let bars: Vec<Value> = bars
        .iter()
        .map(|bar| {
            bar.iter()
                .map(|(chord, beats)| json!({"chord": chord, "beats": beats}))
                .collect()
        })
        .collect();
    json!({
        "schemaVersion": 1,
        "id": id,
        "name": format!("Chart {id}"),
        "keyTonic": 0,
        "mode": "major",
        "timeSig": time_sig,
        "defaultBpm": 100.0,
        "defaultStyleId": default_style,
        "sections": [{"id": "a", "name": "A", "bars": bars}],
        "arrangement": [{"sectionId": "a", "repeats": 1}],
    })
}

/// A two-bar 4/4 chart with a split first bar and no default style.
fn four_four(id: &str) -> Value {
    chart_value(
        id,
        [4, 4],
        None,
        &[&[("Gm7", 2.0), ("C7", 2.0)], &[("Fmaj7", 4.0)]],
    )
}

#[test]
fn bundled_styles_and_charts_are_listed_with_their_ids_names_and_meters() {
    let _scenario = common::scenario();
    let studio = Studio::boot();

    let styles = studio.ok("band_list_styles", json!({}));
    let styles = styles.as_array().expect("style list");
    let mut ids: Vec<&str> = styles.iter().map(|s| s["id"].as_str().unwrap()).collect();
    ids.sort_unstable();
    assert_eq!(ids, BUNDLED_STYLES.map(|(id, _, _)| id));
    for (id, name, meter) in BUNDLED_STYLES {
        let style = styles.iter().find(|s| s["id"] == id).unwrap();
        assert_eq!(style["name"], name, "{id}");
        assert_eq!(style["schemaVersion"], 1, "{id}");
        assert_eq!(style["feel"]["timeSig"], json!(meter), "{id}");
        assert!(
            style["patterns"].as_array().is_some_and(|p| !p.is_empty()),
            "{id} ships patterns"
        );
    }
    // The list is sorted by name (that is the order the UI shows).
    let names: Vec<&str> = styles.iter().map(|s| s["name"].as_str().unwrap()).collect();
    assert!(names.windows(2).all(|w| w[0] <= w[1]), "{names:?}");

    let charts = charts(&studio);
    for id in BUNDLED_CHARTS {
        let chart = find_chart(&charts, id);
        assert_eq!(chart["schemaVersion"], 1, "{id}");
        assert_eq!(chart["timeSig"], json!([4, 4]), "{id}");
        let style = chart["defaultStyleId"].as_str().unwrap_or("");
        assert!(
            BUNDLED_STYLES.iter().any(|(s, _, _)| *s == style),
            "{id} default style {style:?} is bundled"
        );
        assert!(!chart["sections"].as_array().unwrap().is_empty(), "{id}");
        assert!(!chart["arrangement"].as_array().unwrap().is_empty(), "{id}");
    }
    let blues = find_chart(&charts, "blues-12-bar");
    assert_eq!(blues["name"], "12-Bar Blues (Standard)");
    assert_eq!(blues["defaultStyleId"], "blues-shuffle");
    assert_eq!(blues["defaultBpm"], 110.0);
    assert_eq!(blues["keyTonic"], 9);
    assert_eq!(blues["mode"], "major");
    assert_eq!(blues["sections"][0]["id"], "chorus");
    assert_eq!(blues["sections"][0]["bars"].as_array().unwrap().len(), 12);
    assert_eq!(
        blues["arrangement"],
        json!([{"sectionId": "chorus", "repeats": 2}])
    );
    let form = find_chart(&charts, "rock-song-form");
    assert_eq!(form["sections"].as_array().unwrap().len(), 5);
    assert_eq!(form["arrangement"].as_array().unwrap().len(), 8);
    assert_eq!(form["arrangement"][0]["sectionId"], "intro");
    let names: Vec<&str> = charts.iter().map(|c| c["name"].as_str().unwrap()).collect();
    assert!(names.windows(2).all(|w| w[0] <= w[1]), "{names:?}");
}

#[test]
fn every_bundled_chart_loads_and_the_band_follows_its_style_tempo_and_first_chord() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let styles = studio.ok("band_list_styles", json!({}));
    let list = charts(&studio);
    let bundled: Vec<Value> = list
        .iter()
        .filter(|c| BUNDLED_CHARTS.contains(&c["id"].as_str().unwrap()))
        .cloned()
        .collect();
    assert_eq!(bundled.len(), BUNDLED_CHARTS.len());

    for chart in bundled {
        let id = chart["id"].as_str().unwrap();
        let loaded = studio.ok("band_load_chart", json!({"chartId": id}));
        assert_eq!(
            loaded, chart,
            "{id}: band_load_chart returns the library chart"
        );

        // The first resolved bar comes from the first arranged section.
        let first_id = &chart["arrangement"][0]["sectionId"];
        let section = chart["sections"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| &s["id"] == first_id)
            .unwrap();
        let bars = section["bars"].as_array().unwrap();
        let first_chord = bars[0][0]["chord"].clone();
        let next_chord = if bars[0].as_array().unwrap().len() > 1 {
            bars[0][1]["chord"].clone()
        } else {
            bars[1][0]["chord"].clone()
        };
        let style_id = chart["defaultStyleId"].as_str().unwrap();
        let style_name = styles
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["id"] == style_id)
            .map(|s| s["name"].clone())
            .unwrap();

        // Wait for the FULL post-load state, not just chord+style+bpm: the engine's
        // default telemetry is an A7/D7 blues at exactly the bundled blues charts'
        // style and tempo, so a partial predicate can match the pre-load default on
        // a slow runner before the chart lands (#105). The asserts below document
        // the matched snapshot; a never-appearing state fails the wait with the
        // last telemetry in the message.
        let tel = telemetry_where(&studio, &format!("{id} loaded"), |t| {
            t["band"]["current_chord"] == first_chord
                && t["band"]["next_chord"] == next_chord
                && t["band"]["current_section"] == section["name"]
                && t["band"]["style_id"] == style_id
                && t["transport"]["bpm"] == chart["defaultBpm"]
                && t["transport"]["time_signature"] == json!([4, 4])
                && t["transport"]["state"] == "stopped"
        });
        assert_eq!(tel["band"]["style_name"], style_name, "{id}");
        assert_eq!(tel["band"]["next_chord"], next_chord, "{id}");
        assert_eq!(tel["band"]["current_section"], section["name"], "{id}");
        assert_eq!(tel["transport"]["time_signature"], json!([4, 4]), "{id}");
        assert_eq!(tel["transport"]["state"], "stopped", "{id}");
        assert_eq!(tel["band"]["pending_style_id"], Value::Null, "{id}");
    }
}

#[test]
fn loading_without_following_keeps_the_chosen_style_and_tempo_and_unknown_ids_are_named() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("band_set_style", json!({"styleId": "jazz-swing"}));
    studio.ok("transport_set_tempo", json!({"bpm": 77.0}));

    let chart = studio.ok(
        "band_load_chart",
        json!({"chartId": "blues-8-bar", "followChart": false}),
    );
    assert_eq!(chart["id"], "blues-8-bar");
    let tel = telemetry_where(&studio, "the 8-bar blues", |t| {
        t["band"]["current_chord"] == "C7"
    });
    assert_eq!(tel["band"]["style_id"], "jazz-swing");
    assert_eq!(tel["transport"]["bpm"], 77.0);
    assert_eq!(tel["band"]["current_section"], "Chorus");

    // Following the chart adopts its default style and tempo.
    studio.ok(
        "band_load_chart",
        json!({"chartId": "blues-8-bar", "followChart": true}),
    );
    let tel = telemetry_where(&studio, "chart followed", |t| {
        t["band"]["style_id"] == "blues-shuffle"
    });
    assert_eq!(tel["transport"]["bpm"], 95.0);
    assert_eq!(tel["band"]["current_chord"], "C7");

    let missing = unique("no-such-chart");
    assert_eq!(
        studio.err("band_load_chart", json!({"chartId": &missing})),
        format!("unknown chart \"{missing}\"")
    );
    let err = studio.err("band_load_chart", json!({"chartId": 42}));
    assert!(err.contains("chartId"), "{err}");
    let err = studio.err("band_load_chart", json!({}));
    assert!(err.contains("chartId"), "{err}");

    // The refusals left the loaded chart alone.
    let tel = studio.ok("audio_get_telemetry", json!({}));
    assert_eq!(tel["band"]["current_chord"], "C7");
    assert_eq!(tel["transport"]["bpm"], 95.0);
}

#[test]
fn an_inline_chart_plays_without_touching_the_library_and_can_change_the_meter() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let before = chart_ids(&studio);
    let id = unique("inline");
    assert_eq!(
        studio.ok("band_load_chart_inline", json!({"chart": four_four(&id)})),
        Value::Null
    );
    let tel = telemetry_where(&studio, "inline chart", |t| {
        t["band"]["current_chord"] == "Gm7"
    });
    assert_eq!(tel["band"]["next_chord"], "C7");
    assert_eq!(tel["band"]["current_section"], "A");
    // No default style: the first 4/4 style by name is chosen.
    assert_eq!(tel["band"]["style_id"], "blues-shuffle");
    assert_eq!(tel["transport"]["time_signature"], json!([4, 4]));
    // Neither registered nor written.
    assert_eq!(chart_ids(&studio), before);
    assert!(!user_chart_file(&id).exists());

    // A 6/8 chart with a 6/8 default style switches the transport meter...
    let waltz = chart_value(
        &unique("six-eight"),
        [6, 8],
        Some("ballad-68"),
        &[&[("Am", 3.0), ("E7", 3.0)]],
    );
    studio.ok("band_load_chart_inline", json!({"chart": waltz}));
    let tel = telemetry_where(&studio, "6/8 meter", |t| {
        t["transport"]["time_signature"] == json!([6, 8])
    });
    assert_eq!(tel["band"]["style_id"], "ballad-68");
    assert_eq!(tel["band"]["current_chord"], "Am");
    assert_eq!(tel["band"]["next_chord"], "E7");

    // ...after which a 4/4 style or a 4/4 chart without following no longer fits.
    assert_eq!(
        studio.err("band_set_style", json!({"styleId": "blues-shuffle"})),
        METER_MISMATCH
    );
    assert_eq!(
        studio.err(
            "band_load_chart",
            json!({"chartId": "blues-12-bar", "followChart": false})
        ),
        "Load a chart with a matching style to change meter."
    );
    // Following a 4/4 chart brings the meter back.
    studio.ok("band_load_chart", json!({"chartId": "blues-12-bar"}));
    let tel = telemetry_where(&studio, "4/4 meter", |t| {
        t["transport"]["time_signature"] == json!([4, 4])
    });
    assert_eq!(tel["band"]["style_id"], "blues-shuffle");
    assert_eq!(tel["band"]["current_chord"], "A7");
}

#[test]
fn the_inline_validator_names_what_is_wrong_and_leaves_the_band_untouched() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("band_load_chart", json!({"chartId": "ii-v-i"}));
    telemetry_where(&studio, "ii-v-i", |t| t["band"]["current_chord"] == "Dm7");

    let good = four_four(&unique("valid"));
    let with = |edit: fn(&mut Value)| {
        let mut c = good.clone();
        edit(&mut c);
        c
    };
    let cases: Vec<(&str, Value, String)> = vec![
        (
            "no sections",
            with(|c| c["sections"] = json!([])),
            "chart has no sections".into(),
        ),
        (
            "no arrangement",
            with(|c| c["arrangement"] = json!([])),
            "chart has no arrangement".into(),
        ),
        (
            "section without bars",
            with(|c| c["sections"][0]["bars"] = json!([])),
            "section \"a\" has no bars".into(),
        ),
        (
            "empty bar",
            with(|c| c["sections"][0]["bars"] = json!([[]])),
            "section \"a\" bar 1 is empty".into(),
        ),
        (
            "bar shorter than the meter",
            with(|c| c["sections"][0]["bars"][1][0]["beats"] = json!(3.0)),
            "section \"a\" bar 2 holds 3 beats, expected 4".into(),
        ),
        (
            "negative beats",
            with(|c| c["sections"][0]["bars"][1][0]["beats"] = json!(-4.0)),
            "Chord beat lengths must be positive and finite.".into(),
        ),
        (
            "zero meter",
            with(|c| c["timeSig"] = json!([0, 4])),
            "time signature must be positive".into(),
        ),
        (
            "tempo above 240",
            with(|c| c["defaultBpm"] = json!(240.5)),
            "Chart tempo must be within 40–240 BPM.".into(),
        ),
        (
            "tempo below 40",
            with(|c| c["defaultBpm"] = json!(39.9)),
            "Chart tempo must be within 40–240 BPM.".into(),
        ),
        (
            "zero repeats",
            with(|c| c["arrangement"][0]["repeats"] = json!(0)),
            "Keep chart repeats positive and the arrangement within 4096 bars.".into(),
        ),
        (
            "more than 4096 bars",
            with(|c| c["arrangement"][0]["repeats"] = json!(2049)),
            "Keep chart repeats positive and the arrangement within 4096 bars.".into(),
        ),
        (
            "arrangement of an unknown section",
            with(|c| c["arrangement"][0]["sectionId"] = json!("nope")),
            "arrangement references unknown section \"nope\"".into(),
        ),
        (
            "duplicate section ids",
            with(|c| {
                let a = c["sections"][0].clone();
                c["sections"] = json!([a.clone(), a]);
            }),
            "Chart section IDs must be nonempty and unique.".into(),
        ),
        (
            "empty chart id",
            with(|c| c["id"] = json!("   ")),
            "chart id is empty".into(),
        ),
        (
            "3/4 with no matching style",
            with(|c| {
                c["timeSig"] = json!([3, 4]);
                c["sections"][0]["bars"] = json!([[{"chord": "Gm7", "beats": 3.0}]]);
            }),
            "No style matches this chart's meter.".into(),
        ),
        (
            "6/8 with a 4/4 default style",
            with(|c| {
                c["timeSig"] = json!([6, 8]);
                c["defaultStyleId"] = json!("blues-shuffle");
                c["sections"][0]["bars"] = json!([[{"chord": "Am", "beats": 6.0}]]);
            }),
            "The chart's default style has a different meter. Choose a matching style.".into(),
        ),
        (
            "unknown default style",
            with(|c| c["defaultStyleId"] = json!("no-such-style")),
            "unknown style \"no-such-style\"".into(),
        ),
    ];
    for (label, chart, expected) in cases {
        let err = studio.err("band_load_chart_inline", json!({"chart": chart}));
        assert_eq!(err, expected, "{label}");
    }
    // Not a chart at all: Tauri names the argument.
    let err = studio.err("band_load_chart_inline", json!({"chart": "nope"}));
    assert!(err.contains("chart"), "{err}");
    let err = studio.err(
        "band_load_chart_inline",
        json!({"chart": with(|c| { c.as_object_mut().unwrap().remove("sections"); })}),
    );
    assert!(err.contains("sections"), "{err}");

    // Every refusal left the band on the chart it had.
    let tel = studio.ok("audio_get_telemetry", json!({}));
    assert_eq!(tel["band"]["current_chord"], "Dm7");
    assert_eq!(tel["band"]["style_id"], "jazz-swing");
    assert_eq!(tel["transport"]["time_signature"], json!([4, 4]));
    assert_eq!(tel["transport"]["bpm"], 130.0);

    // The tempo bounds are inclusive: charts at 40 and 240 BPM are accepted. (The
    // inline load keeps the transport tempo; see the ignored test below.)
    for bpm in [40.0, 240.0] {
        studio.ok("band_load_chart", json!({"chartId": "ii-v-i"}));
        band_where(&studio, "ii-v-i again", |b| b["current_chord"] == "Dm7");
        let mut chart = good.clone();
        chart["defaultBpm"] = json!(bpm);
        assert_eq!(
            studio.ok("band_load_chart_inline", json!({"chart": chart})),
            Value::Null
        );
        band_where(&studio, &format!("chart at {bpm} BPM"), |b| {
            b["current_chord"] == "Gm7"
        });
    }

    // Chord symbols are not judged by the validator: the band shows them verbatim.
    studio.ok(
        "band_load_chart_inline",
        json!({"chart": with(|c| c["sections"][0]["bars"][0][0]["chord"] = json!("???"))}),
    );
    let band = band_where(&studio, "odd chord", |b| b["current_chord"] == "???");
    assert_eq!(band["next_chord"], "C7");
}

/// `band_load_chart` and the editor's inline Play share `apply_chart_timing`, so a
/// chart's `bpm:` line becomes the transport tempo in both paths (#81 / #83).
#[test]
fn an_inline_chart_sets_the_transport_tempo_like_a_library_chart_does() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    studio.ok("transport_set_tempo", json!({"bpm": 77.0}));
    telemetry_where(&studio, "77 bpm", |t| t["transport"]["bpm"] == 77.0);
    let mut chart = four_four(&unique("tempo"));
    chart["defaultBpm"] = json!(132.0);
    studio.ok("band_load_chart_inline", json!({"chart": chart}));
    let tel = telemetry_where(&studio, "the chart's tempo", |t| {
        t["transport"]["bpm"] == 132.0
    });
    assert_eq!(tel["band"]["current_chord"], "Gm7");
}

#[test]
fn saving_a_chart_writes_a_user_file_that_is_listed_and_survives_a_reload() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("saved");
    let mut chart = four_four(&id);
    chart["name"] = json!("Saved Chart");
    let before = charts(&studio);
    assert!(before.iter().all(|c| c["id"] != id));

    let path = studio.ok("charts_save", json!({"chart": chart}));
    let path = PathBuf::from(path.as_str().expect("saved path"));
    assert_eq!(path, user_chart_file(&id));
    let on_disk = read_json(&path);
    assert_eq!(on_disk["id"], id);
    assert_eq!(on_disk["name"], "Saved Chart");
    assert_eq!(on_disk["sections"][0]["bars"], chart["sections"][0]["bars"]);
    assert_eq!(on_disk["defaultBpm"], 100.0);

    let after = charts(&studio);
    assert_eq!(after.iter().filter(|c| c["id"] == id).count(), 1);
    assert_eq!(find_chart(&after, &id)["name"], "Saved Chart");

    let info = studio.ok("library_reload", json!({}));
    assert_eq!(
        PathBuf::from(info["chartsDir"].as_str().unwrap()),
        user_dir().join("charts")
    );
    assert_eq!(
        PathBuf::from(info["stylesDir"].as_str().unwrap()),
        user_dir().join("styles")
    );
    let user_ids: Vec<&str> = info["userChartIds"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert!(user_ids.contains(&id.as_str()), "{user_ids:?}");
    assert!(user_ids.windows(2).all(|w| w[0] <= w[1]), "{user_ids:?}");
    assert!(
        info["loadErrors"]
            .as_array()
            .unwrap()
            .iter()
            .all(|e| !e.as_str().unwrap().contains(&id)),
        "{}",
        info["loadErrors"]
    );
    assert_eq!(find_chart(&charts(&studio), &id)["name"], "Saved Chart");
    let loaded = studio.ok("band_load_chart", json!({"chartId": &id}));
    assert_eq!(loaded["name"], "Saved Chart");
    band_where(&studio, "saved chart", |b| b["current_chord"] == "Gm7");

    // Saving again keeps a backup of the previous file and updates the listing.
    chart["name"] = json!("Saved Chart v2");
    studio.ok("charts_save", json!({"chart": chart}));
    assert_eq!(find_chart(&charts(&studio), &id)["name"], "Saved Chart v2");
    assert_eq!(read_json(&path)["name"], "Saved Chart v2");
    assert_eq!(
        read_json(&path.with_extension("json.bak"))["name"],
        "Saved Chart"
    );
    assert_eq!(charts(&studio).iter().filter(|c| c["id"] == id).count(), 1);

    // Ids that are not file-safe get a safe file name and stay addressable by id.
    let odd = unique("odd id/with spaces");
    let path = studio.ok("charts_save", json!({"chart": four_four(&odd)}));
    let path = PathBuf::from(path.as_str().unwrap());
    assert_eq!(path.parent().unwrap(), user_dir().join("charts"));
    let stem = path.file_stem().unwrap().to_string_lossy().into_owned();
    assert_eq!(stem, odd.replace([' ', '/'], "-"));
    assert_eq!(read_json(&path)["id"], odd);
    assert!(chart_ids(&studio).contains(&odd));
    studio.ok("charts_delete_user", json!({"chartId": &odd}));
    assert!(!path.exists());

    // An invalid chart is refused before anything is written.
    let bad_id = unique("bad-save");
    let mut bad = four_four(&bad_id);
    bad["sections"][0]["bars"] = json!([]);
    assert_eq!(
        studio.err("charts_save", json!({"chart": bad})),
        "section \"a\" has no bars"
    );
    assert!(!user_chart_file(&bad_id).exists());
    assert!(!chart_ids(&studio).contains(&bad_id));
    let err = studio.err("charts_save", json!({"chart": 1}));
    assert!(err.contains("chart"), "{err}");
}

#[test]
fn deleting_removes_only_user_chart_files_and_refuses_bundled_ids() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    assert_eq!(
        studio.err("charts_delete_user", json!({"chartId": "blues-12-bar"})),
        "\"blues-12-bar\" is not a user chart"
    );
    assert!(chart_ids(&studio).contains(&"blues-12-bar".to_string()));
    let ghost = unique("ghost");
    assert_eq!(
        studio.err("charts_delete_user", json!({"chartId": &ghost})),
        format!("\"{ghost}\" is not a user chart")
    );
    let err = studio.err("charts_delete_user", json!({"chartId": null}));
    assert!(err.contains("chartId"), "{err}");

    let id = unique("doomed");
    let path = studio.ok("charts_save", json!({"chart": four_four(&id)}));
    let path = PathBuf::from(path.as_str().unwrap());
    assert!(path.exists());
    assert!(chart_ids(&studio).contains(&id));
    assert_eq!(
        studio.ok("charts_delete_user", json!({"chartId": &id})),
        Value::Null
    );
    assert!(!path.exists());
    assert!(!chart_ids(&studio).contains(&id));
    let info = studio.ok("library_reload", json!({}));
    assert!(!info["userChartIds"]
        .as_array()
        .unwrap()
        .contains(&json!(id)));
    assert_eq!(
        studio.err("charts_delete_user", json!({"chartId": &id})),
        format!("\"{id}\" is not a user chart")
    );

    // A user chart with a bundled id shadows the bundled one and can be deleted,
    // after which the bundled chart is back.
    let listed = charts(&studio);
    let mut shadow = find_chart(&listed, "one-chord-vamp");
    assert_eq!(shadow["name"], "One-Chord Groove Vamp");
    shadow["name"] = json!("Vamp (user copy)");
    studio.ok("charts_save", json!({"chart": shadow}));
    let shadowed = charts(&studio);
    assert_eq!(shadowed.len(), listed.len());
    assert_eq!(
        find_chart(&shadowed, "one-chord-vamp")["name"],
        "Vamp (user copy)"
    );
    assert!(studio.ok("library_reload", json!({}))["userChartIds"]
        .as_array()
        .unwrap()
        .contains(&json!("one-chord-vamp")));
    studio.ok("charts_delete_user", json!({"chartId": "one-chord-vamp"}));
    assert!(!user_chart_file("one-chord-vamp").exists());
    let restored = charts(&studio);
    assert_eq!(restored.len(), listed.len());
    assert_eq!(
        find_chart(&restored, "one-chord-vamp")["name"],
        "One-Chord Groove Vamp"
    );
    assert_eq!(
        studio.err("charts_delete_user", json!({"chartId": "one-chord-vamp"})),
        "\"one-chord-vamp\" is not a user chart"
    );
}

#[test]
fn importing_a_chart_file_copies_it_into_the_user_charts_folder() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let id = unique("imported");
    let mut chart = four_four(&id);
    chart["name"] = json!("Imported Chart");
    // The file stem differs from the id: the copy is named by id.
    let source = user_dir().join(format!("{}.json", unique("dropped-in")));
    std::fs::write(&source, serde_json::to_string_pretty(&chart).unwrap()).unwrap();

    let imported = studio.ok(
        "charts_import_file",
        json!({"path": source.to_string_lossy()}),
    );
    assert_eq!(imported["id"], id);
    assert_eq!(imported["name"], "Imported Chart");
    assert_eq!(
        imported["sections"][0]["bars"],
        chart["sections"][0]["bars"]
    );
    let copy = user_chart_file(&id);
    assert_eq!(read_json(&copy)["name"], "Imported Chart");
    assert!(source.exists(), "the source file is left where it was");
    assert_eq!(find_chart(&charts(&studio), &id)["name"], "Imported Chart");
    assert!(studio.ok("library_reload", json!({}))["userChartIds"]
        .as_array()
        .unwrap()
        .contains(&json!(id)));
    studio.ok("band_load_chart", json!({"chartId": &id}));
    band_where(&studio, "imported chart", |b| b["current_chord"] == "Gm7");

    // A missing file names the path.
    let missing = user_dir().join(format!("{}.json", unique("missing")));
    let err = studio.err(
        "charts_import_file",
        json!({"path": missing.to_string_lossy()}),
    );
    assert!(
        err.starts_with(&format!("{}: ", missing.display())),
        "{err}"
    );

    // A file that is not JSON names the path and the parse problem.
    let garbage = user_dir().join(format!("{}.json", unique("garbage")));
    std::fs::write(&garbage, "{ not a chart").unwrap();
    let err = studio.err(
        "charts_import_file",
        json!({"path": garbage.to_string_lossy()}),
    );
    assert!(
        err.starts_with(&format!("{}: ", garbage.display())) && err.contains("line 1"),
        "{err}"
    );

    // A file that parses but does not validate is neither copied nor listed.
    let invalid_id = unique("invalid-import");
    let mut invalid = four_four(&invalid_id);
    invalid["timeSig"] = json!([0, 4]);
    let invalid_file = user_dir().join(format!("{invalid_id}.json"));
    std::fs::write(&invalid_file, invalid.to_string()).unwrap();
    assert_eq!(
        studio.err(
            "charts_import_file",
            json!({"path": invalid_file.to_string_lossy()})
        ),
        "time signature must be positive"
    );
    assert!(!user_chart_file(&invalid_id).exists());
    assert!(!chart_ids(&studio).contains(&invalid_id));

    let err = studio.err("charts_import_file", json!({"path": 1}));
    assert!(err.contains("path"), "{err}");
}

#[test]
fn library_reload_reports_broken_user_chart_files_without_registering_them() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let dir = user_dir().join("charts");
    std::fs::create_dir_all(&dir).unwrap();
    let garbage = dir.join(format!("{}.json", unique("garbage")));
    std::fs::write(&garbage, "{ not json").unwrap();
    let invalid_id = unique("too-fast");
    let mut invalid = four_four(&invalid_id);
    invalid["defaultBpm"] = json!(999.0);
    let invalid_file = dir.join(format!("{invalid_id}.json"));
    std::fs::write(&invalid_file, invalid.to_string()).unwrap();
    // Backups and half-written files never count as charts.
    let ignored = dir.join(format!("{}.json.tmp", unique("half-written")));
    std::fs::write(&ignored, "{").unwrap();

    let info = studio.ok("library_reload", json!({}));
    let errors: Vec<String> = info["loadErrors"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e.as_str().unwrap().to_string())
        .collect();
    let garbage_name = garbage.file_name().unwrap().to_string_lossy().into_owned();
    assert!(
        errors
            .iter()
            .any(|e| e.contains(&garbage_name) && e.contains("line 1")),
        "{errors:?}"
    );
    assert!(
        errors.contains(&format!(
            "chart {invalid_id}: Chart tempo must be within 40–240 BPM."
        )),
        "{errors:?}"
    );
    let ignored_name = ignored.file_name().unwrap().to_string_lossy().into_owned();
    assert!(
        errors.iter().all(|e| !e.contains(&ignored_name)),
        "{errors:?}"
    );
    assert!(!info["userChartIds"]
        .as_array()
        .unwrap()
        .contains(&json!(invalid_id)));
    let ids = chart_ids(&studio);
    assert!(!ids.contains(&invalid_id));
    for id in BUNDLED_CHARTS {
        assert!(
            ids.contains(&id.to_string()),
            "{id} survives a broken user file"
        );
    }
    assert_eq!(
        studio.err("band_load_chart", json!({"chartId": &invalid_id})),
        format!("unknown chart \"{invalid_id}\"")
    );

    // Removing the files clears the reports about them.
    std::fs::remove_file(&garbage).unwrap();
    std::fs::remove_file(&invalid_file).unwrap();
    std::fs::remove_file(&ignored).unwrap();
    let info = studio.ok("library_reload", json!({}));
    assert!(
        info["loadErrors"].as_array().unwrap().iter().all(|e| !e
            .as_str()
            .unwrap()
            .contains(&garbage_name)
            && !e.as_str().unwrap().contains(&invalid_id)),
        "{}",
        info["loadErrors"]
    );
}

#[test]
fn band_set_style_switches_bundled_styles_and_refuses_unknown_or_other_meter_ones() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let start = band_where(&studio, "startup style", |b| {
        b["style_id"] == "blues-shuffle"
    });
    assert_eq!(start["style_name"], "Blues Shuffle");

    for (id, name, meter) in BUNDLED_STYLES {
        if meter != [4, 4] {
            continue;
        }
        assert_eq!(
            studio.ok("band_set_style", json!({"styleId": id})),
            Value::Null
        );
        let band = band_where(&studio, id, |b| b["style_id"] == id);
        assert_eq!(band["style_name"], name);
        assert_eq!(band["pending_style_id"], Value::Null);
    }

    assert_eq!(
        studio.err("band_set_style", json!({"styleId": "ballad-68"})),
        METER_MISMATCH
    );
    let missing = unique("no-such-style");
    assert_eq!(
        studio.err("band_set_style", json!({"styleId": &missing})),
        format!("unknown style \"{missing}\"")
    );
    let err = studio.err("band_set_style", json!({"styleId": 7}));
    assert!(err.contains("styleId"), "{err}");
    let err = studio.err("band_set_style", json!({}));
    assert!(err.contains("styleId"), "{err}");

    // The last accepted style is still playing.
    let band = studio.ok("audio_get_telemetry", json!({}))["band"].clone();
    assert_eq!(band["style_id"], "rock-straight");
    assert_eq!(band["style_name"], "Rock Straight 8th");
}

#[test]
fn band_set_intensity_clamps_to_the_unit_range() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    band_where(&studio, "default intensity", |b| near(&b["intensity"], 0.5));
    for (sent, shown) in [
        (0.25, 0.25),
        (1.0, 1.0),
        (1.7, 1.0),
        (-0.3, 0.0),
        (0.0, 0.0),
        (0.6, 0.6),
    ] {
        assert_eq!(
            studio.ok("band_set_intensity", json!({"intensity": sent})),
            Value::Null
        );
        let band = band_where(&studio, &format!("intensity {sent} -> {shown}"), |b| {
            near(&b["intensity"], shown)
        });
        assert_eq!(band["pending_intensity"], Value::Null);
    }
    let err = studio.err("band_set_intensity", json!({"intensity": "loud"}));
    assert!(err.contains("intensity"), "{err}");
    let err = studio.err("band_set_intensity", json!({}));
    assert!(err.contains("intensity"), "{err}");
    let band = studio.ok("audio_get_telemetry", json!({}))["band"].clone();
    assert!(near(&band["intensity"], 0.6), "{band}");
}

#[test]
fn band_set_patches_mutes_follow_energy_and_queued_changes_into_the_telemetry() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    let start = band_where(&studio, "fresh band", |b| b["style_id"] == "blues-shuffle");
    assert_eq!(start["mute_drums"], false);
    assert_eq!(start["mute_bass"], false);
    assert_eq!(start["mute_comp"], false);
    assert_eq!(start["follow_energy"], false);

    assert_eq!(
        studio.ok("band_set", json!({"args": {"muteDrums": true}})),
        Value::Null
    );
    let band = band_where(&studio, "drums muted", |b| b["mute_drums"] == true);
    assert_eq!(band["mute_bass"], false);
    assert_eq!(band["mute_comp"], false);

    studio.ok(
        "band_set",
        json!({"args": {"muteBass": true, "muteComp": true}}),
    );
    let band = band_where(&studio, "bass and comp muted", |b| {
        b["mute_bass"] == true && b["mute_comp"] == true
    });
    assert_eq!(
        band["mute_drums"], true,
        "unmentioned parts keep their state"
    );

    studio.ok(
        "band_set",
        json!({"args": {"muteDrums": false, "followEnergy": true, "intensity": 0.9}}),
    );
    let band = band_where(&studio, "drums back, following energy", |b| {
        b["follow_energy"] == true && b["mute_drums"] == false
    });
    // Follow mode continuously derives intensity from the input envelope.
    assert!(
        band["intensity"]
            .as_f64()
            .is_some_and(|v| (0.0..=1.0).contains(&v)),
        "{band}"
    );
    assert_eq!(band["mute_bass"], true);
    studio.ok(
        "band_set",
        json!({"args": {"followEnergy": false, "intensity": 0.9}}),
    );
    band_where(&studio, "fixed intensity", |b| {
        b["follow_energy"] == false && near(&b["intensity"], 0.9)
    });

    // Queued for the next bar: nothing changes while the transport is stopped, the
    // telemetry shows what is pending.
    studio.ok(
        "band_set",
        json!({"args": {"styleId": "funk-16", "intensity": 0.3, "atNextBar": true}}),
    );
    let band = band_where(&studio, "queued style", |b| {
        b["pending_style_id"] == "funk-16"
    });
    assert!(near(&band["pending_intensity"], 0.3), "{band}");
    assert!(near(&band["intensity"], 0.9), "{band}");
    assert_eq!(band["style_id"], "blues-shuffle");

    // Immediate style change.
    studio.ok("band_set", json!({"args": {"styleId": "metal-gallop"}}));
    let band = band_where(&studio, "metal", |b| b["style_id"] == "metal-gallop");
    assert_eq!(band["style_name"], "Heavy Metal Gallop");

    // Refusals leave the band alone.
    assert_eq!(
        studio.err("band_set", json!({"args": {"styleId": "ballad-68"}})),
        METER_MISMATCH
    );
    let missing = unique("no-such-style");
    assert_eq!(
        studio.err("band_set", json!({"args": {"styleId": &missing}})),
        format!("unknown style \"{missing}\"")
    );
    let err = studio.err("band_set", json!({"args": {"muteDrums": "yes"}}));
    assert!(err.contains("args"), "{err}");
    let err = studio.err("band_set", json!({}));
    assert!(err.contains("args"), "{err}");
    assert_eq!(studio.ok("band_set", json!({"args": {}})), Value::Null);
    let band = studio.ok("audio_get_telemetry", json!({}))["band"].clone();
    assert_eq!(band["style_id"], "metal-gallop");
    assert_eq!(band["mute_bass"], true);
    assert_eq!(band["follow_energy"], false);

    // Loading a chart starts a new song: every part plays again.
    studio.ok("band_load_chart", json!({"chartId": "blues-12-bar"}));
    let band = band_where(&studio, "new song", |b| {
        b["current_chord"] == "A7"
            && b["style_id"] == "blues-shuffle"
            && b["mute_drums"] == false
            && b["mute_bass"] == false
            && b["mute_comp"] == false
    });
    assert_eq!(band["mute_drums"], false);
    assert_eq!(band["mute_bass"], false);
    assert_eq!(band["mute_comp"], false);
    assert_eq!(band["style_id"], "blues-shuffle");
}

#[test]
fn band_cue_queues_the_named_cue_and_names_an_unknown_one() {
    let _scenario = common::scenario();
    let studio = Studio::boot();
    for cue in ["fill", "crash", "stop", "ending"] {
        assert_eq!(studio.ok("band_cue", json!({"cue": cue})), Value::Null);
        let band = band_where(&studio, cue, |b| b["pending_cue"] == cue);
        assert_eq!(
            band["active_cue"], "none",
            "{cue} waits for the next bar and the transport is stopped"
        );
        assert_eq!(band["is_stopped"], false);
    }
    studio.ok("band_cue", json!({"cue": "none"}));
    band_where(&studio, "cue cleared", |b| b["pending_cue"] == "none");

    for bad in ["Fill", "solo", ""] {
        assert_eq!(
            studio.err("band_cue", json!({"cue": bad})),
            format!("Unknown cue: {bad}")
        );
    }
    let err = studio.err("band_cue", json!({"cue": 3}));
    assert!(err.contains("cue"), "{err}");
    let band = studio.ok("audio_get_telemetry", json!({}))["band"].clone();
    assert_eq!(band["pending_cue"], "none");
    assert_eq!(band["active_cue"], "none");
}
