//! sequencer: Rhythm section groove sequencer and pattern scheduler.
//!
//! The sequencer renders drums, bass and comp ahead of the audio callback. Pattern
//! events are scheduled sample-accurately inside the spans the timeline hands out, so
//! off-beat hits (the shuffle's "and", funk 16ths) land where the style puts them,
//! swing is applied to straight eighths, notes get a real note-off from `durBeats`,
//! and humanised timing jitter is deterministic per seed.
//!
//! Live steering (queued styles, energy following, part mutes, cues) is applied on
//! bar boundaries via the timeline's `Bar` events.

use crate::instruments::Sf2Synth;
use crate::sampler::Sampler;
use crate::voicing::{bass_note_for_chord, parse_chord, slash_bass, voice_chord};
use jam_core::chart::ResolvedChart;
use jam_core::style::{DrumPattern, PatternEntry, Style};
use jam_core::timeline::{Span, TimelineEvent};
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

/// Bass channel on the synth.
const CH_BASS: u8 = 0;
/// Comp channel on the synth.
const CH_COMP: u8 = 1;
/// Delay between successive strings of a strum.
const STRUM_SPREAD_SECS: f64 = 0.006;
/// Two positions closer than this are treated as the same pattern boundary.
const CONTINUITY_EPS: f64 = 1e-6;

#[derive(Debug, Clone)]
enum SpanEventKind {
    Drum {
        instrument: String,
        velocity: f32,
    },
    NoteOn {
        channel: u8,
        key: u8,
        velocity: f32,
        off_at_beats: f64,
    },
    NoteOff {
        channel: u8,
        key: u8,
    },
}

#[derive(Debug, Clone)]
struct SpanEvent {
    offset: usize,
    kind: SpanEventKind,
}

struct SpanWindow {
    start: f64,
    end: f64,
    samples_per_beat: f64,
    frames: usize,
}

#[derive(Debug, Clone, Copy)]
struct PendingNoteOff {
    at_beats: f64,
    channel: u8,
    key: u8,
}

