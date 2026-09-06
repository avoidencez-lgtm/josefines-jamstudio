//! registry: Seam definitions and loaders for styles, charts, and rigs.
//! `BUNDLED_CONTROLS` is the versioned control-map fixture only; the app never loads it.

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

impl VersionedManifest for crate::style::Style {
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

impl VersionedManifest for crate::chart::Chart {
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
                    match crate::json::from_str::<T>(content) {
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

    /// Loads every `*.json` in a user directory. Files that fail to parse are reported
    /// (path + error) instead of silently skipped, so a typo in a hand-written chart
    /// is visible.
    pub fn load_from_fs_dir<P: AsRef<Path>>(&mut self, path: P) -> (usize, Vec<String>) {
        let mut count = 0;
        let mut errors = Vec::new();
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().is_some_and(|ext| ext == "json") {
                    match std::fs::read_to_string(&p) {
                        Ok(content) => match crate::json::from_str::<T>(&content) {
                            Ok(item) => {
                                self.items.insert(item.id().to_string(), item);
                                count += 1;
                            }
                            Err(e) => errors.push(format!("{}: {e}", p.display())),
                        },
                        Err(e) => errors.push(format!("{}: {e}", p.display())),
                    }
                }
            }
        }
        (count, errors)
    }

    pub fn insert(&mut self, item: T) -> String {
        let id = item.id().to_string();
        self.items.insert(id.clone(), item);
        id
    }

    pub fn get(&self, id: &str) -> Option<&T> {
        self.items.get(id)
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// All items, sorted by display name for stable UI lists.
    pub fn list(&self) -> Vec<&T> {
        let mut v: Vec<&T> = self.items.values().collect();
        v.sort_by(|a, b| a.name().cmp(b.name()).then_with(|| a.id().cmp(b.id())));
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chart::Chart;
    use crate::style::Style;

    #[test]
    fn bundled_styles_and_charts_load_through_the_registry() {
        let mut styles: SeamRegistry<Style> = SeamRegistry::new();
        let n = styles.load_from_dir(&BUNDLED_STYLES).expect("styles parse");
        assert!(n >= 6, "expected the six bundled styles, got {n}");
        assert!(styles.get("blues-shuffle").is_some());

        let mut charts: SeamRegistry<Chart> = SeamRegistry::new();
        let n = charts.load_from_dir(&BUNDLED_CHARTS).expect("charts parse");
        assert!(n >= 8, "expected the eight bundled charts, got {n}");
        assert!(charts.get("blues-12-bar").is_some());

        let names: Vec<&str> = charts.list().iter().map(|c| c.name.as_str()).collect();
        let mut sorted = names.clone();
        sorted.sort();
        assert_eq!(names, sorted, "list() is sorted by name");
    }

    #[test]
    fn user_dir_errors_are_reported_not_swallowed() {
        let dir = std::env::temp_dir().join(format!("jam-registry-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("broken.json"), "{ not json").unwrap();
        let mut charts: SeamRegistry<Chart> = SeamRegistry::new();
        let (count, errors) = charts.load_from_fs_dir(&dir);
        assert_eq!(count, 0);
        assert_eq!(errors.len(), 1);
        assert!(errors[0].contains("broken.json"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_utf8_bom_does_not_make_a_user_file_unreadable() {
        let dir = std::env::temp_dir().join(format!("jam-registry-bom-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes
            .extend_from_slice(br#"{"schemaVersion":1,"id":"bom-map","name":"BOM","bindings":[]}"#);
        std::fs::write(dir.join("bom-map.json"), bytes).unwrap();
        let mut maps: SeamRegistry<ControlMapManifest> = SeamRegistry::new();
        let (count, errors) = maps.load_from_fs_dir(&dir);
        assert_eq!(errors, Vec::<String>::new());
        assert_eq!(count, 1);
        assert_eq!(maps.get("bom-map").unwrap().name, "BOM");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
