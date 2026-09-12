//! style: Data schemas for styles, drum patterns, and groove structures.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    pub extra: HashMap<String, serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_style_fields_survive_a_rewrite() {
        let json = include_str!("../../../styles/blues-shuffle.json");
        let mut value: serde_json::Value = serde_json::from_str(json).unwrap();
        value["futureAccent"] = serde_json::json!({"keep": true});
        let style: Style = serde_json::from_value(value).unwrap();
        assert_eq!(style.extra.get("futureAccent").unwrap()["keep"], true);
        let round = serde_json::to_value(&style).unwrap();
        assert_eq!(round["futureAccent"]["keep"], true);
        assert_eq!(round["id"], "blues-shuffle");
    }
}
