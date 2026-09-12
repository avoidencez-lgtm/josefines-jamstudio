//! Timeline MIDI scheduler. Scene commands fire 50 ms before the target.
//! Clock ticks sit on the timeline (no lookahead).
use crate::midi::{MemorySink, MidiSink};
use jam_core::timeline::beats_to_samples;

/// ARCHITECTURE §4 / §9.1: 50 ms lookahead for scene commands.
pub const LOOKAHEAD_MS: u32 = 50;
pub const PPQN: u32 = 24;
pub const CLOCK: u8 = 0xF8;
pub const START: u8 = 0xFA;
pub const CONTINUE: u8 = 0xFB;
pub const STOP: u8 = 0xFC;

pub fn tick_interval_samples(sample_rate: u32, bpm: f64) -> u64 {
    beats_to_samples(1.0 / f64::from(PPQN), bpm, sample_rate)
}

pub struct MidiScheduler {
    sample_rate: u32,
    lookahead_ms: u32,
    queue: Vec<(u64, Vec<u8>)>,
}

impl MidiScheduler {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            lookahead_ms: LOOKAHEAD_MS,
            queue: Vec::new(),
        }
    }

    pub fn lookahead_samples(&self) -> u64 {
        u64::from(self.sample_rate) * u64::from(self.lookahead_ms) / 1000
    }

    pub fn emit_sample(&self, target_sample: u64) -> u64 {
        target_sample.saturating_sub(self.lookahead_samples())
    }

    pub fn schedule(&mut self, target_sample: u64, bytes: Vec<u8>) {
        self.schedule_at(self.emit_sample(target_sample), bytes);
    }

    pub fn schedule_at(&mut self, at_sample: u64, bytes: Vec<u8>) {
        self.queue.push((at_sample, bytes));
        self.queue.sort_by_key(|(at, _)| *at);
    }

    pub fn schedule_clock(&mut self, start_sample: u64, beats: u32, bpm: f64) {
        for i in 0..beats * PPQN {
            let at = start_sample
                + beats_to_samples(f64::from(i) / f64::from(PPQN), bpm, self.sample_rate);
            self.schedule_at(at, vec![CLOCK]);
        }
    }

    pub fn schedule_pc(&mut self, target_sample: u64, channel: u8, program: u8) {
        self.schedule(
            target_sample,
            vec![0xC0 | (channel & 0x0F), program & 0x7F],
        );
    }

    pub fn due(&mut self, now_sample: u64) -> Vec<(u64, Vec<u8>)> {
        let mut sent = Vec::new();
        let mut keep = Vec::new();
        for (at, bytes) in self.queue.drain(..) {
            if at <= now_sample {
                sent.push((at, bytes));
            } else {
                keep.push((at, bytes));
            }
        }
        self.queue = keep;
        sent
    }

    /// Sends every event whose emit sample is at or before `now_sample`.
    pub fn flush_due(
        &mut self,
        now_sample: u64,
        sink: &mut impl MidiSink,
    ) -> Result<Vec<(u64, Vec<u8>)>, String> {
        let sent = self.due(now_sample);
        for (_, bytes) in &sent {
            sink.send(bytes)?;
        }
        Ok(sent)
    }

    pub fn clear(&mut self) {
        self.queue.clear();
    }
}

impl MemorySink {
    /// Records the timeline sample the scheduler used. Bytes still go through `send`.
    pub fn stamp(&mut self, at_sample: u64) {
        self.at_samples.push(at_sample);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jam_core::timeline::Timeline;

    #[test]
    fn program_change_at_bar_five_lands_within_one_ms_of_lookahead() {
        let mut tl = Timeline::new(48_000, 120.0, (4, 4));
        tl.set_count_in(0);
        tl.seek_bar(5);
        let target = tl.current_sample;
        assert_eq!(target, 384_000);

        let mut sched = MidiScheduler::new(48_000);
        let mut sink = MemorySink::new();
        sched.schedule_pc(target, 0, 12);

        let want = target - sched.lookahead_samples();
        assert_eq!(want, 381_600);
        assert!(sched.flush_due(want.saturating_sub(1), &mut sink).unwrap().is_empty());
        let sent = sched.flush_due(want, &mut sink).unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].1, vec![0xC0, 12]);
        assert_eq!(sink.messages, vec![vec![0xC0, 12]]);
        let tol = u64::from(tl.sample_rate) / 1000;
        assert!(
            sent[0].0.abs_diff(want) <= tol,
            "emit {} want {want} (±{tol} samples)",
            sent[0].0
        );
        sink.stamp(sent[0].0);
        assert_eq!(sink.at_samples, vec![want]);
    }

    #[test]
    fn clock_ticks_are_twenty_four_ppqn_at_sixty_one_twenty_and_two_forty() {
        for bpm in [60.0, 120.0, 240.0] {
            let mut sched = MidiScheduler::new(48_000);
            let mut sink = MemorySink::new();
            sched.schedule_at(0, vec![START]);
            sched.schedule_clock(0, 1, bpm);
            let sent = sched.flush_due(u64::MAX, &mut sink).unwrap();
            assert_eq!(sent[0].1, vec![START], "{bpm}");
            let ticks: Vec<u64> = sent
                .iter()
                .filter(|(_, b)| *b == vec![CLOCK])
                .map(|(at, _)| *at)
                .collect();
            assert_eq!(ticks.len(), 24, "{bpm}");
            let step = tick_interval_samples(48_000, bpm);
            for pair in ticks.windows(2) {
                assert_eq!(pair[1] - pair[0], step, "{bpm} {pair:?}");
            }
            assert_eq!(sink.messages[0], vec![START]);
            assert_eq!(sink.messages.iter().filter(|m| **m == vec![CLOCK]).count(), 24);
        }
    }

    #[test]
    fn clock_start_stop_continue_go_through_memory_sink() {
        let mut sched = MidiScheduler::new(48_000);
        let mut sink = MemorySink::new();
        sched.schedule_at(0, vec![START]);
        sched.schedule_clock(0, 1, 120.0);
        sched.schedule_at(24_000, vec![STOP]);
        sched.schedule_at(36_000, vec![CONTINUE]);
        sched.schedule_clock(36_000, 1, 120.0);
        let sent = sched.flush_due(u64::MAX, &mut sink).unwrap();
        let kinds: Vec<u8> = sent.iter().map(|(_, b)| b[0]).collect();
        assert_eq!(kinds[0], START);
        assert_eq!(kinds[24], CLOCK);
        assert_eq!(kinds[25], STOP);
        assert_eq!(kinds[26], CONTINUE);
        assert_eq!(
            kinds.iter().filter(|b| **b == CLOCK).count(),
            48
        );
        assert_eq!(sink.messages[25], vec![STOP]);
        assert_eq!(sink.messages[26], vec![CONTINUE]);
    }
}
