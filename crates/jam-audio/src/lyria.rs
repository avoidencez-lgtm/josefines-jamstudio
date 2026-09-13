//! Bounded 48 kHz stereo playback queue for Lyria RealTime.

use std::collections::VecDeque;

const CHANNELS: usize = 2;
const PREFILL_FRAMES: usize = 48_000;
const TARGET_FRAMES: usize = 24_000;
const MAX_FRAMES: usize = 96_000;
const FADE_FRAMES: usize = 12_000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct LyriaBusStatus {
    pub active: bool,
    pub buffering: bool,
    pub queued_frames: usize,
}

pub struct LyriaBus {
    frames: VecDeque<[f32; CHANNELS]>,
    active: bool,
    primed: bool,
    gain: f32,
}

impl Default for LyriaBus {
    fn default() -> Self {
        Self {
            frames: VecDeque::with_capacity(MAX_FRAMES),
            active: false,
            primed: false,
            gain: 0.0,
        }
    }
}

impl LyriaBus {
    pub fn start(&mut self) {
        self.frames.clear();
        self.active = true;
        self.primed = false;
        self.gain = 0.0;
    }

    pub fn stop(&mut self) {
        self.frames.clear();
        self.active = false;
        self.primed = false;
        self.gain = 0.0;
    }

    pub fn push_pcm16(&mut self, samples: &[i16]) -> Result<(), String> {
        if samples.is_empty() || !samples.len().is_multiple_of(CHANNELS) {
            return Err("Lyria audio must contain complete stereo frames.".into());
        }
        for frame in samples.as_chunks::<CHANNELS>().0 {
            if self.frames.len() == MAX_FRAMES {
                self.frames.pop_front();
            }
            self.frames
                .push_back([frame[0] as f32 / 32768.0, frame[1] as f32 / 32768.0]);
        }
        if self.active && self.frames.len() >= PREFILL_FRAMES {
            self.primed = true;
        }
        Ok(())
    }

    pub fn status(&self) -> LyriaBusStatus {
        LyriaBusStatus {
            active: self.active,
            buffering: self.active && !self.primed,
            queued_frames: self.frames.len(),
        }
    }

    /// Render-worker only. Adds stereo samples without allocating in the device callback.
    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        if !self.active || !self.primed {
            return;
        }
        let step = 1.0 / FADE_FRAMES as f32;
        for (left, right) in left.iter_mut().zip(right.iter_mut()) {
            let Some(frame) = self.frames.pop_front() else {
                self.primed = false;
                self.gain = 0.0;
                return;
            };
            let target = if self.frames.len() < TARGET_FRAMES {
                0.0
            } else {
                1.0
            };
            self.gain += (target - self.gain).clamp(-step, step);
            *left += frame[0] * self.gain;
            *right += frame[1] * self.gain;
        }
        if self.frames.is_empty() {
            self.primed = false;
            self.gain = 0.0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefill_bounds_and_fades_the_stream() {
        let mut bus = LyriaBus::default();
        bus.start();
        assert!(bus.push_pcm16(&[]).is_err());
        assert!(bus.push_pcm16(&[1]).is_err());
        bus.push_pcm16(&vec![i16::MAX; (PREFILL_FRAMES - 1) * 2])
            .unwrap();
        let mut left = [0.0; 256];
        let mut right = [0.0; 256];
        bus.render(&mut left, &mut right);
        assert!(left.iter().all(|sample| *sample == 0.0));
        assert!(bus.status().buffering);

        bus.push_pcm16(&[i16::MAX; 2]).unwrap();
        bus.render(&mut left, &mut right);
        assert!(left[0] > 0.0 && left[0] < left[255]);
        assert_eq!(left, right);

        bus.push_pcm16(&vec![7; MAX_FRAMES * 4]).unwrap();
        assert_eq!(bus.status().queued_frames, MAX_FRAMES);
        bus.stop();
        assert_eq!(bus.status(), LyriaBusStatus::default());
    }
}
