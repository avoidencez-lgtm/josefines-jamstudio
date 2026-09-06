//! timeline: Pure timeline conversion math between samples, beats, bars and time.
//! Includes Transport state machine, count-in sequencer, and sample-accurate looping.

use serde::{Deserialize, Serialize};

pub const SAMPLE_RATE: u32 = 48_000;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct TempoPoint {
    pub bpm: f64,
    pub time_signature: (u8, u8),
}

impl Default for TempoPoint {
    fn default() -> Self {
        Self {
            bpm: 120.0,
            time_signature: (4, 4),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
pub struct Position {
    pub samples: u64,
    pub beats: f64,
    pub bar: u32,
    pub beat: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum TransportState {
    #[default]
    Stopped,
    CountingIn {
        bar: u32,
        beat: u32,
        total_bars: u32,
    },
    Playing,
    Paused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimelineEvent {
    /// A beat boundary. `offset` is the frame inside the current render block at
    /// which the beat lands, so clicks and cues can be placed sample-accurately.
    Beat {
        bar: u32,
        beat: u32,
        is_count_in: bool,
        offset: usize,
    },
    Bar {
        bar: u32,
        is_count_in: bool,
    },
    CountInComplete,
    LoopWrapped {
        from_sample: u64,
        to_sample: u64,
    },
}

/// A contiguous stretch of playing time inside one render block.
///
/// `offset` and `frames` address the output block; `start_beats` is the absolute
/// song position (in beats from bar 1) at `offset`. A block that crosses a loop
/// boundary yields two spans; a block that finishes a count-in yields one span
/// covering only the surplus after the count-in.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Span {
    pub offset: usize,
    pub frames: usize,
    pub start_beats: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Timeline {
    pub sample_rate: u32,
    pub bpm: f64,
    pub time_signature: (u8, u8),
    pub state: TransportState,
    pub current_sample: u64,
    pub count_in_bars: u32,
    count_in_sample: u64,
    pub loop_enabled: bool,
    pub loop_start_bar: u32,
    pub loop_end_bar: u32,
}

impl Default for Timeline {
    fn default() -> Self {
        Self::new(SAMPLE_RATE, 120.0, (4, 4))
    }
}

impl Timeline {
    pub fn new(sample_rate: u32, bpm: f64, time_signature: (u8, u8)) -> Self {
        Self {
            sample_rate,
            bpm,
            time_signature,
            state: TransportState::Stopped,
            current_sample: 0,
            count_in_bars: 1,
            count_in_sample: 0,
            loop_enabled: false,
            loop_start_bar: 1,
            loop_end_bar: 5, // 4-bar loop by default (bars 1..4, ends at start of bar 5)
        }
    }

    /// Changes tempo while keeping the musical position (bar and beat) fixed, so a
    /// live tempo nudge never makes the band jump to a different place in the chart.
    pub fn set_bpm(&mut self, bpm: f64) {
        let new_bpm = bpm.clamp(20.0, 300.0);
        if (new_bpm - self.bpm).abs() < f64::EPSILON {
            return;
        }
        let beats = samples_to_beats(self.current_sample, self.bpm, self.sample_rate);
        let count_in_beats = samples_to_beats(self.count_in_sample, self.bpm, self.sample_rate);
        self.bpm = new_bpm;
        self.current_sample = beats_to_samples(beats, self.bpm, self.sample_rate);
        self.count_in_sample = beats_to_samples(count_in_beats, self.bpm, self.sample_rate);
    }

    pub fn set_time_signature(&mut self, ts: (u8, u8)) {
        if ts.0 == 0 || ts.1 == 0 || ts == self.time_signature {
            return;
        }
        self.time_signature = ts;
        // Count-in length is `samples_per_bar() * total_bars` from the *current*
        // meter. A shorter meter can make `count_in_sample` already past the new
        // end, so the surplus in this block exceeds `frames` and
        // `frames - surplus` underflows (#128). Restart so the clicks match
        // the loaded chart.
        if let TransportState::CountingIn { total_bars, .. } = self.state {
            self.count_in_sample = 0;
            self.state = TransportState::CountingIn {
                bar: 1,
                beat: 1,
                total_bars,
            };
        }
    }

    pub fn set_loop(&mut self, start_bar: u32, end_bar: u32, enabled: bool) {
        // start + 1 must stay in u32: startBar = u32::MAX from IPC used to
        // overflow (debug panic, release wraps and disables the loop).
        let start = start_bar.clamp(1, u32::MAX - 1);
        self.loop_start_bar = start;
        self.loop_end_bar = end_bar.max(start.saturating_add(1));
        self.loop_enabled = enabled;
    }

    pub fn set_count_in(&mut self, bars: u32) {
        self.count_in_bars = bars;
    }

    pub fn play(&mut self) {
        match self.state {
            TransportState::Paused => {
                self.state = TransportState::Playing;
            }
            TransportState::Stopped => {
                if self.count_in_bars > 0 {
                    self.state = TransportState::CountingIn {
                        bar: 1,
                        beat: 1,
                        total_bars: self.count_in_bars,
                    };
                    self.count_in_sample = 0;
                } else {
                    self.state = TransportState::Playing;
                }
            }
            _ => {}
        }
    }

    pub fn pause(&mut self) {
        if matches!(
            self.state,
            TransportState::Playing | TransportState::CountingIn { .. }
        ) {
            self.state = TransportState::Paused;
        }
    }

    pub fn stop(&mut self) {
        self.state = TransportState::Stopped;
        self.current_sample = 0;
        self.count_in_sample = 0;
    }

    pub fn seek_bar(&mut self, bar: u32) {
        let b = bar.max(1) - 1;
        let beats_per_bar = self.time_signature.0 as f64;
        let target_beats = b as f64 * beats_per_bar;
        self.current_sample = beats_to_samples(target_beats, self.bpm, self.sample_rate);
    }

    pub fn seek_sample(&mut self, sample: u64) {
        self.current_sample = sample;
    }

    pub fn samples_per_beat(&self) -> f64 {
        let beat_duration_sec = 60.0 / self.bpm;
        beat_duration_sec * self.sample_rate as f64
    }

    pub fn samples_per_bar(&self) -> u64 {
        let beats_per_bar = self.time_signature.0 as f64;
        (self.samples_per_beat() * beats_per_bar).round() as u64
    }

    pub fn current_position(&self) -> Position {
        let beats = samples_to_beats(self.current_sample, self.bpm, self.sample_rate);
        let (bar, beat) = bar_beat_at(beats, self.time_signature);
        Position {
            samples: self.current_sample,
            beats,
            bar,
            beat,
        }
    }

    /// Advance the timeline by `frames`. Returns any triggered timeline events (beats, bars, loop wrap).
    pub fn advance(&mut self, frames: usize) -> Vec<TimelineEvent> {
        self.advance_with_spans(frames).0
    }

    /// Advance the timeline by `frames`, returning both the beat-level events and the
    /// sample-accurate playing spans the band must render for this block.
    ///
    /// Beat boundaries are detected on the half-open sample range `[start, end)`, so the
    /// very first downbeat (sample 0) and the downbeat right after a loop wrap are both
    /// reported exactly once.
    pub fn advance_with_spans(&mut self, frames: usize) -> (Vec<TimelineEvent>, Vec<Span>) {
        let mut events = Vec::new();
        let mut spans = Vec::new();

        match self.state {
            TransportState::CountingIn { total_bars, .. } => {
                let beats_per_bar = self.time_signature.0 as u32;
                let start_sample = self.count_in_sample;
                let end_sample = start_sample + frames as u64;
                let total_count_in_samples = self.samples_per_bar() * total_bars as u64;
                let clipped_end = end_sample.min(total_count_in_samples);

                let spb = self.samples_per_beat();
                for b_idx in self.beat_indices_in(start_sample, clipped_end) {
                    let count_bar = (b_idx / beats_per_bar) + 1;
                    let count_beat = (b_idx % beats_per_bar) + 1;
                    if count_bar <= total_bars {
                        self.state = TransportState::CountingIn {
                            bar: count_bar,
                            beat: count_beat,
                            total_bars,
                        };
                        let beat_sample = (b_idx as f64 * spb).round() as u64;
                        events.push(TimelineEvent::Beat {
                            bar: count_bar,
                            beat: count_beat,
                            is_count_in: true,
                            offset: beat_sample.saturating_sub(start_sample) as usize,
                        });
                        if count_beat == 1 {
                            events.push(TimelineEvent::Bar {
                                bar: count_bar,
                                is_count_in: true,
                            });
                        }
                    }
                }

                if end_sample >= total_count_in_samples {
                    self.state = TransportState::Playing;
                    events.push(TimelineEvent::CountInComplete);
                    // Keep the pre-count-in playhead (seek / practice range).
                    // After Stop the playhead is 0; come in at the loop start
                    // when a loop is armed, instead of always bar 1 (#134).
                    if self.current_sample == 0 && self.loop_enabled {
                        self.seek_bar(self.loop_start_bar);
                    }
                    self.count_in_sample = 0;

                    let surplus = end_sample
                        .saturating_sub(total_count_in_samples)
                        .min(frames as u64) as usize;
                    if surplus > 0 {
                        let block_offset = frames.saturating_sub(surplus);
                        let (sub_events, sub_spans) = self.advance_with_spans(surplus);
                        events.extend(sub_events.into_iter().map(|e| match e {
                            TimelineEvent::Beat {
                                bar,
                                beat,
                                is_count_in,
                                offset,
                            } => TimelineEvent::Beat {
                                bar,
                                beat,
                                is_count_in,
                                offset: offset + block_offset,
                            },
                            other => other,
                        }));
                        spans.extend(sub_spans.into_iter().map(|s| Span {
                            offset: s.offset + block_offset,
                            ..s
                        }));
                    }
                } else {
                    self.count_in_sample = end_sample;
                }
            }

            TransportState::Playing => {
                let mut remaining = frames;
                let mut block_offset = 0usize;

                while remaining > 0 {
                    let start_sample = self.current_sample;
                    let mut segment_end = start_sample + remaining as u64;
                    let mut wrap_to: Option<u64> = None;

                    if self.loop_enabled {
                        let spb_u = self.samples_per_bar();
                        let loop_start_sample = (self.loop_start_bar - 1) as u64 * spb_u;
                        let loop_end_sample = (self.loop_end_bar - 1) as u64 * spb_u;
                        if loop_end_sample > loop_start_sample {
                            if start_sample >= loop_end_sample {
                                // Loop was enabled while already past its end: jump back first.
                                events.push(TimelineEvent::LoopWrapped {
                                    from_sample: start_sample,
                                    to_sample: loop_start_sample,
                                });
                                self.current_sample = loop_start_sample;
                                continue;
                            }
                            if segment_end >= loop_end_sample {
                                segment_end = loop_end_sample;
                                wrap_to = Some(loop_start_sample);
                            }
                        }
                    }

                    let seg_frames = (segment_end - start_sample) as usize;
                    self.emit_beats(start_sample, segment_end, block_offset, &mut events);
                    if seg_frames > 0 {
                        spans.push(Span {
                            offset: block_offset,
                            frames: seg_frames,
                            start_beats: samples_to_beats(start_sample, self.bpm, self.sample_rate),
                        });
                    }
                    block_offset += seg_frames;
                    remaining -= seg_frames;

                    if let Some(target) = wrap_to {
                        events.push(TimelineEvent::LoopWrapped {
                            from_sample: segment_end,
                            to_sample: target,
                        });
                        self.current_sample = target;
                    } else {
                        self.current_sample = segment_end;
                    }
                }
            }

            TransportState::Stopped | TransportState::Paused => {}
        }

        (events, spans)
    }

    /// Beat indices `b` whose boundary sample `b * samples_per_beat` lies in `[start, end)`.
    fn beat_indices_in(&self, start: u64, end: u64) -> std::ops::Range<u32> {
        if end <= start {
            return 0..0;
        }
        let spb = self.samples_per_beat();
        let first = (start as f64 / spb).ceil() as u32;
        let last_exclusive = (end as f64 / spb).ceil() as u32;
        first..last_exclusive
    }

    fn emit_beats(
        &self,
        start: u64,
        end: u64,
        block_offset: usize,
        events: &mut Vec<TimelineEvent>,
    ) {
        let beats_per_bar = self.time_signature.0 as u32;
        let spb = self.samples_per_beat();
        for b_idx in self.beat_indices_in(start, end) {
            let cur_bar = (b_idx / beats_per_bar) + 1;
            let cur_beat = (b_idx % beats_per_bar) + 1;
            let beat_sample = (b_idx as f64 * spb).round() as u64;
            events.push(TimelineEvent::Beat {
                bar: cur_bar,
                beat: cur_beat,
                is_count_in: false,
                offset: block_offset + beat_sample.saturating_sub(start) as usize,
            });
            if cur_beat == 1 {
                events.push(TimelineEvent::Bar {
                    bar: cur_bar,
                    is_count_in: false,
                });
            }
        }
    }
}

pub fn beats_to_samples(beats: f64, bpm: f64, sample_rate: u32) -> u64 {
    if bpm <= 0.0 {
        return 0;
    }
    let seconds = (beats * 60.0) / bpm;
    (seconds * sample_rate as f64).round() as u64
}

pub fn samples_to_beats(samples: u64, bpm: f64, sample_rate: u32) -> f64 {
    if sample_rate == 0 || bpm <= 0.0 {
        return 0.0;
    }
    let seconds = samples as f64 / sample_rate as f64;
    (seconds * bpm) / 60.0
}

pub fn bar_beat_at(beats: f64, time_sig: (u8, u8)) -> (u32, u32) {
    let beats_per_bar = time_sig.0 as f64;
    let total_beats = beats.max(0.0);
    let bar = (total_beats / beats_per_bar).floor() as u32 + 1;
    let beat = (total_beats % beats_per_bar).floor() as u32 + 1;
    (bar, beat)
}

pub fn next_bar_boundary(samples: u64, bpm: f64, time_sig: (u8, u8), sample_rate: u32) -> u64 {
    let current_beats = samples_to_beats(samples, bpm, sample_rate);
    let beats_per_bar = time_sig.0 as f64;
    let current_bar = (current_beats / beats_per_bar).floor();
    let next_bar_beats = (current_bar + 1.0) * beats_per_bar;
    beats_to_samples(next_bar_beats, bpm, sample_rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_beats_samples_roundtrip() {
        let bpm = 120.0;
        let rate = 48_000;
        let beats = 4.0;
        let samples = beats_to_samples(beats, bpm, rate);
        assert_eq!(samples, 96_000); // 4 beats @ 120 bpm = 2.0s = 96,000 samples
        let calc_beats = samples_to_beats(samples, bpm, rate);
        assert!((calc_beats - beats).abs() < 1e-6);
    }

    #[test]
    fn test_bar_beat_calculation() {
        assert_eq!(bar_beat_at(0.0, (4, 4)), (1, 1));
        assert_eq!(bar_beat_at(3.5, (4, 4)), (1, 4));
        assert_eq!(bar_beat_at(4.0, (4, 4)), (2, 1));
        assert_eq!(bar_beat_at(7.9, (4, 4)), (2, 4));
    }

    #[test]
    fn test_count_in_state_machine() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(1); // 1 bar count-in = 4 beats = 96,000 samples
        tl.play();

        assert!(matches!(tl.state, TransportState::CountingIn { .. }));

        // Advance by half a bar (48,000 samples)
        let ev1 = tl.advance(48_000);
        assert!(matches!(
            tl.state,
            TransportState::CountingIn { bar: 1, .. }
        ));
        assert!(!ev1.contains(&TimelineEvent::CountInComplete));

        // Advance by remaining half bar (48,000 samples)
        let ev2 = tl.advance(48_000);
        assert_eq!(tl.state, TransportState::Playing);
        assert!(ev2.contains(&TimelineEvent::CountInComplete));
    }

    #[test]
    fn count_in_keeps_the_seek_position() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(1);
        tl.seek_bar(9);
        tl.play();
        tl.advance(96_000);
        assert_eq!(tl.state, TransportState::Playing);
        assert_eq!(tl.current_position().bar, 9);
    }

    #[test]
    fn count_in_comes_in_at_the_loop_start_when_stopped_at_the_top() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(1);
        tl.set_loop(5, 9, true);
        tl.play();
        tl.advance(96_000);
        assert_eq!(tl.state, TransportState::Playing);
        assert_eq!(tl.current_position().bar, 5);
    }

    #[test]
    fn count_in_surplus_renders_the_current_seek_once_at_the_correct_offset() {
        for destination in [5, 9] {
            let mut tl = Timeline::new(48_000, 120.0, (4, 4));
            tl.seek_bar(9);
            tl.play();
            assert!(tl.advance_with_spans(95_900).1.is_empty());
            tl.play(); // Repeated Play cannot restart an active count-in.
            if destination == 5 {
                tl.seek_bar(5); // A later seek replaces the destination.
            }
            let (events, spans) = tl.advance_with_spans(256);
            assert_eq!(
                spans,
                vec![Span {
                    offset: 100,
                    frames: 156,
                    start_beats: f64::from((destination - 1) * 4),
                }]
            );
            assert_eq!(
                events
                    .iter()
                    .filter(|e| **e == TimelineEvent::CountInComplete)
                    .count(),
                1
            );
            assert!(events.contains(&TimelineEvent::Beat {
                bar: destination,
                beat: 1,
                is_count_in: false,
                offset: 100,
            }));
            assert_eq!(tl.current_sample, u64::from(destination - 1) * 96_000 + 156);
            assert!(tl.advance(256).is_empty());
        }
    }

    #[test]
    fn shrinking_the_meter_during_count_in_does_not_panic() {
        let mut tl = Timeline::new(48_000, 120.0, (6, 8));
        tl.set_count_in(1);
        tl.play();

        // Five elapsed beats exceed the new four-beat duration: the old code
        // underflowed the next block offset here (exactly four beats did not).
        tl.advance(120_000);

        tl.set_time_signature((4, 4));
        assert_eq!(
            tl.state,
            TransportState::CountingIn {
                bar: 1,
                beat: 1,
                total_bars: 1
            }
        );
        let (events, spans) = tl.advance_with_spans(95_900);
        assert!(spans.is_empty());
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(
                    e,
                    TimelineEvent::Beat {
                        is_count_in: true,
                        ..
                    }
                ))
                .count(),
            4
        );
        let (events, spans) = tl.advance_with_spans(256);
        assert_eq!(tl.state, TransportState::Playing);
        assert_eq!(tl.current_sample, 156);
        assert_eq!(
            spans,
            vec![Span {
                offset: 100,
                frames: 156,
                start_beats: 0.0
            }]
        );
        assert_eq!(
            events
                .iter()
                .filter(|e| **e == TimelineEvent::CountInComplete)
                .count(),
            1
        );
        assert!(events.contains(&TimelineEvent::Beat {
            bar: 1,
            beat: 1,
            is_count_in: false,
            offset: 100
        }));
        assert!(!tl.advance(256).contains(&TimelineEvent::CountInComplete));
    }

    #[test]
    fn same_or_invalid_meter_does_not_restart_count_in() {
        let mut tl = Timeline::new(48_000, 120.0, (6, 8));
        tl.play();
        tl.advance(120_000);
        let state = tl.state;
        for meter in [(6, 8), (0, 4), (4, 0)] {
            tl.set_time_signature(meter);
            assert_eq!(tl.state, state);
            assert_eq!(tl.count_in_sample, 120_000);
            assert_eq!(tl.time_signature, (6, 8));
        }
    }

    #[test]
    fn test_sample_accurate_loop_wraparound() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(0);
        tl.set_loop(1, 3, true); // Loop bars 1 & 2: ends at start of bar 3 = 192,000 samples
        tl.play();

        // Advance 191,000 samples
        tl.advance(191_000);
        assert_eq!(tl.current_sample, 191_000);

        // Advance 2,000 samples -> crosses 192,000 boundary, wrapping to 0 + 1,000 = 1,000
        let ev = tl.advance(2_000);
        assert_eq!(tl.current_sample, 1_000);
        assert!(ev.iter().any(|e| matches!(
            e,
            TimelineEvent::LoopWrapped {
                from_sample: 192_000,
                to_sample: 0
            }
        )));
    }

