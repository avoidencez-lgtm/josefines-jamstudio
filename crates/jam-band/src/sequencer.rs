//! sequencer: Rhythm section groove sequencer and pattern scheduler.
//! Renders humanized drums, walking/riff bass, and chord comping ahead of the audio callback.

use crate::instruments::Sf2Synth;
use crate::sampler::Sampler;
use crate::voicing::{bass_note_for_degree, parse_chord, voice_chord};
use jam_core::chart::ResolvedChart;
use jam_core::style::{BassNote, CompStrum, DrumHit, DrumPattern, PatternEntry, Style};
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
    pub synth: Sf2Synth,
    rng: Pcg32,
    current_pattern: PatternEntry,
    pub current_chart: Option<ResolvedChart>,
    pub current_chord: String,
    pub next_chord: Option<String>,
    is_playing_fill: bool,
    is_playing_ending: bool,
    pub is_stopped: bool,
}

impl BandSequencer {
    pub fn new(style: Style, sample_rate: u32, seed: u64) -> Self {
        let sampler = Sampler::new_with_synthetic_kit(sample_rate);
        let synth = Sf2Synth::new(sample_rate);
        let default_pattern = style.patterns.first().cloned().unwrap_or(PatternEntry {
            intensity: (0.0, 1.0),
            drums: DrumPattern::default(),
            bass: Default::default(),
            comp: Default::default(),
        });

        let mut seq = Self {
            style,
            intensity: 0.5,
            active_cue: Cue::None,
            pending_cue: Cue::None,
            sampler,
            synth,
            rng: Pcg32::new(seed, 1),
            current_pattern: default_pattern,
            current_chart: None,
            current_chord: "A7".into(),
            next_chord: Some("D7".into()),
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

    pub fn load_chart(&mut self, chart: ResolvedChart) {
        let (c, n) = chart.chord_at(1, 1);
        self.current_chord = c;
        self.next_chord = n;
        self.current_chart = Some(chart);
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
        let entry = self
            .style
            .patterns
            .iter()
            .find(|p| self.intensity >= p.intensity.0 && self.intensity <= p.intensity.1)
            .or_else(|| self.style.patterns.first());

        if let Some(p) = entry {
            self.current_pattern = p.clone();
        }
    }

    /// Process a timeline event from the master transport
    pub fn handle_timeline_event(&mut self, event: &TimelineEvent) {
        match event {
            TimelineEvent::Bar {
                bar, is_count_in, ..
            } => {
                if *is_count_in {
                    return;
                }

                // Update chord from chart
                if let Some(ref chart) = self.current_chart {
                    let (cur, nxt) = chart.chord_at(*bar, 1);
                    self.current_chord = cur;
                    self.next_chord = nxt;
                }

                // Check pending cues at bar boundary
                let cue_to_apply = std::mem::replace(&mut self.pending_cue, Cue::None);
                self.active_cue = cue_to_apply;

                match cue_to_apply {
                    Cue::Fill => {
                        if let Some(fill) = self.style.fills.first() {
                            self.current_pattern.drums = fill.clone();
                            self.is_playing_fill = true;
                        }
                    }
                    Cue::Crash => {
                        self.sampler.trigger("crash", 0.9);
                        self.is_playing_fill = false;
                        self.update_pattern_for_intensity();
                    }
                    Cue::Stop => {
                        self.is_stopped = true;
                        self.is_playing_fill = false;
                        self.synth.all_notes_off();
                    }
                    Cue::Ending => {
                        if let Some(ending) = self.style.endings.first() {
                            self.current_pattern.drums = ending.clone();
                            self.is_playing_ending = true;
                        }
                    }
                    Cue::None => {
                        if self.is_playing_fill {
                            self.is_playing_fill = false;
                            self.update_pattern_for_intensity();
                        } else if self.is_playing_ending {
                            self.is_stopped = true;
                            self.synth.all_notes_off();
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
                let (chord_root, _) = parse_chord(&self.current_chord);

                // 1. DRUMS
                let hits_to_trigger: Vec<DrumHit> = self
                    .current_pattern
                    .drums
                    .hits
                    .iter()
                    .filter(|h| (h.at_beats - current_beat_float).abs() < 0.25)
                    .cloned()
                    .collect();

                for hit in hits_to_trigger {
                    if let Some(p) = hit.prob {
                        let roll: f32 = self.rng.gen();
                        if roll > p {
                            continue;
                        }
                    }

                    let vel_delta =
                        (self.rng.gen::<f32>() - 0.5) * 2.0 * self.style.humanize.velocity;
                    let final_vel = (hit.velocity + vel_delta).clamp(0.05, 1.0);

                    self.sampler.trigger(&hit.instrument, final_vel);
                }

                // 2. BASS
                let bass_notes: Vec<BassNote> = self
                    .current_pattern
                    .bass
                    .notes
                    .iter()
                    .filter(|n| (n.at_beats - current_beat_float).abs() < 0.25)
                    .cloned()
                    .collect();

                for note in bass_notes {
                    let midi_note = bass_note_for_degree(chord_root, note.degree, note.octave);
                    let vel_delta =
                        (self.rng.gen::<f32>() - 0.5) * 2.0 * self.style.humanize.velocity;
                    let final_vel = (note.velocity + vel_delta).clamp(0.05, 1.0);

                    self.synth.note_on(0, midi_note, final_vel);
                }

                // 3. COMP
                let comp_strums: Vec<CompStrum> = self
                    .current_pattern
                    .comp
                    .strums
                    .iter()
                    .filter(|s| (s.at_beats - current_beat_float).abs() < 0.25)
                    .cloned()
                    .collect();

                for strum in comp_strums {
                    let voicing_kind = &self.current_pattern.comp.voicing;
                    let notes = voice_chord(&self.current_chord, voicing_kind);
                    let vel_delta =
                        (self.rng.gen::<f32>() - 0.5) * 2.0 * self.style.humanize.velocity;
                    let final_vel = (strum.velocity + vel_delta).clamp(0.05, 1.0);

                    for n in notes {
                        self.synth.note_on(1, n, final_vel);
                    }
                }
            }

            TimelineEvent::CountInComplete => {
                self.is_stopped = false;
                self.update_pattern_for_intensity();
            }

            TimelineEvent::LoopWrapped { .. } => {
                self.update_pattern_for_intensity();
            }
        }
    }

    pub fn render(&mut self, output_left: &mut [f32], output_right: &mut [f32]) {
        if !self.is_stopped {
            self.sampler.render(output_left, output_right);
            self.synth.render(output_left, output_right);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jam_core::style::{BassNote, CompPattern, CompStrum, StyleFeel, StyleHumanize};

    fn create_test_full_style() -> Style {
        let drum_p = DrumPattern {
            length_beats: 4.0,
            hits: vec![DrumHit {
                instrument: "kick".into(),
                at_beats: 0.0,
                velocity: 0.9,
                prob: None,
            }],
        };

        let bass_p = jam_core::style::BassPattern {
            length_beats: 4.0,
            notes: vec![
                BassNote {
                    degree: 1,
                    octave: 0,
                    at_beats: 0.0,
                    dur_beats: 1.0,
                    velocity: 0.85,
                },
                BassNote {
                    degree: 5,
                    octave: 0,
                    at_beats: 2.0,
                    dur_beats: 1.0,
                    velocity: 0.8,
                },
            ],
        };

        let comp_p = CompPattern {
            length_beats: 4.0,
            voicing: "shell".into(),
            strums: vec![CompStrum {
                at_beats: 0.0,
                dur_beats: 2.0,
                velocity: 0.75,
                direction: "down".into(),
            }],
        };

        Style {
            schema_version: 1,
            id: "full-blues".into(),
            name: "Full Blues".into(),
            genre: "Blues".into(),
            feel: StyleFeel {
                swing: 0.5,
                time_sig: (4, 4),
                bpm_range: (60.0, 180.0),
            },
            kit_id: "standard".into(),
            bass_program: "finger-bass".into(),
            comp_program: "clean-guitar".into(),
            patterns: vec![PatternEntry {
                intensity: (0.0, 1.0),
                drums: drum_p,
                bass: bass_p,
                comp: comp_p,
            }],
            fills: vec![],
            endings: vec![],
            humanize: StyleHumanize {
                timing_ms: 1.0,
                velocity: 0.02,
            },
        }
    }

    #[test]
    fn test_full_trio_playback() {
        let style = create_test_full_style();
        let mut seq = BandSequencer::new(style, 48_000, 42);

        // Beat 1: triggers Kick + Bass Root + Comp Strum
        seq.handle_timeline_event(&TimelineEvent::Beat {
            bar: 1,
            beat: 1,
            is_count_in: false,
        });

        let mut left = vec![0.0f32; 1024];
        let mut right = vec![0.0f32; 1024];
        seq.render(&mut left, &mut right);

        assert!(left.iter().any(|&s| s.abs() > 0.1));
        assert!(right.iter().any(|&s| s.abs() > 0.1));
    }
}
