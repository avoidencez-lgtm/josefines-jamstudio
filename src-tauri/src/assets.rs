//! Sample packs from the GitHub `assets-v1` release. Headless download needs `JAM_LIVE=1`.
use crate::library::Library;
use crate::net;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use tauri::Emitter;

const EMPTY_SHA: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const RELEASE_PREFIX: &str =
    "https://github.com/avoidencez-lgtm/josefines-jamstudio/releases/download/";
const MAX_ZIP: u64 = 64 * 1024 * 1024;
const MAX_FILES: usize = 64;
/// Wire name: frontend `listen("assets.state")` maps dots to colons.
const ASSETS_STATE: &str = "assets:state";
pub const NOT_CONFIGURED: &str = "Sample pack download is not configured. This pack's SHA-256 is the empty-file placeholder. Publish a real assets-v1 zip and record its SHA-256 in assets/manifest.json. The band uses the bundled synthetic kit until then.";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackStatus {
    pub id: String,
    pub name: String,
    pub state: String,
    pub live: bool,
    pub message: String,
    #[serde(default)]
    pub percent: u8,
    #[serde(default)]
    pub licence: String,
}

#[derive(Clone)]
struct Pack {
    id: String,
    name: String,
    url: String,
    sha256: String,
    bytes: u64,
    licence: String,
}

fn manifest() -> Value {
    serde_json::from_str(include_str!("../../assets/manifest.json")).expect("assets manifest")
}

fn packs() -> Vec<Pack> {
    manifest()["packs"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|pack| {
            Some(Pack {
                id: pack["id"].as_str()?.to_string(),
                name: pack["name"].as_str().unwrap_or_default().to_string(),
                url: pack["url"].as_str()?.to_string(),
                sha256: pack["sha256"].as_str()?.to_ascii_lowercase(),
                bytes: pack["bytes"].as_u64().unwrap_or(0),
                licence: pack["licence"].as_str()?.to_string(),
            })
        })
        .collect()
}

fn pack_dir(id: &str) -> PathBuf {
    Library::default_user_root().join("assets").join(id)
}

fn placeholder(sha: &str) -> bool {
    sha == EMPTY_SHA || sha.len() != 64 || !sha.chars().all(|c| c.is_ascii_hexdigit())
}

fn parse_sha256(hex: &str) -> Option<[u8; 32]> {
    if hex.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, slot) in out.iter_mut().enumerate() {
        *slot = u8::from_str_radix(hex.get(i * 2..i * 2 + 2)?, 16).ok()?;
    }
    Some(out)
}

/// Constant-time compare of SHA-256 hex digests. Length/charset mismatches are public.
fn sha256_eq(left: &str, right: &str) -> bool {
    match (parse_sha256(left), parse_sha256(right)) {
        (Some(a), Some(b)) => {
            let mut diff = 0u8;
            for (x, y) in a.iter().zip(b.iter()) {
                diff |= x ^ y;
            }
            diff == 0
        }
        _ => false,
    }
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| format!("Cannot read {}. {e}", path.display()))?;
    sha256_reader(file)
}

fn sha256_reader(mut file: impl Read) -> Result<String, String> {
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn pack_files_present(dir: &Path) -> bool {
    dir.join("kit.json").is_file()
        || (dir.join("bass.sf2").is_file() && dir.join("comp.sf2").is_file())
}

fn pack_ready(dir: &Path, sha: &str) -> bool {
    if !pack_files_present(dir) {
        return false;
    }
    let Ok(root) = dir.canonicalize() else {
        return false;
    };
    let Ok(mut file) = File::open(dir.with_extension("zip")) else {
        return false;
    };
    // The retained release archive is the manifest: verify its identity, then
    // compare every installed file. A receipt alone cannot detect a damaged WAV.
    if !sha256_reader((&mut file).take(MAX_ZIP + 1)).is_ok_and(|got| sha256_eq(&got, sha))
        || file.rewind().is_err()
    {
        return false;
    }
    let Ok(mut zip) = zip::ZipArchive::new(file) else {
        return false;
    };
    let mut files = 0;
    let mut total = 0u64;
    for i in 0..zip.len() {
        let Ok(entry) = zip.by_index(i) else {
            return false;
        };
        if entry.is_dir() {
            continue;
        }
        files += 1;
        if files > MAX_FILES || entry.is_symlink() || entry.encrypted() {
            return false;
        }
        let Some(rel) = entry.enclosed_name() else {
            return false;
        };
        let Ok(path) = root.join(rel).canonicalize() else {
            return false;
        };
        if !path.starts_with(&root) {
            return false;
        }
        let Ok(installed) = File::open(&path) else {
            return false;
        };
        if !installed
            .metadata()
            .is_ok_and(|m| m.is_file() && m.len() == entry.size())
        {
            return false;
        }
        total = total.saturating_add(entry.size());
        if total > MAX_ZIP {
            return false;
        }
        // Read one byte beyond the declared size so an understated ZIP entry
        // cannot make two truncated prefixes look like complete matching files.
        let limit = entry.size() + 1;
        let Ok(expected) = sha256_reader(entry.take(limit)) else {
            return false;
        };
        let Ok(actual) = sha256_reader(installed.take(limit)) else {
            return false;
        };
        if !sha256_eq(&expected, &actual) {
            return false;
        }
    }
    files > 0
}

fn allowed_pack_url(url: &str) -> bool {
    url.starts_with(RELEASE_PREFIX)
        || (cfg!(test)
            && (url.starts_with("http://127.0.0.1:") || url.starts_with("http://localhost:")))
}

fn replace_dir(src: &Path, dest: &Path) -> Result<(), String> {
    // Nonempty directories cannot be replaced by rename. Keep the old pack
    // beside the destination until publication succeeds, including on Windows.
    let previous = dest.with_extension("previous");
    if previous.try_exists().map_err(|e| e.to_string())? {
        return Err(format!(
            "A previous sample pack was kept at {}. Move it aside before retrying the install.",
            previous.display()
        ));
    }
    let had_dest = dest.try_exists().map_err(|e| e.to_string())?;
    if had_dest {
        fs::rename(dest, &previous)
            .map_err(|e| format!("Cannot preserve {}. {e}", dest.display()))?;
    }
    if let Err(e) = fs::rename(src, dest) {
        if had_dest {
            if let Err(restore) = fs::rename(&previous, dest) {
                return Err(format!(
                    "Cannot publish {}. {e} Cannot restore the previous pack: {restore}. Its files are kept at {}.",
                    dest.display(), previous.display()
                ));
            }
        }
        return Err(format!("Cannot publish {}. {e}", dest.display()));
    }
    if had_dest {
        let _ = fs::remove_dir_all(&previous);
    }
    Ok(())
}

fn pack_mutexes() -> &'static tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>> {
    static LOCKS: OnceLock<tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> =
        OnceLock::new();
    LOCKS.get_or_init(|| tokio::sync::Mutex::new(HashMap::new()))
}

