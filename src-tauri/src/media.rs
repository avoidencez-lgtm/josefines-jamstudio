//! File-backed music-video projects, generated assets and local FFmpeg assembly.
use crate::{library::Library, net::media as api, platform, AppState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::Stdio,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;

const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "webm", "mkv", "wav", "mp3", "flac", "m4a", "aac", "ogg",
];

// ponytail: one media operation at a time for this single-user desktop studio.
static GATE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static SAVE: std::sync::Mutex<()> = std::sync::Mutex::new(());
static CANCEL: AtomicBool = AtomicBool::new(false);
static SERIAL: AtomicU64 = AtomicU64::new(0);
pub fn root() -> PathBuf {
    Library::default_user_root().join("music-videos")
}
fn id() -> String {
    format!(
        "{}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        SERIAL.fetch_add(1, Ordering::Relaxed)
    )
}
fn valid_id(s: &str) -> Result<(), String> {
    if s.is_empty()
        || s.len() > 100
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
    {
        return Err("Invalid media ID".into());
    }
    Ok(())
}
fn read(path: &Path) -> Result<Value, String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > 2_000_000 {
        return Err("Media document exceeds 2 MB".into());
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
fn write(path: &Path, value: &Value) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("Invalid output path")?).map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    if bytes.len() > 2_000_000 {
        return Err("Media document exceeds 2 MB".into());
    }
    let temp = path.with_extension("tmp");
    fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    fs::OpenOptions::new()
        .write(true)
        .open(&temp)
        .and_then(|f| f.sync_all())
        .map_err(|e| e.to_string())?;
    if path.exists() {
        fs::copy(path, path.with_extension("bak")).map_err(|e| e.to_string())?;
    }
    fs::rename(temp, path).map_err(|e| e.to_string())
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub schema_version: u32,
    pub id: String,
    pub kind: String,
    pub path: String,
    pub seconds: f64,
    pub label: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shot {
    pub id: String,
    pub seconds: f64,
    pub asset_id: Option<String>,
    pub trim_start: f64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    schema_version: u32,
    id: String,
    revision: u64,
    title: String,
    audio_id: Option<String>,
    ratio: String,
    shots: Vec<Shot>,
}
fn project(v: &Value) -> Result<Project, String> {
    let p: Project =
        serde_json::from_value(v.clone()).map_err(|e| format!("Video project: {e}"))?;
    valid_id(&p.id)?;
    if p.schema_version != 1
        || p.title.trim().is_empty()
        || p.title.len() > 300
        || !["16:9", "9:16"].contains(&p.ratio.as_str())
        || p.shots.len() > 120
    {
        return Err("Check video title, version, ratio and shot count (up to 120).".into());
    }
    let mut ids = std::collections::HashSet::new();
    for s in &p.shots {
        valid_id(&s.id)?;
        if !ids.insert(&s.id)
            || !s.seconds.is_finite()
            || !(0.1..=120.0).contains(&s.seconds)
            || !s.trim_start.is_finite()
            || !(0.0..=600.0).contains(&s.trim_start)
        {
            return Err("Check unique shots, durations (0.1–120 s) and clip offsets.".into());
        }
        if let Some(a) = &s.asset_id {
            valid_id(a)?;
        }
    }
    if p.shots.iter().map(|s| s.seconds).sum::<f64>() > 600.0 {
        return Err("Keep videos within 10 minutes.".into());
    }
    if let Some(a) = &p.audio_id {
        valid_id(a)?;
    }
    Ok(p)
}
fn save_project(base: &Path, mut document: Value) -> Result<Value, String> {
    let _lock = SAVE.lock().map_err(|e| e.to_string())?;
    let p = project(&document)?;
    let file = base.join("projects").join(format!("{}.json", p.id));
    if file.exists() {
        if read(&file)?["revision"].as_u64() != Some(p.revision) {
            return Err("This video changed in another window. Reopen it before saving.".into());
        }
    } else if p.revision != 0 {
        return Err("Video project was moved. Save a new copy.".into());
    }
    document["revision"] = json!(p.revision + 1);
    write(&file, &document)?;
    Ok(document)
}
#[tauri::command]
pub fn media_save(document: Value) -> Result<Value, String> {
    save_project(&root(), document)
}
#[tauri::command]
pub fn media_list() -> Result<Value, String> {
    list_media(&root())
}

