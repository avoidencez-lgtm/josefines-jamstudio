//! style: Data schemas for styles, drum patterns, and groove structures.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrumHit {
    pub instrument: String,
    pub at_beats: f64,
    pub velocity: f32,
    #[serde(default)]
    pub prob: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DrumPattern {
    pub length_beats: f64,
    pub hits: Vec<DrumHit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BassNote {
    pub degree: i32,
    pub octave: i32,
    pub at_beats: f64,
    pub dur_beats: f64,
    pub velocity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BassPattern {
    pub length_beats: f64,
    pub notes: Vec<BassNote>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompStrum {
    pub at_beats: f64,
    pub dur_beats: f64,
    pub velocity: f32,
    pub direction: String, // "up" | "down"
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CompPattern {
    pub length_beats: f64,
    pub voicing: String, // "shell" | "triad" | "drop2" | "power"
    pub strums: Vec<CompStrum>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PatternEntry {
    pub intensity: (f32, f32),
    pub drums: DrumPattern,
    #[serde(default)]
    pub bass: BassPattern,
    #[serde(default)]
    pub comp: CompPattern,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleFeel {
    pub swing: f32,
    pub time_sig: (u8, u8),
    pub bpm_range: (f64, f64),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleHumanize {
    pub timing_ms: f32,
    pub velocity: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Style {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub genre: String,
    pub feel: StyleFeel,
    pub kit_id: String,
    pub bass_program: String,
    pub comp_program: String,
    pub patterns: Vec<PatternEntry>,
    #[serde(default)]
    pub fills: Vec<DrumPattern>,
    #[serde(default)]
    pub endings: Vec<DrumPattern>,
    pub humanize: StyleHumanize,
    #[serde(default, flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

impl Style {
    pub const SCHEMA_VERSION: u32 = 1;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_fields_survive_a_rewrite() {
        let mut style: Style =
            crate::json::from_str(include_str!("../../../styles/blues-shuffle.json")).unwrap();
        style
            .extra
            .insert("authorNote".into(), serde_json::json!("keep"));
        let again: Style = crate::json::from_str(&serde_json::to_string(&style).unwrap()).unwrap();
        assert_eq!(again.extra["authorNote"], "keep");
        assert_eq!(again.id, "blues-shuffle");
    }
}