    #[test]
    fn test_ten_minute_playback_zero_drift() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(0);
        tl.play();

        // 10 minutes @ 48 kHz = 600 seconds * 48000 = 28,800,000 samples
        let total_samples = 28_800_000u64;
        let chunk_size = 256;
        let iterations = total_samples / chunk_size;

        for _ in 0..iterations {
            tl.advance(chunk_size as usize);
        }

        assert_eq!(tl.current_sample, total_samples);
        let pos = tl.current_position();
        assert_eq!(pos.samples, total_samples);
        // 10 minutes @ 120 bpm = 1200 beats = 300 bars
        assert!((pos.beats - 1200.0).abs() < 1e-6);
        assert_eq!(pos.bar, 301); // 1-indexed, starting bar 301 beat 1
        assert_eq!(pos.beat, 1);
    }

    #[test]
    fn first_downbeat_is_emitted_exactly_once() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(0);
        tl.play();
        let ev = tl.advance(256);
        let downbeats = ev
            .iter()
            .filter(|e| matches!(e, TimelineEvent::Bar { bar: 1, .. }))
            .count();
        assert_eq!(downbeats, 1, "bar 1 downbeat must fire on the first block");
        let ev2 = tl.advance(256);
        assert!(ev2.is_empty(), "no boundary lies inside the second block");
    }

    #[test]
    fn count_in_emits_its_first_click() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(1);
        tl.play();
        let ev = tl.advance(256);
        assert!(ev.contains(&TimelineEvent::Beat {
            bar: 1,
            beat: 1,
            is_count_in: true,
            offset: 0,
        }));
    }

    #[test]
    fn beat_offsets_are_block_relative() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(0);
        tl.play();
        tl.advance(23_900); // 100 frames before beat 2 (24_000)
        let ev = tl.advance(256);
        assert!(ev.contains(&TimelineEvent::Beat {
            bar: 1,
            beat: 2,
            is_count_in: false,
            offset: 100,
        }));
    }

    #[test]
    fn count_in_surplus_beat_offset_includes_block_offset() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(1);
        tl.play();
        tl.advance(95_000);
        let ev = tl.advance(2_000);
        assert!(ev.contains(&TimelineEvent::Beat {
            bar: 1,
            beat: 1,
            is_count_in: false,
            offset: 1_000,
        }));
    }

    #[test]
    fn loop_wrap_splits_span_and_fires_loop_start_downbeat() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(0);
        tl.set_loop(1, 3, true); // ends at sample 192_000
        tl.play();
        tl.advance(191_000);
        let (ev, spans) = tl.advance_with_spans(2_000);
        assert_eq!(spans.len(), 2);
        assert_eq!(spans[0].offset, 0);
        assert_eq!(spans[0].frames, 1_000);
        assert_eq!(spans[1].offset, 1_000);
        assert_eq!(spans[1].frames, 1_000);
        assert!((spans[1].start_beats - 0.0).abs() < 1e-9);
        assert!(ev.contains(&TimelineEvent::Bar {
            bar: 1,
            is_count_in: false
        }));
        assert!(!ev.contains(&TimelineEvent::Bar {
            bar: 3,
            is_count_in: false
        }));
    }

    #[test]
    fn count_in_surplus_span_is_offset_into_block() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(1); // 96_000 samples
        tl.play();
        tl.advance(95_000);
        let (ev, spans) = tl.advance_with_spans(2_000);
        assert!(ev.contains(&TimelineEvent::CountInComplete));
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].offset, 1_000);
        assert_eq!(spans[0].frames, 1_000);
        assert_eq!(spans[0].start_beats, 0.0);
        assert!(ev.contains(&TimelineEvent::Bar {
            bar: 1,
            is_count_in: false
        }));
    }

    #[test]
    fn tempo_change_keeps_musical_position() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(0);
        tl.play();
        tl.advance(96_000 + 24_000); // bar 2, beat 2
        let before = tl.current_position();
        tl.set_bpm(90.0);
        let after = tl.current_position();
        assert_eq!((before.bar, before.beat), (after.bar, after.beat));
        assert!((before.beats - after.beats).abs() < 1e-6);
    }

    #[test]
    fn loop_enabled_past_end_jumps_back() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(0);
        tl.play();
        tl.advance(96_000 * 6); // bar 7
        tl.set_loop(1, 3, true);
        let (ev, spans) = tl.advance_with_spans(256);
        assert!(ev
            .iter()
            .any(|e| matches!(e, TimelineEvent::LoopWrapped { to_sample: 0, .. })));
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].start_beats, 0.0);
        assert_eq!(tl.current_sample, 256);
    }

    #[test]
    fn set_loop_clamps_a_max_start_bar_instead_of_overflowing() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_loop(u32::MAX, u32::MAX, true);
        assert_eq!(tl.loop_start_bar, u32::MAX - 1);
        assert_eq!(tl.loop_end_bar, u32::MAX);
        assert!(tl.loop_enabled);
        tl.set_loop(5, 3, true);
        assert_eq!(tl.loop_start_bar, 5);
        assert_eq!(tl.loop_end_bar, 6);
    }
}
