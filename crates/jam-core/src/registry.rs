//! registry: Seam definitions and loaders for styles, charts, rigs, and control maps.

use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

pub static BUNDLED_STYLES: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../styles");
pub static BUNDLED_CHARTS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../charts");
pub static BUNDLED_RIGS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../rigs");
pub static BUNDLED_CONTROLS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../controls");

pub trait VersionedManifest {
    fn schema_version(&self) -> u32;
    fn id(&self) -> &str;
    fn name(&self) -> &str;
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StyleManifest {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub default_bpm: Option<f64>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl VersionedManifest for StyleManifest {
    fn schema_version(&self) -> u32 {
        self.schema_version
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn name(&self) -> &str {
        &self.name
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChartManifest {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub key: String,
    pub time_signature: (u8, u8),
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl VersionedManifest for ChartManifest {
    fn schema_version(&self) -> u32 {
        self.schema_version
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn name(&self) -> &str {
        &self.name
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RigManifest {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub target_device: String,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl VersionedManifest for RigManifest {
    fn schema_version(&self) -> u32 {
        self.schema_version
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn name(&self) -> &str {
        &self.name
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ControlMapManifest {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl VersionedManifest for ControlMapManifest {
    fn schema_version(&self) -> u32 {
        self.schema_version
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn name(&self) -> &str {
        &self.name
    }
}

#[derive(Default, Debug)]
pub struct SeamRegistry<T: VersionedManifest> {
    items: HashMap<String, T>,
}

impl<T: VersionedManifest + for<'de> Deserialize<'de>> SeamRegistry<T> {
    pub fn new() -> Self {
        Self {
            items: HashMap::new(),
        }
    }

    pub fn load_from_dir(&mut self, dir: &Dir) -> Result<usize, String> {
        let mut count = 0;
        for file in dir.files() {
            if file.path().extension().is_some_and(|ext| ext == "json") {
                if let Some(content) = file.contents_utf8() {
                    match serde_json::from_str::<T>(content) {
                        Ok(item) => {
                            self.items.insert(item.id().to_string(), item);
                            count += 1;
                        }
                        Err(e) => {
                            return Err(format!(
                                "Failed to parse {}: {}",
                                file.path().display(),
                                e
                            ));
                        }
                    }
                }
            }
        }
        Ok(count)
    }

    pub fn load_from_fs_dir<P: AsRef<Path>>(&mut self, path: P) -> usize {
        let mut count = 0;
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().is_some_and(|ext| ext == "json") {
                    if let Ok(content) = std::fs::read_to_string(&p) {
                        if let Ok(item) = serde_json::from_str::<T>(&content) {
                            self.items.insert(item.id().to_string(), item);
                            count += 1;
                        }
                    }
                }
            }
        }
        count
    }

    pub fn get(&self, id: &str) -> Option<&T> {
        self.items.get(id)
    }

    pub fn list(&self) -> Vec<&T> {
        self.items.values().collect()
    }
}
