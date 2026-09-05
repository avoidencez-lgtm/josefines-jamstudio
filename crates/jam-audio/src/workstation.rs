//! Original-song playback and retrospective capture. PCM never crosses IPC.
use jam_core::timeline::Span;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

/// Guitar, band L/R, master L/R, drums L/R, bass, comp.
pub use jam_band::sequencer::MidiNote;

pub type Frame = [f32; 9];

#[derive(Default)]
pub struct Capture {
    pub seconds: u32,
    frames: VecDeque<Frame>,
}

impl Capture {
    pub fn arm(&mut self, seconds: u32) -> Result<(), String> {
        if seconds > 60 {
            return Err("Capture length must be 0–60 seconds.".into());
        }
        self.seconds = seconds;
        self.frames.clear();
        Ok(())
    }
    pub fn push(&mut self, frames: &[Frame], rate: u32) {
        let capacity = self.seconds as usize * rate as usize;
        if capacity == 0 {
            return;
        }
        for frame in frames {
            if self.frames.len() >= capacity {
                self.frames.pop_front();
            }
            self.frames.push_back(*frame);
        }
    }
    pub fn snapshot(&self) -> Result<Vec<Frame>, String> {
        if self.frames.is_empty() {
            return Err("Arm capture, then play something first.".into());
        }
        Ok(self.frames.iter().copied().collect())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipSpec {
    pub take_id: String,
    pub trim_start: f64,
    pub trim_end: f64,
    pub start_bar: u32,
    pub repeats: u32,
    pub gain: f32,
    pub muted: bool,
    #[serde(default)]
    pub label: String,
}

pub struct Clip {
    pub spec: ClipSpec,
    /// Decoded audio, shared with the app's clip cache so Play, Loop and Record
    /// reuse one decode of the same take (validated finite when decoded).
    pub samples: std::sync::Arc<Vec<f32>>,
    pub sample_rate: u32,
}

impl Clip {
    pub fn new(
        spec: ClipSpec,
        samples: std::sync::Arc<Vec<f32>>,
        sample_rate: u32,
    ) -> Result<Self, String> {
        let duration = samples.len() as f64 / sample_rate.max(1) as f64;
        if sample_rate == 0
            || !spec.trim_start.is_finite()
            || !spec.trim_end.is_finite()
            || spec.trim_start < 0.0
            || spec.trim_end <= spec.trim_start
            || spec.trim_end > duration + 1e-6
            || !(1..=256).contains(&spec.start_bar)
            || !(1..=64).contains(&spec.repeats)
            || !spec.gain.is_finite()
            || !(0.0..=2.0).contains(&spec.gain)
        {
            return Err("Check the clip trim, bar, repeats and volume.".into());
        }
        Ok(Self {
            spec,
            samples,
            sample_rate,
        })
    }

    /// Plays at the recorded pitch and speed. Tempo changes move its start bar,
    /// never silently time-stretch the performance. Trim length determines repeats.
    pub fn render(&self, spans: &[Span], bpm: f64, beats_per_bar: f64, rate: u32, out: &mut [f32]) {
        if self.spec.muted {
            return;
        }
        let start_seconds = (self.spec.start_bar - 1) as f64 * beats_per_bar * 60.0 / bpm;
        let length = self.spec.trim_end - self.spec.trim_start;
        for span in spans {
            for i in 0..span.frames {
                let t = span.start_beats * 60.0 / bpm + i as f64 / rate as f64 - start_seconds;
                if t < 0.0 || t >= length * self.spec.repeats as f64 {
                    continue;
                }
                let pos = (self.spec.trim_start + t.rem_euclid(length)) * self.sample_rate as f64;
                let a = pos.floor() as usize;
                let fraction = (pos - a as f64) as f32;
                if let (Some(x), Some(target)) = (self.samples.get(a), out.get_mut(span.offset + i))
                {
                    let y = self.samples.get(a + 1).unwrap_or(x);
                    // 2 ms edge ramps prevent clicks at a trimmed loop boundary.
                    let within = t.rem_euclid(length);
                    let fade = (within / 0.002).min((length - within) / 0.002).min(1.0) as f32;
                    *target += (x + (y - x) * fraction) * self.spec.gain * fade;
                }
            }
        }
    }
}

pub struct Audition {
    pub clip: Clip,
    frames: usize,
}
impl Audition {
    pub fn new(mut clip: Clip) -> Self {
        clip.spec.start_bar = 1;
        clip.spec.repeats = 1;
        clip.spec.muted = false;
        Self { clip, frames: 0 }
    }
    pub fn render(&mut self, rate: u32, out: &mut [f32]) -> bool {
        self.clip.render(
            &[Span {
                offset: 0,
                frames: out.len(),
                start_beats: self.frames as f64 / rate as f64 * 2.0,
            }],
            120.0,
            4.0,
            rate,
            out,
        );
        self.frames += out.len();
        self.frames as f64 / (rate as f64) < self.clip.spec.trim_end - self.clip.spec.trim_start
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capture_is_bounded_and_disarm_forgets_audio() {
        let mut c = Capture::default();
        c.arm(1).unwrap();
        c.push(&[[0.1; 9], [0.2; 9], [0.3; 9]], 2);
        assert_eq!(c.snapshot().unwrap(), vec![[0.2; 9], [0.3; 9]]);
        c.arm(0).unwrap();
        assert!(c.snapshot().is_err());
    }
    #[test]
    fn clip_keeps_pitch_repeats_at_trim_and_obeys_transport_spans() {
        let spec = ClipSpec {
            take_id: "x".into(),
            trim_start: 0.0,
            trim_end: 0.1,
            start_bar: 2,
            repeats: 2,
            gain: 0.5,
            muted: false,
            label: String::new(),
        };
        let clip = Clip::new(spec, std::sync::Arc::new(vec![1.0; 100]), 1000).unwrap();
        let mut out = vec![0.0; 250];
        clip.render(
            &[Span {
                offset: 10,
                frames: 230,
                start_beats: 4.0,
            }],
            120.0,
            4.0,
            1000,
            &mut out,
        );
        assert_eq!(out[0], 0.0);
        assert!((out[20] - 0.5).abs() < 1e-6);
        assert!((out[120] - 0.5).abs() < 1e-6);
        assert_eq!(out[220], 0.0);
        let mut audition = Audition::new(
            Clip::new(clip.spec.clone(), std::sync::Arc::new(vec![1.0; 100]), 1000).unwrap(),
        );
        let mut first = vec![0.0; 50];
        assert!(audition.render(1000, &mut first));
        assert!(first[10] > 0.4);
        assert!(!audition.render(1000, &mut first));
        let mut invalid = clip.spec.clone();
        invalid.trim_end = 9.0;
        assert!(Clip::new(invalid, std::sync::Arc::new(vec![0.0; 100]), 1000).is_err());
    }
}
