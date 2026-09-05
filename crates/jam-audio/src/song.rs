//! Stereo reference playback, advanced only by frames rendered for the output queue.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceState {
    pub asset_id: String,
    pub label: String,
    pub seconds: f64,
    pub position: f64,
    pub state: String,
    pub loop_start: f64,
    pub loop_end: f64,
    pub loop_enabled: bool,
}

pub struct ReferenceSong {
    pub info: ReferenceState,
    // ponytail: one decoded stereo source, at most 440 MiB. Stream for longer songs.
    samples: Vec<f32>,
    position: f64,
    fade_in: f64,
}

impl ReferenceSong {
    pub fn new(asset_id: String, label: String, samples: Vec<f32>) -> Result<Self, String> {
        if asset_id.is_empty() || asset_id.len() > 100 {
            return Err("Invalid reference asset ID.".into());
        }
        if samples.len() < 9600
            || !samples.len().is_multiple_of(2)
            || samples.len() > (48_000 * 1200 + 9600) * 2
            || samples.iter().any(|v| !v.is_finite())
        {
            return Err("Reference audio must be finite 48 kHz stereo, between 0.1 seconds and twenty minutes.".into());
        }
        let seconds = samples.len() as f64 / 96_000.0;
        Ok(Self {
            info: ReferenceState {
                asset_id,
                label: label.chars().take(200).collect(),
                seconds,
                position: 0.0,
                state: "stopped".into(),
                loop_start: 0.0,
                loop_end: seconds,
                loop_enabled: false,
            },
            samples,
            position: 0.0,
            fade_in: 96.0,
        })
    }

    pub fn play(&mut self) {
        if self.position >= self.samples.len() as f64 / 2.0 {
            self.seek(0.0).unwrap();
        }
        if self.info.state != "playing" {
            self.fade_in = 96.0;
        }
        self.info.state = "playing".into();
    }
    pub fn pause(&mut self) {
        self.info.state = "paused".into();
    }
    pub fn stop(&mut self) {
        self.position = 0.0;
        self.fade_in = 96.0;
        self.info.position = 0.0;
        self.info.state = "stopped".into();
    }
    pub fn seek(&mut self, seconds: f64) -> Result<(), String> {
        if !seconds.is_finite() || !(0.0..=self.info.seconds).contains(&seconds) {
            return Err("Choose a position inside the reference song.".into());
        }
        self.position = seconds * 48_000.0;
        self.fade_in = 96.0;
        self.info.position = seconds;
        Ok(())
    }
    pub fn set_loop(&mut self, start: f64, end: f64, enabled: bool) -> Result<(), String> {
        if !start.is_finite()
            || !end.is_finite()
            || start < 0.0
            || end > self.info.seconds
            // Decimal seconds such as 0.3 - 0.2 have sub-sample rounding error.
            || end - start < 0.1 - 1e-9
        {
            return Err(
                "Choose a reference loop at least 0.1 seconds long inside the song.".into(),
            );
        }
        self.info.loop_start = start;
        self.info.loop_end = end;
        self.info.loop_enabled = enabled;
        Ok(())
    }

