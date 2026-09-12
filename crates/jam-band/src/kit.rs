//! kit.json on disk. Missing or invalid packs fall back to the synthetic kit.
use serde::Deserialize;
use std::path::{Path, PathBuf};

pub const SYNTHETIC: &str = "synthetic";
pub const FILE: &str = "file";
pub const SINE: &str = "sine";
pub const SF2: &str = "sf2";
pub const SF2_PACK_ID: &str = "freepats-bass-comp";
pub const SF2_NOT_CONFIGURED: &str = "SoundFont is not unpacked. Run Settings → Check these sample packs with JAM_LIVE=1. Bass and comp use sine voices until freepats-bass-comp is installed.";

#[derive(Debug, Clone)]
pub struct KitStatus {
    pub kit_id: String,
    pub source: &'static str,
    pub message: String,
}

impl KitStatus {
    pub fn synthetic(kit_id: &str, message: String) -> Self {
        Self {
            kit_id: kit_id.into(),
            source: SYNTHETIC,
            message,
        }
    }

    pub fn missing(kit_id: &str) -> Self {
        Self::synthetic(
            kit_id,
            format!(
                "Drum kit '{kit_id}' is not unpacked. Run Settings → Check these sample packs with JAM_LIVE=1. Playing the bundled synthetic kit."
            ),
        )
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KitManifest {
    pub schema_version: u32,
    pub id: String,
    #[serde(default)]
    pub sample_rate: u32,
    pub instruments: Vec<KitInstrument>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KitInstrument {
    pub name: String,
    pub layers: Vec<KitLayer>,
    pub choke_group: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KitLayer {
    pub velocity: [f32; 2],
    pub files: Vec<String>,
}

pub fn user_root() -> PathBuf {
    if let Ok(p) = std::env::var("JAM_USER_DIR") {
        return PathBuf::from(p);
    }
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .unwrap_or_else(|| ".".into());
    PathBuf::from(home).join("JosefinesJamstudio")
}

pub fn pack_dir(kit_id: &str) -> PathBuf {
    if let Ok(p) = std::env::var("JAM_KIT_DIR") {
        return PathBuf::from(p);
    }
    user_root().join("assets").join(kit_id)
}

pub fn sf2_dir() -> PathBuf {
    if let Ok(p) = std::env::var("JAM_SF2_DIR") {
        return PathBuf::from(p);
    }
    user_root().join("assets").join(SF2_PACK_ID)
}

pub fn sf2_ready(dir: &Path) -> bool {
    dir.join("bass.sf2").is_file() && dir.join("comp.sf2").is_file()
}

pub fn read_manifest(dir: &Path) -> Result<KitManifest, String> {
    let path = dir.join("kit.json");
    let raw = std::fs::read_to_string(&path)
        .map_err(|_| format!("kit.json is missing in {}.", dir.display()))?;
    let raw = raw.trim_start_matches('\u{feff}');
    let kit: KitManifest =
        serde_json::from_str(raw).map_err(|e| format!("kit.json is invalid. {e}"))?;
    if kit.schema_version != 1 {
        return Err("kit.json schemaVersion must be 1.".into());
    }
    if kit.sample_rate != 0 && kit.sample_rate != 48_000 {
        return Err("kit.json sampleRate must be 48000.".into());
    }
    if kit.instruments.is_empty() {
        return Err("kit.json has no instruments.".into());
    }
    Ok(kit)
}

/// 48 kHz mono PCM. Stereo is averaged. Other rates are refused.
pub fn read_wav_48k(path: &Path) -> Result<Vec<f32>, String> {
    let mut reader = hound::WavReader::open(path)
        .map_err(|e| format!("Cannot read {}. {e}", path.display()))?;
    let spec = reader.spec();
    if spec.sample_rate != 48_000 {
        return Err(format!(
            "{} is {} Hz; the engine is 48 kHz.",
            path.display(),
            spec.sample_rate
        ));
    }
    if spec.channels == 0 || spec.channels > 2 {
        return Err(format!("{} must be mono or stereo.", path.display()));
    }
    let ch = spec.channels as usize;
    let samples: Result<Vec<f32>, _> = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().collect(),
        hound::SampleFormat::Int if spec.bits_per_sample <= 16 => reader
            .samples::<i16>()
            .map(|s| s.map(|v| v as f32 / 32768.0))
            .collect(),
        hound::SampleFormat::Int => reader
            .samples::<i32>()
            .map(|s| s.map(|v| v as f32 / 2f32.powi(i32::from(spec.bits_per_sample.min(31)) - 1)))
            .collect(),
    };
    let pcm = samples.map_err(|e| format!("{} is not readable PCM. {e}", path.display()))?;
    if ch == 1 {
        return Ok(pcm);
    }
    Ok(pcm
        .chunks_exact(2)
        .map(|f| 0.5 * (f[0] + f[1]))
        .collect())
}

pub fn safe_wav(dir: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.contains("..") || rel.contains(':') || Path::new(rel).is_absolute() {
        return Err(format!("Unsafe sample path '{rel}'."));
    }
    let path = dir.join(rel);
    if !path.starts_with(dir) {
        return Err(format!("Unsafe sample path '{rel}'."));
    }
    Ok(path)
}

#[cfg(test)]
pub(crate) static TEST_ENV: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kit_json_accepts_utf8_bom() {
        let dir = std::env::temp_dir().join(format!("jam-kit-bom-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("kit.json"),
            "\u{feff}{\"schemaVersion\":1,\"id\":\"x\",\"sampleRate\":48000,\"instruments\":[{\"name\":\"kick\",\"layers\":[{\"velocity\":[0,1],\"files\":[\"k.wav\"]}]}]}",
        )
        .unwrap();
        let kit = read_manifest(&dir).expect("BOM kit.json");
        assert_eq!(kit.id, "x");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_wav_names_the_path() {
        let err = read_wav_48k(Path::new("no-such.wav")).unwrap_err();
        assert!(
            err.starts_with("Cannot read ") && err.contains("no-such.wav"),
            "{err}"
        );
    }
}
