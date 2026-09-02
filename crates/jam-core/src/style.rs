//! style: Data schemas for styles, drum patterns, kit definitions, and groove structures.

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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VelocityLayer {
    pub velocity: (f32, f32),
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KitInstrument {
    pub name: String,
    #[serde(default)]
    pub choke_group: Option<String>,
    pub layers: Vec<VelocityLayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Kit {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub instruments: Vec<KitInstrument>,
}
