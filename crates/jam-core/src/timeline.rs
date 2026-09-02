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
    Beat {
        bar: u32,
        beat: u32,
        is_count_in: bool,
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

    pub fn set_bpm(&mut self, bpm: f64) {
        self.bpm = bpm.clamp(20.0, 300.0);
    }

    pub fn set_time_signature(&mut self, ts: (u8, u8)) {
        if ts.0 > 0 && ts.1 > 0 {
            self.time_signature = ts;
        }
    }

    pub fn set_loop(&mut self, start_bar: u32, end_bar: u32, enabled: bool) {
        self.loop_start_bar = start_bar.max(1);
        self.loop_end_bar = end_bar.max(self.loop_start_bar + 1);
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
        let mut events = Vec::new();
        let spb = self.samples_per_beat();
        let beats_per_bar = self.time_signature.0 as u32;

        match self.state {
            TransportState::CountingIn {
                bar: _,
                beat: _,
                total_bars,
            } => {
                let start_sample = self.count_in_sample;
                let end_sample = start_sample + frames as u64;
                let total_count_in_samples = self.samples_per_bar() * total_bars as u64;

                // Check for beat boundaries crossed during count-in
                let prev_beat_idx = (start_sample as f64 / spb).floor() as u32;
                let next_beat_idx = (end_sample as f64 / spb).floor() as u32;

                for b_idx in (prev_beat_idx + 1)..=next_beat_idx {
                    let count_bar = (b_idx / beats_per_bar) + 1;
                    let count_beat = (b_idx % beats_per_bar) + 1;
                    if count_bar <= total_bars {
                        self.state = TransportState::CountingIn {
                            bar: count_bar,
                            beat: count_beat,
                            total_bars,
                        };
                        events.push(TimelineEvent::Beat {
                            bar: count_bar,
                            beat: count_beat,
                            is_count_in: true,
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
                    // Count-in finished, transition to Playing
                    self.state = TransportState::Playing;
                    events.push(TimelineEvent::CountInComplete);

                    // Account for surplus frames in Playing state
                    let surplus = (end_sample - total_count_in_samples) as usize;
                    self.current_sample = 0;
                    if surplus > 0 {
                        let mut sub_events = self.advance(surplus);
                        events.append(&mut sub_events);
                    }
                } else {
                    self.count_in_sample = end_sample;
                }
            }

            TransportState::Playing => {
                let start_sample = self.current_sample;
                let mut end_sample = start_sample + frames as u64;

                // Check loop boundary
                if self.loop_enabled {
                    let loop_start_sample =
                        (self.loop_start_bar - 1) as u64 * self.samples_per_bar();
                    let loop_end_sample = (self.loop_end_bar - 1) as u64 * self.samples_per_bar();

                    if end_sample >= loop_end_sample && loop_end_sample > loop_start_sample {
                        events.push(TimelineEvent::LoopWrapped {
                            from_sample: loop_end_sample,
                            to_sample: loop_start_sample,
                        });
                        let wrap_surplus = end_sample - loop_end_sample;
                        end_sample = loop_start_sample + wrap_surplus;
                    }
                }

                // Detect beat / bar boundaries crossed
                let prev_beat_idx = (start_sample as f64 / spb).floor() as u32;
                let next_beat_idx = (end_sample as f64 / spb).floor() as u32;

                for b_idx in (prev_beat_idx + 1)..=next_beat_idx {
                    let cur_bar = (b_idx / beats_per_bar) + 1;
                    let cur_beat = (b_idx % beats_per_bar) + 1;
                    events.push(TimelineEvent::Beat {
                        bar: cur_bar,
                        beat: cur_beat,
                        is_count_in: false,
                    });
                    if cur_beat == 1 {
                        events.push(TimelineEvent::Bar {
                            bar: cur_bar,
                            is_count_in: false,
                        });
                    }
                }

                self.current_sample = end_sample;
            }

            TransportState::Stopped | TransportState::Paused => {}
        }

        events
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
}
