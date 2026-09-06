//! Confirmed source-time beat maps. No timer or inference of a downbeat.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub id: String,
    pub label: String,
    pub start_bar: usize,
    /// Exclusive: bar 3 ends a section containing bars 1 and 2.
    pub end_bar: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Grid {
    pub schema_version: u32,
    pub origin: String,
    pub beats_per_bar: usize,
    /// Includes the ending downbeat, which is a boundary, not a playable bar.
    pub beats: Vec<f64>,
    pub sections: Vec<Section>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Position {
    pub bar: usize,
    pub beat: f64,
    pub bpm: f64,
    pub section_id: Option<String>,
    pub section_label: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct State {
    pub origin: String,
    pub beats_per_bar: usize,
    pub bars: usize,
    pub sections: Vec<Section>,
    pub position: Option<Position>,
}

impl Grid {
    pub fn validate(&self, seconds: f64) -> Result<(), String> {
        if self.schema_version != 1
            || self.origin != "confirmed-local"
            || !(2..=12).contains(&self.beats_per_bar)
            || self.beats.len() < self.beats_per_bar + 1
            || self.beats.len() > 5000
            || !(self.beats.len() - 1).is_multiple_of(self.beats_per_bar)
            || !seconds.is_finite()
            || self.beats.iter().enumerate().any(|(i, b)| {
                !b.is_finite()
                    || *b < 0.0
                    || *b > seconds
                    || (i > 0 && *b - self.beats[i - 1] < 0.06)
            })
            || self.sections.len() > 64
        {
            return Err("Invalid confirmed beat map. Confirm the first downbeat and complete bars again in Songs.".into());
        }
        let bars = (self.beats.len() - 1) / self.beats_per_bar;
        if self.sections.iter().enumerate().any(|(i, s)| {
            s.id.is_empty()
                || s.id.len() > 100
                || !s
                    .id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c))
                || s.label.trim().is_empty()
                || s.label.chars().count() > 80
                || s.label.chars().any(char::is_control)
                || s.start_bar == 0
                || s.start_bar >= s.end_bar
                || s.end_bar > bars + 1
                || self.sections[..i].iter().any(|p| p.id == s.id)
                || (i > 0 && s.start_bar < self.sections[i - 1].end_bar)
        }) {
            return Err("Use up to 64 distinct sections in time order, without overlap, inside complete confirmed bars.".into());
        }
        Ok(())
    }

    pub fn state(&self, seconds: f64, speed: f64) -> State {
        let index = self.beats.partition_point(|b| *b <= seconds);
        let position = if index == 0 || index == self.beats.len() {
            None
        } else {
            let i = index - 1;
            let interval = self.beats[index] - self.beats[i];
            let bar = i / self.beats_per_bar + 1;
            let section = self
                .sections
                .iter()
                .find(|s| s.start_bar <= bar && bar < s.end_bar);
            Some(Position {
                bar,
                beat: (i % self.beats_per_bar + 1) as f64 + (seconds - self.beats[i]) / interval,
                bpm: 60.0 / interval * speed,
                section_id: section.map(|s| s.id.clone()),
                section_label: section.map(|s| s.label.clone()),
            })
        };
        State {
            origin: self.origin.clone(),
            beats_per_bar: self.beats_per_bar,
            bars: (self.beats.len() - 1) / self.beats_per_bar,
            sections: self.sections.clone(),
            position,
        }
    }

    pub fn section_bounds(&self, id: &str) -> Result<(f64, f64), String> {
        let s = self
            .sections
            .iter()
            .find(|s| s.id == id)
            .ok_or("That reference section no longer exists. Load the reference again.")?;
        Ok((
            self.beats[(s.start_bar - 1) * self.beats_per_bar],
            self.beats[(s.end_bar - 1) * self.beats_per_bar],
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn irregular_confirmed_beats_resolve_bars_and_exclusive_section_bounds() {
        let g: Grid = serde_json::from_str(include_str!(
            "../../../../tests/fixtures/seams/reference-grid.json"
        ))
        .unwrap();
        g.validate(5.0).unwrap();
        assert!(g.state(0.199, 1.0).position.is_none());
        let p = g.state(2.5, 0.75).position.unwrap();
        assert_eq!(p.bar, 2);
        assert!((p.beat - 1.5).abs() < 1e-9);
        assert!((p.bpm - 75.0).abs() < 1e-9);
        assert_eq!(p.section_label.as_deref(), Some("Chorus"));
        assert_eq!(g.section_bounds("chorus").unwrap(), (2.2, 4.6));
        assert!(g.state(4.6, 1.0).position.is_none());
        for kind in 0..6 {
            let mut bad = g.clone();
            match kind {
                0 => bad.beats[2] = bad.beats[1],
                1 => bad.beats[0] = f64::NAN,
                2 => bad.sections[1].start_bar = 1,
                3 => bad.sections[0].end_bar = 99,
                4 => bad.beats_per_bar = 0,
                _ => bad.origin = "automatic".into(),
            }
            assert!(bad.validate(5.0).is_err());
        }
    }
}