fn list_media(base: &Path) -> Result<Value, String> {
    let mut result = json!({"projects":[],"assets":[],"jobs":[],"warnings":[]});
    for kind in ["projects", "assets", "jobs"] {
        let dir = base.join(kind);
        if !dir.exists() {
            continue;
        }
        for e in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let p = e.map_err(|e| e.to_string())?.path();
            if !p.extension().is_some_and(|e| e == "json") {
                continue;
            }
            let checked = read(&p).and_then(|value| {
                if value["schemaVersion"] != 1 {
                    return Err(
                        "Unsupported version; update the app before opening this file.".into(),
                    );
                }
                if kind == "projects" {
                    project(&value)?;
                }
                if kind == "assets" {
                    serde_json::from_value::<Asset>(value.clone()).map_err(|e| e.to_string())?;
                }
                Ok(if kind == "jobs" {
                    public_job(value)
                } else {
                    value
                })
            });
            match checked {
                Ok(value) => result[kind].as_array_mut().unwrap().push(value),
                Err(e) => result["warnings"]
                    .as_array_mut()
                    .unwrap()
                    .push(json!(format!("{}: {e} File left intact.", p.display()))),
            }
        }
    }
    Ok(result)
}

fn asset(base: &Path, id: &str) -> Result<Asset, String> {
    valid_id(id)?;
    let a: Asset = serde_json::from_value(read(&base.join("assets").join(format!("{id}.json")))?)
        .map_err(|e| e.to_string())?;
    let path = fs::canonicalize(&a.path).map_err(|_| "Media file moved or missing")?;
    let allowed = fs::canonicalize(base.join("assets")).map_err(|e| e.to_string())?;
    if !path.starts_with(allowed) || !path.is_file() {
        return Err("Asset is outside the media library".into());
    }
    Ok(a)
}
async fn run(executable: &Path, args: &[String], seconds: u64) -> Result<Vec<u8>, String> {
    use tokio::io::AsyncReadExt;
    let mut child = platform::command(executable)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Media tool could not start: {e}"))?;
    let stdout = child.stdout.take().ok_or("Missing media tool output")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Missing media tool error output")?;
    let work = async {
        let out = async {
            let mut b = Vec::new();
            stdout.take(1_048_577).read_to_end(&mut b).await.map(|_| b)
        };
        let err = async {
            let mut b = Vec::new();
            stderr.take(1_048_577).read_to_end(&mut b).await.map(|_| b)
        };
        let (status, out, err) =
            tokio::try_join!(child.wait(), out, err).map_err(|e| e.to_string())?;
        if out.len() > 1_048_576 || err.len() > 1_048_576 {
            return Err("Media tool output limit exceeded".into());
        }
        if !status.success() {
            return Err(format!(
                "Media tool failed: {}",
                String::from_utf8_lossy(&err)
                    .chars()
                    .take(1800)
                    .collect::<String>()
            ));
        }
        Ok(out)
    };
    tokio::select! {
        result=tokio::time::timeout(Duration::from_secs(seconds),work)=>result.map_err(|_|"Media operation timed out".to_string())?,
        _=async {loop {tokio::time::sleep(Duration::from_millis(100)).await;if CANCEL.load(Ordering::Relaxed){break;}}}=>Err("Media operation canceled".into())
    }
}
async fn probe(path: &Path, kind: &str) -> Result<f64, String> {
    let exe = platform::find_agent("ffprobe", "").map_err(|_| {
        "Install FFmpeg (including ffprobe) and restart Jamstudio, or add its folder to PATH."
    })?;
    let args = [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "format=duration:stream=codec_type",
        "-of",
        "json",
    ]
    .map(String::from)
    .into_iter()
    .chain([path.to_string_lossy().into_owned()])
    .collect::<Vec<_>>();
    let v: Value =
        serde_json::from_slice(&run(&exe, &args, 20).await?).map_err(|e| e.to_string())?;
    let duration = v["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or("Cannot read media duration")?;
    if !duration.is_finite()
        || !(0.1..=600.1).contains(&duration)
        || !v["streams"]
            .as_array()
            .is_some_and(|streams| streams.iter().any(|s| s["codec_type"] == kind))
    {
        return Err("Choose a valid audio/video file between 0.1 seconds and 10 minutes.".into());
    }
    Ok(duration)
}
async fn import(base: &Path, path: &Path, kind: &str, label: &str) -> Result<Asset, String> {
    if !path.is_absolute()
        || !path.is_file()
        || !["audio", "video"].contains(&kind)
        || fs::metadata(path).map_err(|e| e.to_string())?.len() > 512 * 1024 * 1024
    {
        return Err("Choose a local audio/video file up to 512 MB.".into());
    }
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !MEDIA_EXTENSIONS.contains(&ext.as_str()) {
        return Err("Choose MP4/MOV/WebM/MKV video or WAV/MP3/FLAC/M4A/AAC/OGG audio.".into());
    }
    let seconds = probe(path, kind).await?;
    let id = id();
    let dest = base.join("assets").join(format!("{id}.{ext}"));
    fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::copy(path, &dest).map_err(|e| e.to_string())?;
    let a = Asset {
        schema_version: 1,
        id: id.clone(),
        kind: kind.into(),
        path: dest.to_string_lossy().into_owned(),
        seconds,
        label: label.chars().take(160).collect(),
        extra: BTreeMap::new(),
    };
    write(
        &base.join("assets").join(format!("{id}.json")),
        &serde_json::to_value(&a).map_err(|e| e.to_string())?,
    )?;
    Ok(a)
}
#[tauri::command]
pub async fn media_import(path: String, kind: String) -> Result<Asset, String> {
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    CANCEL.store(false, Ordering::Relaxed);
    import(
        &root(),
        Path::new(&path),
        &kind,
        Path::new(&path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Imported media"),
    )
    .await
}
#[tauri::command]
pub async fn media_from_take(take_id: String, state: State<'_, AppState>) -> Result<Asset, String> {
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    CANCEL.store(false, Ordering::Relaxed);
    let take = crate::find_take(&state, &take_id)?;
    let rate = if take.sample_rate > 0 {
        take.sample_rate
    } else {
        jam_audio::recorder::wav_sample_rate(Path::new(&take.path_band))?
    };
    if take.sample_count == 0 || take.sample_count as u64 > u64::from(rate) * 600 {
        return Err("Choose a take between one frame and ten minutes.".into());
    }
    let work = root().join(format!("mix-{}", id()));
    fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let result = async {
        let mut files = clean_take_stems(&take);
        if let Some(value) = take.snapshot["body"].get("clips") {
            let clips: Vec<jam_audio::workstation::ClipSpec> =
                serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
            if clips.len() > 16 {
                return Err("A take supports at most 16 guitar layers.".into());
            }
            for (i, spec) in clips.into_iter().enumerate() {
                if spec.muted {
                    continue;
                }
                let clip = crate::originals::read_clip(spec, &state)?;
                let path = work.join(format!("layer-{i}.wav"));
                jam_audio::export::write_clip_stem(
                    &path,
                    &clip,
                    take.sample_count,
                    rate,
                    take.tempo,
                )
                .map_err(|e| e.to_string())?;
                files.push(path);
            }
        }
        let mixed = work.join("soundtrack.wav");
        mix_soundtrack(&files, &mixed).await?;
        import(
            &root(),
            &mixed,
            "audio",
            &format!("Clean take mix · {}", take.timestamp),
        )
        .await
    }
    .await;
    let _ = fs::remove_dir_all(work);
    result
}
// The monitor/master contains click and test tone; it must never feed a soundtrack.
fn clean_take_stems(take: &jam_audio::recorder::TakeMetadata) -> Vec<PathBuf> {
    vec![
        PathBuf::from(take.stems.get("band").unwrap_or(&take.path_band)),
        PathBuf::from(take.stems.get("guitar-di").unwrap_or(&take.path_input)),
    ]
}

async fn mix_soundtrack(files: &[PathBuf], output: &Path) -> Result<(), String> {
    let exe = platform::find_agent("ffmpeg", "")?;
    let mut args: Vec<String> = ["-nostdin", "-y", "-v", "error"]
        .into_iter()
        .map(String::from)
        .collect();
    for file in files {
        args.extend(["-i".into(), file.to_string_lossy().into_owned()]);
    }
    args.extend([
        "-filter_complex".into(),
        format!(
            "amix=inputs={}:duration=longest:dropout_transition=0:normalize=1",
            files.len()
        ),
        "-ac".into(),
        "2".into(),
        "-ar".into(),
        "48000".into(),
        "-c:a".into(),
        "pcm_s24le".into(),
        output.to_string_lossy().into_owned(),
    ]);
    run(&exe, &args, 180).await?;
    Ok(())
}

#[tauri::command]
pub async fn media_tools() -> Value {
    let ffmpeg = platform::find_agent("ffmpeg", "");
    let ffprobe = platform::find_agent("ffprobe", "");
    json!({"ready":ffmpeg.is_ok()&&ffprobe.is_ok(),"message":if ffmpeg.is_ok()&&ffprobe.is_ok(){"FFmpeg and ffprobe found. Local MP4 export is available."}else{"Install FFmpeg with ffprobe, add its folder to PATH, then restart Jamstudio."}})
}
async fn finish_job(
    base: &Path,
    job: &mut Value,
    output: api::Output,
    m: &api::Model,
    state: &AppState,
) -> Result<(), String> {
    let (bytes, ext, lyrics) = match output {
        api::Output::Pending(task) => {
            job["taskId"] = json!(task);
            job["status"] = json!("pending");
            return Ok(());
        }
        api::Output::Inline(b, e, l) => (b, e, l),
        api::Output::Download(uri, e) => {
            // Persist the receipt before downloading: reopening can retry without a new generation.
            job["downloadUri"] = json!(uri);
            job["extension"] = json!(e);
            job["status"] = json!("download");
            write(
                &base
                    .join("jobs")
                    .join(format!("{}.json", job["id"].as_str().unwrap())),
                job,
            )?;
            (
                api::download(m, &uri, state.secret_store.as_ref()).await?,
                e,
                String::new(),
            )
        }
    };
    if bytes.is_empty() || bytes.len() > 128 * 1024 * 1024 {
        return Err("Generated media is empty or exceeds 128 MB".into());
    }
    let raw = base
        .join("assets")
        .join(format!("{}-source.{ext}", job["id"].as_str().unwrap()));
    fs::create_dir_all(raw.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&raw, bytes).map_err(|e| e.to_string())?;
    // Keep the raw file even if decoding fails; the paid output is never discarded.
    job["rawPath"] = json!(raw.to_string_lossy());
    job["lyrics"] = json!(lyrics);
    write(
        &base
            .join("jobs")
            .join(format!("{}.json", job["id"].as_str().unwrap())),
        job,
    )?;
    let a = import(base, &raw, &m.kind, &m.name).await?;
    job["assetId"] = json!(a.id);
    job["status"] = json!("ready");
    Ok(())
}
#[tauri::command]
pub async fn media_generate(
    request: api::Generate,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    CANCEL.store(false, Ordering::Relaxed);
    let (mut m, path, body) = api::request(&request)?;
    if !api::configured(&m, state.secret_store.as_ref()) {
        return Err(format!("Add a {} API key in Settings.", m.provider));
    }
    platform::find_agent("ffprobe", "")
        .map_err(|_| "Install FFmpeg with ffprobe before generating media.")?;
    m.model = request.model.clone();
    let base = root();
    let id = id();
    let file = base.join("jobs").join(format!("{id}.json"));
    let mut job = json!({"schemaVersion":1,"id":id,"request":request,"status":"unknown","message":"Request started. If interrupted, check provider history before generating again."});
    write(&file, &job)?;
    let result = async {
        let bytes = api::fetch(
            &m,
            &path,
            Some(&body),
            state.secret_store.as_ref(),
            &state.cost_log,
        )
        .await?;
        finish_job(&base, &mut job, api::response(&m, bytes)?, &m, &state).await
    }
    .await;
    job["message"] = json!(result.err().unwrap_or_default());
    write(&file, &job)?;
    Ok(public_job(job))
}
fn public_job(mut job: Value) -> Value {
    if let Some(o) = job.as_object_mut() {
        o.remove("downloadUri");
    }
    job
}
#[tauri::command]
pub async fn media_refresh(job_id: String, state: State<'_, AppState>) -> Result<Value, String> {
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    CANCEL.store(false, Ordering::Relaxed);
    valid_id(&job_id)?;
    let base = root();
    let file = base.join("jobs").join(format!("{job_id}.json"));
    let mut job = read(&file)?;
    let request: api::Generate =
        serde_json::from_value(job["request"].clone()).map_err(|e| e.to_string())?;
    let (mut m, _, _) = api::request(&request)?;
    m.model = request.model.clone();
    if job["status"] == "ready" {
        return Ok(public_job(job));
    }
    let result=async {
        if let Some(raw)=job["rawPath"].as_str() {
            let path=fs::canonicalize(raw).map_err(|e|e.to_string())?;
            if !path.starts_with(fs::canonicalize(base.join("assets")).map_err(|e|e.to_string())?) {return Err("Raw media outside library".into());}
            let a=import(&base,&path,&m.kind,&m.name).await?;job["assetId"]=json!(a.id);job["status"]=json!("ready");return Ok(());
        }
        let output=if let Some(task)=job["taskId"].as_str() {
            api::poll(&m,&request,task,state.secret_store.as_ref(),&state.cost_log).await?
        } else if let Some(uri)=job["downloadUri"].as_str() {
            let ext=job["extension"].as_str().ok_or("Missing media extension")?;
            if !["mp4","mp3","wav","webm","mov","mkv","flac","ogg"].contains(&ext){return Err("Invalid media extension".into());}
            api::Output::Download(uri.into(),ext.into())
        } else {return Err("No recoverable task ID. Check provider history and import the result; this button never starts another paid generation.".into());};
        finish_job(&base,&mut job,output,&m,&state).await
    }.await;
    job["message"] = json!(result.err().unwrap_or_default());
    write(&file, &job)?;
    Ok(public_job(job))
}

async fn render(base: &Path, document: &Value) -> Result<String, String> {
    let p = project(document)?;
    let audio = asset(
        base,
        p.audio_id.as_deref().ok_or("Choose a soundtrack first")?,
    )?;
    if audio.kind != "audio" || p.shots.is_empty() {
        return Err("Choose audio and add at least one shot".into());
    }
    let duration = p.shots.iter().map(|s| s.seconds).sum::<f64>();
    if (duration - audio.seconds).abs() > 0.1 {
        return Err(
            "Fit the storyboard to the soundtrack before exporting (within 0.1 seconds).".into(),
        );
    }
    let exe = platform::find_agent("ffmpeg", "")
        .map_err(|_| "Install FFmpeg and restart Jamstudio to render videos.")?;
    let output = base.join("exports").join(id());
    fs::create_dir_all(&output).map_err(|e| e.to_string())?;
    write(&output.join("project.json"), document)?;
    let (w, h) = if p.ratio == "9:16" {
        (720, 1280)
    } else {
        (1280, 720)
    };
    let mut concat = String::new();
    // Render each shot separately: bounded memory independent of the number of clips.
    for (i, shot) in p.shots.iter().enumerate() {
        let clip = asset(
            base,
            shot.asset_id
                .as_deref()
                .ok_or_else(|| format!("Shot {} needs a clip", i + 1))?,
        )?;
        if clip.kind != "video" || shot.trim_start >= clip.seconds {
            return Err(format!("Check video and trim offset for shot {}", i + 1));
        }
        let frames = ((p.shots[..=i].iter().map(|s| s.seconds).sum::<f64>() * 30.0).round()
            - (p.shots[..i].iter().map(|s| s.seconds).sum::<f64>() * 30.0).round())
            as u64;
        let name = format!("shot-{i}.mp4");
        let filter=format!("scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps=30,format=yuv420p");
        let args = vec![
            "-v".into(),
            "error".into(),
            "-nostdin".into(),
            "-protocol_whitelist".into(),
            "file,pipe".into(),
            "-stream_loop".into(),
            "-1".into(),
            "-ss".into(),
            shot.trim_start.to_string(),
            "-i".into(),
            clip.path,
            "-an".into(),
            "-vf".into(),
            filter,
            "-frames:v".into(),
            frames.to_string(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "fast".into(),
            "-crf".into(),
            "20".into(),
            "-threads".into(),
            "2".into(),
            output.join(&name).to_string_lossy().into_owned(),
        ];
        run(&exe, &args, 300).await?;
        concat.push_str(&format!("file '{name}'\n"));
    }
    fs::write(output.join("shots.txt"), concat).map_err(|e| e.to_string())?;
    let target = output.join("music-video.mp4");
    let args = vec![
        "-v".into(),
        "error".into(),
        "-nostdin".into(),
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "1".into(),
        "-protocol_whitelist".into(),
        "file,pipe".into(),
        "-i".into(),
        output.join("shots.txt").to_string_lossy().into_owned(),
        "-protocol_whitelist".into(),
        "file,pipe".into(),
        "-i".into(),
        audio.path,
        "-map".into(),
        "0:v:0".into(),
        "-map".into(),
        "1:a:0".into(),
        "-c:v".into(),
        "copy".into(),
        "-c:a".into(),
        "aac".into(),
        "-b:a".into(),
        "320k".into(),
        "-ar".into(),
        "48000".into(),
        "-t".into(),
        duration.to_string(),
        "-movflags".into(),
        "+faststart".into(),
        target.to_string_lossy().into_owned(),
    ];
    run(&exe, &args, 300).await?;
    Ok(target.to_string_lossy().into_owned())
}
#[tauri::command]
pub async fn media_render(document: Value) -> Result<String, String> {
    let _gate = GATE
        .try_lock()
        .map_err(|_| "Another media operation is running")?;
    CANCEL.store(false, Ordering::Relaxed);
    render(&root(), &document).await
}
#[tauri::command]
pub fn media_cancel() {
    CANCEL.store(true, Ordering::Relaxed);
}
fn playable_file(base: &Path, path: &Path) -> Result<PathBuf, String> {
    let file = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !file.starts_with(fs::canonicalize(base).map_err(|e| e.to_string())?)
        || !file.is_file()
        || !MEDIA_EXTENSIONS.contains(&file.extension().and_then(|s| s.to_str()).unwrap_or(""))
    {
        return Err("Choose an imported or generated file from the media library.".into());
    }
    Ok(file)
}
#[tauri::command]
pub async fn media_open(path: String) -> Result<(), String> {
    platform::open_media(&playable_file(&root(), Path::new(&path))?).await
}

#[cfg(test)]
mod tests {
    #[test]
    fn media_scan_keeps_good_documents_and_clean_mix_excludes_monitor() {
        let root = std::env::temp_dir().join(format!("jam-media-scan-{}", super::id()));
        std::fs::create_dir_all(root.join("projects")).unwrap();
        let doc = serde_json::json!({"schemaVersion":1,"id":"good","revision":0,"title":"Good","ratio":"16:9","shots":[]});
        super::save_project(&root, doc).unwrap();
        std::fs::write(root.join("projects/bad.json"), b"broken").unwrap();
        let result = super::list_media(&root).unwrap();
        assert_eq!(result["projects"].as_array().unwrap().len(), 1);
        assert_eq!(result["warnings"].as_array().unwrap().len(), 1);
        let take = jam_audio::recorder::TakeMetadata {
            path_input: "di.wav".into(),
            path_band: "band.wav".into(),
            path_master: "click.wav".into(),
            ..Default::default()
        };
        assert_eq!(
            super::clean_take_stems(&take),
            [
                std::path::PathBuf::from("band.wav"),
                std::path::PathBuf::from("di.wav")
            ]
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    use super::*;
    #[test]
    fn player_accepts_import_formats_but_not_outside_files_or_programs() {
        let base = std::env::temp_dir().join(format!("jam-player-{}", id()));
        let library = base.join("library");
        fs::create_dir_all(&library).unwrap();
        for ext in MEDIA_EXTENSIONS {
            let file = library.join(format!("reference.{ext}"));
            fs::write(&file, []).unwrap();
            assert!(playable_file(&library, &file).is_ok());
        }
        for file in [base.join("outside.wav"), library.join("program.exe")] {
            fs::write(&file, []).unwrap();
            assert!(playable_file(&library, &file).is_err());
        }
        assert!(playable_file(&library, &library).is_err());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn save_conflicts_unknown_fields_and_path_boundaries() {
        let base = std::env::temp_dir().join(format!("jam-video-{}", id()));
        let doc = json!({"schemaVersion":1,"id":"test","revision":0,"title":"Original","audioId":null,"ratio":"16:9","shots":[],"future":{"keep":true}});
        let saved = save_project(&base, doc.clone()).unwrap();
        assert_eq!(saved["future"], doc["future"]);
        assert!(save_project(&base, doc).is_err());
        let mut invalid = saved.clone();
        invalid["id"] = json!("../outside");
        assert!(save_project(&base, invalid).is_err());
        let mut invalid = saved;
        invalid["shots"] = json!([{"id":"a","seconds":0,"trimStart":0,"assetId":null}]);
        assert!(project(&invalid).is_err());
        fs::remove_dir_all(base).unwrap();
    }
    #[tokio::test]
    #[ignore = "requires user-installed FFmpeg; run with JAM_MEDIA_TEST=1"]
    async fn clean_soundtrack_uses_stems_not_click_master() {
        assert_eq!(std::env::var("JAM_MEDIA_TEST").as_deref(), Ok("1"));
        let base = std::env::temp_dir().join(format!("jam-clean-mix-{}", id()));
        fs::create_dir_all(&base).unwrap();
        let exe = platform::find_agent("ffmpeg", "").unwrap();
        for (name, value) in [("band", 0.2), ("di", 0.4), ("master", 0.9)] {
            run(
                &exe,
                &[
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    &format!("aevalsrc={value}|{value}:s=48000:d=1"),
                    "-c:a",
                    "pcm_s24le",
                    base.join(format!("{name}.wav")).to_str().unwrap(),
                ]
                .map(String::from),
                20,
            )
            .await
            .unwrap();
        }
        let take = jam_audio::recorder::TakeMetadata {
            path_input: base.join("di.wav").to_string_lossy().into_owned(),
            path_band: base.join("band.wav").to_string_lossy().into_owned(),
            path_master: base.join("master.wav").to_string_lossy().into_owned(),
            ..Default::default()
        };
        let output = base.join("mix.wav");
        mix_soundtrack(&clean_take_stems(&take), &output)
            .await
            .unwrap();
        let (audio, rate) = jam_audio::recorder::read_wav_mono(&output).unwrap();
        assert_eq!(rate, 48000);
        assert_eq!(audio.len(), 48000);
        assert!(audio.iter().all(|s| (*s - 0.3).abs() < 0.0001));
        fs::remove_dir_all(base).unwrap();
    }
    #[tokio::test]
    #[ignore = "requires user-installed FFmpeg and ffprobe; run with JAM_MEDIA_TEST=1"]
    async fn local_video_render_keeps_song_timing() {
        assert_eq!(std::env::var("JAM_MEDIA_TEST").as_deref(), Ok("1"));
        let base = std::env::temp_dir().join(format!("jam-video-{}", id()));
        fs::create_dir_all(&base).unwrap();
        let exe = platform::find_agent("ffmpeg", "").unwrap();
        CANCEL.store(false, Ordering::Relaxed);
        for (name, filter) in [
            (
                "song.wav",
                "sine=frequency=440:sample_rate=48000:duration=3",
            ),
            ("clip.mp4", "color=c=gold:s=320x180:d=1:r=30"),
        ] {
            let args = ["-v", "error", "-f", "lavfi", "-i", filter]
                .map(String::from)
                .into_iter()
                .chain([base.join(name).to_string_lossy().into_owned()])
                .collect::<Vec<_>>();
            run(&exe, &args, 30).await.unwrap();
        }
        let audio = import(&base, &base.join("song.wav"), "audio", "synthetic")
            .await
            .unwrap();
        let clip = import(&base, &base.join("clip.mp4"), "video", "synthetic")
            .await
            .unwrap();
        let doc = json!({"schemaVersion":1,"id":"test","revision":0,"title":"Synthetic film","audioId":audio.id,"ratio":"16:9","shots":[{"id":"a","seconds":1.37,"assetId":clip.id,"trimStart":0},{"id":"b","seconds":1.63,"assetId":clip.id,"trimStart":0.2}]});
        let file = render(&base, &doc).await.unwrap();
        assert!((probe(Path::new(&file), "video").await.unwrap() - 3.0).abs() < 0.05);
        assert!((probe(Path::new(&file), "audio").await.unwrap() - 3.0).abs() < 0.05);
        let pcm = run(
            &exe,
            &[
                "-v", "error", "-i", &file, "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le",
                "pipe:1",
            ]
            .map(String::from),
            30,
        )
        .await
        .unwrap();
        let samples: Vec<f32> = pcm
            .chunks(4)
            .map(|b| f32::from_le_bytes(b.try_into().unwrap()))
            .collect();
        // AAC introduces lossy error, but must retain the original frequency, phase and amplitude.
        let mse = samples
            .iter()
            .take(143000)
            .enumerate()
            .skip(1000)
            .map(|(i, s)| {
                let expected =
                    0.125 * (2.0 * std::f64::consts::PI * 440.0 * i as f64 / 48000.0).sin();
                (*s as f64 - expected).powi(2)
            })
            .sum::<f64>()
            / 142000.0;
        assert!(
            mse.sqrt() < 0.015,
            "Audio RMSE {} exceeds AAC tolerance",
            mse.sqrt()
        );
        fs::remove_dir_all(base).unwrap();
    }
}
