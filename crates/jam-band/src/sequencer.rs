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
use crate::voicing::{bass_note_for_chord, parse_chord, voice_chord};
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

#[derive(Debug, Clone, Copy)]
struct PendingNoteOff {
    at_beats: f64,
    channel: u8,
    key: u8,
}

pub struct BandSequencer {
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
    /// Position (absolute beats) up to which pattern events have been scheduled.
    cursor_beats: Option<f64>,
    sample_rate: u32,
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
            cursor_beats: None,
            sample_rate,
        };
        seq.update_pattern_for_intensity();
        seq
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
        let (c, n) = chart.chord_at(1, 1);
        self.current_chord = c;
        self.next_chord = n;
        self.current_section = chart
            .section_at(1)
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
        self.sampler.all_off();
        self.synth.all_notes_off();
        self.pending_note_offs.clear();
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

    fn render_tails(&mut self, left: &mut [f32], right: &mut [f32]) {
        if left.is_empty() {
            return;
        }
        self.sampler.render(left, right);
        self.synth.render(left, right);
    }

    fn fire(&mut self, kind: SpanEventKind) {
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

    fn humanize_offset(&mut self, nominal: f64, frames: usize) -> usize {
        let jitter_samples = self.style.humanize.timing_ms as f64 * 1e-3 * self.sample_rate as f64;
        let jitter = if jitter_samples > 0.0 {
            (self.rng.gen::<f64>() - 0.5) * 2.0 * jitter_samples
        } else {
            0.0
        };
        (nominal + jitter).round().clamp(0.0, (frames - 1) as f64) as usize
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

        if !self.mute_drums {
            let len = pattern.drums.length_beats;
            for hit in &pattern.drums.hits {
                if !self.sampler.has_instrument(&hit.instrument) {
                    continue;
                }
                let at = self.swung(hit.at_beats);
                for t in Self::occurrences(at, len, start, end) {
                    if let Some(p) = hit.prob {
                        if self.rng.gen::<f32>() > p {
                            continue;
                        }
                    }
                    let nominal = (t - start) * samples_per_beat;
                    let offset = self.humanize_offset(nominal, frames);
                    let velocity = self.humanize_velocity(hit.velocity);
                    events.push(SpanEvent {
                        offset,
                        kind: SpanEventKind::Drum {
                            instrument: hit.instrument.clone(),
                            velocity,
                        },
                    });
                }
            }
        }

        if !self.mute_bass {
            let len = pattern.bass.length_beats;
            for note in &pattern.bass.notes {
                let at = self.swung(note.at_beats);
                for t in Self::occurrences(at, len, start, end) {
                    let chord = self.chord_at_abs_beats(t, beats_per_bar);
                    let (root, quality) = parse_chord(&chord);
                    let key = bass_note_for_chord(root, quality, note.degree, note.octave);
                    let nominal = (t - start) * samples_per_beat;
                    let offset = self.humanize_offset(nominal, frames);
                    let velocity = self.humanize_velocity(note.velocity);
                    let dur = note.dur_beats.max(0.05);
                    events.push(SpanEvent {
                        offset,
                        kind: SpanEventKind::NoteOn {
                            channel: CH_BASS,
                            key,
                            velocity,
                            off_at_beats: t + dur * 0.92,
                        },
                    });
                }
            }
        }

        if !self.mute_comp {
            let len = pattern.comp.length_beats;
            let spread = (STRUM_SPREAD_SECS * self.sample_rate as f64) as usize;
            for strum in &pattern.comp.strums {
                let at = self.swung(strum.at_beats);
                for t in Self::occurrences(at, len, start, end) {
                    let chord = self.chord_at_abs_beats(t, beats_per_bar);
                    let mut notes = voice_chord(&chord, &pattern.comp.voicing);
                    if strum.direction == "up" {
                        notes.reverse();
                    }
                    let nominal = (t - start) * samples_per_beat;
                    let base_offset = self.humanize_offset(nominal, frames);
                    let velocity = self.humanize_velocity(strum.velocity);
                    let dur = strum.dur_beats.max(0.05);
                    for (i, key) in notes.into_iter().enumerate() {
                        events.push(SpanEvent {
                            offset: (base_offset + i * spread).min(frames - 1),
                            kind: SpanEventKind::NoteOn {
                                channel: CH_COMP,
                                key,
                                velocity,
                                off_at_beats: t + dur * 0.9,
                            },
                        });
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
