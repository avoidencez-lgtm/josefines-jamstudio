//! Confirmed local beat maps; no provider/downbeat claims are inferred.
use super::*;
use jam_audio::song::grid::{Grid, Section};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Confirmation {
    pub source_hash: String,
    pub expected_beats: Vec<f64>,
    /// Zero-based index into the displayed local beat estimates.
    pub first_downbeat: usize,
    pub beats_per_bar: usize,
    pub sections: Vec<Section>,
    pub confirmed: bool,
}

async fn save(base: &Path, asset_id: &str, request: Confirmation) -> Result<Asset, String> {
    if !request.confirmed {
        return Err(
            "Listen and confirm the first downbeat, beats per bar and sections before saving."
                .into(),
        );
    }
    let original = reference_asset(base, asset_id)?;
    let analysis = original
        .extra
        .get("songAnalysis")
        .ok_or("Analyze tempo and chords in Songs first.")?;
    if analysis["schemaVersion"] != 1
        || analysis["analyzer"] != "local-chroma-v1"
        || analysis["confidence"] != "low"
        || analysis["sourceHash"] != request.source_hash
        || request.expected_beats.len() > 5000
        || analysis["beats"] != json!(request.expected_beats)
        || !(2..=12).contains(&request.beats_per_bar)
        || request.first_downbeat >= request.expected_beats.len()
    {
        return Err("Local beat estimates changed or are unavailable. Analyze the song and reopen this editor.".into());
    }
    let beats = &request.expected_beats[request.first_downbeat..];
    let count = (beats.len() - 1) / request.beats_per_bar * request.beats_per_bar + 1;
    let grid = Grid {
        schema_version: 1,
        origin: "confirmed-local".into(),
        beats_per_bar: request.beats_per_bar,
        beats: beats[..count].to_vec(),
        sections: request.sections,
    };
    grid.validate(original.seconds)?;
    let path = PathBuf::from(&original.path);
    let hash = tauri::async_runtime::spawn_blocking(move || source_hash(&path))
        .await
        .map_err(|_| "Source hashing worker stopped.")??;
    if hash != request.source_hash {
        return Err(
            "Audio changed since analysis. Analyze the source again before confirming bars.".into(),
        );
    }
    let mut current = reference_asset(base, asset_id)?;
    if current.path != original.path
        || current.seconds != original.seconds
        || current.extra.get("songAnalysis") != original.extra.get("songAnalysis")
    {
        return Err("The source or analysis changed while confirming. Reopen this editor.".into());
    }
    let saved = current
        .extra
        .entry("referenceGrid".into())
        .or_insert(json!({"schemaVersion":1}));
    if saved["schemaVersion"] != 1 {
        return Err("Unsupported saved reference grid version.".into());
    }
    let mut next = serde_json::to_value(grid).map_err(|e| e.to_string())?;
    // Retain unknown fields in edited sections, matched by stable ID.
    for section in next["sections"].as_array_mut().unwrap() {
        if let Some(old) = saved["sections"]
            .as_array()
            .and_then(|sections| sections.iter().find(|s| s["id"] == section["id"]))
        {
            if let Some(fields) = old.as_object() {
                for (key, value) in fields {
                    section
                        .as_object_mut()
                        .unwrap()
                        .entry(key.clone())
                        .or_insert(value.clone());
                }
            }
        }
    }
    for (key, value) in next.as_object().unwrap() {
        saved[key] = value.clone();
    }
    saved["sourceHash"] = json!(hash);
    if CANCEL.load(Ordering::Relaxed) {
        return Err("Reference map confirmation canceled.".into());
    }
    write(
        &base.join("assets").join(format!("{asset_id}.json")),
        &serde_json::to_value(&current).map_err(|e| e.to_string())?,
    )?;
    Ok(current)
}

#[tauri::command]
pub async fn media_reference_grid_save(
    asset_id: String,
    confirmation: Confirmation,
    state: State<'_, AppState>,
) -> Result<Asset, String> {
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    state.engine.lock().ensure_timing_editable()?;
    CANCEL.store(false, Ordering::Relaxed);
    save(&root(), &asset_id, confirmation).await
}

#[tauri::command]
pub fn media_reference_loop_section(
    asset_id: String,
    section_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .engine
        .lock()
        .reference_loop_section(&asset_id, &section_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn confirmed_grid_preserves_metadata_and_refuses_stale_or_unconfirmed_inputs() {
        let _gate = GATE.lock().await;
        CANCEL.store(false, Ordering::Relaxed);
        let base = std::env::temp_dir().join(format!("jam-grid-{}", id()));
        fs::create_dir_all(base.join("assets")).unwrap();
        let source = base.join("assets/source.wav");
        fs::write(&source, b"unchanged encoded source").unwrap();
        let hash = source_hash(&source).unwrap();
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/seams/reference-grid.json"
        ))
        .unwrap();
        let manifest = base.join("assets/source.json");
        write(&manifest, &json!({"schemaVersion":1,"id":"source","kind":"audio","path":source,"seconds":5.0,"label":"Fixture","future":true,
            "songAnalysis":{"schemaVersion":1,"analyzer":"local-chroma-v1","confidence":"low","sourceHash":hash,"beats":fixture["beats"]},
            "referenceGrid":{"schemaVersion":1,"future":42,"sections":[{"id":"verse","future":true}]}})).unwrap();
        let request = json!({"sourceHash":hash,"expectedBeats":fixture["beats"],"firstDownbeat":0,"beatsPerBar":4,"sections":fixture["sections"],"confirmed":true});
        let saved = save(
            &base,
            "source",
            serde_json::from_value(request.clone()).unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(saved.extra["future"], true);
        assert_eq!(saved.extra["referenceGrid"]["future"], 42);
        assert_eq!(saved.extra["referenceGrid"]["sections"][0]["future"], true);
        let stable = fs::read(&manifest).unwrap();
        for (field, value) in [
            ("confirmed", json!(false)),
            ("firstDownbeat", json!(9999)),
            ("beatsPerBar", json!(0)),
            ("sourceHash", json!("stale")),
            ("expectedBeats", json!([0.0])),
        ] {
            let mut bad = request.clone();
            bad[field] = value;
            assert!(save(&base, "source", serde_json::from_value(bad).unwrap())
                .await
                .is_err());
            assert_eq!(fs::read(&manifest).unwrap(), stable);
        }
        fs::write(&source, b"changed").unwrap();
        assert!(
            save(&base, "source", serde_json::from_value(request).unwrap())
                .await
                .err()
                .unwrap()
                .contains("Audio changed")
        );
        assert_eq!(fs::read(&manifest).unwrap(), stable);
        fs::remove_dir_all(base).unwrap();
    }
}
