//! Durable, bounded stem ZIP import and native reference mixing.
use super::*;
use jam_audio::song::{validate_stem_mix, ReferenceSong, StemMix};
use std::io::{Read, Write};

const ZIP_LIMIT: u64 = 192 * 1024 * 1024;
const AUDIO_LIMIT: u64 = 512 * 1024 * 1024;
const SET_LIMIT: u64 = 2 * 1024 * 1024 * 1024;

fn source(base: &Path, id: &str) -> Result<Asset, String> {
    let a = asset(base, id)?;
    if a.schema_version != 1
        || a.id != id
        || a.kind != "audio"
        || !a.seconds.is_finite()
        || !(0.1..=600.1).contains(&a.seconds)
    {
        return Err("Choose an audio source up to ten minutes.".into());
    }
    Ok(a)
}

fn bounded_file(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file()
        || file.metadata().map_err(|e| e.to_string())?.len() > limit
    {
        return Err("Stem input exceeds its file size limit.".into());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > limit {
        return Err("Stem input is empty or too large.".into());
    }
    Ok(bytes)
}

/// Entry names are display labels only. Never extract a provider-supplied path.
fn unpack(bytes: &[u8], folder: &Path) -> Result<Vec<(String, PathBuf)>, String> {
    let mut zip =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|_| "Invalid stem ZIP")?;
    if !(2..=32).contains(&zip.len()) {
        return Err("Use a ZIP with 2–8 aligned audio tracks and at most 32 entries.".into());
    }
    let mut files = Vec::new();
    let mut total = 0;
    for i in 0..zip.len() {
        if CANCEL.load(Ordering::Relaxed) {
            return Err("Stem import canceled.".into());
        }
        let mut entry = zip.by_index(i).map_err(|_| "Unreadable stem ZIP entry")?;
        let path = entry.enclosed_name().ok_or("Unsafe path in stem ZIP")?;
        if entry.encrypted() || entry.is_symlink() {
            return Err("Encrypted files and links are not supported in stem ZIPs.".into());
        }
        if entry.is_dir() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !["wav", "mp3", "flac", "m4a", "aac", "ogg"].contains(&ext.as_str()) {
            return Err("Stem ZIPs may contain only WAV, MP3, FLAC, M4A, AAC or OGG audio.".into());
        }
        if files.len() == 8 || entry.size() > AUDIO_LIMIT || total + entry.size() > SET_LIMIT {
            return Err(
                "Stem ZIP exceeds eight tracks, 512 MB per track or 2 GiB expanded.".into(),
            );
        }
        let output = folder.join(format!("input-{i}.{ext}"));
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)
            .map_err(|e| e.to_string())?;
        let mut buffer = [0u8; 65536];
        let mut size = 0;
        loop {
            if CANCEL.load(Ordering::Relaxed) {
                return Err("Stem import canceled.".into());
            }
            let n = entry
                .read(&mut buffer)
                .map_err(|_| "Corrupt or truncated stem ZIP")?;
            if n == 0 {
                break;
            }
            size += n as u64;
            total += n as u64;
            if size > AUDIO_LIMIT || total > SET_LIMIT {
                return Err("Expanded stem audio exceeds the size limit.".into());
            }
            file.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        }
        file.sync_all().map_err(|e| e.to_string())?;
        let label: String = path
            .file_stem()
            .and_then(|v| v.to_str())
            .unwrap_or("Track")
            .chars()
            .filter(|c| !c.is_control())
            .take(100)
            .collect();
        files.push((
            if label.trim().is_empty() {
                "Track".into()
            } else {
                label
            },
            output,
        ));
    }
    if files.len() < 2 {
        return Err("The ZIP must contain at least two audio tracks.".into());
    }
    Ok(files)
}

