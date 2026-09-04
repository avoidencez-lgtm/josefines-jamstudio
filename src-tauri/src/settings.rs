//! settings: App configuration stored at ~/JosefinesJamstudio/settings.json (schemaVersion: 1).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub fn settings_path() -> PathBuf {
    let mut dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("JosefinesJamstudio");
    dir.push("settings.json");
    dir
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
    /// Section name -> scene index, per profile id.
    #[serde(default)]
    pub section_mappings: HashMap<String, HashMap<String, usize>>,
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
            section_mappings: HashMap::new(),
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

pub fn load_settings() -> AppSettings {
    let path = settings_path();
    if let Ok(content) = fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        AppSettings::default()
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
