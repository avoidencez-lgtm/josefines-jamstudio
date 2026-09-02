//! sequencer: Drum groove sequencer and style pattern scheduler.
//! Renders humanized drum hits ahead of the audio callback with cue handling (fill, crash, stop, ending).

use crate::sampler::Sampler;
use jam_core::style::{DrumHit, DrumPattern, Style};
use jam_core::timeline::TimelineEvent;
use rand::Rng;
use rand_pcg::Pcg32;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum Cue {
    #[default]
    None,
    Fill,
    Crash,
    Stop,
    Ending,
}

pub struct BandSequencer {
    pub style: Style,
    pub intensity: f32,
    pub active_cue: Cue,
    pub pending_cue: Cue,
    pub sampler: Sampler,
    rng: Pcg32,
    current_pattern: DrumPattern,
    is_playing_fill: bool,
    is_playing_ending: bool,
    pub is_stopped: bool,
}

impl BandSequencer {
    pub fn new(style: Style, sample_rate: u32, seed: u64) -> Self {
        let sampler = Sampler::new_with_synthetic_kit(sample_rate);
        let mut seq = Self {
            style,
            intensity: 0.5,
            active_cue: Cue::None,
            pending_cue: Cue::None,
            sampler,
            rng: Pcg32::new(seed, 1),
            current_pattern: DrumPattern::default(),
            is_playing_fill: false,
            is_playing_ending: false,
            is_stopped: false,
        };
        seq.update_pattern_for_intensity();
        seq
    }

    pub fn set_style(&mut self, style: Style) {
        self.style = style;
        self.update_pattern_for_intensity();
    }

    pub fn set_intensity(&mut self, intensity: f32) {
        self.intensity = intensity.clamp(0.0, 1.0);
        if !self.is_playing_fill && !self.is_playing_ending {
            self.update_pattern_for_intensity();
        }
    }

    pub fn cue(&mut self, cue: Cue) {
        self.pending_cue = cue;
    }

    fn update_pattern_for_intensity(&mut self) {
        // Find pattern whose intensity range covers current intensity
        let entry = self
            .style
            .patterns
            .iter()
            .find(|p| self.intensity >= p.intensity.0 && self.intensity <= p.intensity.1)
            .or_else(|| self.style.patterns.first());

        if let Some(p) = entry {
            self.current_pattern = p.drums.clone();
        }
    }

    /// Process a timeline event from the master transport
    pub fn handle_timeline_event(&mut self, event: &TimelineEvent) {
        match event {
            TimelineEvent::Bar { is_count_in, .. } => {
                if *is_count_in {
                    return;
                }

                // Check pending cues at bar boundary
                let cue_to_apply = std::mem::replace(&mut self.pending_cue, Cue::None);
                self.active_cue = cue_to_apply;

                match cue_to_apply {
                    Cue::Fill => {
                        if let Some(fill) = self.style.fills.first() {
                            self.current_pattern = fill.clone();
                            self.is_playing_fill = true;
                        }
                    }
                    Cue::Crash => {
                        // Crash cymbal triggered on the downbeat
                        self.sampler.trigger("crash", 0.9);
                        self.is_playing_fill = false;
                        self.update_pattern_for_intensity();
                    }
                    Cue::Stop => {
                        self.is_stopped = true;
                        self.is_playing_fill = false;
                    }
                    Cue::Ending => {
                        if let Some(ending) = self.style.endings.first() {
                            self.current_pattern = ending.clone();
                            self.is_playing_ending = true;
                        }
                    }
                    Cue::None => {
                        if self.is_playing_fill {
                            self.is_playing_fill = false;
                            self.update_pattern_for_intensity();
                        } else if self.is_playing_ending {
                            self.is_stopped = true;
                        }
                    }
                }
            }

            TimelineEvent::Beat {
                beat, is_count_in, ..
            } => {
                if *is_count_in || self.is_stopped {
                    return;
                }

                let current_beat_float = (*beat as f64) - 1.0;
                let hits_to_trigger: Vec<DrumHit> = self
                    .current_pattern
                    .hits
                    .iter()
                    .filter(|h| (h.at_beats - current_beat_float).abs() < 0.25)
                    .cloned()
                    .collect();

                for hit in hits_to_trigger {
                    // Check probability if specified
                    if let Some(p) = hit.prob {
                        let roll: f32 = self.rng.gen();
                        if roll > p {
                            continue;
                        }
                    }

                    // Apply velocity humanization: ± style.humanize.velocity
                    let vel_delta =
                        (self.rng.gen::<f32>() - 0.5) * 2.0 * self.style.humanize.velocity;
                    let final_vel = (hit.velocity + vel_delta).clamp(0.05, 1.0);

                    self.sampler.trigger(&hit.instrument, final_vel);
                }
            }

            TimelineEvent::CountInComplete => {
                self.is_stopped = false;
                self.update_pattern_for_intensity();
            }

            TimelineEvent::LoopWrapped { .. } => {
                // Keep playing in loop
                self.update_pattern_for_intensity();
            }
        }
    }

