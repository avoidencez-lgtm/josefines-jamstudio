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
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
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
