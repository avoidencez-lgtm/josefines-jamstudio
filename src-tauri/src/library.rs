//! library: the app's content library. Bundled styles and charts come from the
//! `include_dir` seams in jam-core; the user can add or override JSON files under
//! `~/JosefinesJamstudio/{styles,charts}`. Lookups go through the registry, so adding a
//! style or chart never requires touching Rust.

use jam_core::chart::Chart;
use jam_core::registry::{SeamRegistry, BUNDLED_CHARTS, BUNDLED_RIGS, BUNDLED_STYLES};
use jam_core::style::Style;
use jam_rig::RigProfile;
use std::path::{Path, PathBuf};

pub struct Library {
    styles: SeamRegistry<Style>,
    charts: SeamRegistry<Chart>,
    rigs: SeamRegistry<RigProfile>,
    user_root: PathBuf,
    load_errors: Vec<String>,
    user_chart_ids: Vec<String>,
}

impl Library {
    /// `~/JosefinesJamstudio` (or `JAM_USER_DIR` when set, e.g. in tests).
    pub fn default_user_root() -> PathBuf {
        if let Ok(p) = std::env::var("JAM_USER_DIR") {
            return PathBuf::from(p);
        }
        let mut dir = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        dir.push("JosefinesJamstudio");
        dir
    }

    pub fn load() -> Self {
        Self::load_from(Self::default_user_root())
    }

    pub fn load_from(user_root: PathBuf) -> Self {
        let mut lib = Self {
            styles: SeamRegistry::new(),
            charts: SeamRegistry::new(),
            rigs: SeamRegistry::new(),
            user_root,
            load_errors: Vec::new(),
            user_chart_ids: Vec::new(),
        };
        lib.reload();
        lib
    }

    /// Re-reads bundled and user content. User files with the same id win.
    pub fn reload(&mut self) {
        self.styles = SeamRegistry::new();
        self.charts = SeamRegistry::new();
        self.rigs = SeamRegistry::new();
        self.load_errors.clear();
        self.user_chart_ids.clear();

        if let Err(e) = self.styles.load_from_dir(&BUNDLED_STYLES) {
            self.load_errors.push(format!("bundled styles: {e}"));
        }
        if let Err(e) = self.charts.load_from_dir(&BUNDLED_CHARTS) {
            self.load_errors.push(format!("bundled charts: {e}"));
        }
        if let Err(e) = self.rigs.load_from_dir(&BUNDLED_RIGS) {
            self.load_errors.push(format!("bundled rigs: {e}"));
        }
        let (_, errs) = self.styles.load_from_fs_dir(self.styles_dir());
        self.load_errors.extend(errs);
        let (_, errs) = self.rigs.load_from_fs_dir(self.rigs_dir());
        self.load_errors.extend(errs);
        for rig in self.rigs.list() {
            if let Err(e) = rig.validate() {
                self.load_errors.push(format!("rig: {e}"));
            }
        }

        // Load user charts one by one so we know which ids came from the user folder.
        let mut user: SeamRegistry<Chart> = SeamRegistry::new();
        let (_, errs) = user.load_from_fs_dir(self.charts_dir());
        self.load_errors.extend(errs);
        for chart in user.list() {
            if let Err(e) = validate_chart(chart) {
                self.load_errors.push(format!("chart {}: {e}", chart.id));
                continue;
            }
            self.user_chart_ids.push(chart.id.clone());
            self.charts.insert(chart.clone());
        }
        self.user_chart_ids.sort();
    }

    /// Ids of charts that live in the user folder (and therefore can be deleted).
    pub fn user_chart_ids(&self) -> &[String] {
        &self.user_chart_ids
    }

    pub fn styles_dir(&self) -> PathBuf {
        self.user_root.join("styles")
    }

    pub fn charts_dir(&self) -> PathBuf {
        self.user_root.join("charts")
    }

    pub fn rigs_dir(&self) -> PathBuf {
        self.user_root.join("rigs")
    }

    pub fn rig(&self, id: &str) -> Result<RigProfile, String> {
        self.rigs
            .get(id)
            .cloned()
            .ok_or_else(|| format!("unknown rig profile \"{id}\""))
    }

    /// Valid rig profiles only; a broken user file is reported in `load_errors`.
    pub fn rigs(&self) -> Vec<RigProfile> {
        self.rigs
            .list()
            .into_iter()
            .filter(|r| r.validate().is_ok())
            .cloned()
            .collect()
    }

    pub fn load_errors(&self) -> &[String] {
        &self.load_errors
    }

    pub fn style(&self, id: &str) -> Result<Style, String> {
        self.styles
            .get(id)
            .cloned()
            .ok_or_else(|| format!("unknown style \"{id}\""))
    }