    pub fn render(&mut self, output_left: &mut [f32], output_right: &mut [f32]) {
        if !self.is_stopped {
            self.sampler.render(output_left, output_right);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jam_core::style::{DrumHit, DrumPattern, PatternEntry, StyleFeel, StyleHumanize};

    fn create_test_style() -> Style {
        let main_pattern = DrumPattern {
            length_beats: 4.0,
            hits: vec![
                DrumHit {
                    instrument: "kick".into(),
                    at_beats: 0.0,
                    velocity: 0.9,
                    prob: None,
                },
                DrumHit {
                    instrument: "snare".into(),
                    at_beats: 1.0,
                    velocity: 0.8,
                    prob: None,
                },
                DrumHit {
                    instrument: "kick".into(),
                    at_beats: 2.0,
                    velocity: 0.9,
                    prob: None,
                },
                DrumHit {
                    instrument: "snare".into(),
                    at_beats: 3.0,
                    velocity: 0.8,
                    prob: None,
                },
            ],
        };

        let fill_pattern = DrumPattern {
            length_beats: 4.0,
            hits: vec![
                DrumHit {
                    instrument: "snare".into(),
                    at_beats: 0.0,
                    velocity: 0.8,
                    prob: None,
                },
                DrumHit {
                    instrument: "tom_high".into(),
                    at_beats: 1.0,
                    velocity: 0.8,
                    prob: None,
                },
                DrumHit {
                    instrument: "tom_mid".into(),
                    at_beats: 2.0,
                    velocity: 0.8,
                    prob: None,
                },
                DrumHit {
                    instrument: "tom_low".into(),
                    at_beats: 3.0,
                    velocity: 0.9,
                    prob: None,
                },
            ],
        };

        Style {
            schema_version: 1,
            id: "test-rock".into(),
            name: "Test Rock".into(),
            genre: "Rock".into(),
            feel: StyleFeel {
                swing: 0.0,
                time_sig: (4, 4),
                bpm_range: (60.0, 180.0),
            },
            kit_id: "standard".into(),
            bass_program: "picked-bass".into(),
            comp_program: "clean-guitar".into(),
            patterns: vec![PatternEntry {
                intensity: (0.0, 1.0),
                drums: main_pattern,
                bass: Default::default(),
                comp: Default::default(),
            }],
            fills: vec![fill_pattern],
            endings: vec![],
            humanize: StyleHumanize {
                timing_ms: 2.0,
                velocity: 0.05,
            },
        }
    }

    #[test]
    fn test_sequencer_groove_trigger() {
        let style = create_test_style();
        let mut seq = BandSequencer::new(style, 48_000, 42);

        // Beat 1: Kick
        seq.handle_timeline_event(&TimelineEvent::Beat {
            bar: 1,
            beat: 1,
            is_count_in: false,
        });

        let mut left = vec![0.0f32; 512];
        let mut right = vec![0.0f32; 512];
        seq.render(&mut left, &mut right);

        assert!(left.iter().any(|&s| s.abs() > 0.05));
    }

    #[test]
    fn test_sequencer_fill_cue_transitions() {
        let style = create_test_style();
        let mut seq = BandSequencer::new(style, 48_000, 42);

        // Queue fill
        seq.cue(Cue::Fill);
        assert_eq!(seq.pending_cue, Cue::Fill);

        // Bar boundary triggers the fill
        seq.handle_timeline_event(&TimelineEvent::Bar {
            bar: 2,
            is_count_in: false,
        });
        assert!(seq.is_playing_fill);
        assert_eq!(seq.active_cue, Cue::Fill);
        assert_eq!(seq.pending_cue, Cue::None);

        // Next bar transitions back to groove
        seq.handle_timeline_event(&TimelineEvent::Bar {
            bar: 3,
            is_count_in: false,
        });
        assert!(!seq.is_playing_fill);
    }
}
