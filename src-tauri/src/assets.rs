//! Sample packs from the GitHub `assets-v1` release. Headless download needs `JAM_LIVE=1`.
use crate::library::Library;
use crate::net;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::Emitter;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

const EMPTY_SHA: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const RELEASE_PREFIX: &str =
    "https://github.com/avoidencez-lgtm/josefines-jamstudio/releases/download/";
const MAX_ZIP: u64 = 64 * 1024 * 1024;
pub const NOT_CONFIGURED: &str = "Sample pack download is not configured. This pack's SHA-256 is the empty-file placeholder. Publish a real assets-v1 zip and record its SHA-256 in assets/manifest.json. The band uses the bundled synthetic kit until then.";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackStatus {
    pub id: String,
    pub name: String,
    pub state: String,
    pub live: bool,
    pub message: String,
}

#[derive(Clone)]
struct Pack {
    id: String,
    name: String,
    url: String,
    sha256: String,
    bytes: u64,
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

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Cannot read {}. {e}", path.display()))?;
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

fn unpack_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "Invalid sample-pack ZIP.")?;
    if zip.len() == 0 || zip.len() > 64 {
        return Err("Sample-pack ZIP has an unexpected number of files.".into());
    }
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|_| "Unreadable sample-pack ZIP entry.")?;
        let rel = entry
            .enclosed_name()
            .ok_or("Unsafe path in sample-pack ZIP.")?;
        if entry.is_dir() {
            continue;
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
        let max = if ext == "sf2" {
            32 * 1024 * 1024
        } else {
            8 * 1024 * 1024
        };
        if entry.size() > max {
            return Err("A sample-pack file is larger than the allowed size.".into());
        }
        let out = dest.join(rel);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut dst = File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut dst).map_err(|e| e.to_string())?;
    }
    if !pack_ready(dest) {
        return Err("Sample-pack ZIP is missing kit.json or bass.sf2/comp.sf2.".into());
    }
    Ok(())
}

fn pack_ready(dir: &Path) -> bool {
    dir.join("kit.json").is_file()
        || (dir.join("bass.sf2").is_file() && dir.join("comp.sf2").is_file())
}

async fn download_resume(url: &str, part: &Path, expected: u64) -> Result<(), String> {
    if !url.starts_with(RELEASE_PREFIX) {
        return Err("Sample pack URL must be this repo's GitHub Release.".into());
    }
    let have = part.metadata().map(|m| m.len()).unwrap_or(0);
    if expected > 0 && have > expected {
        let _ = fs::remove_file(part);
    }
    let have = part.metadata().map(|m| m.len()).unwrap_or(0);
    if expected > MAX_ZIP {
        return Err("Sample pack is larger than 64 MB.".into());
    }
    if expected > 0 && have == expected {
        return Ok(());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(4))
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("josefines-jamstudio/0.1")
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(url);
    if have > 0 {
        req = req.header(reqwest::header::RANGE, format!("bytes={have}-"));
    }
    let mut response = req.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    if have > 0 && status == reqwest::StatusCode::OK {
        let _ = fs::remove_file(part);
    } else if !status.is_success() && status != reqwest::StatusCode::PARTIAL_CONTENT {
        return Err(format!("Sample pack download failed ({status})."));
    }
    if let Some(len) = response.content_length() {
        let total = if status == reqwest::StatusCode::PARTIAL_CONTENT {
            have + len
        } else {
            len
        };
        if total > MAX_ZIP {
            return Err("Sample pack is larger than 64 MB.".into());
        }
    }
    fs::create_dir_all(part.parent().unwrap_or(Path::new("."))).map_err(|e| e.to_string())?;
    let mut file = if status == reqwest::StatusCode::PARTIAL_CONTENT && have > 0 {
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(part)
            .map_err(|e| e.to_string())?
    } else {
        File::create(part).map_err(|e| e.to_string())?
    };
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        if file.seek(SeekFrom::Current(0)).map_err(|e| e.to_string())? > MAX_ZIP {
            return Err("Sample pack is larger than 64 MB.".into());
        }
    }
    Ok(())
}

fn status_for(pack: &Pack) -> PackStatus {
    let dest = pack_dir(&pack.id);
    let ready = pack_ready(&dest);
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
        message: if dest.join("kit.json").is_file() {
            "Pack is unpacked. The band loads kit.json and WAVs from this folder when you play.".into()
        } else if dest.join("bass.sf2").is_file() {
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
    if std::env::var("JAM_ASSETS_FIXTURE").as_deref() == Ok("1") {
        return Ok(status()
            .into_iter()
            .map(|mut pack| {
                pack.state = "synthetic".into();
                pack.message =
                    "Synthetic kit only. No GitHub Release zip was downloaded.".into();
                pack
            })
            .collect());
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
        install(pack).await?;
    }
    Ok(wanted.iter().map(status_for).collect())
}

async fn install(pack: &Pack) -> Result<(), String> {
    let dest = pack_dir(&pack.id);
    if pack_ready(&dest) {
        return Ok(());
    }
    let zip_path = dest.with_extension("zip");
    let part = dest.with_extension("zip.part");
    if let Ok(path) = std::env::var("JAM_ASSETS_LOCAL") {
        let local = PathBuf::from(path);
        if !local.is_file() {
            return Err("JAM_ASSETS_LOCAL does not point at a zip.".into());
        }
        fs::create_dir_all(dest.parent().unwrap_or(Path::new("."))).map_err(|e| e.to_string())?;
        fs::copy(&local, &zip_path).map_err(|e| e.to_string())?;
    } else {
        download_resume(&pack.url, &part, pack.bytes).await?;
        fs::rename(&part, &zip_path).map_err(|e| e.to_string())?;
    }
    let digest = sha256_file(&zip_path)?;
    if digest != pack.sha256 {
        let _ = fs::remove_file(&zip_path);
        return Err(format!(
            "Sample pack checksum failed. Expected {}, got {digest}.",
            pack.sha256
        ));
    }
    if pack.bytes > 0 {
        let len = zip_path.metadata().map_err(|e| e.to_string())?.len();
        if len != pack.bytes {
            let _ = fs::remove_file(&zip_path);
            return Err(format!(
                "Sample pack size failed. Expected {} bytes, got {len}.",
                pack.bytes
            ));
        }
    }
    unpack_zip(&zip_path, &dest)?;
    Ok(())
}

#[tauri::command]
pub fn assets_status() -> Vec<PackStatus> {
    status()
}

#[tauri::command]
pub async fn assets_ensure<R: tauri::Runtime>(
    ids: Option<Vec<String>>,
    app: tauri::AppHandle<R>,
) -> Result<Vec<PackStatus>, String> {
    let packs = ensure(&ids.unwrap_or_default()).await?;
    let _ = app.emit("assets.state", &packs);
    Ok(packs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

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
        bad.start_file(
            "../escape.wav",
            zip::write::SimpleFileOptions::default(),
        )
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
        assert_eq!(sha256_file(&kit_zip).unwrap(), packs_sha("standard-rock-kit"));
        assert_eq!(
            sha256_file(&sf2_zip).unwrap(),
            packs_sha("freepats-bass-comp")
        );
        assert!(
            packs.iter().all(|p| p.state == "ready"),
            "{packs:?}"
        );
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
        packs()
            .into_iter()
            .find(|p| p.id == id)
            .unwrap()
            .sha256
    }
}