    pub fn style_for_chart(&self, chart: &Chart) -> Result<Style, String> {
        let style = match &chart.default_style_id {
            Some(id) => self.style(id)?,
            None => self
                .styles
                .list()
                .into_iter()
                .find(|s| s.feel.time_sig == chart.time_sig)
                .cloned()
                .ok_or("No style matches this chart's meter.")?,
        };
        if style.feel.time_sig != chart.time_sig {
            return Err(
                "The chart's default style has a different meter. Choose a matching style.".into(),
            );
        }
        Ok(style)
    }

    pub fn chart(&self, id: &str) -> Result<Chart, String> {
        self.charts
            .get(id)
            .cloned()
            .ok_or_else(|| format!("unknown chart \"{id}\""))
    }

    pub fn styles(&self) -> Vec<Style> {
        self.styles.list().into_iter().cloned().collect()
    }

    pub fn charts(&self) -> Vec<Chart> {
        self.charts.list().into_iter().cloned().collect()
    }

    /// Parses a chart JSON file anywhere on disk, copies it into the user charts
    /// directory (so it is there next launch) and registers it.
    pub fn import_chart_file(&mut self, path: &Path) -> Result<Chart, String> {
        let content =
            std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
        let chart: Chart =
            jam_core::json::from_str(&content).map_err(|e| format!("{}: {e}", path.display()))?;
        validate_chart(&chart)?;
        self.save_chart(&chart)?;
        Ok(chart)
    }

    /// Writes a chart to `<user>/charts/<id>.json` and registers it.
    pub fn save_chart(&mut self, chart: &Chart) -> Result<PathBuf, String> {
        validate_chart(chart)?;
        let dir = self.charts_dir();
        std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        let file = dir.join(format!("{}.json", safe_file_stem(&chart.id)));
        let json = serde_json::to_string_pretty(chart).map_err(|e| e.to_string())?;
        let temp = file.with_extension("json.tmp");
        std::fs::write(&temp, json).map_err(|e| format!("{}: {e}", temp.display()))?;
        std::fs::OpenOptions::new()
            .write(true)
            .open(&temp)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
        if file.exists() {
            std::fs::copy(&file, file.with_extension("json.bak")).map_err(|e| e.to_string())?;
        }
        std::fs::rename(temp, &file).map_err(|e| e.to_string())?;
        self.charts.insert(chart.clone());
        if !self.user_chart_ids.contains(&chart.id) {
            self.user_chart_ids.push(chart.id.clone());
            self.user_chart_ids.sort();
        }
        Ok(file)
    }

    /// Removes a user chart file (bundled charts cannot be deleted; they can be
    /// shadowed by a user chart with the same id).
    pub fn delete_user_chart(&mut self, id: &str) -> Result<(), String> {
        let file = self
            .find_user_chart_file(id)
            .ok_or_else(|| format!("\"{id}\" is not a user chart"))?;
        std::fs::remove_file(&file).map_err(|e| format!("{}: {e}", file.display()))?;
        self.reload();
        Ok(())
    }

    /// The file in the user charts folder whose chart id is `id` (the file name may
    /// differ when the user dropped it in by hand).
    fn find_user_chart_file(&self, id: &str) -> Option<PathBuf> {
        let by_name = self
            .charts_dir()
            .join(format!("{}.json", safe_file_stem(id)));
        if by_name.exists() {
            return Some(by_name);
        }
        let entries = std::fs::read_dir(self.charts_dir()).ok()?;
        entries.flatten().map(|e| e.path()).find(|p| {
            p.extension().is_some_and(|x| x == "json")
                && std::fs::read_to_string(p)
                    .ok()
                    .and_then(|s| jam_core::json::from_str::<Chart>(&s).ok())
                    .is_some_and(|c| c.id == id)
        })
    }
}

fn safe_file_stem(id: &str) -> String {
    let stem: String = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    if stem.is_empty() {
        "chart".into()
    } else {
        stem
    }
}

