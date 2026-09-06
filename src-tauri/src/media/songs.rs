//! Canonical song files, exposed through the existing media asset view.
use super::*;

pub(super) fn library(base: &Path) -> Result<PathBuf, String> {
    Ok(base
        .parent()
        .ok_or("Missing song library parent")?
        .join("songs"))
}

pub(super) fn folder(base: &Path, song_id: &str) -> Result<PathBuf, String> {
    valid_id(song_id)?;
    Ok(library(base)?.join(song_id))
}

fn sync_file(path: &Path) -> Result<(), String> {
    fs::OpenOptions::new()
        .write(true)
        .open(path)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())
}

fn inside(folder: &Path, path: &Path) -> Result<PathBuf, String> {
    let root = folder.canonicalize().map_err(|e| e.to_string())?;
    let file = path
        .canonicalize()
        .map_err(|_| "Song file moved or missing")?;
    if !file.starts_with(root) || !file.is_file() {
        return Err("Song file is outside its song folder.".into());
    }
    Ok(file)
}

pub(super) fn load(base: &Path, song_id: &str) -> Result<Asset, String> {
    let dir = folder(base, song_id)?;
    let root = dir
        .parent()
        .unwrap()
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !dir
        .canonicalize()
        .map_err(|e| e.to_string())?
        .starts_with(root)
    {
        return Err("Song folder is outside the library.".into());
    }
    let mut v = read(&inside(&dir, &dir.join("song.json"))?)?;
    if v["schemaVersion"] != 1 || v["id"] != song_id {
        return Err("Unsupported song version or mismatched ID. File left intact.".into());
    }
    let source = v["sourcePath"].as_str().ok_or("Missing song source path")?;
    if source != "source.wav" {
        return Err("Song sourcePath must be source.wav.".into());
    }
    let path = inside(&dir, &dir.join(source))?;
    let duration = v["durationMs"].as_f64().ok_or("Invalid song duration")?;
    if !duration.is_finite()
        || !(100.0..=1_200_200.0).contains(&duration)
        || !v["sourceHash"]
            .as_str()
            .is_some_and(|h| h.len() == 64 && h.bytes().all(|c| c.is_ascii_hexdigit()))
    {
        return Err("Invalid song duration or source hash.".into());
    }
    if let Some(entries) = v
        .get_mut("stemSet")
        .and_then(|set| set.get_mut("stems"))
        .and_then(Value::as_array_mut)
    {
        for entry in entries {
            let relative = entry["path"].as_str().ok_or("Missing stem path")?;
            let relative = Path::new(relative);
            if !relative
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_)))
                || relative.as_os_str().is_empty()
            {
                return Err("Stem path must be relative to its song folder.".into());
            }
            entry["path"] = json!(dir
                .canonicalize()
                .map_err(|e| e.to_string())?
                .join(relative));
        }
    }
    let fields = v.as_object_mut().ok_or("Invalid song document")?;
    for reserved in ["kind", "path", "label", "seconds"] {
        if fields.contains_key(reserved) {
            return Err("Conflicting song fields. File left intact.".into());
        }
    }
    let title = fields.remove("title").ok_or("Missing song title")?;
    fields.remove("sourcePath");
    fields.remove("durationMs");
    fields.insert("label".into(), title);
    fields.insert("path".into(), json!(path));
    fields.insert("seconds".into(), json!(duration / 1000.0));
    fields.insert("kind".into(), json!("audio"));
    serde_json::from_value(v).map_err(|e| format!("Invalid song: {e}"))
}

fn document(dir: &Path, a: &Asset) -> Result<Value, String> {
    let mut v = serde_json::to_value(a).map_err(|e| e.to_string())?;
    let fields = v.as_object_mut().unwrap();
    for reserved in ["title", "sourcePath", "durationMs"] {
        if fields.contains_key(reserved) {
            return Err(format!(
                "Existing metadata uses reserved song field {reserved}. File left intact."
            ));
        }
    }
    fields.remove("kind");
    fields.remove("path");
    fields.remove("seconds");
    fields.remove("label");
    fields.insert("title".into(), json!(a.label));
    fields.insert("sourcePath".into(), json!("source.wav"));
    fields.insert("durationMs".into(), json!(a.seconds * 1000.0));
    if let Some(entries) = v
        .get_mut("stemSet")
        .and_then(|set| set.get_mut("stems"))
        .and_then(Value::as_array_mut)
    {
        for entry in entries {
            let path = Path::new(entry["path"].as_str().ok_or("Missing stem path")?);
            let canonical = dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf());
            let relative = path
                .strip_prefix(&canonical)
                .or_else(|_| path.strip_prefix(dir))
                .map_err(|_| "Stem must be stored inside the song folder")?;
            if !relative
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_)))
            {
                return Err("Invalid song stem path.".into());
            }
            entry["path"] = json!(relative.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(v)
}

