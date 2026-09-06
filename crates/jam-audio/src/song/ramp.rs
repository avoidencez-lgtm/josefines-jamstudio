//! Practice progression follows complete source bars, never a wall-clock timer.
use super::grid::Grid;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub schema_version: u32,
    pub start_percent: u32,
    pub step_percent: u32,
    pub target_percent: u32,
    pub bars_per_step: u32,
}

impl Config {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1
            || !(50..=150).contains(&self.start_percent)
            || !(self.start_percent + 1..=150).contains(&self.target_percent)
            || !(1..=50).contains(&self.step_percent)
            || !(1..=64).contains(&self.bars_per_step)
        {
            return Err("Choose a ramp from 50–149% to a higher target up to 150%, increasing 1–50 percentage points every 1–64 complete bars.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct State {
    pub config: Config,
    pub active: bool,
    pub completed_bars: u32,
    pub speed_percent: u32,
}

impl State {
    pub fn new(config: Config) -> Self {
        Self {
            config,
            active: true,
            completed_bars: 0,
            speed_percent: config.start_percent,
        }
    }
}

pub(super) fn aligned(grid: &Grid, seconds: f64) -> bool {
    grid.beats
        .iter()
        .step_by(grid.beats_per_bar)
        // Only float roundoff is allowed: an early cut must not skip the counted boundary.
        .any(|b| (b - seconds).abs() <= 1e-11)
}

/// Skip a partial first bar. The cached boundary makes per-frame work constant time.
pub(super) fn next_end(grid: &Grid, frames: f64) -> Option<usize> {
    let start = grid
        .beats
        .iter()
        .step_by(grid.beats_per_bar)
        .position(|b| b * 48_000.0 >= frames - 1e-6)?
        * grid.beats_per_bar;
    let end = start + grid.beats_per_bar;
    (end < grid.beats.len()).then_some(end)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::song::{grid::Grid, ReferenceSong};

    #[test]
    fn ramp_waits_multiple_bars_survives_pause_clamps_target_and_cancels_on_manual_edits() {
        let mut song =
            ReferenceSong::new("ramp".into(), "Short loop".into(), vec![0.0; 96_000]).unwrap();
        song.set_grid(Grid {
            schema_version: 1,
            origin: "confirmed-local".into(),
            beats_per_bar: 4,
            beats: vec![0.0, 0.1, 0.2, 0.3, 0.4],
            sections: vec![],
        })
        .unwrap();
        song.set_loop(0.0, 0.4, true).unwrap();
        let config = Config {
            schema_version: 1,
            start_percent: 100,
            step_percent: 20,
            target_percent: 125,
            bars_per_step: 2,
        };
        song.configure_ramp(Some(config)).unwrap();
        song.play();
        song.render(48_000, &mut vec![0.0; 19_201], &mut vec![0.0; 19_201]);
        assert_eq!(song.info.ramp.unwrap().completed_bars, 1);
        assert_eq!(song.info.speed, 1.0);
        song.pause();
        let before = song.info.ramp;
        song.render(48_000, &mut [0.0; 256], &mut [0.0; 256]);
        assert_eq!(song.info.ramp, before);
        song.play();
        song.render(48_000, &mut vec![0.0; 96_000], &mut vec![0.0; 96_000]);
        assert_eq!(song.info.speed, 1.25);
        assert_eq!(song.info.ramp.unwrap().completed_bars, 4);
        assert!(!song.info.ramp.unwrap().active);
        song.stop();
        assert_eq!(song.info.speed, 1.0);
        song.set_processing(0.8, 2).unwrap();
        assert!(song.info.ramp.is_none());
        song.configure_ramp(Some(config)).unwrap();
        song.seek(0.2).unwrap();
        assert!(song.info.ramp.is_none());
    }

    #[test]
    fn ramp_counts_full_looped_bars_at_all_output_rates_and_preserves_queued_readouts() {
        let config: Config = serde_json::from_str(include_str!(
            "../../../../tests/fixtures/seams/reference-ramp.json"
        ))
        .unwrap();
        let grid: Grid = serde_json::from_str(include_str!(
            "../../../../tests/fixtures/seams/reference-grid.json"
        ))
        .unwrap();
        for rate in [44_100, 48_000, 96_000] {
            let mut song =
                ReferenceSong::new("ramp".into(), "Fixture".into(), vec![0.1; 480_000]).unwrap();
            assert!(song.configure_ramp(Some(config)).is_err());
            song.set_grid(grid.clone()).unwrap();
            song.loop_section("chorus").unwrap();
            song.configure_ramp(Some(config)).unwrap();
            assert_eq!(song.info.state, "stopped", "arming never starts playback");
            assert_eq!(song.played_state(0).ramp.unwrap().config, config);
            song.play();
            let mut heard_steps = Vec::new();
            let mut frames = 0;
            let mut last_count = 0;
            let mut old_stamp = 0;
            while song.info.ramp.as_ref().unwrap().active {
                let mut left = [0.0; 257];
                let mut right = left;
                let mut stamps = [0; 257];
                song.render_timed(rate, &mut left, &mut right, &mut stamps);
                assert!(left.iter().all(|v| v.is_finite()));
                for stamp in stamps {
                    let heard = song.played_state(stamp).ramp.unwrap();
                    if heard.completed_bars != last_count {
                        last_count = heard.completed_bars;
                        heard_steps.push((frames, heard.speed_percent));
                    }
                    frames += 1;
                }
                if old_stamp == 0 {
                    old_stamp = stamps[0];
                }
                if frames > rate * 20 {
                    panic!("Ramp did not reach target");
                }
            }
            assert_eq!(
                heard_steps
                    .iter()
                    .map(|(_, speed)| *speed)
                    .collect::<Vec<_>>(),
                [75, 100, 125]
            );
            let expected = [4.8, 8.0, 10.4];
            for ((frame, _), seconds) in heard_steps.iter().zip(expected) {
                assert!((*frame as f64 / rate as f64 - seconds).abs() <= 3.0 / rate as f64);
            }
            assert_eq!(song.played_state(old_stamp).ramp.unwrap().speed_percent, 50);
            song.stop();
            assert_eq!(song.info.ramp.unwrap().completed_bars, 0);
            assert_eq!(song.info.speed, 0.5);
            song.pause();
            let before = song.info.ramp;
            song.render(rate, &mut [0.0; 10], &mut [0.0; 10]);
            assert_eq!(song.info.ramp, before);
            song.configure_ramp(None).unwrap();
            assert!(song.info.ramp.is_none());
            assert_eq!(song.info.speed, 0.5);
            song.set_loop(2.2, 4.6 - 1.0 / 48_000.0, true).unwrap();
            assert!(
                song.configure_ramp(Some(config)).is_err(),
                "an early cut must not skip the downbeat"
            );
            song.set_loop(2.3, 4.6, true).unwrap();
            assert!(
                song.configure_ramp(Some(config)).is_err(),
                "partial-bar loops are refused"
            );
            song.set_loop(2.2, 4.6, false).unwrap();
            song.seek(2.5).unwrap();
            assert!(
                song.configure_ramp(Some(config)).is_err(),
                "no complete bar remains after this partial bar"
            );
            song.seek(0.5).unwrap();
            song.configure_ramp(Some(config)).unwrap();
            song.play();
            song.render(
                rate,
                &mut vec![0.0; rate as usize * 6],
                &mut vec![0.0; rate as usize * 6],
            );
            assert_eq!(
                song.info.ramp.unwrap().completed_bars,
                0,
                "a partial first bar never counts"
            );
            for bad in [
                Config {
                    start_percent: 49,
                    ..config
                },
                Config {
                    bars_per_step: 0,
                    ..config
                },
                Config {
                    target_percent: 40,
                    ..config
                },
                Config {
                    step_percent: 0,
                    ..config
                },
                Config {
                    schema_version: 2,
                    ..config
                },
            ] {
                assert!(song.configure_ramp(Some(bad)).is_err());
            }
        }
    }

    #[test]
    fn stop_rearms_a_section_loop_from_its_downbeat_not_the_file_start() {
        let config: Config = serde_json::from_str(include_str!(
            "../../../../tests/fixtures/seams/reference-ramp.json"
        ))
        .unwrap();
        let grid: Grid = serde_json::from_str(include_str!(
            "../../../../tests/fixtures/seams/reference-grid.json"
        ))
        .unwrap();
        let mut song =
            ReferenceSong::new("ramp".into(), "Fixture".into(), vec![0.1; 480_000]).unwrap();
        song.set_grid(grid).unwrap();
        song.loop_section("chorus").unwrap();
        song.configure_ramp(Some(config)).unwrap();
        song.stop();
        assert!(
            (song.info.position - 2.2).abs() <= 1.0 / 48_000.0,
            "Stop must return to the section loop, not the file start"
        );
        song.play();
        // 2.3 s of source at 50% is past the verse (2.2) and still inside the chorus (4.6).
        let past_verse = (2.3_f64 / 0.5 * 48_000.0).ceil() as usize;
        song.render(
            48_000,
            &mut vec![0.0; past_verse],
            &mut vec![0.0; past_verse],
        );
        assert_eq!(
            song.info.ramp.unwrap().completed_bars,
            0,
            "the verse before a chorus loop must not count after Stop"
        );
        assert_eq!(song.info.ramp.unwrap().speed_percent, 50);
        assert_eq!(song.info.speed, 0.5);
    }
}
