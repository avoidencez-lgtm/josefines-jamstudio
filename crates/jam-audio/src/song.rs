//! Stereo reference playback, advanced only by frames rendered for the output queue.
pub mod grid;
pub mod ramp;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};

static SOURCE_SERIAL: AtomicU32 = AtomicU32::new(1);
fn normal_speed() -> f64 {
    1.0
}

fn transpose_estimate(label: &str, semitones: i32) -> Option<String> {
    if semitones.rem_euclid(12) == 0 {
        return Some(label.into());
    }
    let notes = jam_dsp::offline::NOTES;
    let root = notes.iter().position(|n| Some(*n) == label.get(..1))? as i32;
    let (accidental, length) = match label.as_bytes().get(1) {
        Some(b'#') => (1, 2),
        Some(b'b') => (-1, 2),
        _ => (0, 1),
    };
    Some(format!(
        "{}{}",
        notes[(root + accidental + semitones).rem_euclid(12) as usize],
        &label[length..]
    ))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StemMix {
    pub id: String,
    pub label: String,
    pub gain: f32,
    pub muted: bool,
    pub guitar: bool,
}

pub fn validate_stem_mix(mix: &[StemMix]) -> Result<(), String> {
    if !(2..=8).contains(&mix.len())
        || mix.iter().any(|s| {
            s.id.is_empty()
                || s.id.len() > 100
                || s.label.is_empty()
                || s.label.chars().count() > 100
                || !s.gain.is_finite()
                || !(0.0..=2.0).contains(&s.gain)
        })
        || mix
            .iter()
            .enumerate()
            .any(|(i, s)| mix[..i].iter().any(|v| v.id == s.id))
        || mix.iter().filter(|s| s.guitar).count() > 1
    {
        return Err(
            "Choose 2–8 distinct stems, levels from 0 to 200%, and at most one guitar track."
                .into(),
        );
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceAnalysisState {
    pub confidence: String,
    pub bpm: Option<f64>,
    pub key: Option<String>,
    pub chord: Option<String>,
    pub next_chord: Option<String>,
    pub beat: Option<usize>,
    pub beat_count: usize,
}

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
    #[serde(default)]
    pub analysis: Option<ReferenceAnalysisState>,
    #[serde(default)]
    pub analysis_error: Option<String>,
    #[serde(default)]
    pub stems: Vec<StemMix>,
    #[serde(default = "normal_speed")]
    pub speed: f64,
    #[serde(default)]
    pub semitones: i32,
    #[serde(default)]
    pub processing_error: Option<String>,
    #[serde(default)]
    pub grid: Option<grid::State>,
    #[serde(default)]
    pub grid_error: Option<String>,
    #[serde(default)]
    pub ramp: Option<ramp::State>,
}

pub struct ReferenceSong {
    pub info: ReferenceState,
    // ponytail: one decoded stereo source, at most 440 MiB. Stream for longer songs.
    samples: Vec<f32>,
    position: f64,
    fade_in: f64,
    serial: u32,
    analysis: Option<jam_dsp::offline::SongAnalysis>,
    extra_samples: Vec<Vec<f32>>,
    stem_gains: Vec<f32>,
    streams: Vec<jam_dsp::stretch::Stream>,
    // ponytail: retain 16 queued parameter generations; older readouts become unknown.
    previous_parameters: Vec<(u32, f64, i32, Option<ramp::State>)>,
    ramp_end: Option<usize>,
    last_frame: [f32; 2],
    transition_from: Option<[f32; 2]>,
    pub grid: Option<grid::Grid>,
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
                analysis: None,
                analysis_error: None,
                stems: Vec::new(),
                speed: 1.0,
                semitones: 0,
                processing_error: None,
                grid: None,
                grid_error: None,
                ramp: None,
            },
            samples,
            position: 0.0,
            fade_in: 96.0,
            serial: SOURCE_SERIAL.fetch_add(1, Ordering::Relaxed),
            analysis: None,
            extra_samples: Vec::new(),
            stem_gains: Vec::new(),
            streams: vec![jam_dsp::stretch::Stream::new()?],
            previous_parameters: Vec::with_capacity(16),
            ramp_end: None,
            last_frame: [0.0; 2],
            transition_from: None,
            grid: None,
        })
    }

    /// All tracks share the same source-frame cursor; the original mix is not added.
    pub fn with_stems(
        asset_id: String,
        label: String,
        mix: Vec<StemMix>,
        mut tracks: Vec<Vec<f32>>,
    ) -> Result<Self, String> {
        validate_stem_mix(&mix)?;
        if tracks.len() != mix.len()
            || tracks
                .iter()
                .any(|t| t.len() != tracks[0].len() || t.iter().any(|v| !v.is_finite()))
            || tracks.iter().map(|t| t.len() as u64 * 4).sum::<u64>() > 2 * 1024 * 1024 * 1024
        {
            return Err(
                "Stems must have identical lengths and fit within 2 GiB of decoded audio.".into(),
            );
        }
        // ponytail: decode at most eight tracks into 2 GiB; stream for larger sets.
        let first = tracks.remove(0);
        let mut song = Self::new(asset_id, label, first)?;
        for _ in &tracks {
            song.streams.push(jam_dsp::stretch::Stream::new()?);
        }
        song.extra_samples = tracks;
        song.stem_gains = mix
            .iter()
            .map(|s| if s.muted { 0.0 } else { s.gain })
            .collect();
        song.info.stems = mix;
        Ok(song)
    }

    pub fn set_stem_mix(&mut self, mix: Vec<StemMix>) -> Result<(), String> {
        validate_stem_mix(&mix)?;
        if mix.len() != self.info.stems.len()
            || mix
                .iter()
                .zip(&self.info.stems)
                .any(|(a, b)| a.id != b.id || a.label != b.label)
        {
            return Err("The loaded stem set changed. Load it again before mixing.".into());
        }
        self.info.stems = mix;
        Ok(())
    }

    pub fn set_processing(&mut self, speed: f64, semitones: i32) -> Result<(), String> {
        jam_dsp::stretch::validate(speed, semitones as f64)?;
        self.remember_parameters();
        self.info.ramp = None;
        self.apply_processing(speed, semitones)
    }

    fn remember_parameters(&mut self) {
        if self.previous_parameters.len() == 16 {
            self.previous_parameters.remove(0);
        }
        self.previous_parameters.push((
            self.serial,
            self.info.speed,
            self.info.semitones,
            self.info.ramp,
        ));
        self.serial = SOURCE_SERIAL.fetch_add(1, Ordering::Relaxed);
    }

    fn apply_processing(&mut self, speed: f64, semitones: i32) -> Result<(), String> {
        if self.info.speed == speed && self.info.semitones == semitones {
            return Ok(());
        }
        for stream in &mut self.streams {
            stream.set_parameters(speed, semitones as f64)?;
        }
        self.info.speed = speed;
        self.info.semitones = semitones;
        self.info.processing_error = None;
        self.fade_in = 96.0;
        self.transition_from = (self.info.state == "playing").then_some(self.last_frame);
        Ok(())
    }

    pub fn configure_ramp(&mut self, config: Option<ramp::Config>) -> Result<(), String> {
        let next = if let Some(config) = config {
            config.validate()?;
            let grid = self
                .grid
                .as_ref()
                .ok_or("Confirm bars in Songs and reload the reference before starting a ramp.")?;
            if self.info.loop_enabled
                && (!ramp::aligned(grid, self.info.loop_start)
                    || !ramp::aligned(grid, self.info.loop_end))
            {
                return Err("Use a loop bounded by confirmed downbeats, or turn the loop off before starting a ramp.".into());
            }
            Some(ramp::next_end(grid, self.position).ok_or("Seek before a complete confirmed bar, or select a section loop before starting the ramp.")?)
        } else {
            None
        };
        self.remember_parameters();
        self.ramp_end = next;
        self.info.ramp = config.map(ramp::State::new);
        if let Some(config) = config {
            self.apply_processing(config.start_percent as f64 / 100.0, self.info.semitones)?;
        }
        Ok(())
    }

    fn advance_ramp(&mut self) -> Result<(), String> {
        let (Some(mut ramp), Some(end), Some(grid)) =
            (self.info.ramp, self.ramp_end, self.grid.as_ref())
        else {
            return Ok(());
        };
        if !ramp.active || self.position < grid.beats[end] * 48_000.0 - 1e-6 {
            return Ok(());
        }
        self.ramp_end =
            (end + grid.beats_per_bar < grid.beats.len()).then_some(end + grid.beats_per_bar);
        self.remember_parameters();
        ramp.completed_bars += 1;
        let steps = ramp.completed_bars / ramp.config.bars_per_step;
        ramp.speed_percent = (ramp.config.start_percent + steps * ramp.config.step_percent)
            .min(ramp.config.target_percent);
        ramp.active = ramp.speed_percent < ramp.config.target_percent;
        self.info.ramp = Some(ramp);
        self.apply_processing(ramp.speed_percent as f64 / 100.0, self.info.semitones)
    }

    pub fn set_grid(&mut self, grid: grid::Grid) -> Result<(), String> {
        grid.validate(self.info.seconds)?;
        self.configure_ramp(None)?;
        self.info.grid = Some(grid.state(-1.0, self.info.speed));
        self.info.grid_error = None;
        self.grid = Some(grid);
        Ok(())
    }

    pub fn loop_section(&mut self, id: &str) -> Result<(), String> {
        let (start, end) = self
            .grid
            .as_ref()
            .ok_or("Confirm the reference beat map and sections in Songs first.")?
            .section_bounds(id)?;
        self.set_loop(start, end, true)?;
        // Start at the selected downbeat, including when currently in another section.
        self.seek(start)
    }

    fn invalidate_streams(&mut self) {
        for stream in &mut self.streams {
            stream.invalidate();
        }
    }

    pub fn set_analysis(&mut self, analysis: jam_dsp::offline::SongAnalysis) -> Result<(), String> {
        let valid_note = |s: &str| {
            let mut c = s.chars();
            matches!(c.next(), Some('A'..='G')) && matches!(c.as_str(), "" | "#" | "b")
        };
        if analysis.schema_version != 1
            || analysis.analyzer != "local-chroma-v1"
            || analysis.confidence != "low"
            || !analysis.seconds.is_finite()
            || !(2.0..=1200.0).contains(&analysis.seconds)
            || (analysis.seconds - self.info.seconds).abs() > 1.0 / 48_000.0
            || analysis
                .bpm
                .is_some_and(|b| !b.is_finite() || !(40.0..=250.0).contains(&b))
            || analysis.beats.len() > 5000
            || analysis.chords.len() > 5000
            || analysis.beats.iter().enumerate().any(|(i, b)| {
                !b.is_finite()
                    || *b < 0.0
                    || *b >= analysis.seconds
                    || (i > 0 && *b <= analysis.beats[i - 1])
            })
            || analysis.chords.iter().enumerate().any(|(i, c)| {
                !c.start.is_finite()
                    || !c.end.is_finite()
                    || c.start < 0.0
                    || c.end <= c.start
                    || c.end > analysis.seconds
                    || (i > 0 && c.start < analysis.chords[i - 1].end)
                    || c.chord
                        .as_ref()
                        .is_some_and(|s| !valid_note(s.strip_suffix('m').unwrap_or(s)))
            })
            || analysis.key.as_ref().is_some_and(|s| {
                !s.strip_suffix(" major")
                    .or_else(|| s.strip_suffix(" minor"))
                    .is_some_and(valid_note)
            })
        {
            return Err("Saved analysis is invalid or does not match this audio. Analyze it again in Songs.".into());
        }
        self.analysis = Some(analysis);
        self.info.analysis_error = None;
        Ok(())
    }

    /// One atomic word identifies both the decoded source and its 48 kHz frame.
    /// The source cap is under 58 million frames, comfortably within u32.
    fn stamp(&self) -> u64 {
        ((self.serial as u64) << 32) | self.position.min(self.samples.len() as f64 / 2.0) as u64
    }

    pub(crate) fn played_state(&self, stamp: u64) -> ReferenceState {
        let mut state = self.info.clone();
        let playing = state.state == "playing";
        let serial = (stamp >> 32) as u32;
        let parameters = if !playing || serial == self.serial {
            Some((self.info.speed, self.info.semitones, self.info.ramp))
        } else {
            self.previous_parameters
                .iter()
                .find(|(id, _, _, _)| *id == serial)
                .map(|(_, speed, semitones, ramp)| (*speed, *semitones, *ramp))
        };
        let Some((speed, semitones, ramp)) = parameters else {
            state.position = 0.0;
            state.ramp = None;
            if self.analysis.is_some() {
                state.analysis_error = Some("Waiting for updated reference output.".into());
            }
            return state;
        };
        // Once paused/stopped, commands own the cursor and prepared parameters.
        // A completed old output buffer must not undo Stop, seek or a speed edit.
        if playing {
            state.position = (stamp as u32) as f64 / 48_000.0;
        }
        state.ramp = ramp;
        state.grid = self.grid.as_ref().map(|g| g.state(state.position, speed));
        state.analysis = self.analysis.as_ref().map(|a| {
            let index = a.chords.partition_point(|c| c.end <= state.position);
            let chord = a
                .chords
                .get(index)
                .filter(|c| c.start <= state.position)
                .and_then(|c| c.chord.clone());
            let next_chord = a
                .chords
                .iter()
                .skip(index)
                .find(|c| c.start > state.position && c.chord != chord)
                .and_then(|c| c.chord.clone());
            let beat = a.beats.partition_point(|b| *b <= state.position);
            ReferenceAnalysisState {
                confidence: a.confidence.clone(),
                bpm: a.bpm.map(|bpm| bpm * speed),
                key: a
                    .key
                    .as_deref()
                    .and_then(|s| transpose_estimate(s, semitones)),
                chord: chord
                    .as_deref()
                    .and_then(|s| transpose_estimate(s, semitones)),
                next_chord: next_chord
                    .as_deref()
                    .and_then(|s| transpose_estimate(s, semitones)),
                beat: (beat > 0 && state.position < state.seconds).then_some(beat),
                beat_count: a.beats.len(),
            }
        });
        state
    }

    pub fn play(&mut self) {
        if self.position >= self.samples.len() as f64 / 2.0 {
            self.stop();
        }
        if self.info.state != "playing" {
            self.fade_in = 96.0;
        }
        self.info.state = "playing".into();
    }
    pub fn pause(&mut self) {
        self.info.state = "paused".into();
        self.transition_from = None;
    }
    pub fn stop(&mut self) {
        self.invalidate_streams();
        self.last_frame = [0.0; 2];
        self.transition_from = None;
        self.position = 0.0;
        self.fade_in = 96.0;
        self.info.position = 0.0;
        self.info.state = "stopped".into();
        if let Err(error) = self.configure_ramp(self.info.ramp.map(|r| r.config)) {
            self.info.processing_error = Some(error);
        }
    }
    pub fn seek(&mut self, seconds: f64) -> Result<(), String> {
        if !seconds.is_finite() || !(0.0..=self.info.seconds).contains(&seconds) {
            return Err("Choose a position inside the reference song.".into());
        }
        self.configure_ramp(None)?;
        self.position = seconds * 48_000.0;
        self.invalidate_streams();
        self.transition_from = (self.info.state == "playing").then_some(self.last_frame);
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
        self.configure_ramp(None)?;
        self.info.loop_end = end;
        self.info.loop_enabled = enabled;
        self.invalidate_streams();
        if self.info.speed != 1.0 || self.info.semitones != 0 {
            self.fade_in = 96.0;
            self.transition_from = (self.info.state == "playing").then_some(self.last_frame);
        }
        Ok(())
    }

    /// All processing stays at 48 kHz, interpolated for the negotiated output rate.
    pub fn render(&mut self, rate: u32, left: &mut [f32], right: &mut [f32]) {
        self.render_timed(rate, left, right, &mut []);
    }

    pub(crate) fn render_timed(
        &mut self,
        rate: u32,
        left: &mut [f32],
        right: &mut [f32],
        positions: &mut [u64],
    ) {
        left.fill(0.0);
        right.fill(0.0);
        positions.fill(self.stamp());
        if rate == 0 || self.info.state != "playing" {
            return;
        }
        let length = self.samples.len() / 2;
        let loop_start = self.info.loop_start * 48_000.0;
        let loop_end = self.info.loop_end * 48_000.0;
        for (i, (l, r)) in left.iter_mut().zip(right).enumerate() {
            if let Err(error) = self.advance_ramp() {
                self.info.processing_error = Some(error);
                self.info.state = "paused".into();
                break;
            }
            if self.info.loop_enabled && self.position >= loop_end {
                self.position =
                    loop_start + (self.position - loop_end).rem_euclid(loop_end - loop_start);
                self.fade_in = 96.0;
                self.invalidate_streams();
                self.transition_from = None;
                self.ramp_end = self
                    .grid
                    .as_ref()
                    .and_then(|g| ramp::next_end(g, loop_start));
            }
            if self.position >= length as f64 {
                self.position = length as f64;
                self.info.state = "stopped".into();
                if let Some(tail) = positions.get_mut(i..) {
                    tail.fill(self.stamp());
                }
                break;
            }
            if let Some(stamp) = positions.get_mut(i) {
                *stamp = self.stamp();
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
                .min((end - self.position) / (96.0 * self.info.speed))
                .clamp(0.0, 1.0) as f32;
            let processing = self.info.speed != 1.0 || self.info.semitones != 0;
            *l = (self.samples[a * 2] + (self.samples[b * 2] - self.samples[a * 2]) * fraction)
                * gain;
            *r = (self.samples[a * 2 + 1]
                + (self.samples[b * 2 + 1] - self.samples[a * 2 + 1]) * fraction)
                * gain;
            if processing || !self.info.stems.is_empty() {
                *l = 0.0;
                *r = 0.0;
                for index in 0..self.streams.len() {
                    let stem_gain = if let Some(stem) = self.info.stems.get(index) {
                        let target = if stem.muted { 0.0 } else { stem.gain };
                        // A bounded 2 ms full-scale ramp avoids clicks on gain/mute changes.
                        let current = &mut self.stem_gains[index];
                        let step = 2.0 * 48_000.0 / (96.0 * rate as f32);
                        *current += (target - *current).clamp(-step, step);
                        *current
                    } else {
                        1.0
                    };
                    let samples = if index == 0 {
                        &self.samples
                    } else {
                        &self.extra_samples[index - 1]
                    };
                    let frame = if processing {
                        let limit = (end.ceil() as usize).min(length) * 2;
                        match self.streams[index].frame(&samples[..limit], self.position, rate) {
                            Ok(frame) => frame,
                            Err(error) => {
                                self.info.processing_error = Some(error);
                                self.info.state = "paused".into();
                                *l = 0.0;
                                *r = 0.0;
                                break;
                            }
                        }
                    } else {
                        [0, 1].map(|c| {
                            samples[a * 2 + c]
                                + (samples[b * 2 + c] - samples[a * 2 + c]) * fraction
                        })
                    };
                    *l += frame[0] * gain * stem_gain;
                    *r += frame[1] * gain * stem_gain;
                }
            }
            if self.info.processing_error.is_some() {
                break;
            }
            // De-click a processor restart from the last emitted level over 2 ms.
            // This is a short held-sample ramp, not parallel processing of the old mix.
            if let Some(previous) = self.transition_from {
                let old_gain = (self.fade_in / 96.0).clamp(0.0, 1.0) as f32;
                *l += previous[0] * old_gain;
                *r += previous[1] * old_gain;
                if self.fade_in == 0.0 {
                    self.transition_from = None;
                }
            }
            self.last_frame = [*l, *r];
            self.position += self.info.speed * 48_000.0 / rate as f64;
            self.fade_in = (self.fade_in - 48_000.0 / rate as f64).max(0.0);
        }
        self.info.position = (self.position / 48_000.0).min(self.info.seconds);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn queued_positions_cannot_override_stop_or_paused_edits() {
        let mut song =
            ReferenceSong::new("source".into(), "Fixture".into(), vec![0.0; 480_000]).unwrap();
        song.set_grid(
            serde_json::from_str(include_str!(
                "../../../tests/fixtures/seams/reference-grid.json"
            ))
            .unwrap(),
        )
        .unwrap();
        song.seek(0.25).unwrap();
        let before_stop = song.stamp();
        song.stop();
        assert_eq!(song.played_state(before_stop).position, 0.0);
        song.seek(2.5).unwrap();
        let before_edit = song.stamp();
        song.pause();
        song.seek(3.1).unwrap();
        song.set_processing(0.75, 2).unwrap();
        let paused = song.played_state(before_edit);
        assert_eq!(paused.position, 3.1);
        assert!((paused.grid.unwrap().position.unwrap().bpm - 75.0).abs() < 1e-9);
        song.play();
        let playing = song.played_state(before_edit);
        assert_eq!(
            playing.position, 2.5,
            "playing still follows the consumed queue"
        );
        assert!((playing.grid.unwrap().position.unwrap().bpm - 100.0).abs() < 1e-9);
    }

    #[test]
    fn processing_changes_declick_without_losing_old_queued_chord_parameters() {
        let samples: Vec<f32> = (0..192_000)
            .flat_map(|i| {
                [(i as f64 * 1000.0 * std::f64::consts::TAU / 48_000.0).sin() as f32 * 0.2; 2]
            })
            .collect();
        let mut song = ReferenceSong::new("source".into(), "Tone".into(), samples).unwrap();
        let mut analysis: jam_dsp::offline::SongAnalysis = serde_json::from_str(include_str!(
            "../../../tests/fixtures/seams/song-analysis.json"
        ))
        .unwrap();
        analysis.seconds = 4.0;
        song.set_analysis(analysis).unwrap();
        song.play();
        let mut left = vec![0.0; 4096];
        let mut right = left.clone();
        let mut stamps = vec![0; left.len()];
        song.render_timed(48_000, &mut left, &mut right, &mut stamps);
        let previous = *left.last().unwrap();
        let old_stamp = *stamps.last().unwrap();
        song.set_processing(0.75, 2).unwrap();
        let old = song.played_state(old_stamp).analysis.unwrap();
        assert_eq!(old.chord.as_deref(), Some("C"));
        assert_eq!(old.bpm, Some(90.0));
        song.render_timed(48_000, &mut left, &mut right, &mut stamps);
        assert!((left[0] - previous).abs() < 0.03);
        assert!(left[..200].windows(2).all(|p| (p[1] - p[0]).abs() < 0.04));
        let new = song.played_state(stamps[0]).analysis.unwrap();
        assert_eq!(new.chord.as_deref(), Some("D"));
        assert_eq!(new.bpm, Some(67.5));
        assert_eq!(new.key.as_deref(), Some("D major"));
        assert_eq!(
            transpose_estimate("Bb minor", 2).as_deref(),
            Some("C minor")
        );
        let config = (song.info.speed, song.info.semitones);
        for (speed, pitch) in [(f64::NAN, 0), (0.49, 0), (1.51, 0), (1.0, 13)] {
            assert!(song.set_processing(speed, pitch).is_err());
            assert_eq!((song.info.speed, song.info.semitones), config);
        }
    }
    #[test]
    fn live_stem_processing_preserves_pitch_and_source_timing_across_output_rates() {
        let band: Vec<f32> = (0..96_000)
            .flat_map(|i| {
                [1000.0, 500.0]
                    .map(|hz| (i as f64 * hz * std::f64::consts::TAU / 48_000.0).sin() as f32 * 0.2)
            })
            .collect();
        let guitar: Vec<f32> = (0..96_000)
            .flat_map(|i| {
                [(i as f64 * 1100.0 * std::f64::consts::TAU / 48_000.0).sin() as f32 * 0.2; 2]
            })
            .collect();
        let mix = vec![
            StemMix {
                id: "guitar".into(),
                label: "Guitar".into(),
                gain: 1.0,
                muted: true,
                guitar: true,
            },
            StemMix {
                id: "band".into(),
                label: "Band".into(),
                gain: 1.0,
                muted: false,
                guitar: false,
            },
        ];
        for rate in [44_100, 48_000, 96_000] {
            for (speed, pitch) in [
                (0.5, 0),
                (0.8, 0),
                (1.25, 0),
                (1.5, 0),
                (0.75, 2),
                (1.0, -12),
                (1.0, 12),
            ] {
                let mut song = ReferenceSong::with_stems(
                    "source".into(),
                    "Synthetic stems".into(),
                    mix.clone(),
                    vec![guitar.clone(), band.clone()],
                )
                .unwrap();
                song.set_processing(speed, pitch).unwrap();
                song.play();
                let frames = (2.0 / speed * rate as f64).ceil() as usize;
                let mut output = [Vec::new(), Vec::new()];
                let mut rendered = 0;
                let mut block_index = 0;
                while rendered < frames + 1024 {
                    let count = [63, 257, 1024][block_index % 3];
                    block_index += 1;
                    let mut left = vec![0.0; count];
                    let mut right = left.clone();
                    let mut stamps = vec![0; count];
                    song.render_timed(rate, &mut left, &mut right, &mut stamps);
                    if rendered + count < frames {
                        let heard = song.played_state(*stamps.last().unwrap());
                        let expected = (rendered + count - 1) as f64 * speed / rate as f64;
                        assert!(((heard.position - expected)*48_000.0).abs() <= 1.0 + 1e-7, "rate {rate}, speed {speed}, rendered {rendered}, count {count}: heard {} expected {expected}, error {} frames", heard.position, (heard.position-expected)*48_000.0);
                    }
                    output[0].extend(left);
                    output[1].extend(right);
                    rendered += count;
                }
                assert!(
                    song.info.processing_error.is_none(),
                    "{:?}",
                    song.info.processing_error
                );
                assert_eq!(song.info.state, "stopped");
                assert_eq!(song.info.position, 2.0);
                for (channel, hz) in [(0, 1000.0), (1, 500.0)] {
                    let samples = &output[channel][frames / 4..frames * 3 / 4];
                    let crossings: Vec<f64> = samples
                        .windows(2)
                        .enumerate()
                        .filter(|(_, p)| p[0] <= 0.0 && p[1] > 0.0)
                        .map(|(i, p)| i as f64 + (-p[0] / (p[1] - p[0])) as f64)
                        .collect();
                    let frequency = (crossings.len() - 1) as f64 * rate as f64
                        / (crossings.last().unwrap() - crossings[0]);
                    let expected = hz * 2.0f64.powf(pitch as f64 / 12.0);
                    let cents = 1200.0 * (frequency / expected).log2();
                    assert!(
                        cents.abs() <= 5.0,
                        "rate {rate}, speed {speed}, pitch {pitch}: {frequency} Hz ({cents} cents)"
                    );
                    if speed == 0.8 && channel == 0 {
                        assert!((frequency - 1000.0).abs() <= 1.0);
                    }
                    let rms =
                        (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
                    assert!(
                        (0.10..0.18).contains(&rms),
                        "Backing must mix once, with guitar absent: {rms}"
                    );
                    assert!(output[channel][frames + 1..].iter().all(|v| *v == 0.0));
                }
                song.set_loop(1.0, 2.0, true).unwrap();
                song.seek(1.9).unwrap();
                song.play();
                let mut left = vec![0.0; rate as usize / 2];
                let mut right = left.clone();
                song.render(rate, &mut left, &mut right);
                assert!(
                    (song.info.position - (1.9 + 0.5 * speed - 1.0)).abs() <= 1.0 / rate as f64
                );
                let before = song.info.position;
                song.pause();
                song.render(rate, &mut left, &mut right);
                assert_eq!(song.info.position, before);
                assert!(left.iter().all(|v| *v == 0.0));
            }
        }
    }

    #[test]
    #[ignore = "developer CPU measurement; run explicitly with JAM_AUDIO_PERF=1"]
    fn live_eight_stem_processing_stays_ahead_of_output() {
        assert_eq!(std::env::var("JAM_AUDIO_PERF").as_deref(), Ok("1"));
        let samples: Vec<f32> = (0..480_000)
            .flat_map(|i| {
                [(i as f64 * 440.0 * std::f64::consts::TAU / 48_000.0).sin() as f32 * 0.05; 2]
            })
            .collect();
        let mix = (0..8)
            .map(|i| StemMix {
                id: i.to_string(),
                label: i.to_string(),
                gain: 1.0,
                muted: false,
                guitar: false,
            })
            .collect();
        let mut song =
            ReferenceSong::with_stems("perf".into(), "Eight stems".into(), mix, vec![samples; 8])
                .unwrap();
        song.set_processing(0.75, 2).unwrap();
        song.play();
        let mut left = [0.0; 256];
        let mut right = left;
        let began = std::time::Instant::now();
        let mut peak = std::time::Duration::ZERO;
        for _ in 0..1500 {
            let block = std::time::Instant::now();
            song.render(48_000, &mut left, &mut right);
            peak = peak.max(block.elapsed());
        }
        let elapsed = began.elapsed();
        eprintln!(
            "8 stems / 8 seconds: {:.3}s CPU elapsed, worst 256-frame block {:.3}ms",
            elapsed.as_secs_f64(),
            peak.as_secs_f64() * 1000.0
        );
        assert!(elapsed.as_secs_f64() < 8.0);
        assert!(song.info.processing_error.is_none());
    }
    #[test]
    fn stems_mix_once_and_mute_guitar_on_the_shared_cursor() {
        let mix = vec![
            StemMix {
                id: "guitar".into(),
                label: "Guitar".into(),
                gain: 1.0,
                muted: false,
                guitar: true,
            },
            StemMix {
                id: "band".into(),
                label: "Band".into(),
                gain: 0.5,
                muted: false,
                guitar: false,
            },
        ];
        for rate in [44_100, 48_000, 96_000] {
            let mut song = ReferenceSong::with_stems(
                "source".into(),
                "Fixture".into(),
                mix.clone(),
                vec![vec![0.2; 96_000], vec![0.4; 96_000]],
            )
            .unwrap();
            let mut left = vec![0.0; rate as usize / 100];
            let mut right = left.clone();
            song.play();
            song.render(rate, &mut left, &mut right);
            assert!((left.last().unwrap() - 0.4).abs() < 1e-6);
            let mut minus = mix.clone();
            minus[0].muted = true;
            song.set_stem_mix(minus).unwrap();
            song.render(rate, &mut left, &mut right);
            assert!((left.last().unwrap() - 0.2).abs() < 1e-6);
            assert!(left.windows(2).all(|p| (p[1] - p[0]).abs() < 0.005));
            assert!((song.info.position - 0.02).abs() < 1.0 / rate as f64);
            song.set_loop(0.2, 0.4, true).unwrap();
            song.seek(0.399).unwrap();
            song.render(rate, &mut left, &mut right);
            assert!((left.last().unwrap() - 0.2).abs() < 1e-6);
            assert!((song.info.position - 0.209).abs() < 1.0 / rate as f64);
            let mut invalid = mix.clone();
            invalid[0].gain = f32::NAN;
            assert!(song.set_stem_mix(invalid).is_err());
        }
        assert!(ReferenceSong::with_stems(
            "s".into(),
            "s".into(),
            mix,
            vec![vec![0.1; 9600], vec![0.1; 9602]]
        )
        .is_err());
    }
    #[test]
    fn chord_readout_uses_consumed_positions_across_seek_loop_and_source_replacement() {
        let mut song =
            ReferenceSong::new("chords".into(), "Chords".into(), vec![0.2; 384_000]).unwrap();
        let mut analysis: jam_dsp::offline::SongAnalysis = serde_json::from_str(include_str!(
            "../../../tests/fixtures/seams/song-analysis.json"
        ))
        .unwrap();
        analysis.seconds = 4.0;
        analysis.beats = vec![0.0, 1.0, 2.0, 3.0];
        analysis.chords = ["C", "F", "G", "C"]
            .iter()
            .enumerate()
            .map(|(i, c)| jam_dsp::offline::ChordEstimate {
                start: i as f64,
                end: i as f64 + 1.0,
                chord: Some((*c).into()),
            })
            .collect();
        song.set_analysis(analysis).unwrap();
        for rate in [44_100, 48_000, 96_000] {
            song.seek(0.9).unwrap();
            song.play();
            let mut left = vec![0.0; rate as usize / 4];
            let mut right = left.clone();
            let mut positions = vec![0; left.len()];
            song.render_timed(rate, &mut left, &mut right, &mut positions);
            let before = song.played_state(positions[0]);
            assert_eq!(before.analysis.unwrap().chord.as_deref(), Some("C"));
            let after = song.played_state(*positions.last().unwrap());
            assert_eq!(after.analysis.unwrap().chord.as_deref(), Some("F"));
            assert!((after.position - (1.15 - 1.0 / rate as f64)).abs() < 1.0 / 48_000.0);
            song.set_loop(1.0, 2.0, true).unwrap();
            song.seek(1.9).unwrap();
            song.render_timed(rate, &mut left, &mut right, &mut positions);
            assert!((song.played_state(*positions.last().unwrap()).position - 1.15).abs() < 0.001);
            song.set_loop(0.0, 4.0, false).unwrap();
        }
        let old = song.stamp();
        let replacement =
            ReferenceSong::new("new".into(), "New".into(), vec![0.1; 384_000]).unwrap();
        assert_eq!(replacement.played_state(old).position, 0.0);
        for corrupt in [
            (|a: &mut jam_dsp::offline::SongAnalysis| a.schema_version = 2)
                as fn(&mut jam_dsp::offline::SongAnalysis),
            |a| a.beats = vec![1.0, 0.0],
            |a| a.beats = vec![f64::NAN],
            |a| a.seconds = 3.0,
            |a| a.chords[0].end = 9.0,
            |a| a.chords[0].chord = Some("not a chord".into()),
            |a| a.key = Some("not a key".into()),
        ] {
            let mut invalid = song.analysis.clone().unwrap();
            corrupt(&mut invalid);
            assert!(song.set_analysis(invalid).is_err());
        }
    }
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