async fn lock_pack(id: &str) -> tokio::sync::OwnedMutexGuard<()> {
    let slot = {
        let mut map = pack_mutexes().lock().await;
        map.entry(id.to_string())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone()
    };
    slot.lock_owned().await
}

fn unpack_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "Invalid sample-pack ZIP.")?;
    if zip.is_empty() {
        return Err("Sample-pack ZIP has an unexpected number of files.".into());
    }
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let mut files = 0usize;
    let mut total = 0u64;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|_| "Unreadable sample-pack ZIP entry.")?;
        let rel = entry
            .enclosed_name()
            .ok_or("Unsafe path in sample-pack ZIP.")?;
        if entry.is_dir() {
            continue;
        }
        files += 1;
        if files > MAX_FILES {
            return Err("Sample-pack ZIP has an unexpected number of files.".into());
        }
        if entry.encrypted() || entry.is_symlink() {
            return Err("Encrypted files and links are not supported in sample packs.".into());
        }
        let ext = rel
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let name = rel
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let ok = ext == "wav"
            || ext == "json"
            || ext == "sf2"
            || name == "license"
            || name == "license.txt"
            || name == "licence.txt"
            || name.starts_with("license")
            || name == "readme.txt"
            || name.starts_with("readme");
        if !ok {
            return Err(
                "Sample packs may contain kit.json, SoundFont, licence text and WAV files only."
                    .into(),
            );
        }
        let max: u64 = if ext == "sf2" {
            32 * 1024 * 1024
        } else {
            8 * 1024 * 1024
        };
        let out = dest.join(rel);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut dst = File::create(&out).map_err(|e| e.to_string())?;
        // ZIP uncompressed-size headers are untrusted; bound the actual stream.
        let mut limited = Read::take(&mut entry, max.saturating_add(1));
        let written = std::io::copy(&mut limited, &mut dst).map_err(|e| e.to_string())?;
        if written > max {
            drop(dst);
            let _ = fs::remove_file(&out);
            return Err("A sample-pack file is larger than the allowed size.".into());
        }
        total += written;
        if total > MAX_ZIP {
            drop(dst);
            let _ = fs::remove_file(&out);
            return Err("Sample pack is larger than 64 MB.".into());
        }
    }
    if files == 0 {
        return Err("Sample-pack ZIP has an unexpected number of files.".into());
    }
    if !pack_files_present(dest) {
        return Err("Sample-pack ZIP is missing kit.json or bass.sf2/comp.sf2.".into());
    }
    Ok(())
}

fn content_range_start(headers: &reqwest::header::HeaderMap, expected: u64) -> Option<u64> {
    let value = headers.get(reqwest::header::CONTENT_RANGE)?.to_str().ok()?;
    let (unit, value) = value.trim().split_once(' ')?;
    if !unit.eq_ignore_ascii_case("bytes") {
        return None;
    }
    let number = |s: &str| {
        if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
            None
        } else {
            s.parse::<u64>().ok()
        }
    };
    let (range, total) = value.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    let (start, end) = (number(start)?, number(end)?);
    if end < start || end >= MAX_ZIP || (expected > 0 && end >= expected) {
        return None;
    }
    if total != "*" {
        let total = number(total)?;
        if total <= end || total > MAX_ZIP || (expected > 0 && total != expected) {
            return None;
        }
    }
    if let Some(length) = headers.get(reqwest::header::CONTENT_LENGTH) {
        if number(length.to_str().ok()?)? != end - start + 1 {
            return None;
        }
    }
    Some(start)
}

async fn download_resume(
    url: &str,
    part: &Path,
    expected: u64,
    mut progress: impl FnMut(u8),
) -> Result<(), String> {
    if !allowed_pack_url(url) {
        return Err("Sample pack URL must be this repo's GitHub Release.".into());
    }
    if expected > MAX_ZIP {
        return Err("Sample pack is larger than 64 MB.".into());
    }
    let limit = if expected > 0 { expected } else { MAX_ZIP };
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(4))
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("josefines-jamstudio/0.1")
        .build()
        .map_err(|e| e.to_string())?;
    let mut restarted = false;
    loop {
        let mut have = if restarted {
            0
        } else {
            part.metadata().map(|m| m.len()).unwrap_or(0)
        };
        if have > MAX_ZIP || (expected > 0 && have > expected) {
            have = 0;
        }
        if expected > 0 && have == expected {
            progress(100);
            return Ok(());
        }
        let mut req = client.get(url);
        if have > 0 {
            req = req.header(reqwest::header::RANGE, format!("bytes={have}-"));
        }
        let mut response = req.send().await.map_err(|e| e.to_string())?;
        let status = response.status();
        let range_start = content_range_start(response.headers(), expected);
        let partial = status == reqwest::StatusCode::PARTIAL_CONTENT;
        if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE
            || (partial && !range_start.is_some_and(|start| start == have || start == 0))
        {
            if restarted || have == 0 {
                return Err(format!("Sample pack download returned an unusable byte range ({status}). Retry the download."));
            }
            // Retry once without Range. Keep the prefix until a valid response
            // can replace it; never write a wrong-offset fragment at byte zero.
            restarted = true;
            continue;
        }
        if status != reqwest::StatusCode::OK && !partial {
            return Err(format!("Sample pack download failed ({status})."));
        }
        let resume = partial && have > 0 && range_start == Some(have);
        if !resume {
            have = 0;
        }
        if let Some(len) = response.content_length() {
            if len > limit - have {
                return Err(format!(
                    "Sample pack download exceeds its {limit}-byte limit. Retry the download."
                ));
            }
        }
        fs::create_dir_all(part.parent().unwrap_or(Path::new("."))).map_err(|e| e.to_string())?;
        let mut file = if resume {
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(part)
                .map_err(|e| e.to_string())?
        } else {
            File::create(part).map_err(|e| e.to_string())?
        };
        let total = if expected > 0 {
            expected
        } else {
            response
                .content_length()
                .map(|len| have.saturating_add(len))
                .unwrap_or(0)
        };
        let mut last = 255u8;
        let mut emit_pct = |written: u64| {
            if total == 0 {
                return;
            }
            let pct = ((written.saturating_mul(100)) / total).min(100) as u8;
            if pct != last {
                last = pct;
                progress(pct);
            }
        };
        emit_pct(have);
        let mut written = have;
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            if chunk.len() as u64 > limit - written {
                return Err(format!(
                    "Sample pack download exceeds its {limit}-byte limit. Retry the download."
                ));
            }
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            written += chunk.len() as u64;
            emit_pct(written);
        }
        if total > 0 && written < total {
            return Err(format!("Sample pack download is incomplete ({written} of {total} bytes). Retry to resume the download."));
        }
        return Ok(());
    }
}

