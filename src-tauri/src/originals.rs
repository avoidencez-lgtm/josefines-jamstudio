//! Song documents are ordinary JSON; the existing chart and style formats do the work.
use crate::{
    library::{validate_chart, Library},
    AppState,
};
use jam_audio::{
    recorder::TakeMetadata,
    workstation::{Clip, ClipSpec},
};
use jam_band::sequencer::SectionBand;
use jam_core::chart::Chart;
use serde::Deserialize;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, State};

static SAVE_LOCK: Mutex<()> = Mutex::new(());

#[tauri::command]
pub async fn takes_melody(
    take_id: String,
    start_seconds: f64,
    length_seconds: f64,
) -> Result<Vec<jam_audio::melody::MelodyNote>, String> {
    if !start_seconds.is_finite()
        || start_seconds < 0.0
        || !length_seconds.is_finite()
        || !(0.1..=60.0).contains(&length_seconds)
    {
        return Err("Choose a nonnegative start and 0.1–60 seconds of melody.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        valid_id(&take_id)?;
        let take = file_takes()?
            .0
            .into_iter()
            .find(|t| t.id == take_id)
            .ok_or("Take is not in the recording library.")?;
        let path = Path::new(&take.path_input);
        if fs::metadata(path).map_err(|e| e.to_string())?.len() > 64 * 1024 * 1024 {
            return Err("Use a short recording (at most 64 MB and two minutes).".into());
        }
        let (samples, rate) = jam_audio::recorder::read_wav_mono(path)?;
        let duration = samples.len() as f64 / rate as f64;
        if duration > 120.0 || start_seconds >= duration {
            return Err("Choose a start inside a recording no longer than two minutes.".into());
        }
        let start = (start_seconds * rate as f64) as usize;
        let end = (((start_seconds + length_seconds) * rate as f64) as usize).min(samples.len());
        Ok(jam_audio::melody::extract(&samples[start..end], rate))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Part {
    style_id: String,
    intensity: f32,
    gain: f32,
    muted: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Section {
    parts: [Part; 3],
    swing: f32,
    #[serde(default)]
    rig_scene: Option<usize>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SongBody {
    chart: Chart,
    sections: BTreeMap<String, Section>,
    clips: Vec<ClipSpec>,
    #[serde(default)]
    tone_profile_id: Option<String>,
    #[serde(default)]
    lyrics: BTreeMap<String, String>,
}

fn song_dir() -> PathBuf {
    Library::default_user_root().join("originals")
}
pub(crate) fn valid_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 100
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("Invalid song or take id.".into());
    }
    Ok(())
}
fn path(root: &Path, id: &str) -> Result<PathBuf, String> {
    valid_id(id)?;
    Ok(root.join(format!("{id}.json")))
}
fn body(doc: &Value) -> Result<SongBody, String> {
    if doc.to_string().len() > 2_000_000 {
        return Err("Song file exceeds 2 MB. Remove unused versions.".into());
    }
    if doc["schemaVersion"] != 1 {
        return Err("Unsupported song version. Update the app before editing this file.".into());
    }
    if !doc["versions"].is_array() {
        return Err("Song version list must be an array.".into());
    }
    let b: SongBody =
        serde_json::from_value(doc["body"].clone()).map_err(|e| format!("Song: {e}"))?;
    // Bound before resolving a chart, so a hand-edited repeat count cannot allocate forever.
    if b.chart.sections.len() > 64
        || b.chart.arrangement.len() > 128
        || b.chart.sections.iter().any(|s| s.bars.len() > 256)
        || b.chart
            .arrangement
            .iter()
            .any(|a| a.repeats == 0 || a.repeats > 64)
        || b.clips.len() > 16
        || !b.chart.default_bpm.is_finite()
        || !(40.0..=240.0).contains(&b.chart.default_bpm)
        || b.chart.time_sig != (4, 4)
    {
        return Err(
            "Songwriting supports 4/4, 40–240 BPM, up to 64 sections and 16 guitar clips.".into(),
        );
    }
    for s in &b.chart.sections {
        for bar in &s.bars {
            for c in bar {
                if !c.beats.is_finite() || c.beats <= 0.0 || c.chord.len() > 32 {
                    return Err("Invalid chord or beat count.".into());
                }
            }
        }
    }
    let bars: usize = b
        .chart
        .arrangement
        .iter()
        .map(|a| {
            b.chart
                .sections
                .iter()
                .find(|s| s.id == a.section_id)
                .map_or(0, |s| s.bars.len() * a.repeats as usize)
        })
        .sum();
    if bars > 256 {
        return Err("Keep the song within 256 bars.".into());
    }
    validate_chart(&b.chart)?;
    if b.lyrics.iter().any(|(id, text)| {
        !b.chart.sections.iter().any(|s| &s.id == id) || text.encode_utf16().count() > 12_000
    }) {
        return Err(
            "Lyrics must belong to a song section and stay within 12,000 characters.".into(),
        );
    }
    for s in &b.chart.sections {
        let set = b
            .sections
            .get(&s.id)
            .ok_or_else(|| format!("Missing band settings for {}", s.name))?;
        if !set.swing.is_finite()
            || !(0.5..=0.75).contains(&set.swing)
            || set.parts.iter().any(|p| {
                !p.gain.is_finite()
                    || !(0.0..=2.0).contains(&p.gain)
                    || !p.intensity.is_finite()
                    || !(0.0..=1.0).contains(&p.intensity)
            })
        {
            return Err("Check section swing, intensity and volumes.".into());
        }
    }
    Ok(b)
}

fn write_document(root: &Path, mut doc: Value) -> Result<Value, String> {
    let _lock = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let id = doc["id"].as_str().ok_or("Song id missing")?;
    let file = path(root, id)?;
    let revision = doc["revision"].as_u64().ok_or("Song revision missing")?;
    if file.exists() {
        let current: Value =
            serde_json::from_str(&fs::read_to_string(&file).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        if current["revision"].as_u64() != Some(revision) {
            return Err("This song changed in another window. Reopen it before saving.".into());
        }
    } else if revision != 0 {
        return Err("The song file was moved. Save a copy to keep your edits.".into());
    }
    doc["revision"] = Value::from(revision.checked_add(1).ok_or("Song revision overflow")?);
    body(&doc)?;
    let bytes = serde_json::to_vec_pretty(&doc).map_err(|e| e.to_string())?;
    if bytes.len() > 8_000_000 {
        return Err("Song file exceeds the 8 MB disk-read limit. Remove unused versions.".into());
    }
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let temp = file.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    fs::OpenOptions::new()
        .write(true)
        .open(&temp)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    if file.exists() {
        fs::copy(&file, file.with_extension("json.bak")).map_err(|e| e.to_string())?;
    }
    fs::rename(temp, file).map_err(|e| e.to_string())?;
    Ok(doc)
}

#[tauri::command]
pub fn originals_save(document: Value) -> Result<Value, String> {
    write_document(&song_dir(), document)
}
#[tauri::command]
pub async fn originals_list<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<Vec<Value>, String> {
    let (docs, warnings) = scan_originals(&song_dir())?;
    // Three rooms refresh this list; a damaged file is reported once per session.
    for warning in state.warnings.fresh(warnings) {
        let _ = app.emit("app:error", warning);
    }
    Ok(docs)
}

fn scan_originals(root: &Path) -> Result<(Vec<Value>, Vec<String>), String> {
    if !root.exists() {
        return Ok((vec![], vec![]));
    }
    let mut docs = Vec::new();
    let mut warnings = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let p = entry.map_err(|e| e.to_string())?.path();
        if p.extension().is_some_and(|x| x == "json") {
            let read = || -> Result<Value, String> {
                // Bound disk input separately; body() enforces the same compact 2 MB limit as save.
                if fs::metadata(&p).map_err(|e| e.to_string())?.len() > 8_000_000 {
                    return Err("Song file exceeds the 8 MB disk-read limit.".into());
                }
                let v: Value = serde_json::from_slice(&fs::read(&p).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
                body(&v)?;
                valid_id(v["id"].as_str().ok_or("Song id missing")?)?;
                if v["revision"].as_u64().is_none() {
                    return Err("Song revision is invalid.".into());
                }
                Ok(v)
            };
            match read() {
                Ok(v) => docs.push(v),
                Err(e) => warnings.push(format!(
                    "Cannot read {}: {e}. Other songs remain available; this file was left intact.",
                    p.display()
                )),
            }
        }
    }
    Ok((docs, warnings))
}

pub fn takes_root() -> PathBuf {
    std::env::var("JAM_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| Library::default_user_root())
        .join("takes")
}

pub fn file_takes() -> Result<(Vec<TakeMetadata>, Vec<String>), String> {
    scan_takes(&takes_root())
}

/// Metadata paths are untrusted; updates belong only to root/<validated take id>.
pub fn save_take_manifest(take: &TakeMetadata) -> Result<(), String> {
    valid_id(&take.id)?;
    let root = takes_root().canonicalize().map_err(|e| e.to_string())?;
    let dir = root.join(&take.id);
    let meta = fs::symlink_metadata(&dir).map_err(|e| e.to_string())?;
    let input_dir = Path::new(&take.path_input)
        .parent()
        .ok_or("Take input directory missing")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !meta.is_dir()
        || meta.file_type().is_symlink()
        || dir.canonicalize().map_err(|e| e.to_string())? != dir
        || input_dir != dir
    {
        return Err(format!(
            "Take {} input is not inside its take directory",
            take.id
        ));
    }
    jam_audio::recorder::save_manifest(take)
}

fn scan_takes(root: &Path) -> Result<(Vec<TakeMetadata>, Vec<String>), String> {
    if !root.exists() {
        return Ok((vec![], vec![]));
    }
    let mut takes = Vec::new();
    let mut warnings = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let p = entry.map_err(|e| e.to_string())?.path().join("take.json");
        if p.exists() {
            match fs::read(&p)
                .map_err(|e| e.to_string())
                .and_then(|s| serde_json::from_slice(&s).map_err(|e| e.to_string()))
            {
                Ok(take) => takes.push(take),
                Err(e) => warnings.push(format!(
                    "Cannot read {}: {e}. Other takes remain available; this file was left intact.",
                    p.display()
                )),
            }
        }
    }
    Ok((takes, warnings))
}

pub fn read_clip(spec: ClipSpec, state: &AppState) -> Result<Clip, String> {
    valid_id(&spec.take_id)?;
    let take = crate::find_take(state, &spec.take_id)?;
    let p = Path::new(&take.path_input);
    // ponytail: decode each guitar clip in memory, max 10 min; stream if longer songs are needed.
    if fs::metadata(p)
        .map_err(|e| format!("Cannot read take {} at {}: {e}", take.id, p.display()))?
        .len()
        > 100_000_000
    {
        return Err("Clip is too large. Use a take shorter than ten minutes.".into());
    }
    // One decode per take file, shared by Play, Loop, Record, audition and export (#44).
    let decoded = state
        .clips
        .lock()
        .load(p)
        .map_err(|e| format!("Cannot read take {} at {}: {e}", take.id, p.display()))?;
    Clip::new(spec, decoded.samples, decoded.sample_rate)
}

#[tauri::command]
pub async fn originals_load(document: Value, state: State<'_, AppState>) -> Result<(), String> {
    let song = body(&document)?;
    let tones = {
        let rig = state.rig.lock();
        song_tones(
            &song,
            &rig.profile.id,
            rig.profile.scenes.len(),
            rig.is_live(),
        )?
    };
    let mut sections = BTreeMap::new();
    {
        let lib = state.library.lock();
        for (id, s) in &song.sections {
            let styles = [
                lib.style(&s.parts[0].style_id)?,
                lib.style(&s.parts[1].style_id)?,
                lib.style(&s.parts[2].style_id)?,
            ];
            if styles
                .iter()
                .any(|s| s.feel.time_sig != song.chart.time_sig)
            {
                return Err(format!(
                    "Choose {}/{} styles for this original song.",
                    song.chart.time_sig.0, song.chart.time_sig.1
                ));
            }
            sections.insert(
                id.clone(),
                SectionBand {
                    styles,
                    intensity: std::array::from_fn(|i| s.parts[i].intensity),
                    gains: std::array::from_fn(|i| s.parts[i].gain),
                    muted: std::array::from_fn(|i| s.parts[i].muted),
                    swing: s.swing,
                },
            );
        }
    }
    let clips = song
        .clips
        .into_iter()
        .map(|s| read_clip(s, &state))
        .collect::<Result<Vec<_>, _>>()?;
    let mut snapshot = document.clone();
    snapshot
        .as_object_mut()
        .ok_or("Song must be an object")?
        .remove("versions");
    state
        .engine
        .lock()
        .configure_song(song.chart.resolve(), sections, clips, snapshot)?;
    let mut rig = state.rig.lock();
    rig.song_mappings = Some(tones);
    rig.reset_section_tracking();
    Ok(())
}

fn song_tones(
    song: &SongBody,
    profile: &str,
    scenes: usize,
    live: bool,
) -> Result<std::collections::HashMap<String, usize>, String> {
    let mut mappings = std::collections::HashMap::new();
    let Some(wanted) = &song.tone_profile_id else {
        return Ok(mappings);
    };
    if wanted != profile || !live {
        return Err(format!(
            "Open the {wanted} profile and a MIDI output in Rig, or switch off song tone changes."
        ));
    }
    let mut names = std::collections::BTreeSet::new();
    for section in &song.chart.sections {
        if !names.insert(&section.name) {
            return Err("Use unique section names when song tones are enabled.".into());
        }
        if let Some(scene) = song.sections[&section.id].rig_scene {
            if scene >= scenes {
                return Err(format!("Choose an available tone for {}.", section.name));
            }
            mappings.insert(section.name.clone(), scene);
        }
    }
    Ok(mappings)
}

#[tauri::command]
pub fn originals_record(session_id: String, state: State<'_, AppState>) -> Result<String, String> {
    state.engine.lock().record_song(session_id)
}

#[tauri::command]
pub fn capture_arm(seconds: u32, state: State<'_, AppState>) -> Result<(), String> {
    state.engine.lock().capture.lock().arm(seconds)
}

#[tauri::command]
pub fn clip_audition(spec: ClipSpec, state: State<'_, AppState>) -> Result<(), String> {
    let clip = read_clip(spec, &state)?;
    let eng = state.engine.lock();
    if !eng.status().running {
        return Err("Start a working audio device before listening.".into());
    }
    if eng.recorder_is_recording() {
        return Err("Save the recording before listening to another take.".into());
    }
    eng.transport_stop();
    *eng.audition.lock() = Some(jam_audio::workstation::Audition::new(clip));
    Ok(())
}
#[tauri::command]
pub fn capture_keep(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<TakeMetadata, String> {
    let take = state.engine.lock().keep_capture(session_id)?;
    state.store.lock().insert_take(&take)?;
    Ok(take)
}
#[tauri::command]
pub fn takes_favourite(
    take_id: String,
    favourite: bool,
    state: State<'_, AppState>,
) -> Result<TakeMetadata, String> {
    let mut take = crate::find_take(&state, &take_id)?;
    take.extra
        .insert("favourite".into(), Value::Bool(favourite));
    save_take_manifest(&take)?;
    Ok(take)
}

#[cfg(test)]
mod tests {
    #[test]
    fn take_ids_reject_path_components() {
        assert_eq!(
            super::valid_id("..\\saved").unwrap_err(),
            "Invalid song or take id."
        );
        assert_eq!(
            super::valid_id("../../saved").unwrap_err(),
            "Invalid song or take id."
        );
        assert!(super::valid_id("take-1").is_ok());
    }

    #[test]
    fn near_limit_song_stays_readable_after_pretty_printed_save() {
        let root = std::env::temp_dir().join(format!("jam-song-size-{}", std::process::id()));
        let mut doc: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/seams/original.json")).unwrap();
        // Unknown nested metadata is retained, just like a sizeable version history.
        doc["futureData"] = serde_json::json!(vec![vec![0; 10]; 40_000]);
        doc["padding"] = serde_json::json!("x".repeat(1_950_000 - doc.to_string().len()));
        assert!(doc.to_string().len() < 2_000_000);
        assert!(serde_json::to_vec_pretty(&doc).unwrap().len() > 2_000_000);
        let saved = super::write_document(&root, doc).unwrap();
        let (listed, warnings) = super::scan_originals(&root).unwrap();
        assert!(warnings.is_empty(), "{warnings:?}");
        assert_eq!(listed, vec![saved]);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn corrupt_song_does_not_hide_healthy_originals() {
        let root = std::env::temp_dir().join(format!("jam-song-scan-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            root.join("good.json"),
            include_bytes!("../../tests/fixtures/seams/original.json"),
        )
        .unwrap();
        std::fs::write(root.join("broken.json"), b"broken").unwrap();
        let (docs, warnings) = super::scan_originals(&root).unwrap();
        assert_eq!(docs.len(), 1);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("broken.json"));
        assert_eq!(std::fs::read(root.join("broken.json")).unwrap(), b"broken");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn corrupt_manifest_does_not_hide_other_takes() {
        let root = std::env::temp_dir().join(format!("jam-take-scan-{}", std::process::id()));
        for id in ["good", "bad"] {
            std::fs::create_dir_all(root.join(id)).unwrap();
        }
        let take = jam_audio::recorder::TakeMetadata {
            id: "good".into(),
            ..Default::default()
        };
        std::fs::write(
            root.join("good/take.json"),
            serde_json::to_vec(&take).unwrap(),
        )
        .unwrap();
        std::fs::write(root.join("bad/take.json"), b"broken").unwrap();
        let (takes, warnings) = super::scan_takes(&root).unwrap();
        assert_eq!(takes.len(), 1);
        assert_eq!(takes[0].id, "good");
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("bad"));
        assert_eq!(
            std::fs::read(root.join("bad/take.json")).unwrap(),
            b"broken"
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    use super::*;
    #[test]
    fn song_tones_require_the_selected_live_rig_and_valid_unique_sections() {
        let mut doc: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/seams/original.json")).unwrap();
        doc["body"]["toneProfileId"] = serde_json::json!("headrush-pedalboard");
        doc["body"]["sections"]["verse"]["rigScene"] = serde_json::json!(2);
        let song = body(&doc).unwrap();
        assert_eq!(
            song_tones(&song, "headrush-pedalboard", 4, true).unwrap()["Verse"],
            2
        );
        assert!(song_tones(&song, "other-rig", 4, true).is_err());
        assert!(song_tones(&song, "headrush-pedalboard", 4, false).is_err());
        assert!(song_tones(&song, "headrush-pedalboard", 2, true).is_err());
        doc["body"]["toneProfileId"] = Value::Null;
        assert!(song_tones(&body(&doc).unwrap(), "other-rig", 0, false)
            .unwrap()
            .is_empty());
    }
    #[test]
    fn song_roundtrip_preserves_unknown_fields_and_rejects_conflicting_save() {
        let root = std::env::temp_dir().join(format!("jam-originals-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let mut doc: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/seams/original.json")).unwrap();
        doc["body"]["lyrics"] = serde_json::json!({"verse": "An original first line"});
        let saved = write_document(&root, doc.clone()).unwrap();
        assert_eq!(saved["body"]["lyrics"]["verse"], "An original first line");
        let mut invalid = saved.clone();
        invalid["body"]["lyrics"]["missing"] = serde_json::json!("Unknown section");
        assert!(body(&invalid).is_err());
        invalid["body"]["lyrics"] = serde_json::json!({"verse": "x".repeat(12_001)});
        assert!(body(&invalid).is_err());
        assert_eq!(saved["customNote"], "keep me");
        assert_eq!(saved["revision"], 1);
        assert!(write_document(&root, doc)
            .unwrap_err()
            .contains("another window"));
        assert_eq!(write_document(&root, saved).unwrap()["revision"], 2);
        assert!(path(&root, "../escape").is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