/// A humanised or strum-spread hit that belongs in a later span.
#[derive(Debug, Clone)]
struct PendingHit {
    at_beats: f64,
    kind: SpanEventKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiNote {
    pub frame: u64,
    pub bytes: [u8; 3],
}

/// A section's three independently editable parts. Existing Style JSON is reused.
#[derive(Clone)]
pub struct SectionBand {
    pub styles: [Style; 3],
    pub intensity: [f32; 3],
    pub gains: [f32; 3],
    pub muted: [bool; 3],
    pub swing: f32,
}

pub struct BandSequencer {
    pub section_bands: std::collections::BTreeMap<String, SectionBand>,
    section_applied: String,
    part_gains: [f32; 3],
    pub part_audio: [Vec<f32>; 4],
    pub note_events: Vec<MidiNote>,
    pub style: Style,
    pub intensity: f32,
    pub active_cue: Cue,
    pub pending_cue: Cue,
    pub pending_style: Option<Style>,
    pub pending_intensity: Option<f32>,
    pub mute_drums: bool,
    pub mute_bass: bool,
    pub mute_comp: bool,
    pub follow_energy: bool,
    pub current_energy: f32,
    pub sampler: Sampler,
    pub synth: Sf2Synth,
    rng: Pcg32,
    current_pattern: PatternEntry,
    pub current_chart: Option<ResolvedChart>,
    pub current_chord: String,
    pub next_chord: Option<String>,
    pub current_section: String,
    pub is_stopped: bool,
    is_playing_fill: bool,
    is_playing_ending: bool,
    ending_complete: bool,
    pending_note_offs: Vec<PendingNoteOff>,
    pending_hits: Vec<PendingHit>,
    /// Position (absolute beats) up to which pattern events have been scheduled.
    cursor_beats: Option<f64>,
    sample_rate: u32,
    seed: u64,
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
            section_bands: Default::default(),
            section_applied: String::new(),
            part_gains: [1.0; 3],
            part_audio: std::array::from_fn(|_| Vec::with_capacity(256)),
            note_events: Vec::new(),
            style,
            intensity: 0.5,
            active_cue: Cue::None,
            pending_cue: Cue::None,
            pending_style: None,
            pending_intensity: None,
            mute_drums: false,
            mute_bass: false,
            mute_comp: false,
            follow_energy: false,
            current_energy: 0.0,
            sampler,
            synth,
            rng: Pcg32::new(seed, 1),
            current_pattern: default_pattern,
            current_chart: None,
            current_chord: "A7".into(),
            next_chord: Some("D7".into()),
            current_section: String::new(),
            is_stopped: false,
            is_playing_fill: false,
            is_playing_ending: false,
            ending_complete: false,
            pending_note_offs: Vec::with_capacity(64),
            pending_hits: Vec::with_capacity(16),
            cursor_beats: None,
            sample_rate,
            seed,
        };
        seq.update_pattern_for_intensity();
        seq
    }

    pub fn clear_song(&mut self) {
        self.section_bands.clear();
        self.section_applied.clear();
        self.part_gains = [1.0; 3];
        self.set_parts(false, false, false);
        self.reset();
        self.update_pattern_for_intensity();
    }

    pub fn set_style(&mut self, style: Style) {
        self.style = style;
        self.update_pattern_for_intensity();
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Rebuilds the instruments for a new device rate (the kit and synth are rendered
    /// at a fixed rate). Musical state (style, chart, mutes, intensity) is kept.
    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        if sample_rate == self.sample_rate || sample_rate == 0 {
            return;
        }
        self.sample_rate = sample_rate;
        self.sampler = Sampler::new_with_synthetic_kit(sample_rate);
        self.synth = Sf2Synth::new(sample_rate);
        self.pending_note_offs.clear();
        self.pending_hits.clear();
        self.cursor_beats = None;
    }

    pub fn queue_style_at_next_bar(&mut self, style: Style) {
        self.pending_style = Some(style);
    }

    pub fn queue_intensity_at_next_bar(&mut self, intensity: f32) {
        self.pending_intensity = Some(intensity.clamp(0.0, 1.0));
    }

    pub fn set_parts(&mut self, mute_drums: bool, mute_bass: bool, mute_comp: bool) {
        self.mute_drums = mute_drums;
        self.mute_bass = mute_bass;
        self.mute_comp = mute_comp;
    }

    pub fn set_follow_energy(&mut self, enabled: bool) {
        self.follow_energy = enabled;
    }

    pub fn update_energy(&mut self, energy: f32) {
        self.current_energy = energy;
        if self.follow_energy && !self.is_playing_fill && !self.is_playing_ending {
            self.set_intensity(energy);
        }
    }

    pub fn load_chart(&mut self, chart: ResolvedChart) {
        self.retarget_chart(chart, 1, 1);
    }

    /// Swap the written chords without rewinding to bar 1 (Stage transpose).
    pub fn retarget_chart(&mut self, chart: ResolvedChart, bar: u32, beat: u32) {
        let bar = bar.max(1);
        let beat = beat.max(1);
        let (c, n) = chart.chord_at(bar, beat);
        self.current_chord = c;
        self.next_chord = n;
        self.current_section = chart
            .section_at(bar)
            .map(|b| b.section_name.clone())
            .unwrap_or_default();
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

    /// True once after an `Ending` cue has played its bar; the transport should stop.
    pub fn take_ending_complete(&mut self) -> bool {
        std::mem::take(&mut self.ending_complete)
    }

    /// Transport stop: silence everything and forget queued state.
    pub fn reset(&mut self) {
        self.section_applied.clear();
        self.sampler.all_off();
        self.synth.all_notes_off();
        self.pending_note_offs.clear();
        self.pending_hits.clear();
        self.pending_cue = Cue::None;
        self.active_cue = Cue::None;
        self.is_stopped = false;
        self.is_playing_fill = false;
        self.is_playing_ending = false;
        self.ending_complete = false;
        self.cursor_beats = None;
        self.update_pattern_for_intensity();
        if let Some(chart) = &self.current_chart {
            let (c, n) = chart.chord_at(1, 1);
            self.current_chord = c;
            self.next_chord = n;
            self.current_section = chart
                .section_at(1)
                .map(|b| b.section_name.clone())
                .unwrap_or_default();
        }
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

    fn refresh_chord_display(&mut self, bar: u32, beat: u32) {
        if let Some(chart) = &self.current_chart {
            let (cur, nxt) = chart.chord_at(bar, beat);
            self.current_chord = cur;
            self.next_chord = nxt;
            if let Some(b) = chart.section_at(bar) {
                self.current_section = b.section_name.clone();
            }
        }
    }

    /// Process a timeline event from the master transport.
    pub fn handle_timeline_event(&mut self, event: &TimelineEvent) {
        match event {
            TimelineEvent::Bar {
                bar, is_count_in, ..
            } => {
                if *is_count_in {
                    return;
                }

                if let Some(st) = self.pending_style.take() {
                    self.set_style(st);
                }
                if let Some(int) = self.pending_intensity.take() {
                    self.set_intensity(int);
                }

                self.section_applied.clear();
                self.refresh_chord_display(*bar, 1);

                let cue_to_apply = std::mem::replace(&mut self.pending_cue, Cue::None);
                self.active_cue = cue_to_apply;

                match cue_to_apply {
                    Cue::Fill => {
                        self.is_stopped = false;
                        if let Some(fill) = self.style.fills.first() {
                            self.current_pattern.drums = fill.clone();
                            self.is_playing_fill = true;
                        }
                    }
                    Cue::Crash => {
                        self.is_stopped = false;
                        if !self.mute_drums {
                            self.sampler.trigger("crash", 0.9);
                        }
                        self.is_playing_fill = false;
                        self.update_pattern_for_intensity();
                    }
                    Cue::Stop => {
                        // A break: everybody hits the downbeat, then drops out.
                        if !self.mute_drums {
                            self.sampler.trigger("kick", 0.95);
                            self.sampler.trigger("crash", 0.8);
                        }
                        self.is_stopped = true;
                        self.is_playing_fill = false;
                        self.synth.all_notes_off();
                        self.pending_note_offs.clear();
                        self.pending_hits.clear();
                    }
                    Cue::Ending => {
                        self.is_stopped = false;
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
                            self.is_playing_ending = false;
                            self.is_stopped = true;
                            self.ending_complete = true;
                            self.synth.all_notes_off();
                            self.pending_note_offs.clear();
                            self.pending_hits.clear();
                            self.update_pattern_for_intensity();
                        }
                    }
                }
            }

            TimelineEvent::Beat {
                bar,
                beat,
                is_count_in,
                ..
            } => {
                if *is_count_in {
                    return;
                }
                self.refresh_chord_display(*bar, *beat);
            }

            TimelineEvent::CountInComplete => {
                self.is_stopped = false;
                self.is_playing_fill = false;
                self.is_playing_ending = false;
                self.cursor_beats = None;
                self.update_pattern_for_intensity();
            }

            TimelineEvent::LoopWrapped { .. } => {
                self.pending_note_offs.clear();
                self.pending_hits.clear();
                self.update_pattern_for_intensity();
            }
        }
    }

    /// Render `span.frames` samples of band starting at absolute position
    /// `span.start_beats`, scheduling every pattern event that falls inside.
    ///
    /// `samples_per_beat` comes from the transport tempo, `beats_per_bar` from the
    /// transport time signature (chord lookup uses it to find the bar).
    pub fn render_span(
        &mut self,
        span: &Span,
        samples_per_beat: f64,
        beats_per_bar: f64,
        output_left: &mut [f32],
        output_right: &mut [f32],
    ) {
        let frames = span.frames.min(output_left.len()).min(output_right.len());
        if frames == 0 || samples_per_beat <= 0.0 {
            return;
        }

        self.apply_song_section((span.start_beats / beats_per_bar).floor() as u32 + 1);
        let range_start = match self.cursor_beats {
            Some(c) if (c - span.start_beats).abs() < CONTINUITY_EPS => c,
            _ => span.start_beats,
        };
        let range_end = range_start + frames as f64 / samples_per_beat;
        self.cursor_beats = Some(range_end);

        let mut events: Vec<SpanEvent> = Vec::with_capacity(32);

        // Note-offs that fall in (or before) this span.
        let mut i = 0;
        while i < self.pending_note_offs.len() {
            let n = self.pending_note_offs[i];
            if n.at_beats < range_end {
                let offset = ((n.at_beats - range_start).max(0.0) * samples_per_beat) as usize;
                events.push(SpanEvent {
                    offset: offset.min(frames - 1),
                    kind: SpanEventKind::NoteOff {
                        channel: n.channel,
                        key: n.key,
                    },
                });
                self.pending_note_offs.swap_remove(i);
            } else {
                i += 1;
            }
        }

        if !self.is_stopped {
            self.collect_pattern_events(
                range_start,
                range_end,
                samples_per_beat,
                beats_per_bar,
                frames,
                &mut events,
            );
        }

        events.sort_by_key(|e| e.offset);

        let mut cursor = 0usize;
        for ev in events {
            let off = ev.offset.min(frames);
            if off > cursor {
                self.render_tails(
                    &mut output_left[cursor..off],
                    &mut output_right[cursor..off],
                );
                cursor = off;
            }
            self.fire(ev.kind);
        }
        if cursor < frames {
            self.render_tails(
                &mut output_left[cursor..frames],
                &mut output_right[cursor..frames],
            );
        }
    }

    /// Render only the tails of already sounding voices (paused transport).
    pub fn render(&mut self, output_left: &mut [f32], output_right: &mut [f32]) {
        self.render_tails(output_left, output_right);
    }

    pub fn begin_block(&mut self) {
        for bus in &mut self.part_audio {
            bus.clear();
        }
        self.note_events.clear();
    }

    fn apply_song_section(&mut self, bar: u32) {
        let id = self
            .current_chart
            .as_ref()
            .and_then(|c| c.section_at(bar))
            .map(|b| b.section_id.clone())
            .unwrap_or_default();
        if id == self.section_applied {
            return;
        }
        self.section_applied = id.clone();
        if let Some(settings) = self.section_bands.get(&id).cloned() {
            self.style = settings.styles[0].clone();
            self.style.feel.swing = settings.swing;
            let selected: Vec<_> = settings
                .styles
                .iter()
                .enumerate()
                .map(|(i, s)| {
                    s.patterns
                        .iter()
                        .find(|p| {
                            settings.intensity[i] >= p.intensity.0
                                && settings.intensity[i] <= p.intensity.1
                        })
                        .or_else(|| s.patterns.first())
                        .cloned()
                        .unwrap_or_default()
                })
                .collect();
            self.current_pattern = PatternEntry {
                intensity: (0.0, 1.0),
                drums: selected[0].drums.clone(),
                bass: selected[1].bass.clone(),
                comp: selected[2].comp.clone(),
            };
            // Keep note timing and velocity stable when trying other parts.
            self.style.humanize.timing_ms = 0.0;
            self.style.humanize.velocity = 0.0;
            self.intensity = 0.5;
            self.part_gains = settings.gains;
            self.set_parts(settings.muted[0], settings.muted[1], settings.muted[2]);
        }
    }

    fn render_tails(&mut self, left: &mut [f32], right: &mut [f32]) {
        if left.is_empty() {
            return;
        }
        let n = left.len().min(right.len());
        let mut d = vec![0.0; n];
        let mut dr = vec![0.0; n];
        let mut b = vec![0.0; n];
        let mut c = vec![0.0; n];
        let mut scratch = vec![0.0; n];
        self.sampler.render(&mut d, &mut dr);
        self.synth.render_channel(0, &mut b, &mut scratch);
        scratch.fill(0.0);
        self.synth.render_channel(1, &mut c, &mut scratch);
        for i in 0..n {
            d[i] *= self.part_gains[0];
            dr[i] *= self.part_gains[0];
            b[i] *= self.part_gains[1];
            c[i] *= self.part_gains[2];
            left[i] += d[i] + b[i] + c[i];
            right[i] += dr[i] + b[i] + c[i];
        }
        for (bus, samples) in self.part_audio.iter_mut().zip([d, dr, b, c]) {
            bus.extend(samples);
        }
    }

    fn fire(&mut self, kind: SpanEventKind) {
        let frame = self.part_audio[0].len() as u64;
        let event = match &kind {
            SpanEventKind::NoteOn {
                channel,
                key,
                velocity,
                ..
            } => Some([0x90 | channel, *key, (velocity * 127.0).round() as u8]),
            SpanEventKind::NoteOff { channel, key } => Some([0x80 | channel, *key, 0]),
            SpanEventKind::Drum {
                instrument,
                velocity,
            } => {
                let key = match instrument.as_str() {
                    "kick" => 36,
                    "snare" => 38,
                    "hihat_closed" => 42,
                    "hihat_open" => 46,
                    "pedal_hihat" => 44,
                    "ride" => 51,
                    "crash" => 49,
                    "tom_high" => 50,
                    "tom_mid" => 47,
                    "tom_low" => 45,
                    _ => 37,
                };
                self.note_events.push(MidiNote {
                    frame: frame + self.sample_rate as u64 / 10,
                    bytes: [0x89, key, 0],
                });
                Some([0x99, key, (velocity * 127.0).round() as u8])
            }
        };
        if let Some(bytes) = event {
            self.note_events.push(MidiNote { frame, bytes });
        }
        match kind {
            SpanEventKind::Drum {
                instrument,
                velocity,
            } => self.sampler.trigger(&instrument, velocity),
            SpanEventKind::NoteOn {
                channel,
                key,
                velocity,
                off_at_beats,
            } => {
                self.synth.note_on(channel, key, velocity);
                self.pending_note_offs.push(PendingNoteOff {
                    at_beats: off_at_beats,
                    channel,
                    key,
                });
            }
            SpanEventKind::NoteOff { channel, key } => self.synth.note_off(channel, key),
        }
    }

    fn max_timing_beats(&self, samples_per_beat: f64) -> f64 {
        if samples_per_beat <= 0.0 {
            return 0.0;
        }
        self.style.humanize.timing_ms as f64 * 1e-3 * self.sample_rate as f64 / samples_per_beat
    }

    /// Jitter for one pattern occurrence. Same `t` and seed always match, so a late
    /// hit belongs in the next span without a second random draw.
    fn timing_jitter_beats(&self, t: f64, samples_per_beat: f64) -> f64 {
        let max_samples = self.style.humanize.timing_ms as f64 * 1e-3 * self.sample_rate as f64;
        if max_samples <= 0.0 || samples_per_beat <= 0.0 {
            return 0.0;
        }
        let unit = Pcg32::new(self.seed, t.to_bits()).gen::<f64>();
        ((unit - 0.5) * 2.0 * max_samples) / samples_per_beat
    }

    fn scheduled_offset(window: &SpanWindow, at_beats: f64) -> usize {
        let offset = ((at_beats - window.start) * window.samples_per_beat).round();
        offset.clamp(0.0, (window.frames.saturating_sub(1)) as f64) as usize
    }

    fn belongs_in_span(window: &SpanWindow, at_beats: f64) -> bool {
        if at_beats >= window.end {
            return false;
        }
        if at_beats < window.start && at_beats >= 0.0 && window.start > 0.0 {
            return false;
        }
        true
    }

    fn occurrence_plays(&self, t: f64, prob: Option<f32>) -> bool {
        let Some(p) = prob else {
            return true;
        };
        Pcg32::new(self.seed ^ 1, t.to_bits()).gen::<f32>() <= p
    }

    fn push_in_span(
        events: &mut Vec<SpanEvent>,
        window: &SpanWindow,
        at_beats: f64,
        kind: SpanEventKind,
    ) {
        if !Self::belongs_in_span(window, at_beats) {
            return;
        }
        events.push(SpanEvent {
            offset: Self::scheduled_offset(window, at_beats),
            kind,
        });
    }

    fn push_or_carry(
        &mut self,
        events: &mut Vec<SpanEvent>,
        window: &SpanWindow,
        at_beats: f64,
        kind: SpanEventKind,
    ) {
        if at_beats >= window.end {
            self.pending_hits.push(PendingHit { at_beats, kind });
            return;
        }
        Self::push_in_span(events, window, at_beats, kind);
    }

    fn humanize_velocity(&mut self, velocity: f32) -> f32 {
        let delta = (self.rng.gen::<f32>() - 0.5) * 2.0 * self.style.humanize.velocity;
        let intensity_gain = 0.8 + 0.4 * self.intensity;
        ((velocity + delta) * intensity_gain).clamp(0.05, 1.0)
    }

    /// Applies the style's swing to straight eighths (positions ending in .5).
    fn swung(&self, at_beats: f64) -> f64 {
        let swing = self.style.feel.swing as f64;
        let frac = at_beats - at_beats.floor();
        if (frac - 0.5).abs() < 0.02 && (swing - 0.5).abs() > 0.01 {
            at_beats.floor() + swing.clamp(0.5, 0.75)
        } else {
            at_beats
        }
    }

    /// Every occurrence of a pattern position `at` (pattern length `len`) inside
    /// `[start, end)`, as absolute beats. Uses the same arithmetic in every span so an
    /// occurrence is scheduled exactly once across span boundaries.
    fn occurrences(at: f64, len: f64, start: f64, end: f64) -> impl Iterator<Item = f64> {
        let len = if len > 1e-3 { len } else { 4.0 };
        let mut k = ((start - at) / len).floor() as i64;
        let mut t = at + k as f64 * len;
        while t < start {
            k += 1;
            t = at + k as f64 * len;
        }
        std::iter::from_fn(move || {
            if t < end {
                let out = t;
                k += 1;
                t = at + k as f64 * len;
                Some(out)
            } else {
                None
            }
        })
    }

    fn chord_at_abs_beats(&self, abs_beats: f64, beats_per_bar: f64) -> String {
        match &self.current_chart {
            Some(chart) => {
                let bpb = if beats_per_bar > 0.0 {
                    beats_per_bar
                } else {
                    4.0
                };
                let bar_zero = ((abs_beats + 1e-7) / bpb).floor();
                let pos = abs_beats - bar_zero * bpb;
                chart.chord_at_position(bar_zero as u32 + 1, pos.max(0.0)).0
            }
            None => self.current_chord.clone(),
        }
    }

    fn collect_pattern_events(
        &mut self,
        start: f64,
        end: f64,
        samples_per_beat: f64,
        beats_per_bar: f64,
        frames: usize,
        events: &mut Vec<SpanEvent>,
    ) {
        // Borrow the pattern by value while we mutate the RNG; restored below.
        let pattern = std::mem::take(&mut self.current_pattern);
        let pad = self.max_timing_beats(samples_per_beat);
        let spread_beats = STRUM_SPREAD_SECS * self.sample_rate as f64 / samples_per_beat;
        let window = SpanWindow {
            start,
            end,
            samples_per_beat,
            frames,
        };

        let mut i = 0;
        while i < self.pending_hits.len() {
            if self.pending_hits[i].at_beats < end {
                let hit = self.pending_hits.swap_remove(i);
                Self::push_in_span(events, &window, hit.at_beats, hit.kind);
            } else {
                i += 1;
            }
        }

        if !self.mute_drums {
            let len = pattern.drums.length_beats;
            for hit in &pattern.drums.hits {
                if !self.sampler.has_instrument(&hit.instrument) {
                    continue;
                }
                let at = self.swung(hit.at_beats);
                for t in Self::occurrences(at, len, start - pad, end + pad) {
                    if !self.occurrence_plays(t, hit.prob) {
                        continue;
                    }
                    let scheduled = t + self.timing_jitter_beats(t, samples_per_beat);
                    if !Self::belongs_in_span(&window, scheduled) {
                        continue;
                    }
                    let velocity = self.humanize_velocity(hit.velocity);
                    Self::push_in_span(
                        events,
                        &window,
                        scheduled,
                        SpanEventKind::Drum {
                            instrument: hit.instrument.clone(),
                            velocity,
                        },
                    );
                }
            }
        }

        if !self.mute_bass {
            let len = pattern.bass.length_beats;
            for note in &pattern.bass.notes {
                let at = self.swung(note.at_beats);
                for t in Self::occurrences(at, len, start - pad, end + pad) {
                    let chord = self.chord_at_abs_beats(t, beats_per_bar);
                    let Some((root, quality)) = parse_chord(&chord) else {
                        continue;
                    };
                    let bass_root = slash_bass(&chord).unwrap_or(root);
                    let key = if note.degree <= 1 {
                        bass_note_for_chord(bass_root, quality, 1, note.octave)
                    } else {
                        bass_note_for_chord(root, quality, note.degree, note.octave)
                    };
                    let scheduled = t + self.timing_jitter_beats(t, samples_per_beat);
                    if !Self::belongs_in_span(&window, scheduled) {
                        continue;
                    }
                    let velocity = self.humanize_velocity(note.velocity);
                    let dur = note.dur_beats.max(0.05);
                    Self::push_in_span(
                        events,
                        &window,
                        scheduled,
                        SpanEventKind::NoteOn {
                            channel: CH_BASS,
                            key,
                            velocity,
                            off_at_beats: scheduled + dur * 0.92,
                        },
                    );
                }
            }
        }

        if !self.mute_comp {
            let len = pattern.comp.length_beats;
            for strum in &pattern.comp.strums {
                let at = self.swung(strum.at_beats);
                for t in Self::occurrences(at, len, start - pad, end + pad) {
                    let chord = self.chord_at_abs_beats(t, beats_per_bar);
                    let mut notes = voice_chord(&chord, &pattern.comp.voicing);
                    if strum.direction == "up" {
                        notes.reverse();
                    }
                    let scheduled = t + self.timing_jitter_beats(t, samples_per_beat);
                    let look_around = t < start || t >= end;
                    if look_around && !Self::belongs_in_span(&window, scheduled) {
                        continue;
                    }
                    let velocity = self.humanize_velocity(strum.velocity);
                    let dur = strum.dur_beats.max(0.05);
                    for (i, key) in notes.into_iter().enumerate() {
                        if look_around && i > 0 {
                            break;
                        }
                        let at_beats = scheduled + i as f64 * spread_beats;
                        let kind = SpanEventKind::NoteOn {
                            channel: CH_COMP,
                            key,
                            velocity,
                            off_at_beats: at_beats + dur * 0.9,
                        };
                        if i == 0 {
                            Self::push_in_span(events, &window, at_beats, kind);
                        } else {
                            self.push_or_carry(events, &window, at_beats, kind);
                        }
                    }
                }
            }
        }

        self.current_pattern = pattern;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jam_core::style::{
        BassNote, BassPattern, CompPattern, CompStrum, DrumHit, StyleFeel, StyleHumanize,
    };
    use jam_core::timeline::Timeline;

    fn style_with(
        swing: f32,
        hits: Vec<DrumHit>,
        bass: Vec<BassNote>,
        strums: Vec<CompStrum>,
    ) -> Style {
        Style {
            schema_version: 1,
            id: "test".into(),
            name: "Test".into(),
            genre: "Test".into(),
            feel: StyleFeel {
                swing,
                time_sig: (4, 4),
                bpm_range: (60.0, 180.0),
            },
            kit_id: "standard".into(),
            bass_program: "finger-bass".into(),
            comp_program: "clean-guitar".into(),
            patterns: vec![PatternEntry {
                intensity: (0.0, 1.0),
                drums: DrumPattern {
                    length_beats: 4.0,
                    hits,
                },
                bass: BassPattern {
                    length_beats: 4.0,
                    notes: bass,
                },
                comp: CompPattern {
                    length_beats: 4.0,
                    voicing: "shell".into(),
                    strums,
                },
            }],
            fills: vec![],
            endings: vec![],
            humanize: StyleHumanize {
                timing_ms: 0.0,
                velocity: 0.0,
            },
        }
    }

    fn kick(at: f64) -> DrumHit {
        DrumHit {
            instrument: "kick".into(),
            at_beats: at,
            velocity: 0.9,
            prob: None,
        }
    }

    /// Renders `bars` bars at 120 bpm with 256-frame blocks and returns the left channel.
    fn render(style: Style, bars: u32, loop_bars: Option<(u32, u32)>) -> (Vec<f32>, BandSequencer) {
        let sr = 48_000;
        let mut seq = BandSequencer::new(style, sr, 7);
        let mut tl = Timeline::new(sr, 120.0, (4, 4));
        tl.set_count_in(0);
        if let Some((a, b)) = loop_bars {
            tl.set_loop(a, b, true);
        }
        tl.play();
        let total = (bars as f64 * 4.0 * tl.samples_per_beat()) as usize;
        let mut out = vec![0.0f32; total];
        let mut r = vec![0.0f32; total];
        let mut done = 0;
        while done < total {
            let n = 256.min(total - done);
            let (events, spans) = tl.advance_with_spans(n);
            for e in &events {
                seq.handle_timeline_event(e);
            }
            for s in &spans {
                let (l, rr) = (
                    &mut out[done + s.offset..done + s.offset + s.frames],
                    &mut r[done + s.offset..done + s.offset + s.frames],
                );
                seq.render_span(s, tl.samples_per_beat(), 4.0, l, rr);
            }
            done += n;
        }
        (out, seq)
    }

    /// Rising edges of |x| above `threshold` after at least 20 ms of quiet. The
    /// synthetic drums start on a zero crossing, so an onset is reported a handful of
    /// samples after the trigger; tests allow `ATTACK_TOLERANCE`.
    const ATTACK_TOLERANCE: i64 = 12;

    fn onsets(signal: &[f32], threshold: f32) -> Vec<usize> {
        let mut result = Vec::new();
        let mut quiet = 1_000usize;
        for (i, s) in signal.iter().enumerate() {
            if s.abs() > threshold {
                if quiet > 960 {
                    result.push(i);
                }
                quiet = 0;
            } else {
                quiet += 1;
            }
        }
        result
    }

    fn near(found: &[usize], expect: usize) -> bool {
        found
            .iter()
            .any(|&o| o as i64 >= expect as i64 && (o as i64 - expect as i64) <= ATTACK_TOLERANCE)
    }

    #[test]
    fn first_downbeat_sounds_at_sample_zero() {
        let style = style_with(0.5, vec![kick(0.0)], vec![], vec![]);
        let (l, _) = render(style, 1, None);
        let peak_first_ms: f32 = l[..480].iter().fold(0.0, |m, s| m.max(s.abs()));
        assert!(peak_first_ms > 0.1, "kick must sound in the first 10 ms");
    }

    #[test]
    fn off_beat_hits_are_scheduled_sample_accurately() {
        // Ride on the shuffle "and" (0.67) and a funk 16th (0.25).
        let mut ride = kick(0.67);
        ride.instrument = "ride".into();
        let mut sixteenth = kick(2.25);
        sixteenth.instrument = "snare".into();
        let style = style_with(0.5, vec![ride, sixteenth], vec![], vec![]);
        let (l, _) = render(style, 1, None);
        let spb = 24_000.0;
        let found = onsets(&l, 0.05);
        let expect = [(0.67 * spb) as usize, (2.25 * spb) as usize];
        for e in expect {
            assert!(
                near(&found, e),
                "expected onset near sample {e}, got {found:?}"
            );
        }
    }

    #[test]
    fn swing_moves_straight_eighths() {
        let style = style_with(0.67, vec![kick(1.5)], vec![], vec![]);
        let (l, _) = render(style, 1, None);
        let found = onsets(&l, 0.05);
        let swung = (1.67 * 24_000.0) as usize;
        assert!(
            near(&found, swung),
            "expected swung onset near {swung}, got {found:?}"
        );
        let straight = (1.5 * 24_000.0) as usize;
        assert!(
            !near(&found, straight),
            "straight eighth must not also fire"
        );
    }

    #[test]
    fn every_bar_downbeat_fires_exactly_once_across_blocks() {
        let style = style_with(0.5, vec![kick(0.0)], vec![], vec![]);
        let (l, _) = render(style, 4, None);
        let found = onsets(&l, 0.1);
        assert_eq!(found.len(), 4, "one kick per bar, got {found:?}");
        for i in 0..4 {
            assert!(
                near(&found, i * 96_000),
                "bar {} downbeat: {found:?}",
                i + 1
            );
        }
    }

    #[test]
    fn loop_wrap_replays_the_loop_start_downbeat() {
        let style = style_with(0.5, vec![kick(0.0)], vec![], vec![]);
        // Loop bars 1..2 (two bars), render four bars of time: expect 4 kicks.
        let (l, _) = render(style, 4, Some((1, 3)));
        let found = onsets(&l, 0.1);
        assert_eq!(found.len(), 4, "downbeat after each wrap, got {found:?}");
    }

    #[test]
    fn bass_notes_get_a_note_off_from_dur_beats() {
        let style = style_with(
            0.5,
            vec![],
            vec![BassNote {
                degree: 1,
                octave: 0,
                at_beats: 0.0,
                dur_beats: 1.0,
                velocity: 0.9,
            }],
            vec![],
        );
        let sr = 48_000;
        let mut seq = BandSequencer::new(style, sr, 1);
        let spb = 24_000.0;
        let mut l = vec![0.0f32; 12_000];
        let mut r = vec![0.0f32; 12_000];
        let span = Span {
            offset: 0,
            frames: 12_000,
            start_beats: 0.0,
        };
        seq.render_span(&span, spb, 4.0, &mut l, &mut r);
        assert_eq!(seq.synth.sustaining_voices(CH_BASS), 1);
        assert_eq!(seq.pending_note_offs.len(), 1);
        // Advance past the note-off (0.92 beats).
        let span2 = Span {
            offset: 0,
            frames: 12_000,
            start_beats: 0.5,
        };
        seq.render_span(&span2, spb, 4.0, &mut l, &mut r);
        assert_eq!(seq.pending_note_offs.len(), 0);
        assert_eq!(seq.synth.sustaining_voices(CH_BASS), 0);
    }

    fn drum_count(events: &[SpanEvent]) -> usize {
        events
            .iter()
            .filter(|e| matches!(e.kind, SpanEventKind::Drum { .. }))
            .count()
    }

    #[test]
    fn humanize_can_place_a_downbeat_in_the_next_span() {
        let mut style = style_with(0.5, vec![kick(0.0)], vec![], vec![]);
        style.humanize.timing_ms = 10.0;
        let sr = 48_000;
        let spb = 24_000.0;
        let frames = 256;
        let span = frames as f64 / spb;
        for seed in 0..800u64 {
            let mut seq = BandSequencer::new(style.clone(), sr, seed);
            let mut first = Vec::new();
            let mut second = Vec::new();
            seq.collect_pattern_events(0.0, span, spb, 4.0, frames, &mut first);
            seq.collect_pattern_events(span, span * 2.0, spb, 4.0, frames, &mut second);
            if drum_count(&first) == 0 && drum_count(&second) == 1 {
                return;
            }
        }
        panic!("no seed placed the downbeat after the first 256-frame span");
    }

    #[test]
    fn humanize_can_place_a_span_start_hit_in_the_previous_span() {
        let sr = 48_000;
        let spb = 24_000.0;
        let frames = 256;
        let span = frames as f64 / spb;
        let mut style = style_with(0.5, vec![kick(span)], vec![], vec![]);
        style.humanize.timing_ms = 10.0;
        for seed in 0..800u64 {
            let mut seq = BandSequencer::new(style.clone(), sr, seed);
            let mut first = Vec::new();
            let mut second = Vec::new();
            seq.collect_pattern_events(0.0, span, spb, 4.0, frames, &mut first);
            seq.collect_pattern_events(span, span * 2.0, spb, 4.0, frames, &mut second);
            if drum_count(&first) == 1 && drum_count(&second) == 0 {
                return;
            }
        }
        panic!("no seed pulled the span-start kick into the previous span");
    }

    #[test]
    fn humanize_is_deterministic_per_seed() {
        let mut style = style_with(0.5, vec![kick(0.0), kick(1.0)], vec![], vec![]);
        style.humanize.timing_ms = 8.0;
        let collect = |seed: u64| {
            let mut seq = BandSequencer::new(style.clone(), 48_000, seed);
            let mut events = Vec::new();
            seq.collect_pattern_events(0.0, 4.0, 24_000.0, 4.0, 96_000, &mut events);
            events
                .into_iter()
                .filter_map(|e| match e.kind {
                    SpanEventKind::Drum { .. } => Some(e.offset),
                    _ => None,
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(collect(7), collect(7));
        assert_ne!(collect(7), collect(8));
    }

    #[test]
    fn comp_follows_split_bar_chords() {
        use jam_core::chart::{BarChord, ResolvedBar, ResolvedChart};
        let style = style_with(
            0.5,
            vec![],
            vec![
                BassNote {
                    degree: 1,
                    octave: 0,
                    at_beats: 0.0,
                    dur_beats: 0.5,
                    velocity: 0.9,
                },
                BassNote {
                    degree: 1,
                    octave: 0,
                    at_beats: 2.0,
                    dur_beats: 0.5,
                    velocity: 0.9,
                },
            ],
            vec![],
        );
        let mut seq = BandSequencer::new(style, 48_000, 1);
        seq.load_chart(ResolvedChart {
            id: "x".into(),
            name: "x".into(),
            key_tonic: 0,
            time_sig: (4, 4),
            default_bpm: 120.0,
            bars: vec![ResolvedBar {
                bar_index: 1,
                section_id: "a".into(),
                section_name: "A".into(),
                chords: vec![
                    BarChord {
                        chord: "C".into(),
                        beats: 2.0,
                    },
                    BarChord {
                        chord: "G".into(),
                        beats: 2.0,
                    },
                ],
            }],
        });
        let mut events = Vec::new();
        seq.collect_pattern_events(0.0, 4.0, 24_000.0, 4.0, 96_000, &mut events);
        let keys: Vec<u8> = events
            .iter()
            .filter_map(|e| match &e.kind {
                SpanEventKind::NoteOn { key, .. } => Some(*key),
                _ => None,
            })
            .collect();
        assert_eq!(keys.len(), 2);
        assert_eq!(
            (keys[1] as i32 - keys[0] as i32).rem_euclid(12),
            7,
            "C then G"
        );
    }

    #[test]
    fn slash_bass_plays_the_written_note() {
        use jam_core::chart::{BarChord, ResolvedBar, ResolvedChart};
        let style = style_with(
            0.0,
            vec![],
            vec![BassNote {
                degree: 1,
                octave: 0,
                at_beats: 0.0,
                dur_beats: 0.5,
                velocity: 0.9,
            }],
            vec![],
        );
        let bar = |chord: &str| ResolvedBar {
            bar_index: 1,
            section_id: "a".into(),
            section_name: "A".into(),
            chords: vec![BarChord {
                chord: chord.into(),
                beats: 4.0,
            }],
        };
        let key_of = |chord: &str| {
            let mut seq = BandSequencer::new(style.clone(), 48_000, 1);
            seq.load_chart(ResolvedChart {
                id: "slash".into(),
                name: "slash".into(),
                key_tonic: 0,
                time_sig: (4, 4),
                default_bpm: 120.0,
                bars: vec![bar(chord)],
            });
            let mut events = Vec::new();
            seq.collect_pattern_events(0.0, 4.0, 24_000.0, 4.0, 96_000, &mut events);
            events.iter().find_map(|e| match &e.kind {
                SpanEventKind::NoteOn { key, .. } => Some(*key),
                _ => None,
            })
        };
        let c = key_of("C").expect("C bass");
        let ce = key_of("C/E").expect("C/E bass");
        assert_eq!((c as i32) % 12, 0, "C is still C");
        assert_eq!((ce as i32) % 12, 4, "C/E bass is E");
    }

    #[test]
    fn rest_bar_skips_bass_and_comp_but_keeps_drums() {
        use jam_core::chart::{BarChord, ResolvedBar, ResolvedChart};
        let style = style_with(
            0.0,
            vec![kick(0.0)],
            vec![BassNote {
                degree: 1,
                octave: 0,
                at_beats: 0.0,
                dur_beats: 0.5,
                velocity: 0.9,
            }],
            vec![CompStrum {
                at_beats: 0.0,
                dur_beats: 1.0,
                velocity: 0.8,
                direction: "down".into(),
            }],
        );
        let mut seq = BandSequencer::new(style, 48_000, 1);
        let bar = |i: u32, chord: &str| ResolvedBar {
            bar_index: i,
            section_id: "a".into(),
            section_name: "A".into(),
            chords: vec![BarChord {
                chord: chord.into(),
                beats: 4.0,
            }],
        };
        seq.load_chart(ResolvedChart {
            id: "nc".into(),
            name: "nc".into(),
            key_tonic: 9,
            time_sig: (4, 4),
            default_bpm: 120.0,
            bars: vec![bar(1, "A7"), bar(2, "N.C."), bar(3, "A7")],
        });
        let mut events = Vec::new();
        seq.collect_pattern_events(0.0, 12.0, 24_000.0, 4.0, 288_000, &mut events);

        let mut drums = [0usize; 3];
        let mut pitched = [0usize; 3];
        for e in &events {
            let bar_i = (e.offset / 96_000).min(2);
            match &e.kind {
                SpanEventKind::Drum { .. } => drums[bar_i] += 1,
                SpanEventKind::NoteOn { .. } => pitched[bar_i] += 1,
                SpanEventKind::NoteOff { .. } => {}
            }
        }
        assert!(
            drums.iter().all(|&n| n > 0),
            "drums should keep time through the rest: {drums:?}"
        );
        assert!(pitched[0] > 0 && pitched[2] > 0, "A7 bars: {pitched:?}");
        assert_eq!(pitched[1], 0, "N.C. bar must not voice bass or comp");
    }

    #[test]
    fn stop_cue_breaks_and_fill_brings_band_back() {
        let style = style_with(0.5, vec![kick(0.0), kick(2.0)], vec![], vec![]);
        let mut seq = BandSequencer::new(style, 48_000, 1);
        seq.cue(Cue::Stop);
        seq.handle_timeline_event(&TimelineEvent::Bar {
            bar: 2,
            is_count_in: false,
        });
        assert!(seq.is_stopped);
        seq.cue(Cue::Fill);
        seq.handle_timeline_event(&TimelineEvent::Bar {
            bar: 3,
            is_count_in: false,
        });
        assert!(!seq.is_stopped);
    }

    #[test]
    fn ending_cue_completes_after_one_bar() {
        let mut style = style_with(0.5, vec![kick(0.0)], vec![], vec![]);
        style.endings.push(DrumPattern {
            length_beats: 4.0,
            hits: vec![kick(0.0)],
        });
        let mut seq = BandSequencer::new(style, 48_000, 1);
        seq.cue(Cue::Ending);
        seq.handle_timeline_event(&TimelineEvent::Bar {
            bar: 5,
            is_count_in: false,
        });
        assert!(!seq.take_ending_complete());
        seq.handle_timeline_event(&TimelineEvent::Bar {
            bar: 6,
            is_count_in: false,
        });
        assert!(seq.take_ending_complete());
        assert!(seq.is_stopped);
        assert!(!seq.take_ending_complete(), "flag is consumed once");
    }

    #[test]
    fn muted_parts_stay_silent_and_render_is_deterministic() {
        let style = style_with(
            0.5,
            vec![kick(0.0), kick(1.0)],
            vec![BassNote {
                degree: 1,
                octave: 0,
                at_beats: 0.0,
                dur_beats: 1.0,
                velocity: 0.9,
            }],
            vec![CompStrum {
                at_beats: 0.0,
                dur_beats: 2.0,
                velocity: 0.7,
                direction: "down".into(),
            }],
        );
        let mut seq = BandSequencer::new(style.clone(), 48_000, 42);
        seq.set_parts(true, true, true);
        let span = Span {
            offset: 0,
            frames: 4096,
            start_beats: 0.0,
        };
        let mut l = vec![0.0f32; 4096];
        let mut r = vec![0.0f32; 4096];
        seq.render_span(&span, 24_000.0, 4.0, &mut l, &mut r);
        assert!(l.iter().all(|&s| s == 0.0));

        let (a, _) = render(style.clone(), 2, None);
        let (b, _) = render(style, 2, None);
        assert_eq!(a, b);
    }
}