    /// Interpolate the fixed 48 kHz source for the negotiated output rate. No speed change.
    pub fn render(&mut self, rate: u32, left: &mut [f32], right: &mut [f32]) {
        left.fill(0.0);
        right.fill(0.0);
        if rate == 0 || self.info.state != "playing" {
            return;
        }
        let length = self.samples.len() / 2;
        let loop_start = self.info.loop_start * 48_000.0;
        let loop_end = self.info.loop_end * 48_000.0;
        for (l, r) in left.iter_mut().zip(right) {
            if self.info.loop_enabled && self.position >= loop_end {
                self.position =
                    loop_start + (self.position - loop_end).rem_euclid(loop_end - loop_start);
                self.fade_in = 96.0;
            }
            if self.position >= length as f64 {
                self.position = length as f64;
                self.info.state = "stopped".into();
                break;
            }
            let a = self.position.floor() as usize;
            let b = (a + 1).min(length - 1);
            let fraction = (self.position - a as f64) as f32;
            // 2 ms fades at file/loop edges avoid discontinuities on arbitrary cuts.
            let end = if self.info.loop_enabled {
                loop_end
            } else {
                length as f64
            };
            let gain = (1.0 - self.fade_in / 96.0)
                .min((end - self.position) / 96.0)
                .clamp(0.0, 1.0) as f32;
            *l = (self.samples[a * 2] + (self.samples[b * 2] - self.samples[a * 2]) * fraction)
                * gain;
            *r = (self.samples[a * 2 + 1]
                + (self.samples[b * 2 + 1] - self.samples[a * 2 + 1]) * fraction)
                * gain;
            self.position += 48_000.0 / rate as f64;
            self.fade_in = (self.fade_in - 48_000.0 / rate as f64).max(0.0);
        }
        self.info.position = (self.position / 48_000.0).min(self.info.seconds);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stereo_reference_uses_output_frames_and_obeys_pause_seek_loop_and_end() {
        let samples: Vec<_> = (0..48_000)
            .flat_map(|i| {
                let v = (i as f32 * 1000.0 * std::f32::consts::TAU / 48_000.0).sin() * 0.2;
                [v, -v]
            })
            .collect();
        for rate in [32_000, 44_100, 48_000, 96_000] {
            let mut song =
                ReferenceSong::new("fixture".into(), "Sine".into(), samples.clone()).unwrap();
            let mut left = vec![0.0; rate as usize / 4];
            let mut right = left.clone();
            song.play();
            song.render(rate, &mut left, &mut right);
            assert!((song.info.position - 0.25).abs() < 1.0 / rate as f64);
            assert!(left.iter().zip(&right).all(|(l, r)| (l + r).abs() < 1e-6));
            let crossings = left
                .windows(2)
                .filter(|p| p[0] <= 0.0 && p[1] > 0.0)
                .count();
            assert!(
                (crossings as i32 - 250).abs() <= 1,
                "pitch within one cycle in 250 ms"
            );
            song.pause();
            song.render(rate, &mut left, &mut right);
            assert!(left.iter().all(|v| *v == 0.0));
            assert!((song.info.position - 0.25).abs() < 1.0 / rate as f64);
            song.set_loop(0.2, 0.4, true).unwrap();
            song.seek(0.35).unwrap();
            song.play();
            song.render(rate, &mut left, &mut right);
            assert!(
                (song.info.position - 0.2)
                    .abs()
                    .min((song.info.position - 0.4).abs())
                    < 1.0 / rate as f64
            );
            song.set_loop(0.0, 1.0, false).unwrap();
            song.seek(0.9).unwrap();
            song.render(rate, &mut left, &mut right);
            assert_eq!(song.info.state, "stopped");
            assert_eq!(song.info.position, 1.0);
            assert!(left[rate as usize / 8..].iter().all(|v| *v == 0.0));
            song.play();
            assert_eq!(song.info.position, 0.0);
            song.stop();
            assert_eq!(song.info.state, "stopped");
            assert!(song.seek(f64::NAN).is_err());
            assert!(song.set_loop(0.8, 0.2, true).is_err());
            assert!(song.set_loop(0.2, 0.3, true).is_ok());
        }
        // The first pass through the loop start is continuous; only a wrap fades in.
        let mut song =
            ReferenceSong::new("loop".into(), "Loop".into(), vec![0.25; 96_000]).unwrap();
        song.set_loop(0.2, 0.4, true).unwrap();
        song.play();
        let mut left = vec![0.0; 12_000];
        let mut right = left.clone();
        song.render(48_000, &mut left, &mut right);
        assert_eq!(left[9600], 0.25);
        song.render(48_000, &mut left, &mut right);
        assert_eq!(left[7200], 0.0);
        assert_eq!(left[7296], 0.25);
    }
}