fn status_for(pack: &Pack) -> PackStatus {
    let dest = pack_dir(&pack.id);
    let ready = pack_ready(&dest, &pack.sha256);
    let missing = placeholder(&pack.sha256);
    PackStatus {
        id: pack.id.clone(),
        name: pack.name.clone(),
        state: if ready {
            "ready"
        } else if missing {
            "missing"
        } else {
            "recorded"
        }
        .into(),
        live: false,
        percent: if ready { 100 } else { 0 },
        licence: pack.licence.clone(),
        message: if ready && dest.join("kit.json").is_file() {
            "Pack is unpacked. The band loads kit.json and WAVs from this folder when you play."
                .into()
        } else if ready {
            "Pack is unpacked. The band loads bass.sf2 and comp.sf2 when you play.".into()
        } else if missing {
            NOT_CONFIGURED.into()
        } else {
            "Hash is recorded on the assets-v1 release. Download needs JAM_LIVE=1.".into()
        },
    }
}

pub fn status() -> Vec<PackStatus> {
    packs().iter().map(status_for).collect()
}

pub async fn ensure(ids: &[String]) -> Result<Vec<PackStatus>, String> {
    ensure_emitting(ids, |_| {}).await
}

async fn ensure_emitting(
    ids: &[String],
    mut emit: impl FnMut(&[PackStatus]),
) -> Result<Vec<PackStatus>, String> {
    if std::env::var("JAM_ASSETS_FIXTURE").as_deref() == Ok("1") {
        let packs = status()
            .into_iter()
            .map(|mut pack| {
                pack.state = "synthetic".into();
                pack.message = "Synthetic kit only. No GitHub Release zip was downloaded.".into();
                pack
            })
            .collect::<Vec<_>>();
        emit(&packs);
        return Ok(packs);
    }
    let known = packs();
    if !ids.is_empty() && ids.iter().any(|id| known.iter().all(|pack| pack.id != *id)) {
        return Err("Unknown sample pack id.".into());
    }
    let wanted: Vec<Pack> = if ids.is_empty() {
        known
    } else {
        known
            .into_iter()
            .filter(|pack| ids.iter().any(|id| id == &pack.id))
            .collect()
    };
    if wanted.iter().any(|pack| placeholder(&pack.sha256)) {
        return Err(NOT_CONFIGURED.into());
    }
    net::live_guard("sample pack download")?;
    for pack in &wanted {
        if let Err(e) = install(pack, |status| emit(std::slice::from_ref(status))).await {
            let mut err = status_for(pack);
            err.state = "error".into();
            err.message = e.clone();
            emit(std::slice::from_ref(&err));
            return Err(e);
        }
    }
    let packs = wanted.iter().map(status_for).collect::<Vec<_>>();
    emit(&packs);
    Ok(packs)
}