/// Structural checks a chart must pass before the band will play it.
pub fn validate_chart(chart: &Chart) -> Result<(), String> {
    if !chart.default_bpm.is_finite() || !(40.0..=240.0).contains(&chart.default_bpm) {
        return Err("Chart tempo must be within 40–240 BPM.".into());
    }
    if chart.id.trim().is_empty() {
        return Err("chart id is empty".into());
    }
    if chart.sections.is_empty() {
        return Err("chart has no sections".into());
    }
    if chart.arrangement.is_empty() {
        return Err("chart has no arrangement".into());
    }
    if chart.time_sig.0 == 0 || !chart.time_sig.1.is_power_of_two() || chart.time_sig.1 > 32 {
        return Err("Time signature denominator must be a power of two, at most 32.".into());
    }
    let mut total_bars = 0_u64;
    let mut ids = std::collections::BTreeSet::new();
    if chart
        .sections
        .iter()
        .any(|s| s.id.is_empty() || !ids.insert(&s.id))
    {
        return Err("Chart section IDs must be nonempty and unique.".into());
    }
    for item in &chart.arrangement {
        let Some(section) = chart.sections.iter().find(|s| s.id == item.section_id) else {
            return Err(format!(
                "arrangement references unknown section \"{}\"",
                item.section_id
            ));
        };
        total_bars = total_bars.saturating_add(section.bars.len() as u64 * u64::from(item.repeats));
        if item.repeats == 0 || total_bars > 4096 {
            return Err("Keep chart repeats positive and the arrangement within 4096 bars.".into());
        }
    }
    let beats_per_bar = chart.time_sig.0 as f64;
    for section in &chart.sections {
        if section.bars.is_empty() {
            return Err(format!("section \"{}\" has no bars", section.id));
        }
        for (i, bar) in section.bars.iter().enumerate() {
            if bar.iter().any(|c| !c.beats.is_finite() || c.beats <= 0.0) {
                return Err("Chord beat lengths must be positive and finite.".into());
            }
            if bar.is_empty() {
                return Err(format!("section \"{}\" bar {} is empty", section.id, i + 1));
            }
            let total: f64 = bar.iter().map(|c| c.beats).sum();
            if (total - beats_per_bar).abs() > 1e-6 {
                return Err(format!(
                    "section \"{}\" bar {} holds {total} beats, expected {beats_per_bar}",
                    section.id,
                    i + 1
                ));
            }
        }
    }
    if total_bars == 0 {
        return Err("chart resolves to zero bars".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("jam-library-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn bundled_content_is_available_without_a_user_dir() {
        let lib = Library::load_from(temp_root("bundled"));
        assert!(lib.load_errors().is_empty(), "{:?}", lib.load_errors());
        assert_eq!(lib.styles().len(), 6);
        assert_eq!(lib.charts().len(), 9);
        assert_eq!(lib.rigs().len(), 6);
        assert!(lib.style("blues-shuffle").is_ok());
        assert!(lib.chart("blues-12-bar").is_ok());
        assert!(lib.rig("black-spirit-200").is_ok());
        assert!(lib.style("nope").unwrap_err().contains("unknown style"));
    }

    #[test]
    fn user_chart_is_saved_registered_and_shadows_bundled() {
        let root = temp_root("user");
        let mut lib = Library::load_from(root.clone());
        let mut chart = lib.chart("blues-12-bar").unwrap();
        chart.name = "My Blues".into();
        let file = lib.save_chart(&chart).unwrap();
        assert!(file.exists());
        assert_eq!(lib.chart("blues-12-bar").unwrap().name, "My Blues");

        // Survives a reload and still shadows the bundled one.
        lib.reload();
        assert_eq!(lib.chart("blues-12-bar").unwrap().name, "My Blues");
        assert_eq!(lib.charts().len(), 9);

        lib.delete_user_chart("blues-12-bar").unwrap();
        assert_ne!(lib.chart("blues-12-bar").unwrap().name, "My Blues");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn every_bundled_chart_validates() {
        let lib = Library::load_from(temp_root("validate"));
        for chart in lib.charts() {
            validate_chart(&chart).unwrap_or_else(|e| panic!("{}: {e}", chart.id));
        }
    }

    #[test]
    fn non_power_of_two_meters_are_rejected() {
        let lib = Library::load_from(temp_root("meter"));
        let mut chart = lib.chart("blues-12-bar").unwrap();
        chart.time_sig = (4, 6);
        let err = validate_chart(&chart).unwrap_err();
        assert!(err.contains("power of two"), "{err}");
        chart.time_sig = (4, 0);
        assert!(validate_chart(&chart).unwrap_err().contains("power of two"));
    }

    #[test]
    fn broken_bar_lengths_are_rejected() {
        let lib = Library::load_from(temp_root("broken"));
        let mut chart = lib.chart("blues-12-bar").unwrap();
        chart.sections[0].bars[0][0].beats = 3.0;
        let err = validate_chart(&chart).unwrap_err();
        assert!(err.contains("beats"), "{err}");
    }

    #[test]
    fn unsafe_chart_lengths_are_rejected_before_expansion_and_reload() {
        let root = temp_root("bounded-chart");
        let mut lib = Library::load_from(root.clone());
        let mut chart = lib.chart("blues-12-bar").unwrap();
        chart.arrangement[0].repeats = u32::MAX;
        assert!(validate_chart(&chart).unwrap_err().contains("4096"));
        std::fs::create_dir_all(lib.charts_dir()).unwrap();
        std::fs::write(
            lib.charts_dir().join("bad.json"),
            serde_json::to_vec(&chart).unwrap(),
        )
        .unwrap();
        lib.reload();
        assert!(!lib.load_errors().is_empty());
        assert!(lib.chart(&chart.id).unwrap().arrangement[0].repeats < u32::MAX);
        chart.arrangement[0].repeats = 1;
        chart.sections[0].bars[0][0].beats = f64::NAN;
        assert!(validate_chart(&chart).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
