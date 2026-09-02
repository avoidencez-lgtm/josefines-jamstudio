//! chart: Chord charts, arrangement expansion, and chord resolution math.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BarChord {
    pub chord: String,
    pub beats: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChartSection {
    pub id: String,
    pub name: String,
    pub bars: Vec<Vec<BarChord>>,
    #[serde(default)]
    pub style_override_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArrangementItem {
    pub section_id: String,
    #[serde(default = "default_repeats")]
    pub repeats: u32,
}

fn default_repeats() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Chart {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub key_tonic: i32, // 0=C, 1=C#, 2=D, ... 9=A
    pub mode: String,   // "major" | "minor"
    pub time_sig: (u8, u8),
    pub default_bpm: f64,
    #[serde(default)]
    pub default_style_id: Option<String>,
    pub sections: Vec<ChartSection>,
    pub arrangement: Vec<ArrangementItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedBar {
    pub bar_index: u32, // 1-indexed
    pub section_id: String,
    pub section_name: String,
    pub chords: Vec<BarChord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedChart {
    pub id: String,
    pub name: String,
    pub key_tonic: i32,
    pub time_sig: (u8, u8),
    pub default_bpm: f64,
    pub bars: Vec<ResolvedBar>,
}

impl Chart {
    /// Resolves the chart arrangement into a sequence of bars.
    pub fn resolve(&self) -> ResolvedChart {
        let mut bars = Vec::new();
        let mut current_bar_idx = 1;

        for item in &self.arrangement {
            if let Some(sec) = self.sections.iter().find(|s| s.id == item.section_id) {
                for _ in 0..item.repeats {
                    for bar_chords in &sec.bars {
                        bars.push(ResolvedBar {
                            bar_index: current_bar_idx,
                            section_id: sec.id.clone(),
                            section_name: sec.name.clone(),
                            chords: bar_chords.clone(),
                        });
                        current_bar_idx += 1;
                    }
                }
            }
        }

        ResolvedChart {
            id: self.id.clone(),
            name: self.name.clone(),
            key_tonic: self.key_tonic,
            time_sig: self.time_sig,
            default_bpm: self.default_bpm,
            bars,
        }
    }
}

impl ResolvedChart {
    /// Returns the active chord and the next upcoming chord for the given bar and beat.
    pub fn chord_at(&self, bar: u32, _beat: u32) -> (String, Option<String>) {
        if self.bars.is_empty() {
            return ("A7".into(), None);
        }

        let total_bars = self.bars.len() as u32;
        let zero_idx = if bar == 0 { 0 } else { (bar - 1) % total_bars };
        let next_idx = (zero_idx + 1) % total_bars;

        let current = self.bars[zero_idx as usize]
            .chords
            .first()
            .map(|c| c.chord.clone())
            .unwrap_or_else(|| "A7".into());

        let next = self.bars[next_idx as usize]
            .chords
            .first()
            .map(|c| c.chord.clone());

        (current, next)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_12_bar_blues_expansion() {
        let verse_bars: Vec<Vec<BarChord>> = vec![
            vec![BarChord {
                chord: "A7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "D7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "A7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "A7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "D7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "D7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "A7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "A7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "E7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "D7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "A7".into(),
                beats: 4.0,
            }],
            vec![BarChord {
                chord: "E7".into(),
                beats: 4.0,
            }],
        ];

        let chart = Chart {
            schema_version: 1,
            id: "12-bar-blues-a".into(),
            name: "12-Bar Blues in A".into(),
            key_tonic: 9, // A
            mode: "major".into(),
            time_sig: (4, 4),
            default_bpm: 110.0,
            default_style_id: Some("blues-shuffle".into()),
            sections: vec![ChartSection {
                id: "verse".into(),
                name: "Verse".into(),
                bars: verse_bars,
                style_override_id: None,
            }],
            arrangement: vec![ArrangementItem {
                section_id: "verse".into(),
                repeats: 2, // 2 chorus = 24 bars
            }],
        };

        let resolved = chart.resolve();
        assert_eq!(resolved.bars.len(), 24);
        assert_eq!(resolved.bars[0].bar_index, 1);
        assert_eq!(resolved.bars[23].bar_index, 24);

        // Check chord sequence
        let (c1, n1) = resolved.chord_at(1, 1);
        assert_eq!(c1, "A7");
        assert_eq!(n1, Some("D7".into()));

        let (c9, n9) = resolved.chord_at(9, 1);
        assert_eq!(c9, "E7");
        assert_eq!(n9, Some("D7".into()));
    }
}