async fn install(
    base: &Path,
    source: &Asset,
    hash: &str,
    raw: &Path,
    provider: &str,
    model: &str,
) -> Result<Asset, String> {
    let set_id = id();
    let folder = base.join("assets").join(format!("{set_id}-stems"));
    fs::create_dir_all(folder.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::create_dir(&folder).map_err(|e| e.to_string())?;
    let input = raw.to_path_buf();
    let target = folder.clone();
    let files = tauri::async_runtime::spawn_blocking(move || {
        unpack(&bounded_file(&input, ZIP_LIMIT)?, &target)
    })
    .await
    .map_err(|_| "Stem extraction worker stopped.")??;
    // Decode once; later loads read these validated 48 kHz stereo WAVs directly.
    let mut stems = Vec::new();
    let mut frames = None;
    let mut total = 0;
    for (i, (label, input)) in files.into_iter().enumerate() {
        let output = folder.join(format!("stem-{i}.wav"));
        decode_audio(&input.to_string_lossy(), &output, "600.3").await?;
        let path = output.clone();
        let (count, hash) = tauri::async_runtime::spawn_blocking(move || {
            let (samples, _) =
                jam_audio::practice::read_stereo(&path, 48_000 * 600 + 9600, &CANCEL)?;
            if samples.iter().any(|v| !v.is_finite()) {
                return Err("Stem contains non-finite audio.".into());
            }
            Ok::<_, String>((samples.len() / 2, source_hash(&path)?))
        })
        .await
        .map_err(|_| "Stem validation worker stopped.")??;
        if count < 4800 || frames.is_some_and(|n| n != count) {
            return Err("Stem tracks have different lengths. Export aligned tracks from the same start and end.".into());
        }
        frames = Some(count);
        total += count as u64 * 8;
        if total > SET_LIMIT {
            return Err("Decoded stems exceed 2 GiB.".into());
        }
        stems.push(json!({"id":format!("{set_id}-{i}"),"label":label,"gain":1.0,"muted":false,"guitar":false,"path":output.to_string_lossy(),"sha256":hash}));
        fs::remove_file(input).map_err(|e| e.to_string())?;
    }
    let mut current = self::source(base, &source.id)?;
    if (frames.unwrap() as f64 / 48_000.0 - source.seconds).abs() > 0.1 {
        return Err("Stem duration differs from the selected song by more than 100 ms. Choose tracks exported from this song with the same start and end.".into());
    }
    if current.path != source.path || source_hash(Path::new(&current.path))? != hash {
        return Err(
            "Original audio changed during stem import. Import again for the current source."
                .into(),
        );
    }
    current.extra.insert("stemSet".into(), json!({"schemaVersion":1,"id":set_id,"sourceHash":hash,"provider":provider,"model":model,"seconds":frames.unwrap() as f64/48_000.0,"stems":stems}));
    if CANCEL.load(Ordering::Relaxed) {
        return Err("Stem import canceled.".into());
    }
    write(
        &base.join("assets").join(format!("{}.json", source.id)),
        &serde_json::to_value(&current).map_err(|e| e.to_string())?,
    )?;
    Ok(current)
}

pub(super) async fn load(base: &Path, source: &Asset, hash: &str) -> Result<ReferenceSong, String> {
    let set = &source.extra["stemSet"];
    if set["schemaVersion"] != 1 || set["sourceHash"].as_str() != Some(hash) {
        return Err(
            "Saved stems do not match the original audio. Import or separate them again.".into(),
        );
    }
    let entries = set["stems"].as_array().ok_or("Invalid saved stem set")?;
    let mix: Vec<StemMix> =
        serde_json::from_value(set["stems"].clone()).map_err(|_| "Invalid saved stem mix")?;
    validate_stem_mix(&mix)?;
    let mut paths = Vec::new();
    let mut total = 0;
    let assets = base
        .join("assets")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    for entry in entries {
        let path = PathBuf::from(entry["path"].as_str().ok_or("Missing stem path")?)
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if !path.starts_with(&assets) || !path.is_file() {
            return Err("Stem is outside the audio library.".into());
        }
        total += fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if total > SET_LIMIT + 8192 {
            return Err("Saved stem set exceeds 2 GiB.".into());
        }
        paths.push((
            path,
            entry["sha256"]
                .as_str()
                .ok_or("Missing stem hash")?
                .to_string(),
        ));
    }
    let id = source.id.clone();
    let label = source.label.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut tracks = Vec::new();
        for (path, hash) in paths {
            if source_hash(&path)? != hash {
                return Err("A saved stem changed. Import the ZIP again.".into());
            }
            let (samples, _) =
                jam_audio::practice::read_stereo(&path, 48_000 * 600 + 9600, &CANCEL)?;
            if source_hash(&path)? != hash {
                return Err("A stem changed while loading.".into());
            }
            tracks.push(samples);
        }
        ReferenceSong::with_stems(id, label, mix, tracks)
    })
    .await
    .map_err(|_| "Stem loading worker stopped.")?
}

