//! settings: App configuration stored at ~/JosefinesJamstudio/settings.json (schemaVersion: 1).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub fn settings_path() -> PathBuf {
    crate::library::Library::default_user_root().join("settings.json")
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    #[serde(default)]
    pub input_device: Option<String>,
    #[serde(default)]
    pub output_device: Option<String>,
    #[serde(default = "default_input_channel")]
    pub input_channel: u16,
    #[serde(default = "default_sample_rate")]
    pub sample_rate: u32,
    #[serde(default = "default_buffer_size")]
    pub buffer_size: u32,
    #[serde(default)]
    pub rig: RigSettings,
    #[serde(default)]
    pub recorder: RecorderSettings,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct RecorderSettings {
    /// Round-trip offset trimmed from the guitar stem, in samples at the engine rate.
    #[serde(default)]
    pub latency_samples: u32,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub latency_estimated: bool,
    #[serde(default, skip_serializing_if = "is_zero_f32")]
    pub latency_confidence: f32,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub latency_by_device: HashMap<String, DeviceLatency>,
    #[serde(default, flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeviceLatency {
    pub round_trip_frames: u32,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub estimated: bool,
    #[serde(default, skip_serializing_if = "is_zero_f32")]
    pub confidence: f32,
    #[serde(default, flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

fn is_zero_f32(value: &f32) -> bool {
    *value == 0.0
}

impl RecorderSettings {
    pub fn device_key(
        input: Option<&str>,
        output: Option<&str>,
        channel: u16,
        sample_rate: u32,
        buffer_size: u32,
    ) -> String {
        format!(
            "{}|{}|{channel}|{sample_rate}|{buffer_size}",
            input.unwrap_or("default"),
            output.unwrap_or("default")
        )
    }

    pub fn remember(
        &mut self,
        key: String,
        round_trip_frames: u32,
        estimated: bool,
        confidence: f32,
    ) {
        self.latency_samples = round_trip_frames;
        self.latency_estimated = estimated;
        self.latency_confidence = confidence;
        self.latency_by_device.insert(
            key,
            DeviceLatency {
                round_trip_frames,
                estimated,
                confidence,
                extra: HashMap::new(),
            },
        );
    }
}

/// What the Rig screen remembers between launches.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RigSettings {
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default)]
    pub midi_port: Option<String>,
    #[serde(default = "yes")]
    pub follow_sections: bool,
    #[serde(default)]
    pub send_clock: bool,
    /// Section name -> scene index, per profile id.
    #[serde(default)]
    pub section_mappings: HashMap<String, HashMap<String, usize>>,
    #[serde(default, flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

fn yes() -> bool {
    true
}

impl Default for RigSettings {
    fn default() -> Self {
        Self {
            profile_id: None,
            midi_port: None,
            follow_sections: true,
            send_clock: false,
            section_mappings: HashMap::new(),
            extra: HashMap::new(),
        }
    }
}

fn default_input_channel() -> u16 {
    2 // HeadRush dry DI (channel 3 is index 2)
}

fn default_sample_rate() -> u32 {
    48000
}

fn default_buffer_size() -> u32 {
    256
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            input_device: None,
            output_device: None,
            input_channel: default_input_channel(),
            sample_rate: default_sample_rate(),
            buffer_size: default_buffer_size(),
            rig: RigSettings::default(),
            recorder: RecorderSettings::default(),
            extra: HashMap::new(),
        }
    }
}

