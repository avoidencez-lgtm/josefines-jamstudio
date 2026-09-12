//! Recorded fixture stems and chord chart into song.json. No network.
use super::*;
use jam_audio::song::validate_stem_mix;
use jam_audio::song::StemMix;

pub const NOT_CONFIGURED: &str = "Recorded fixture song import is not configured. Set JAM_SONG_FIXTURE=1 to write stems and a chord chart from the recorded fixtures. Live stem separation and Music.ai stay not configured without JAM_LIVE=1.";

fn recorded() -> Result<Value, String> {
    match std::env::var("JAM_SONG_FIXTURE") {
        Ok(value) if value == "1" => serde_json::from_str(include_str!(
            "../../../tests/fixtures/seams/fixture-song.json"
        ))
        .map_err(|e| e.to_string()),
        _ => Err(NOT_CONFIGURED.into()),
    }
}

fn apply(base: &Path, asset_id: &str) -> Result<Asset, String> {
    let fixture = recorded()?;
    let mut source = reference_asset(base, asset_id)?;
    let hash = source
        .extra
        .get("sourceHash")
        .and_then(Value::as_str)
        .ok_or("Import the song first so it has a source hash.")?
        .to_string();
    let dir = songs::folder(base, asset_id)?;
    if !dir.exists() {
        return Err("Import the song first.".into());
    }
    let original = PathBuf::from(&source.path);
    if source_hash(&original)? != hash {
        return Err("Audio changed since import. Import the song again.".into());
    }
    let rows = fixture["stems"]
        .as_array()
        .ok_or("Recorded fixture stems are missing.")?;
    if !(2..=8).contains(&rows.len()) {
        return Err("Recorded fixture must list 2–8 stems.".into());
    }
    let mut stems = Vec::new();
    let mut mix = Vec::new();
    for (index, row) in rows.iter().enumerate() {
        let id = row["id"].as_str().ok_or("Each fixture stem needs an id.")?;
        let label = row["label"]
            .as_str()
            .ok_or("Each fixture stem needs a label.")?;
        let guitar = row["guitar"].as_bool().unwrap_or(false);
        let relative = format!("stem-{index}.wav");
        let path = dir.join(&relative);
        fs::copy(&original, &path).map_err(|e| e.to_string())?;
        let sha = source_hash(&path)?;
        mix.push(StemMix {
            id: id.into(),
            label: label.into(),
            gain: 1.0,
            muted: false,
            guitar,
        });
        stems.push(json!({
            "id": id,
            "label": label,
            "gain": 1.0,
            "muted": false,
            "guitar": guitar,
            "path": path,
            "sha256": sha
        }));
    }
    validate_stem_mix(&mix)?;
    source.extra.insert(
        "stemSet".into(),
        json!({
            "schemaVersion": 1,
            "id": id(),
            "sourceHash": hash,
            "provider": "recorded-fixture",
            "model": "fixture-song-v1",
            "seconds": source.seconds,
            "stems": stems
        }),
    );

    let mut analysis = fixture
        .get("songAnalysis")
        .cloned()
        .ok_or("Recorded fixture chord chart is missing.")?;
    if analysis["schemaVersion"] != 1
        || analysis["analyzer"] != "local-chroma-v1"
        || analysis["confidence"] != "low"
    {
        return Err("Recorded fixture chord chart is invalid.".into());
    }
    analysis["seconds"] = json!(source.seconds);
    analysis["sourceHash"] = json!(hash);
    let chords = analysis["chords"]
        .as_array()
        .ok_or("Recorded fixture chord chart has no chords.")?;
    if chords.is_empty()
        || chords.iter().any(|c| {
            let start = c["start"].as_f64().unwrap_or(f64::NAN);
            let end = c["end"].as_f64().unwrap_or(f64::NAN);
            !start.is_finite() || !end.is_finite() || start < 0.0 || end <= start || end > source.seconds
        })
    {
        return Err("Recorded fixture chords do not fit this imported song.".into());
    }
    if let Some(old) = source.extra.get("songAnalysis") {
        if old["schemaVersion"] == 1 {
            if let Some(fields) = old.as_object() {
                for (key, kept) in fields {
                    analysis
                        .as_object_mut()
                        .unwrap()
                        .entry(key.clone())
                        .or_insert(kept.clone());
                }
            }
        }
    }
    source.extra.insert("songAnalysis".into(), analysis);
    if CANCEL.load(Ordering::Relaxed) {
        return Err("Recorded fixture song import canceled.".into());
    }
    save_asset(base, &source)?;
    Ok(source)
}

#[tauri::command]
pub async fn media_fixture_song(
    asset_id: String,
    state: State<'_, AppState>,
) -> Result<Asset, String> {
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    valid_id(&asset_id)?;
    state.engine.lock().ensure_timing_editable()?;
    CANCEL.store(false, Ordering::Relaxed);
    apply(&root(), &asset_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recorded_fixture_fails_loud_without_the_env() {
        std::env::remove_var("JAM_SONG_FIXTURE");
        let error = recorded().unwrap_err();
        assert!(
            error.contains("not configured") && error.contains("JAM_LIVE=1"),
            "{error}"
        );
    }

    #[test]
    fn recorded_fixture_lists_stems_and_chords() {
        std::env::set_var("JAM_SONG_FIXTURE", "1");
        let fixture = recorded().unwrap();
        std::env::remove_var("JAM_SONG_FIXTURE");
        assert_eq!(fixture["stems"].as_array().unwrap().len(), 2);
        assert_eq!(fixture["songAnalysis"]["chords"][0]["chord"], "C");
        assert_eq!(fixture["songAnalysis"]["chords"][1]["chord"], "F");
    }
}