#[tauri::command]
pub async fn media_stems_import(
    asset_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<Asset, String> {
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    state.engine.lock().ensure_timing_editable()?;
    CANCEL.store(false, Ordering::Relaxed);
    let base = root();
    let source = source(&base, &asset_id)?;
    let hash = source_hash(Path::new(&source.path))?;
    let raw = PathBuf::from(path);
    if !raw.is_absolute() {
        return Err("Use an absolute path to the stem ZIP.".into());
    }
    install(
        &base,
        &source,
        &hash,
        &raw,
        "local-import",
        "user-aligned-tracks",
    )
    .await
}

#[tauri::command]
pub async fn media_separate_stems(
    asset_id: String,
    catalog_id: String,
    usd_per_minute: Option<f64>,
    confirmed: bool,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    if !confirmed {
        return Err(
            "Confirm uploading this song and the provider charge before separating stems.".into(),
        );
    }
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    state.engine.lock().ensure_timing_editable()?;
    CANCEL.store(false, Ordering::Relaxed);
    let base = root();
    let source = source(&base, &asset_id)?;
    let model = api::catalog()
        .into_iter()
        .find(|m| m.id == catalog_id && m.kind == "stems")
        .ok_or("Unknown stem model")?;
    // Validate local decoding availability before a paid request.
    platform::find_agent("ffmpeg", "")?;
    let hash = source_hash(Path::new(&source.path))?;
    let file = bounded_file(Path::new(&source.path), AUDIO_LIMIT)?;
    use sha2::Digest;
    if format!("{:x}", sha2::Sha256::digest(&file)) != hash {
        return Err("Audio changed before upload. Select the source again.".into());
    }
    let extension = Path::new(&source.path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let receipt_dir = base.join("stem-receipts").join(id());
    fs::create_dir_all(&receipt_dir).map_err(|e| e.to_string())?;
    let raw = receipt_dir.join("stems.zip");
    let receipt_path = receipt_dir.join("receipt.json");
    let mut receipt = json!({"schemaVersion":1,"sourceAssetId":asset_id,"sourceHash":hash,"provider":model.provider,"model":model.model,"status":"requesting","rawPath":raw.to_string_lossy(),"usdPerMinute":usd_per_minute});
    write(&receipt_path, &receipt)?;
    let result = async {
        let (bytes, warning) = api::separate_stems(
            &api::SeparateStems {
                catalog_id,
                seconds: source.seconds,
                usd_per_minute,
            },
            file,
            extension,
            &CANCEL,
            state.secret_store.as_ref(),
            &state.cost_log,
        )
        .await?;
        // Persist the paid response before parsing, cancellation or accounting warnings.
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&raw)
            .map_err(|e| format!("Could not save paid stem ZIP: {e}"))?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        receipt["status"] = json!("downloaded");
        receipt["warning"] = json!(warning);
        write(&receipt_path, &receipt)?;
        install(&base, &source, &hash, &raw, &model.provider, &model.model).await?;
        Ok::<_, String>(())
    }
    .await;
    receipt["status"] = json!(if result.is_ok() { "ready" } else { "failed" });
    receipt["error"] = json!(result.as_ref().err());
    write(&receipt_path, &receipt)
        .map_err(|e| format!("{e}. Stem recovery folder: {}", receipt_dir.display()))?;
    result.map_err(|e| format!("{e} Stem recovery folder: {}. Import stems.zip locally if it was downloaded; check provider history before any paid retry.", receipt_dir.display()))?;
    Ok(receipt)
}

#[tauri::command]
pub async fn media_reference_mix(
    asset_id: String,
    mix: Vec<StemMix>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    validate_stem_mix(&mix)?;
    let engine = state.engine.lock();
    engine.ensure_timing_editable()?;
    let loaded = engine
        .get_telemetry()
        .reference
        .ok_or("Load the reference first.")?;
    if loaded.asset_id != asset_id
        || loaded.stems.len() != mix.len()
        || loaded
            .stems
            .iter()
            .zip(&mix)
            .any(|(a, b)| a.id != b.id || a.label != b.label)
    {
        return Err("Loaded stem set changed. Load it again before mixing.".into());
    }
    // The engine control lock prevents recording from starting between save/apply.
    save_mix(&root(), &asset_id, &mix)?;
    engine.reference_mix(&asset_id, mix)
}

fn save_mix(base: &Path, asset_id: &str, mix: &[StemMix]) -> Result<(), String> {
    validate_stem_mix(mix)?;
    let mut a = source(base, asset_id)?;
    let set = a.extra.get_mut("stemSet").ok_or("No saved stem set")?;
    if set["schemaVersion"] != 1 {
        return Err("Unsupported stem set version.".into());
    }
    let entries = set["stems"]
        .as_array_mut()
        .ok_or("Invalid saved stem set")?;
    if entries.len() != mix.len()
        || entries
            .iter()
            .zip(mix)
            .any(|(a, b)| a["id"].as_str() != Some(&b.id))
    {
        return Err("Saved stem set changed. Load it again before mixing.".into());
    }
    for (entry, stem) in entries.iter_mut().zip(mix) {
        entry["gain"] = json!(stem.gain);
        entry["muted"] = json!(stem.muted);
        entry["guitar"] = json!(stem.guitar);
    }
    // Update only mix fields so future metadata survives.
    write(
        &base.join("assets").join(format!("{asset_id}.json")),
        &serde_json::to_value(a).map_err(|e| e.to_string())?,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "requires user-installed FFmpeg; run with JAM_MEDIA_TEST=1"]
    async fn local_stem_zip_decodes_persists_reloads_and_rejects_changed_audio() {
        assert_eq!(std::env::var("JAM_MEDIA_TEST").as_deref(), Ok("1"));
        let _gate = GATE.lock().await;
        CANCEL.store(false, Ordering::Relaxed);
        let base = std::env::temp_dir().join(format!("stem-local-{}", id()));
        fs::create_dir_all(base.join("assets")).unwrap();
        let wav = base.join("assets/source.wav");
        run(
            &platform::find_agent("ffmpeg", "").unwrap(),
            &[
                "-nostdin",
                "-n",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "aevalsrc=0.2*sin(2*PI*440*t)|-0.2*sin(2*PI*440*t):s=48000:d=2",
                "-c:a",
                "pcm_f32le",
            ]
            .map(String::from)
            .into_iter()
            .chain([wav.to_string_lossy().into_owned()])
            .collect::<Vec<_>>(),
            30,
        )
        .await
        .unwrap();
        let a = Asset {
            schema_version: 1,
            id: "source".into(),
            kind: "audio".into(),
            path: wav.to_string_lossy().into_owned(),
            seconds: 2.0,
            label: "Synthetic stems".into(),
            extra: BTreeMap::from([("futureMetadata".into(), json!({"preserve":true}))]),
        };
        write(
            &base.join("assets/source.json"),
            &serde_json::to_value(&a).unwrap(),
        )
        .unwrap();
        let hash = source_hash(&wav).unwrap();
        for ext in ["wav", "mp3"] {
            let input = if ext == "mp3" {
                let path = base.join("encoded.mp3");
                run(
                    &platform::find_agent("ffmpeg", "").unwrap(),
                    &[
                        "-nostdin".into(),
                        "-n".into(),
                        "-v".into(),
                        "error".into(),
                        "-i".into(),
                        wav.to_string_lossy().into_owned(),
                        "-b:a".into(),
                        "128k".into(),
                        path.to_string_lossy().into_owned(),
                    ],
                    30,
                )
                .await
                .unwrap();
                path
            } else {
                wav.clone()
            };
            let raw = base.join(format!("{ext}-stems.zip"));
            let mut zip = zip::ZipWriter::new(fs::File::create(&raw).unwrap());
            for label in ["Guitar", "Band"] {
                zip.start_file(
                    format!("{label}.{ext}"),
                    zip::write::SimpleFileOptions::default(),
                )
                .unwrap();
                zip.write_all(&fs::read(&input).unwrap()).unwrap();
            }
            zip.finish().unwrap();
            let saved = install(
                &base,
                &a,
                &hash,
                &raw,
                "synthetic-test",
                "two-identical-tracks",
            )
            .await
            .unwrap();
            assert_eq!(saved.extra["futureMetadata"]["preserve"], true);
            assert_eq!(source_hash(&wav).unwrap(), hash);
            let mut song = super::super::reference_source(&base, "source", true)
                .await
                .unwrap();
            assert_eq!(song.info.stems.len(), 2);
            assert!((song.info.seconds - 2.0).abs() <= 1.0 / 48_000.0);
            let mut mix = song.info.stems.clone();
            mix[0].guitar = true;
            mix[0].muted = true;
            let manifest = base.join("assets/source.json");
            let mut future = read(&manifest).unwrap();
            future["stemSet"]["future"] = json!({"keep":true});
            future["stemSet"]["stems"][0]["future"] = json!(42);
            write(&manifest, &future).unwrap();
            save_mix(&base, "source", &mix).unwrap();
            let preserved = read(&manifest).unwrap();
            assert_eq!(preserved["stemSet"]["future"]["keep"], true);
            assert_eq!(preserved["stemSet"]["stems"][0]["future"], 42);
            let reloaded = super::super::reference_source(&base, "source", true)
                .await
                .unwrap();
            assert!(reloaded.info.stems[0].muted && reloaded.info.stems[0].guitar);
            super::super::save_reference_processing(&base, "source", 0.75, 2).unwrap();
            let prepared = super::super::reference_source(&base, "source", true)
                .await
                .unwrap();
            assert_eq!((prepared.info.speed, prepared.info.semitones), (0.75, 2));
            assert!(prepared.info.stems[0].muted);
            let mut mapped = read(&manifest).unwrap();
            mapped["referenceGrid"] = json!({"schemaVersion":1,"origin":"confirmed-local","sourceHash":hash,"beatsPerBar":4,"beats":[0.0,0.4,0.8,1.2,1.6],"sections":[{"id":"solo","label":"Solo","startBar":1,"endBar":2}]});
            write(&manifest, &mapped).unwrap();
            let mut gridded = super::super::reference_source(&base, "source", true)
                .await
                .unwrap();
            assert_eq!(gridded.info.grid.as_ref().unwrap().bars, 1);
            gridded.loop_section("solo").unwrap();
            assert_eq!(gridded.info.loop_end, 1.6);
            mapped["referenceGrid"]["sourceHash"] = json!("0".repeat(64));
            write(&manifest, &mapped).unwrap();
            let stale_grid = super::super::reference_source(&base, "source", true)
                .await
                .unwrap();
            assert!(stale_grid.info.grid.is_none());
            assert!(stale_grid
                .info
                .grid_error
                .as_ref()
                .unwrap()
                .contains("changed"));
            mapped["referenceGrid"]["sourceHash"] = json!(hash);
            write(&manifest, &mapped).unwrap();
            let original = super::super::reference_source(&base, "source", false)
                .await
                .unwrap();
            assert_eq!((original.info.speed, original.info.semitones), (1.0, 0));
            assert!(original.info.stems.is_empty());
            assert_eq!(
                asset(&base, "source").unwrap().extra["futureMetadata"]["preserve"],
                true
            );
            let mut stale = mix.clone();
            stale[0].id = "old-set".into();
            assert!(save_mix(&base, "source", &stale).is_err());
            song.set_stem_mix(mix).unwrap();
            // Installing the second archive preserves saved practice settings.
            // This original stereo assertion specifically measures the direct path.
            song.set_processing(1.0, 0).unwrap();
            song.play();
            let mut left = vec![0.0; 4800];
            let mut right = left.clone();
            song.render(48_000, &mut left, &mut right);
            assert!(left.iter().map(|v| v * v).sum::<f32>() > 50.0);
            assert!(left.iter().zip(right).all(|(l, r)| (l + r).abs() < 1e-4));
            let path = PathBuf::from(saved.extra["stemSet"]["stems"][0]["path"].as_str().unwrap());
            fs::write(path, b"changed audio").unwrap();
            assert!(super::super::reference_source(&base, "source", false)
                .await
                .unwrap()
                .info
                .stems
                .is_empty());
            assert!(load(&base, &saved, &hash)
                .await
                .err()
                .unwrap()
                .contains("changed"));
            assert!(load(&base, &saved, "wrong-source-hash")
                .await
                .err()
                .unwrap()
                .contains("match"));
            let previous = read(&base.join("assets/source.json")).unwrap();
            assert!(
                install(&base, &a, "wrong-source-hash", &raw, "test", "test")
                    .await
                    .is_err()
            );
            assert_eq!(read(&base.join("assets/source.json")).unwrap(), previous);
        }
        fs::remove_dir_all(base).unwrap();
    }
    fn archive(names: &[&str]) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for name in names {
            zip.start_file(
                *name,
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated),
            )
            .unwrap();
            zip.write_all(b"synthetic audio placeholder for archive parser only")
                .unwrap();
        }
        zip.finish().unwrap().into_inner()
    }
    #[test]
    fn zip_import_bounds_paths_entries_and_preserves_labels_without_extracting_names() {
        let base = std::env::temp_dir().join(format!("stem-zip-{}", id()));
        fs::create_dir(&base).unwrap();
        let files = unpack(&archive(&["folder/Guitar.wav", "Band.mp3"]), &base).unwrap();
        assert_eq!(files[0].0, "Guitar");
        assert!(files[0].1.ends_with("input-0.wav"));
        assert!(!base.join("folder").exists());
        for (i, names) in [
            vec!["../escape.wav", "Band.wav"],
            vec!["x.txt", "Band.wav"],
            vec!["Only.wav"],
            vec![
                "1.wav", "2.wav", "3.wav", "4.wav", "5.wav", "6.wav", "7.wav", "8.wav", "9.wav",
            ],
        ]
        .into_iter()
        .enumerate()
        {
            let path = base.join(format!("invalid-{i}"));
            fs::create_dir(&path).unwrap();
            assert!(unpack(&archive(&names), &path).is_err());
        }
        fs::remove_dir_all(base).unwrap();
    }
}