async fn install(pack: &Pack, mut on_state: impl FnMut(&PackStatus)) -> Result<(), String> {
    let _guard = lock_pack(&pack.id).await;
    let dest = pack_dir(&pack.id);
    if pack_ready(&dest, &pack.sha256) {
        return Ok(());
    }
    let zip_path = dest.with_extension("zip");
    let part = dest.with_extension("zip.part");
    let mut downloading = status_for(pack);
    downloading.state = "downloading".into();
    downloading.message = "Downloading this sample pack.".into();
    if let Ok(path) = std::env::var("JAM_ASSETS_LOCAL") {
        let local = PathBuf::from(path);
        let metadata = match local.metadata() {
            Ok(metadata) if metadata.is_file() => metadata,
            _ => return Err("JAM_ASSETS_LOCAL does not point at a zip.".into()),
        };
        if pack.bytes > MAX_ZIP {
            return Err("Sample pack is larger than 64 MB.".into());
        }
        let len = metadata.len();
        if len > MAX_ZIP {
            return Err("Sample pack is larger than 64 MB.".into());
        }
        if pack.bytes > 0 && len != pack.bytes {
            return Err(format!(
                "Sample pack size failed. Expected {} bytes, got {len}.",
                pack.bytes
            ));
        }
        fs::create_dir_all(dest.parent().unwrap_or(Path::new("."))).map_err(|e| e.to_string())?;
        fs::copy(&local, &part).map_err(|e| e.to_string())?;
        downloading.percent = 100;
        on_state(&downloading);
    } else {
        let mut progress_status = downloading.clone();
        download_resume(&pack.url, &part, pack.bytes, |percent| {
            progress_status.percent = percent;
            on_state(&progress_status);
        })
        .await?;
    }
    let mut verifying = status_for(pack);
    verifying.state = "verifying".into();
    verifying.percent = 100;
    verifying.message = "Verifying this sample pack.".into();
    on_state(&verifying);
    let digest = sha256_file(&part)?;
    if !sha256_eq(&digest, &pack.sha256) {
        let _ = fs::remove_file(&part);
        return Err(format!(
            "Sample pack checksum failed. Expected {}, got {digest}.",
            pack.sha256
        ));
    }
    if pack.bytes > 0 {
        let len = part.metadata().map_err(|e| e.to_string())?.len();
        if len != pack.bytes {
            let _ = fs::remove_file(&part);
            return Err(format!(
                "Sample pack size failed. Expected {} bytes, got {len}.",
                pack.bytes
            ));
        }
    }
    let staging = dest.with_file_name(format!("{}.unpacking", pack.id));
    if staging.try_exists().map_err(|e| e.to_string())? {
        fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    let result = (|| {
        unpack_zip(&part, &staging)?;
        let previous_zip = zip_path.with_extension("zip.previous");
        if previous_zip.try_exists().map_err(|e| e.to_string())? {
            return Err(format!(
                "A previous sample-pack archive was kept at {}. Move it aside before retrying the install.",
                previous_zip.display()
            ));
        }
        let had_zip = zip_path.try_exists().map_err(|e| e.to_string())?;
        if had_zip {
            fs::rename(&zip_path, &previous_zip).map_err(|e| e.to_string())?;
        }
        let publish = (|| {
            fs::rename(&part, &zip_path).map_err(|e| e.to_string())?;
            if let Err(e) = replace_dir(&staging, &dest) {
                // Keep the new download for retry before restoring the old archive.
                let _ = fs::rename(&zip_path, &part);
                return Err(e);
            }
            Ok(())
        })();
        if had_zip {
            if let Err(ref original) = publish {
                if let Err(restore) = fs::rename(&previous_zip, &zip_path) {
                    return Err(format!(
                        "{original} Cannot restore the previous archive: {restore}. Its bytes are kept at {}.",
                        previous_zip.display()
                    ));
                }
            } else {
                let _ = fs::remove_file(&previous_zip);
            }
        }
        publish
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

#[tauri::command]
pub async fn assets_status() -> Result<Vec<PackStatus>, String> {
    tokio::task::spawn_blocking(status)
        .await
        .map_err(|e| format!("Cannot check the sample packs. {e}"))
}

#[tauri::command]
pub async fn assets_ensure<R: tauri::Runtime>(
    ids: Option<Vec<String>>,
    app: tauri::AppHandle<R>,
) -> Result<Vec<PackStatus>, String> {
    let app2 = app.clone();
    ensure_emitting(&ids.unwrap_or_default(), move |packs| {
        let _ = app2.emit(ASSETS_STATE, packs);
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Mutex;
    use std::thread;
    use std::time::Duration;

    static ENV: Mutex<()> = Mutex::new(());

    struct TestRoot {
        dir: PathBuf,
        _guard: std::sync::MutexGuard<'static, ()>,
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            std::env::remove_var("JAM_USER_DIR");
            std::env::remove_var("JAM_ASSETS_LOCAL");
            let _ = fs::remove_dir_all(&self.dir);
        }
    }

    fn test_root() -> TestRoot {
        let guard = ENV.lock().unwrap_or_else(|e| e.into_inner());
        let dir = std::env::temp_dir().join(format!(
            "jam-assets-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        std::env::set_var("JAM_USER_DIR", &dir);
        TestRoot { dir, _guard: guard }
    }

    fn tiny_kit_zip(path: &Path) {
        let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        zip.start_file("kit.json", opts).unwrap();
        zip.write_all(br#"{"schemaVersion":1,"id":"fixture-kit"}"#)
            .unwrap();
        zip.start_file("LICENSE.txt", opts).unwrap();
        zip.write_all(b"CC0-1.0").unwrap();
        zip.finish().unwrap();
    }

    fn kit_pack(id: &str, zip: &Path) -> Pack {
        Pack {
            id: id.into(),
            name: id.into(),
            url: "http://127.0.0.1:1/missing".into(),
            sha256: sha256_file(zip).unwrap(),
            bytes: zip.metadata().unwrap().len(),
            licence: "CC0-1.0".into(),
        }
    }

    struct HttpReply {
        status: u16,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
        delay: Duration,
    }

    fn read_http_request(stream: &mut std::net::TcpStream) -> Vec<u8> {
        let mut buf = Vec::new();
        let mut tmp = [0u8; 1024];
        stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
        while !buf.windows(4).any(|w| w == b"\r\n\r\n") {
            match stream.read(&mut tmp) {
                Ok(0) => break,
                Ok(n) => buf.extend_from_slice(&tmp[..n]),
                Err(_) => break,
            }
            if buf.len() > 64 * 1024 {
                break;
            }
        }
        buf
    }

    fn spawn_http(replies: Vec<HttpReply>) -> (String, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let mut requests = Vec::new();
            for reply in replies {
                let deadline = std::time::Instant::now() + Duration::from_secs(3);
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            if std::time::Instant::now() >= deadline {
                                return requests;
                            }
                            thread::sleep(Duration::from_millis(10));
                        }
                        Err(_) => return requests,
                    }
                };
                stream.set_nonblocking(false).ok();
                requests.push(String::from_utf8(read_http_request(&mut stream)).unwrap());
                if !reply.delay.is_zero() {
                    thread::sleep(reply.delay);
                }
                let mut head = format!("HTTP/1.1 {} TEST\r\nConnection: close\r\n", reply.status);
                if !reply.headers.iter().any(|(key, _)| {
                    key.eq_ignore_ascii_case("content-length")
                        || key.eq_ignore_ascii_case("transfer-encoding")
                }) {
                    head.push_str(&format!("Content-Length: {}\r\n", reply.body.len()));
                }
                for (k, v) in &reply.headers {
                    head.push_str(&format!("{k}: {v}\r\n"));
                }
                head.push_str("\r\n");
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(&reply.body);
            }
            requests
        });
        (format!("http://127.0.0.1:{}", addr.port()), handle)
    }

    fn patch_zip_uncompressed_sizes(data: &mut [u8], size: u32) {
        let new = size.to_le_bytes();
        let mut i = 0;
        while i + 30 <= data.len() {
            if data[i..i + 4] == [0x50, 0x4b, 0x03, 0x04] {
                data[i + 22..i + 26].copy_from_slice(&new);
                i += 30;
                continue;
            }
            if i + 46 <= data.len() && data[i..i + 4] == [0x50, 0x4b, 0x01, 0x02] {
                data[i + 24..i + 28].copy_from_slice(&new);
                i += 46;
                continue;
            }
            i += 1;
        }
    }

    #[test]
    fn sha256_eq_compares_decoded_digests_in_constant_time() {
        let empty = EMPTY_SHA;
        let other = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b856";
        assert!(sha256_eq(empty, empty));
        assert!(sha256_eq(&empty.to_ascii_uppercase(), empty));
        assert!(!sha256_eq(empty, other));
        assert!(!sha256_eq(empty, &empty[..63]));
        assert!(!sha256_eq("not-a-digest", empty));
        assert!(!sha256_eq(
            empty,
            "gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg"
        ));
        let kit = std::env::temp_dir().join(format!("jam-sha256-eq-{}", std::process::id()));
        let _ = fs::remove_dir_all(&kit);
        fs::create_dir_all(&kit).unwrap();
        let zip_path = kit.join("kit.zip");
        tiny_kit_zip(&zip_path);
        let digest = sha256_file(&zip_path).unwrap();
        assert!(sha256_eq(&digest, &digest));
        let mut mismatch = digest.clone();
        mismatch.replace_range(62..64, if digest.ends_with("00") { "01" } else { "00" });
        assert!(!sha256_eq(&digest, &mismatch));
        let _ = fs::remove_dir_all(&kit);
    }

    #[test]
    fn unpack_zip_ignores_directory_records_in_the_file_limit() {
        let dir = std::env::temp_dir().join(format!(
            "jam-assets-dirs-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let zip_path = dir.join("dirs.zip");
        let mut zip = zip::ZipWriter::new(File::create(&zip_path).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        zip.start_file("kit.json", opts).unwrap();
        zip.write_all(br#"{"schemaVersion":1,"id":"dirs-kit"}"#)
            .unwrap();
        zip.start_file("kick/hit.wav", opts).unwrap();
        zip.write_all(b"RIFF").unwrap();
        for i in 0..63 {
            zip.add_directory(format!("layer{i}/"), opts).unwrap();
        }
        zip.finish().unwrap();
        let archive = zip::ZipArchive::new(File::open(&zip_path).unwrap()).unwrap();
        assert!(archive.len() > 64, "zip.len()={}", archive.len());
        drop(archive);
        unpack_zip(&zip_path, &dir.join("out")).unwrap();
        assert!(dir.join("out/kit.json").is_file());
        assert!(dir.join("out/kick/hit.wav").is_file());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unpack_zip_bounds_actual_bytes_not_the_header_size() {
        let dir = std::env::temp_dir().join(format!(
            "jam-assets-bomb-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let zip_path = dir.join("bomb.zip");
        let mut zip = zip::ZipWriter::new(File::create(&zip_path).unwrap());
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("kit.json", opts).unwrap();
        zip.write_all(br#"{"schemaVersion":1}"#).unwrap();
        zip.start_file("kick.wav", opts).unwrap();
        zip.write_all(&vec![0u8; 9 * 1024 * 1024]).unwrap();
        zip.finish().unwrap();
        let mut data = fs::read(&zip_path).unwrap();
        patch_zip_uncompressed_sizes(&mut data, 1000);
        fs::write(&zip_path, &data).unwrap();
        let err = unpack_zip(&zip_path, &dir.join("out")).unwrap_err();
        assert!(err.contains("larger than the allowed size"), "{err}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn unpack_zip_enforces_cumulative_uncompressed_size() {
        let dir = std::env::temp_dir().join(format!(
            "jam-assets-sum-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let zip_path = dir.join("sum.zip");
        let mut zip = zip::ZipWriter::new(File::create(&zip_path).unwrap());
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("kit.json", opts).unwrap();
        zip.write_all(br#"{"schemaVersion":1}"#).unwrap();
        let chunk = vec![0u8; 7 * 1024 * 1024];
        for i in 0..10 {
            zip.start_file(format!("pad{i}.wav"), opts).unwrap();
            zip.write_all(&chunk).unwrap();
        }
        zip.finish().unwrap();
        let err = unpack_zip(&zip_path, &dir.join("out")).unwrap_err();
        assert!(err.contains("larger than 64 MB"), "{err}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn pack_ready_verifies_installed_files_against_the_release_archive() {
        let root = test_root();
        let dir = root.dir.join("kit");
        let archive = dir.with_extension("zip");
        let mut zip = zip::ZipWriter::new(File::create(&archive).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        zip.start_file("kit.json", opts).unwrap();
        zip.write_all(br#"{"schemaVersion":1}"#).unwrap();
        zip.start_file("kick/hit.wav", opts).unwrap();
        let samples: Vec<u8> = (0..20_001).map(|i| (i % 251) as u8).collect();
        zip.write_all(&samples).unwrap();
        zip.finish().unwrap();
        let sha = sha256_file(&archive).unwrap();
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("kit.json"), br#"{"schemaVersion":1}"#).unwrap();
        // Even an old matching receipt must not conceal a missing sample.
        fs::write(dir.join("installed.sha256"), &sha).unwrap();
        assert!(!pack_ready(&dir, &sha));

        unpack_zip(&archive, &dir).unwrap();
        assert!(pack_ready(&dir, &sha));
        let sample = dir.join("kick/hit.wav");
        let mut damaged = samples.clone();
        *damaged.last_mut().unwrap() ^= 1;
        fs::write(&sample, damaged).unwrap();
        assert!(
            !pack_ready(&dir, &sha),
            "same-size corruption must be found"
        );
        fs::write(&sample, &samples).unwrap();
        assert!(pack_ready(&dir, &sha));
        fs::remove_file(&sample).unwrap();
        assert!(!pack_ready(&dir, &sha));
        unpack_zip(&archive, &dir).unwrap();
        fs::write(&archive, b"invalid replacement archive").unwrap();
        assert!(!pack_ready(&dir, &sha));
    }

    #[test]
    fn leftover_kit_json_is_replaced_only_after_a_complete_unpack() {
        let _root = test_root();
        let dest = pack_dir("leftover-kit");
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("kit.json"), br#"{"schemaVersion":1}"#).unwrap();
        let zip = _root.dir.join("kit.zip");
        tiny_kit_zip(&zip);
        let pack = kit_pack("leftover-kit", &zip);
        assert!(!pack_ready(&dest, &pack.sha256));
        std::env::set_var("JAM_ASSETS_LOCAL", &zip);
        tauri::async_runtime::block_on(install(&pack, |_| {})).unwrap();
        assert!(pack_ready(&dest, &pack.sha256));
        assert!(dest.join("LICENSE.txt").is_file());
        assert_eq!(
            sha256_file(&dest.with_extension("zip")).unwrap(),
            pack.sha256
        );
        assert!(!dest.with_extension("zip.part").exists());
    }

    #[test]
    fn oversized_local_pack_is_rejected_before_touching_the_partial_download() {
        let _root = test_root();
        let zip = _root.dir.join("oversized.zip");
        tiny_kit_zip(&zip);
        let mut pack = kit_pack("oversized-kit", &zip);
        pack.bytes -= 1;
        let part = pack_dir(&pack.id).with_extension("zip.part");
        fs::create_dir_all(part.parent().unwrap()).unwrap();
        fs::write(&part, b"previous partial").unwrap();
        std::env::set_var("JAM_ASSETS_LOCAL", &zip);

        let err = tauri::async_runtime::block_on(install(&pack, |_| {})).unwrap_err();

        assert!(err.contains("size"), "{err}");
        assert_eq!(fs::read(part).unwrap(), b"previous partial");
    }

    #[test]
    fn failed_unpack_preserves_the_previous_pack_and_archive() {
        let _root = test_root();
        let dest = pack_dir("bad-kit");
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("kit.json"), b"previous kit").unwrap();
        fs::write(dest.join("kick.wav"), b"previous sample").unwrap();
        fs::write(dest.with_extension("zip"), b"previous archive").unwrap();
        let zip = _root.dir.join("bad.zip");
        let mut writer = zip::ZipWriter::new(File::create(&zip).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        writer.start_file("kit.json", opts).unwrap();
        writer
            .write_all(br#"{"schemaVersion":1,"id":"bad"}"#)
            .unwrap();
        writer.start_file("evil.exe", opts).unwrap();
        writer.write_all(b"MZ").unwrap();
        writer.finish().unwrap();
        let pack = kit_pack("bad-kit", &zip);
        std::env::set_var("JAM_ASSETS_LOCAL", &zip);
        let mut mismatched = pack.clone();
        mismatched.sha256 = EMPTY_SHA.into();
        let err = tauri::async_runtime::block_on(install(&mismatched, |_| {})).unwrap_err();
        assert!(err.contains("checksum failed"), "{err}");
        assert_eq!(fs::read(dest.join("kit.json")).unwrap(), b"previous kit");
        assert_eq!(
            fs::read(dest.with_extension("zip")).unwrap(),
            b"previous archive"
        );
        let err = tauri::async_runtime::block_on(install(&pack, |_| {})).unwrap_err();
        assert!(
            err.contains("WAV files only") || err.contains("missing"),
            "{err}"
        );
        assert!(!pack_ready(&dest, &pack.sha256));
        assert_eq!(fs::read(dest.join("kit.json")).unwrap(), b"previous kit");
        assert_eq!(fs::read(dest.join("kick.wav")).unwrap(), b"previous sample");
        assert_eq!(
            fs::read(dest.with_extension("zip")).unwrap(),
            b"previous archive"
        );
        assert!(!dest
            .with_file_name("bad-kit.unpacking")
            .join("kit.json")
            .is_file());
    }

    #[test]
    fn failed_pack_publication_preserves_the_installed_archive_and_recovery_folder() {
        let root = test_root();
        let zip = root.dir.join("kit.zip");
        tiny_kit_zip(&zip);
        let pack = kit_pack("publish-kit", &zip);
        std::env::set_var("JAM_ASSETS_LOCAL", &zip);
        tauri::async_runtime::block_on(install(&pack, |_| {})).unwrap();
        let dest = pack_dir(&pack.id);
        let archive = dest.with_extension("zip");
        let old_archive = fs::read(&archive).unwrap();
        let old_kit = fs::read(dest.join("kit.json")).unwrap();

        let mut updated = zip::ZipWriter::new_append(
            OpenOptions::new()
                .read(true)
                .write(true)
                .open(&zip)
                .unwrap(),
        )
        .unwrap();
        updated
            .start_file("README.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        updated.write_all(b"Updated sample pack").unwrap();
        updated.finish().unwrap();
        let updated_pack = kit_pack("publish-kit", &zip);
        let archive_recovery = archive.with_extension("zip.previous");
        fs::write(&archive_recovery, b"unrecovered archive").unwrap();
        let err = tauri::async_runtime::block_on(install(&updated_pack, |_| {})).unwrap_err();
        assert!(err.contains("previous sample-pack archive"), "{err}");
        assert_eq!(fs::read(&archive_recovery).unwrap(), b"unrecovered archive");
        assert_eq!(fs::read(&archive).unwrap(), old_archive);
        assert!(pack_ready(&dest, &pack.sha256));
        fs::rename(&archive_recovery, root.dir.join("saved-archive.zip")).unwrap();
        let recovery = dest.with_extension("previous");
        fs::create_dir(&recovery).unwrap();
        fs::write(recovery.join("keep.txt"), b"unrecovered pack").unwrap();

        let err = tauri::async_runtime::block_on(install(&updated_pack, |_| {})).unwrap_err();
        assert!(err.contains("previous sample pack"), "{err}");
        assert_eq!(
            fs::read(&archive).unwrap(),
            old_archive,
            "A later directory failure must not replace the installed ZIP"
        );
        assert_eq!(fs::read(dest.join("kit.json")).unwrap(), old_kit);
        assert_eq!(
            fs::read(recovery.join("keep.txt")).unwrap(),
            b"unrecovered pack"
        );
        assert!(pack_ready(&dest, &pack.sha256));
        assert!(!dest.with_file_name("publish-kit.unpacking").exists());
        assert!(!archive_recovery.exists());
        assert_eq!(
            fs::read(dest.with_extension("zip.part")).unwrap(),
            fs::read(&zip).unwrap()
        );

        fs::rename(&recovery, root.dir.join("saved-recovery")).unwrap();
        tauri::async_runtime::block_on(install(&updated_pack, |_| {})).unwrap();
        assert!(pack_ready(&dest, &updated_pack.sha256));
        assert!(!archive_recovery.exists());
        assert_eq!(fs::read(&archive).unwrap(), fs::read(&zip).unwrap());
        assert_eq!(
            fs::read(root.dir.join("saved-recovery/keep.txt")).unwrap(),
            b"unrecovered pack"
        );
    }

    #[test]
    fn replacing_a_pack_restores_it_on_failure_and_keeps_recovery_files() {
        let root = test_root();
        let dest = root.dir.join("kit");
        let staging = root.dir.join("kit.unpacking");
        let previous = dest.with_extension("previous");
        fs::create_dir(&dest).unwrap();
        fs::write(dest.join("kit.json"), b"old").unwrap();

        // A missing source makes publication fail after the old pack was moved.
        assert!(replace_dir(&staging, &dest).is_err());
        assert_eq!(fs::read(dest.join("kit.json")).unwrap(), b"old");
        assert!(!previous.exists());

        fs::create_dir(&staging).unwrap();
        fs::write(staging.join("kit.json"), b"new").unwrap();
        fs::create_dir(&previous).unwrap();
        fs::write(previous.join("kit.json"), b"recovery").unwrap();
        assert!(replace_dir(&staging, &dest).is_err());
        assert_eq!(fs::read(dest.join("kit.json")).unwrap(), b"old");
        assert_eq!(fs::read(staging.join("kit.json")).unwrap(), b"new");
        assert_eq!(fs::read(previous.join("kit.json")).unwrap(), b"recovery");

        fs::rename(&previous, root.dir.join("recovered-kit")).unwrap();
        replace_dir(&staging, &dest).unwrap();
        assert_eq!(fs::read(dest.join("kit.json")).unwrap(), b"new");
        assert!(!previous.exists());
        assert!(!staging.exists());
    }

    #[test]
    fn download_resume_drops_part_on_416_and_restarts() {
        let dir = std::env::temp_dir().join(format!(
            "jam-assets-416-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let part = dir.join("pack.zip.part");
        fs::write(&part, b"prefix").unwrap();
        let body = b"restored-pack-bytes".to_vec();
        let (url, handle) = spawn_http(vec![
            HttpReply {
                status: 416,
                headers: vec![],
                body: Vec::new(),
                delay: Duration::ZERO,
            },
            HttpReply {
                status: 200,
                headers: vec![],
                body: body.clone(),
                delay: Duration::ZERO,
            },
        ]);
        tauri::async_runtime::block_on(download_resume(&url, &part, body.len() as u64, |_| {}))
            .unwrap();
        let requests = handle.join().unwrap();
        assert_eq!(requests.len(), 2);
        assert!(requests[0]
            .to_ascii_lowercase()
            .contains("\r\nrange: bytes=6-\r\n"));
        assert!(!requests[1].to_ascii_lowercase().contains("\r\nrange:"));
        assert_eq!(fs::read(&part).unwrap(), body);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn download_resume_truncates_when_content_range_does_not_match() {
        let dir = std::env::temp_dir().join(format!(
            "jam-assets-range-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let part = dir.join("pack.zip.part");
        fs::write(&part, b"AAAAA").unwrap();
        let body = b"BBBBBBBBBB".to_vec();
        let (url, handle) = spawn_http(vec![HttpReply {
            status: 206,
            headers: vec![("Content-Range".into(), "bytes 0-9/10".into())],
            body: body.clone(),
            delay: Duration::ZERO,
        }]);
        tauri::async_runtime::block_on(download_resume(&url, &part, 10, |_| {})).unwrap();
        handle.join().unwrap();
        assert_eq!(fs::read(&part).unwrap(), body);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn download_resume_appends_only_when_content_range_starts_at_have() {
        let dir = std::env::temp_dir().join(format!(
            "jam-assets-resume-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let part = dir.join("pack.zip.part");
        fs::write(&part, b"AAAAA").unwrap();
        let (url, handle) = spawn_http(vec![HttpReply {
            status: 206,
            headers: vec![("Content-Range".into(), "bytes 5-9/10".into())],
            body: b"BBBBB".to_vec(),
            delay: Duration::ZERO,
        }]);
        tauri::async_runtime::block_on(download_resume(&url, &part, 10, |_| {})).unwrap();
        let requests = handle.join().unwrap();
        assert_eq!(requests.len(), 1);
        assert!(requests[0]
            .to_ascii_lowercase()
            .contains("\r\nrange: bytes=5-\r\n"));
        assert_eq!(fs::read(&part).unwrap(), b"AAAAABBBBB");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn download_resume_restarts_once_for_an_unusable_partial_response() {
        let root = test_root();
        let part = root.dir.join("pack.zip.part");
        // A wrong nonzero start cannot become the beginning of a full archive.
        // Nor may matching starts hide an invalid end, total, unit or length.
        for range in [
            "bytes 3-7/10",
            "bytes 5-4/10",
            "bytes 5-9/9",
            "bytes 5-9/11",
            "bytes 5-8/10",
            "bytes5-9/10",
            "bytes 5-garbage/10",
            "items 5-9/10",
            "",
        ] {
            fs::write(&part, b"AAAAA").unwrap();
            let partial = || HttpReply {
                status: 206,
                headers: if range.is_empty() {
                    vec![]
                } else {
                    vec![("Content-Range".into(), range.into())]
                },
                body: b"BBBBB".to_vec(),
                delay: Duration::ZERO,
            };
            let (url, handle) = spawn_http(vec![
                partial(),
                HttpReply {
                    status: 200,
                    headers: vec![],
                    body: b"0123456789".to_vec(),
                    delay: Duration::ZERO,
                },
            ]);
            tauri::async_runtime::block_on(download_resume(&url, &part, 10, |_| {})).unwrap();
            let requests = handle.join().unwrap();
            assert_eq!(requests.len(), 2, "{range}");
            assert!(requests[0]
                .to_ascii_lowercase()
                .contains("\r\nrange: bytes=5-\r\n"));
            assert!(!requests[1].to_ascii_lowercase().contains("\r\nrange:"));
            assert_eq!(fs::read(&part).unwrap(), b"0123456789", "{range}");

            fs::write(&part, b"AAAAA").unwrap();
            let (url, handle) = spawn_http(vec![partial(), partial()]);
            assert!(
                tauri::async_runtime::block_on(download_resume(&url, &part, 10, |_| {})).is_err()
            );
            let requests = handle.join().unwrap();
            assert_eq!(requests.len(), 2, "{range}");
            assert!(!requests[1].to_ascii_lowercase().contains("\r\nrange:"));
            assert_eq!(fs::read(&part).unwrap(), b"AAAAA", "{range}");
        }
    }

    #[test]
    fn download_resume_emits_percent_from_expected_bytes() {
        let dir = std::env::temp_dir().join(format!(
            "jam-assets-pct-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let part = dir.join("pack.zip.part");
        let body = vec![7u8; 40];
        let (url, handle) = spawn_http(vec![HttpReply {
            status: 200,
            headers: vec![],
            body: body.clone(),
            delay: Duration::ZERO,
        }]);
        let seen = std::sync::Mutex::new(Vec::new());
        tauri::async_runtime::block_on(download_resume(&url, &part, body.len() as u64, |pct| {
            seen.lock().unwrap().push(pct);
        }))
        .unwrap();
        handle.join().unwrap();
        let pcts = seen.lock().unwrap().clone();
        assert!(pcts.contains(&100), "{pcts:?}");
        assert!(pcts.windows(2).all(|w| w[0] <= w[1]), "{pcts:?}");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn incomplete_pack_download_keeps_the_prefix_and_resumes_before_installing() {
        let root = test_root();
        let zip = root.dir.join("kit.zip");
        tiny_kit_zip(&zip);
        let bytes = fs::read(&zip).unwrap();
        let split = bytes.len() / 2;
        let mut pack = kit_pack("interrupted-kit", &zip);
        let dest = pack_dir(&pack.id);
        let part = dest.with_extension("zip.part");
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("kit.json"), b"previous kit").unwrap();
        fs::write(dest.with_extension("zip"), b"previous archive").unwrap();
        let (url, server) = spawn_http(vec![HttpReply {
            status: 200,
            headers: vec![],
            body: bytes[..split].to_vec(),
            delay: Duration::ZERO,
        }]);
        pack.url = url;
        let mut states = Vec::new();
        let err = tauri::async_runtime::block_on(install(&pack, |state| {
            states.push(state.state.clone());
        }))
        .unwrap_err();
        server.join().unwrap();
        assert!(
            part.is_file(),
            "Keep an incomplete download for retry: {err}"
        );
        assert_eq!(fs::read(&part).unwrap(), bytes[..split]);
        assert!(err.contains("incomplete"), "{err}");
        assert!(!states.iter().any(|state| state == "verifying"));
        assert_eq!(fs::read(dest.join("kit.json")).unwrap(), b"previous kit");
        assert_eq!(
            fs::read(dest.with_extension("zip")).unwrap(),
            b"previous archive"
        );

        let (url, server) = spawn_http(vec![HttpReply {
            status: 206,
            headers: vec![(
                "Content-Range".into(),
                format!("bytes {split}-{}/{}", bytes.len() - 1, bytes.len()),
            )],
            body: bytes[split..].to_vec(),
            delay: Duration::ZERO,
        }]);
        pack.url = url;
        tauri::async_runtime::block_on(install(&pack, |_| {})).unwrap();
        let requests = server.join().unwrap();
        assert!(requests[0]
            .to_ascii_lowercase()
            .contains(&format!("\r\nrange: bytes={split}-\r\n")));
        assert!(pack_ready(&dest, &pack.sha256));
        assert_eq!(fs::read(dest.with_extension("zip")).unwrap(), bytes);
        assert!(!part.exists());
    }

    #[test]
    fn download_resume_checks_size_before_replacing_or_appending_bytes() {
        let root = test_root();
        let part = root.dir.join("pack.zip.part");
        fs::write(&part, b"prefix").unwrap();
        let (url, server) = spawn_http(vec![HttpReply {
            status: 200,
            headers: vec![],
            body: vec![0; 11],
            delay: Duration::ZERO,
        }]);
        let result = tauri::async_runtime::block_on(download_resume(&url, &part, 10, |_| {}));
        server.join().unwrap();
        assert!(
            result.is_err(),
            "An oversized response must be refused before truncating the prefix"
        );
        assert_eq!(fs::read(&part).unwrap(), b"prefix");

        // A chunked response has no Content-Length; enforce both the manifest
        // size and the global ceiling before any offending chunk reaches disk.
        for expected in [10, MAX_ZIP, 0] {
            let limit = if expected == 0 { MAX_ZIP } else { expected };
            File::create(&part).unwrap().set_len(limit - 4).unwrap();
            let (url, server) = spawn_http(vec![HttpReply {
                status: 206,
                headers: vec![
                    (
                        "Content-Range".into(),
                        format!("bytes {}-{}/{limit}", limit - 4, limit - 1),
                    ),
                    ("Transfer-Encoding".into(), "chunked".into()),
                ],
                body: b"8\r\n12345678\r\n0\r\n\r\n".to_vec(),
                delay: Duration::ZERO,
            }]);
            let result =
                tauri::async_runtime::block_on(download_resume(&url, &part, expected, |_| {}));
            server.join().unwrap();
            assert!(result.is_err(), "{expected}: reject an oversized stream");
            assert!(
                part.metadata().unwrap().len() <= limit,
                "{expected}: do not write bytes beyond the limit"
            );
        }
    }

    #[test]
    fn concurrent_install_of_the_same_pack_serializes() {
        let _root = test_root();
        let zip = _root.dir.join("kit.zip");
        tiny_kit_zip(&zip);
        let bytes = fs::read(&zip).unwrap();
        let pack = kit_pack("concurrent-kit", &zip);
        let inflight = Arc::new(AtomicU32::new(0));
        let max = Arc::new(AtomicU32::new(0));
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let inflight2 = Arc::clone(&inflight);
        let max2 = Arc::clone(&max);
        let body = bytes.clone();
        listener.set_nonblocking(true).unwrap();
        let server = thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(3);
            while std::time::Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        stream.set_nonblocking(false).ok();
                        let _ = read_http_request(&mut stream);
                        let now = inflight2.fetch_add(1, Ordering::SeqCst) + 1;
                        max2.fetch_max(now, Ordering::SeqCst);
                        thread::sleep(Duration::from_millis(80));
                        inflight2.fetch_sub(1, Ordering::SeqCst);
                        let head = format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            body.len()
                        );
                        let _ = stream.write_all(head.as_bytes());
                        let _ = stream.write_all(&body);
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => break,
                }
            }
        });
        let mut pack_a = pack.clone();
        pack_a.url = format!("http://127.0.0.1:{}/a", addr.port());
        let mut pack_b = pack.clone();
        pack_b.url = format!("http://127.0.0.1:{}/b", addr.port());
        let (ra, rb) = tauri::async_runtime::block_on(async {
            tokio::join!(install(&pack_a, |_| {}), install(&pack_b, |_| {}))
        });
        ra.unwrap();
        rb.unwrap();
        let _ = server.join();
        assert!(
            max.load(Ordering::SeqCst) <= 1,
            "overlapping downloads {}",
            max.load(Ordering::SeqCst)
        );
        assert!(pack_ready(&pack_dir("concurrent-kit"), &pack.sha256));
    }

    #[test]
    fn manifest_packs_have_allowlisted_licence_and_licenses_heading() {
        const ALLOWED: &[&str] = &[
            "CC0-1.0",
            "CC-BY-3.0",
            "CC-BY-4.0",
            "Apache-2.0",
            "MIT",
            "BSD-2-Clause",
            "BSD-3-Clause",
            "ISC",
            "0BSD",
            "Zlib",
        ];
        let licenses = include_str!("../../assets/LICENSES.md");
        let listed = packs();
        assert!(!listed.is_empty());
        for pack in &listed {
            assert!(
                ALLOWED.contains(&pack.licence.as_str()),
                "{} {}",
                pack.id,
                pack.licence
            );
            let heading = format!("## {}", pack.id);
            assert!(
                licenses.lines().any(|line| line.trim() == heading),
                "{}",
                pack.id
            );
        }
    }

    #[test]
    fn placeholder_hash_is_rejected_before_download() {
        std::env::remove_var("JAM_ASSETS_FIXTURE");
        std::env::remove_var("JAM_LIVE");
        let packs = status();
        assert!(packs.iter().any(|p| p.id == "standard-rock-kit"));
        if packs.iter().any(|p| p.state == "missing") {
            let err = tauri::async_runtime::block_on(ensure(&[])).unwrap_err();
            assert!(err.contains("not configured"), "{err}");
        }
    }

    #[test]
    fn unpack_requires_kit_json_and_refuses_zip_slip() {
        let dir = std::env::temp_dir().join(format!("jam-assets-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let zip_path = dir.join("ok.zip");
        tiny_kit_zip(&zip_path);
        unpack_zip(&zip_path, &dir.join("out")).unwrap();
        assert!(dir.join("out/kit.json").is_file());

        let sf2_zip = dir.join("sf2.zip");
        let mut sf2 = zip::ZipWriter::new(File::create(&sf2_zip).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        sf2.start_file("bass.sf2", opts).unwrap();
        sf2.write_all(b"RIFF").unwrap();
        sf2.start_file("comp.sf2", opts).unwrap();
        sf2.write_all(b"RIFF").unwrap();
        sf2.start_file("README.txt", opts).unwrap();
        sf2.write_all(b"CC0").unwrap();
        sf2.finish().unwrap();
        unpack_zip(&sf2_zip, &dir.join("sf2out")).unwrap();
        assert!(dir.join("sf2out/bass.sf2").is_file());

        let mut bad = zip::ZipWriter::new(File::create(dir.join("bad.zip")).unwrap());
        bad.start_file("../escape.wav", zip::write::SimpleFileOptions::default())
            .unwrap();
        bad.write_all(&[0u8; 8]).unwrap();
        bad.finish().unwrap();
        assert!(unpack_zip(&dir.join("bad.zip"), &dir.join("out2")).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    #[ignore = "live GitHub download into ~/JosefinesJamstudio/assets"]
    fn live_home_dir_assets_ensure_unpacks_release_zips() {
        std::env::remove_var("JAM_USER_DIR");
        std::env::remove_var("JAM_ASSETS_FIXTURE");
        std::env::remove_var("JAM_ASSETS_LOCAL");
        std::env::remove_var("JAM_KIT_DIR");
        std::env::remove_var("JAM_SF2_DIR");
        std::env::set_var("JAM_LIVE", "1");
        let root = crate::library::Library::default_user_root();
        assert!(
            root.ends_with("JosefinesJamstudio"),
            "home root must be ~/JosefinesJamstudio, got {}",
            root.display()
        );
        let packs = tauri::async_runtime::block_on(ensure(&[])).expect("home-dir assets_ensure");
        let kit_dir = root.join("assets/standard-rock-kit");
        let sf2_dir = root.join("assets/freepats-bass-comp");
        let kit_zip = root.join("assets/standard-rock-kit.zip");
        let sf2_zip = root.join("assets/freepats-bass-comp.zip");
        assert!(kit_dir.join("kit.json").is_file(), "{}", kit_dir.display());
        assert!(
            sf2_dir.join("bass.sf2").is_file() && sf2_dir.join("comp.sf2").is_file(),
            "{}",
            sf2_dir.display()
        );
        assert_eq!(
            sha256_file(&kit_zip).unwrap(),
            packs_sha("standard-rock-kit")
        );
        assert_eq!(
            sha256_file(&sf2_zip).unwrap(),
            packs_sha("freepats-bass-comp")
        );
        assert!(packs.iter().all(|p| p.state == "ready"), "{packs:?}");
        eprintln!("home={}", root.display());
        eprintln!(
            "kit.zip={} {}",
            kit_zip.display(),
            sha256_file(&kit_zip).unwrap()
        );
        eprintln!(
            "sf2.zip={} {}",
            sf2_zip.display(),
            sha256_file(&sf2_zip).unwrap()
        );
    }

    fn packs_sha(id: &str) -> String {
        packs().into_iter().find(|p| p.id == id).unwrap().sha256
    }
}
