//! profiles: Rig modeler profiles (Quad Cortex, Helix, Kemper, Axe-Fx, Black Spirit, Generic).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ModelerKind {
    QuadCortex,
    Helix,
    Kemper,
    AxeFx,
    BlackSpirit,
    Generic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RigProfile {
    pub id: String,
    pub name: String,
    pub kind: ModelerKind,
    pub midi_channel: u8,
    pub scene_cc: Option<u8>,
    pub scenes: Vec<String>,
}

impl RigProfile {
    pub fn quad_cortex() -> Self {
        Self {
            id: "quad-cortex".into(),
            name: "Neural DSP Quad Cortex".into(),
            kind: ModelerKind::QuadCortex,
            midi_channel: 0,
            scene_cc: Some(43),
            scenes: vec![
                "Scene A".into(),
                "Scene B".into(),
                "Scene C".into(),
                "Scene D".into(),
                "Scene E".into(),
                "Scene F".into(),
                "Scene G".into(),
                "Scene H".into(),
            ],
        }
    }

    pub fn helix() -> Self {
        Self {
            id: "helix".into(),
            name: "Line 6 Helix".into(),
            kind: ModelerKind::Helix,
            midi_channel: 0,
            scene_cc: Some(69),
            scenes: (1..=8).map(|i| format!("Snapshot {}", i)).collect(),
        }
    }

    pub fn kemper() -> Self {
        Self {
            id: "kemper".into(),
            name: "Kemper Profiler".into(),
            kind: ModelerKind::Kemper,
            midi_channel: 0,
            scene_cc: Some(50),
            scenes: (1..=5).map(|i| format!("Slot {}", i)).collect(),
        }
    }

    pub fn axe_fx() -> Self {
        Self {
            id: "axe-fx".into(),
            name: "Fractal Axe-Fx III".into(),
            kind: ModelerKind::AxeFx,
            midi_channel: 0,
            scene_cc: Some(34),
            scenes: (1..=8).map(|i| format!("Scene {}", i)).collect(),
        }
    }

    pub fn black_spirit() -> Self {
        Self {
            id: "black-spirit".into(),
            name: "Hughes & Kettner Black Spirit 200".into(),
            kind: ModelerKind::BlackSpirit,
            midi_channel: 0,
            scene_cc: None,
            scenes: vec![
                "Clean".into(),
                "Crunch".into(),
                "Lead".into(),
                "Ultra".into(),
            ],
        }
    }

    pub fn scene_to_midi(&self, scene_idx: usize) -> Vec<u8> {
        let ch = self.midi_channel & 0x0F;
        if let Some(cc) = self.scene_cc {
            vec![0xB0 | ch, cc & 0x7F, (scene_idx as u8) & 0x7F]
        } else {
            // PC fallback
            vec![0xC0 | ch, (scene_idx as u8) & 0x7F]
        }
    }
}