// Serialises settings updates; malformed input is archived before replacement.
static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn load_from(path: &std::path::Path) -> Result<AppSettings, String> {
    match fs::read_to_string(path) {
        Ok(content) => jam_core::json::from_str(&content)
            .map_err(|e| format!("Cannot read {}. {e}. Restore settings.json.bak or repair the file; it has not been overwritten.", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(AppSettings::default()),
        Err(e) => Err(format!("Cannot read {}. {e}", path.display())),
    }
}

pub fn load_settings() -> Result<AppSettings, String> {
    load_from(&settings_path())
}

fn save_to(path: &std::path::Path, settings: &AppSettings) -> Result<(), String> {
    let _lock = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    if load_from(path).is_err() && path.exists() {
        archive_damaged(path)?;
        return write_to(path, settings, false);
    }
    write_to(path, settings, true)
}

fn archive_damaged(path: &std::path::Path) -> Result<std::path::PathBuf, String> {
    use std::io::Write;
    let damaged = fs::read(path).map_err(|e| format!("Cannot recover {}. {e}", path.display()))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let archive = path.with_extension(format!("json.broken-{stamp}"));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&archive)
        .map_err(|e| e.to_string())?;
    file.write_all(&damaged)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    Ok(archive)
}

fn write_to(
    path: &std::path::Path,
    settings: &AppSettings,
    keep_backup: bool,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    let backup = keep_backup.then(|| path.with_extension("json.bak"));
    crate::persistence::write(path, &bytes, backup.as_deref()).map_err(|e| e.to_string())
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    save_to(&settings_path(), settings)
}

/// Startup-only recovery: preserve damaged bytes before replacing the active file.
fn recover_from(path: &std::path::Path) -> Result<(AppSettings, Option<String>), String> {
    let _lock = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    if let Ok(settings) = load_from(path) {
        return Ok((settings, None));
    }
    // Permission/read failures are not evidence of malformed JSON and must not be replaced.
    let archive = archive_damaged(path)?;
    let backup = path.with_extension("json.bak");
    let restored = backup.is_file().then(|| load_from(&backup).ok()).flatten();
    let source = if restored.is_some() {
        "the last valid backup"
    } else {
        "default settings"
    };
    let settings = restored.unwrap_or_default();
    write_to(path, &settings, false)?;
    Ok((settings, Some(format!("Recovered settings using {source}. The damaged file is preserved at {}. Check your audio device and MIDI port before playing.", archive.display()))))
}

pub fn recover_settings() -> Result<(AppSettings, Option<String>), String> {
    recover_from(&settings_path())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_recovers_backup_or_defaults_and_preserves_every_damaged_file() {
        let root =
            std::env::temp_dir().join(format!("jam-settings-recovery-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("settings.json");
        let mut expected = AppSettings::default();
        expected
            .extra
            .insert("futureField".into(), serde_json::json!({"keep": true}));
        fs::write(
            path.with_extension("json.bak"),
            serde_json::to_vec(&expected).unwrap(),
        )
        .unwrap();
        fs::write(&path, "broken active").unwrap();
        let (mut settings, warning) = recover_from(&path).unwrap();
        assert_eq!(settings, expected);
        assert!(warning.unwrap().contains("valid backup"));
        assert!(recover_from(&path).unwrap().1.is_none());
        settings.buffer_size = 512;
        save_to(&path, &settings).unwrap();
        assert_eq!(load_from(&path).unwrap().buffer_size, 512);
        fs::write(&path, "broken again").unwrap();
        fs::write(path.with_extension("json.bak"), "broken backup").unwrap();
        let (settings, warning) = recover_from(&path).unwrap();
        assert_eq!(settings, AppSettings::default());
        assert!(warning.unwrap().contains("default settings"));
        assert_eq!(
            fs::read_to_string(path.with_extension("json.bak")).unwrap(),
            "broken backup"
        );
        let mut preserved: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.to_string_lossy().contains(".broken-"))
            .map(|p| fs::read_to_string(p).unwrap())
            .collect();
        preserved.sort();
        assert_eq!(preserved, ["broken active", "broken again"]);
        save_to(&path, &settings).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn settings_keep_backup_and_never_overwrite_corrupt_source() {
        let root = std::env::temp_dir().join(format!("jam-settings-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("settings.json");
        let mut settings = AppSettings::default();
        save_to(&path, &settings).unwrap();
        settings.buffer_size = 512;
        save_to(&path, &settings).unwrap();
        assert_eq!(load_from(&path).unwrap().buffer_size, 512);
        assert_eq!(
            load_from(&path.with_extension("json.bak"))
                .unwrap()
                .buffer_size,
            256
        );
        fs::write(&path, "broken JSON").unwrap();
        assert!(load_from(&path).is_err());
        save_to(&path, &settings).unwrap();
        assert_eq!(load_from(&path).unwrap().buffer_size, 512);
        let preserved: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.to_string_lossy().contains(".broken-"))
            .map(|p| fs::read_to_string(p).unwrap())
            .collect();
        assert_eq!(preserved, ["broken JSON"]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn save_to_archives_corrupt_settings_and_writes_the_new_document() {
        let root = std::env::temp_dir().join(format!(
            "jam-settings-save-corrupt-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("settings.json");
        fs::write(&path, "{ not json").unwrap();
        let settings = AppSettings {
            buffer_size: 1024,
            ..AppSettings::default()
        };
        save_to(&path, &settings).unwrap();
        assert_eq!(load_from(&path).unwrap().buffer_size, 1024);
        let preserved: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.to_string_lossy().contains(".broken-"))
            .map(|p| fs::read_to_string(p).unwrap())
            .collect();
        assert_eq!(preserved, ["{ not json"]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_utf8_bom_does_not_make_settings_unreadable() {
        let root = std::env::temp_dir().join(format!("jam-settings-bom-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("settings.json");
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(br#"{"schemaVersion":1,"buffer_size":512,"kept":true}"#);
        fs::write(&path, bytes).unwrap();
        let settings = load_from(&path).unwrap();
        assert_eq!(settings.buffer_size, 512);
        assert_eq!(settings.extra.get("kept").unwrap(), true);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn test_settings_preserves_unknown_fields() {
        let json_data = r#"{
            "schemaVersion": 1,
            "input_channel": 3,
            "sample_rate": 48000,
            "buffer_size": 512,
            "future_custom_feature": "enabled",
            "number_val": 42
        }"#;

        let settings: AppSettings = serde_json::from_str(json_data).unwrap();
        assert_eq!(settings.input_channel, 3);
        assert_eq!(
            settings.extra.get("future_custom_feature").unwrap(),
            "enabled"
        );
        assert_eq!(settings.extra.get("number_val").unwrap(), 42);

        let reserialized = serde_json::to_string(&settings).unwrap();
        assert!(reserialized.contains("future_custom_feature"));
        assert!(reserialized.contains("number_val"));
    }

    #[test]
    fn nested_unknown_rig_and_recorder_fields_survive_a_rewrite() {
        let root = std::env::temp_dir().join(format!(
            "jam-settings-nested-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("settings.json");
        fs::write(
            &path,
            r#"{
                "schemaVersion": 1,
                "buffer_size": 256,
                "rig": {
                    "profile_id": "black-spirit-200",
                    "futureClockPpq": 24
                },
                "recorder": {
                    "latency_samples": 96,
                    "futurePunchIn": true,
                    "latency_by_device": {
                        "default|default|2": {
                            "round_trip_frames": 96,
                            "futureCalibrator": "loopback-v2"
                        }
                    }
                }
            }"#,
        )
        .unwrap();
        let mut settings = load_from(&path).unwrap();
        assert_eq!(settings.rig.extra.get("futureClockPpq").unwrap(), 24);
        assert_eq!(settings.recorder.extra.get("futurePunchIn").unwrap(), true);
        assert_eq!(
            settings.recorder.latency_by_device["default|default|2"]
                .extra
                .get("futureCalibrator")
                .unwrap(),
            "loopback-v2"
        );
        settings.buffer_size = 512;
        save_to(&path, &settings).unwrap();
        let round = load_from(&path).unwrap();
        assert_eq!(round.buffer_size, 512);
        assert_eq!(round.rig.extra.get("futureClockPpq").unwrap(), 24);
        assert_eq!(round.recorder.extra.get("futurePunchIn").unwrap(), true);
        assert_eq!(
            round.recorder.latency_by_device["default|default|2"]
                .extra
                .get("futureCalibrator")
                .unwrap(),
            "loopback-v2"
        );
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("futureClockPpq"), "{text}");
        assert!(text.contains("futurePunchIn"), "{text}");
        assert!(text.contains("futureCalibrator"), "{text}");
        fs::remove_dir_all(root).unwrap();
    }
}