pub(super) fn save(base: &Path, a: &Asset) -> Result<(), String> {
    // Refuse unknown versions before replacing a document, including external edits.
    let old = load(base, &a.id)?;
    if old.path != a.path || a.schema_version != 1 || a.kind != "audio" {
        return Err("Song source changed. Reload it before saving.".into());
    }
    let dir = folder(base, &a.id)?;
    write(&dir.join("song.json"), &document(&dir, a)?)
}

/// Stage the complete folder and publish by rename. Legacy bytes and manifests stay intact.
pub(super) async fn store(base: &Path, mut a: Asset) -> Result<Asset, String> {
    let dir = folder(base, &a.id)?;
    if dir.exists() {
        return load(base, &a.id);
    }
    if a.schema_version != 1
        || a.kind != "audio"
        || !a.seconds.is_finite()
        || (a.seconds != 0.0 && !(0.1..=1200.2).contains(&a.seconds))
    {
        return Err("Choose a supported audio asset to store as a song.".into());
    }
    for reserved in ["title", "sourcePath", "durationMs", "sourceHash"] {
        if a.extra.contains_key(reserved) {
            return Err(format!(
                "Existing metadata uses reserved song field {reserved}. File left intact."
            ));
        }
    }
    let legacy = base.join("assets").join(format!("{}.json", a.id));
    let legacy_before = if legacy.exists() {
        Some(fs::read(&legacy).map_err(|e| e.to_string())?)
    } else {
        None
    };
    let stage = dir.parent().unwrap().join(format!(".import-{}", id()));
    fs::create_dir_all(stage.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::create_dir(&stage).map_err(|e| e.to_string())?;
    let result = async {
        let original = PathBuf::from(&a.path);
        let ext = original
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("wav")
            .to_ascii_lowercase();
        media_extension(&ext)?;
        let original_copy = stage.join(format!("original.{ext}"));
        let old_hash = source_hash(&original)?;
        fs::copy(&original, &original_copy).map_err(|e| e.to_string())?;
        if source_hash(&original_copy)? != old_hash {
            return Err("Audio changed while copying. Try again.".into());
        }
        sync_file(&original_copy)?;
        let decoded = stage.join("source.wav");
        let limit = if a.seconds == 0.0 { 600.1 } else { 1200.3 };
        decode_audio(&original_copy.to_string_lossy(), &decoded, limit).await?;
        let path = decoded.clone();
        let (seconds, hash) = tauri::async_runtime::spawn_blocking(move || {
            let (samples, _) =
                jam_audio::practice::read_stereo(&path, 48_000 * 1200 + 9600, &CANCEL)?;
            if samples.iter().any(|s| !s.is_finite()) {
                return Err("Song contains non-finite audio.".into());
            }
            Ok::<_, String>((samples.len() as f64 / 96_000.0, source_hash(&path)?))
        })
        .await
        .map_err(|_| "Song validation worker stopped")??;
        if a.seconds != 0.0 && (seconds - a.seconds).abs() > 0.1 {
            return Err(
                "Decoded duration differs from the saved source by more than 100 ms.".into(),
            );
        }
        sync_file(&decoded)?;
        for key in ["songAnalysis", "referenceGrid", "stemSet"] {
            if let Some(value) = a.extra.get_mut(key) {
                // Stale/unknown analysis stays stale; migration cannot certify it.
                if value["schemaVersion"] == 1 && value["sourceHash"] == old_hash {
                    value["sourceHash"] = json!(hash);
                }
            }
        }
        if let Some(entries) = a
            .extra
            .get_mut("stemSet")
            .and_then(|v| v.get_mut("stems"))
            .and_then(Value::as_array_mut)
        {
            if entries.len() > 8 {
                return Err("A song supports up to eight stems.".into());
            }
            fs::create_dir(stage.join("stems")).map_err(|e| e.to_string())?;
            let mut total = 0;
            for (index, entry) in entries.iter_mut().enumerate() {
                let source = library_audio_path(
                    base,
                    Path::new(entry["path"].as_str().ok_or("Missing stem path")?),
                )?;
                let hash = source_hash(&source)?;
                total += fs::metadata(&source).map_err(|e| e.to_string())?.len();
                if total > 2 * 1024 * 1024 * 1024 + 8192 {
                    return Err("Saved stem set exceeds 2 GiB.".into());
                }
                if entry["sha256"] != hash {
                    return Err(
                        "Saved stem changed. Reimport the stem set before storing this song."
                            .into(),
                    );
                }
                let relative = format!("stems/stem-{index}.wav");
                let target = stage.join(&relative);
                fs::copy(source, &target).map_err(|e| e.to_string())?;
                if source_hash(&target)? != hash {
                    return Err("Stem changed while copying.".into());
                }
                sync_file(&target)?;
                entry["path"] = json!(dir.join(relative));
            }
        }
        if source_hash(&original)? != old_hash {
            return Err("Audio changed during song import. Try again.".into());
        }
        a.path = dir.join("source.wav").to_string_lossy().into_owned();
        a.seconds = seconds;
        a.extra.insert("sourceHash".into(), json!(hash));
        write(&stage.join("song.json"), &document(&dir, &a)?)?;
        if let Some(before) = &legacy_before {
            if &fs::read(&legacy).map_err(|e| e.to_string())? != before {
                return Err("Legacy metadata changed during import. Try again.".into());
            }
        }
        if CANCEL.load(Ordering::Relaxed) {
            return Err("Song import canceled.".into());
        }
        fs::rename(&stage, &dir).map_err(|e| format!("Could not publish song folder: {e}"))?;
        load(base, &a.id)
    }
    .await;
    // This path is a newly created, private staging folder, never user-selected.
    if stage.exists() {
        let _ = fs::remove_dir_all(&stage);
    }
    result
}

pub(super) fn append_list(base: &Path, result: &mut Value) -> Result<(), String> {
    let root = library(base)?;
    if !root.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let id = entry.file_name().to_string_lossy().into_owned();
        if id.starts_with('.') || !entry.path().is_dir() {
            continue;
        }
        result["assets"]
            .as_array_mut()
            .unwrap()
            .retain(|a| a["id"] != id);
        match load(base, &id) {
            Ok(a) => result["assets"].as_array_mut().unwrap().push(json!(a)),
            Err(e) => result["warnings"]
                .as_array_mut()
                .unwrap()
                .push(json!(format!("Song {id}: {e} File left intact."))),
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn media_store_song(
    asset_id: String,
    state: State<'_, AppState>,
) -> Result<Asset, String> {
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    state.engine.lock().ensure_timing_editable()?;
    CANCEL.store(false, Ordering::Relaxed);
    let base = root();
    store(&base, reference_asset(&base, &asset_id)?).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn song_files_are_authoritative_portable_and_preserve_unknown_metadata() {
        let home = std::env::temp_dir().join(format!("jam-song-files-{}", id()));
        let base = home.join("music-videos");
        let dir = folder(&base, "song").unwrap();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("source.wav"), b"fixture").unwrap();
        let document: Value =
            serde_json::from_str(include_str!("../../../tests/fixtures/seams/song-file.json"))
                .unwrap();
        write(&dir.join("song.json"), &document).unwrap();
        // Same ID in the legacy library must never shadow the canonical document.
        write(&base.join("assets/song.json"), &json!({"schemaVersion":1,"id":"song","kind":"audio","path":"missing.wav","seconds":4,"label":"Old"})).unwrap();
        let mut song = asset(&base, "song").unwrap();
        assert_eq!(song.label, "Fixture");
        song.extra.insert(
            "referencePractice".into(),
            json!({"schemaVersion":1,"speed":0.75,"semitones":2}),
        );
        save_asset(&base, &song).unwrap();
        let saved = read(&dir.join("song.json")).unwrap();
        assert_eq!(saved["sourcePath"], "source.wav");
        assert!(
            saved.get("stemSet").is_none(),
            "reading optional metadata must not create an empty stem set"
        );
        assert_eq!(saved["future"], document["future"]);
        assert_eq!(saved["songAnalysis"], document["songAnalysis"]);
        assert_eq!(saved["referencePractice"]["speed"], 0.75);
        assert_eq!(
            list_media(&base).unwrap()["assets"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        // Unsupported/corrupt canonical files cannot fall back to stale legacy data.
        for bad in [
            json!({"schemaVersion":2}),
            json!({"schemaVersion":1,"id":"other"}),
        ] {
            write(&dir.join("song.json"), &bad).unwrap();
            assert!(asset(&base, "song").is_err());
            let list = list_media(&base).unwrap();
            assert!(list["assets"].as_array().unwrap().is_empty());
            assert!(!list["warnings"].as_array().unwrap().is_empty());
        }
        let mut escaped = document;
        escaped["sourcePath"] = json!("../../music-videos/assets/song.json");
        write(&dir.join("song.json"), &escaped).unwrap();
        assert!(asset(&base, "song").is_err());
        assert!(folder(&base, "../escape").is_err());
        fs::remove_dir_all(home).unwrap();
    }

    #[tokio::test]
    #[ignore = "requires user-installed FFmpeg; run with JAM_MEDIA_TEST=1"]
    async fn legacy_song_migration_preserves_audio_metadata_stems_and_video_identity() {
        assert_eq!(std::env::var("JAM_MEDIA_TEST").as_deref(), Ok("1"));
        let _gate = GATE.lock().await;
        CANCEL.store(false, Ordering::Relaxed);
        let home = std::env::temp_dir().join(format!("jam-song-migrate-{}", id()));
        let base = home.join("music-videos");
        fs::create_dir_all(base.join("assets")).unwrap();
        let original = base.join("assets/source.wav");
        let exe = platform::find_agent("ffmpeg", "").unwrap();
        run(
            &exe,
            &[
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "aevalsrc=0.125|0.125:s=48000:d=5",
                "-c:a",
                "pcm_f32le",
                original.to_str().unwrap(),
            ]
            .map(String::from),
            20,
        )
        .await
        .unwrap();
        let hash = source_hash(&original).unwrap();
        let mut grid: Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/seams/reference-grid.json"
        ))
        .unwrap();
        grid["sourceHash"] = json!(hash);
        let legacy = base.join("assets/legacy.json");
        let old = json!({"schemaVersion":1,"id":"legacy","kind":"audio","label":"Kept title","path":original,"seconds":5,"future":{"kept":42},"referenceGrid":grid,"referencePractice":{"schemaVersion":1,"speed":0.75,"semitones":2,"future":true},"stemSet":{"schemaVersion":1,"id":"set","sourceHash":hash,"provider":"local-import","model":"fixture","seconds":5,"future":true,"stems":[{"id":"a","label":"Band","gain":0.5,"muted":false,"guitar":false,"path":original,"sha256":hash,"future":9},{"id":"b","label":"Guitar","gain":1,"muted":true,"guitar":true,"path":original,"sha256":hash}]}});
        write(&legacy, &old).unwrap();
        let before = fs::read(&legacy).unwrap();
        let audio_before = fs::read(&original).unwrap();
        let a = store(&base, asset(&base, "legacy").unwrap()).await.unwrap();
        assert_eq!(a.id, "legacy", "existing video audioId remains valid");
        assert_eq!(fs::read(&legacy).unwrap(), before);
        assert_eq!(fs::read(&original).unwrap(), audio_before);
        assert_eq!(a.extra["future"], old["future"]);
        assert_eq!(a.extra["stemSet"]["future"], true);
        assert_eq!(a.extra["stemSet"]["stems"][0]["future"], 9);
        assert_eq!(
            a.extra["referenceGrid"]["sourceHash"],
            a.extra["sourceHash"]
        );
        let (samples, rate) = jam_audio::recorder::read_wav_mono(Path::new(&a.path)).unwrap();
        assert_eq!(rate, 48_000);
        assert_eq!(samples.len(), 240_000);
        assert!(
            samples.iter().all(|s| (*s - 0.125).abs() < 1e-7),
            "normalized PCM tolerance 1e-7"
        );
        save_reference_processing(&base, "legacy", 1.0, 0).unwrap();
        let loaded = reference_source(&base, "legacy", true).await.unwrap();
        assert!(loaded.info.grid.is_some());
        assert_eq!(loaded.info.stems.len(), 2);
        assert!(loaded.info.stems[1].muted);
        let canonical = folder(&base, "legacy").unwrap().join("song.json");
        let doc = read(&canonical).unwrap();
        assert_eq!(doc["stemSet"]["stems"][0]["path"], "stems/stem-0.wav");
        assert_eq!(doc["referencePractice"]["future"], true);
        assert_eq!(
            list_media(&base).unwrap()["assets"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            store(&base, a).await.unwrap().id,
            "legacy",
            "retry is idempotent"
        );
        // Missing stems keep the original mix available, and portable paths survive moving the library.
        fs::remove_file(folder(&base, "legacy").unwrap().join("stems/stem-1.wav")).unwrap();
        assert!(reference_source(&base, "legacy", true).await.is_err());
        assert!(reference_source(&base, "legacy", false).await.is_ok());
        let moved = home.with_file_name(format!("jam-song-moved-{}", id()));
        fs::rename(&home, &moved).unwrap();
        assert!(
            reference_source(&moved.join("music-videos"), "legacy", false)
                .await
                .is_ok()
        );
        fs::remove_dir_all(moved).unwrap();
    }
}
