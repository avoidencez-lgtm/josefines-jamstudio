//! engine: Lock-free audio engine with render-ahead worker thread, timeline transport, drum sequencer, click, and tuner metering.

use crate::devices::AudioConfig;
use crate::io::{AudioInput, AudioOutput, CpalInput, CpalOutput, FileInput, NullOutput};
use jam_band::sequencer::{BandSequencer, Cue};
use jam_core::chart::ResolvedChart;
use jam_core::style::Style;
use jam_core::timeline::{Timeline, TimelineEvent, TransportState};
use jam_dsp::{calculate_level, EnergyFollower, PitchTracker};
use rtrb::RingBuffer;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EngineTelemetry {
    pub xruns: u64,
    pub input_level: MeterTelemetry,
    pub output_level: MeterTelemetry,
    pub tuner: Option<TunerTelemetry>,
    pub transport: TransportTelemetry,
    pub band: BandTelemetry,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MeterTelemetry {
    pub peak_db: f32,
    pub rms_db: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunerTelemetry {
    pub hz: f32,
    pub note: String,
    pub cents: f32,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransportTelemetry {
    pub state: String,
    pub bar: u32,
    pub beat: u32,
    pub bpm: f64,
    pub time_signature: (u8, u8),
    pub loop_enabled: bool,
    pub loop_start_bar: u32,
    pub loop_end_bar: u32,
    pub count_in_bars: u32,
}

impl Default for TransportTelemetry {
    fn default() -> Self {
        Self {
            state: "stopped".into(),
            bar: 1,
            beat: 1,
            bpm: 120.0,
            time_signature: (4, 4),
            loop_enabled: false,
            loop_start_bar: 1,
            loop_end_bar: 5,
            count_in_bars: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BandTelemetry {
    pub style_id: String,
    pub style_name: String,
    pub intensity: f32,
    pub active_cue: String,
    pub pending_cue: String,
    pub current_chord: String,
    pub next_chord: Option<String>,
    pub mute_drums: bool,
    pub mute_bass: bool,
    pub mute_comp: bool,
    pub follow_energy: bool,
    pub current_energy: f32,
    pub pending_style_id: Option<String>,
    pub pending_intensity: Option<f32>,
}

impl Default for BandTelemetry {
    fn default() -> Self {
        Self {
            style_id: "blues-shuffle".into(),
            style_name: "Blues Shuffle".into(),
            intensity: 0.5,
            active_cue: "none".into(),
            pending_cue: "none".into(),
            current_chord: "A7".into(),
            next_chord: Some("D7".into()),
            mute_drums: false,
            mute_bass: false,
            mute_comp: false,
            follow_energy: false,
            current_energy: 0.0,
            pending_style_id: None,
            pending_intensity: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BandPatch {
    pub style: Option<Style>,
    pub intensity: Option<f32>,
    pub follow_energy: Option<bool>,
    pub mute_drums: Option<bool>,
    pub mute_bass: Option<bool>,
    pub mute_comp: Option<bool>,
    pub at_next_bar: bool,
}

pub struct AudioEngine {
    config: AudioConfig,
    running: Arc<AtomicBool>,
    tone_active: Arc<AtomicBool>,
    tone_hz: Arc<Mutex<f32>>,
    tuner_active: Arc<AtomicBool>,
    xruns: Arc<AtomicU64>,
    timeline: Arc<Mutex<Timeline>>,
    sequencer: Arc<Mutex<BandSequencer>>,
    click_volume: Arc<Mutex<f32>>,
    recorder: Arc<Mutex<crate::recorder::TakeRecorder>>,
    latest_telemetry: Arc<Mutex<EngineTelemetry>>,
    input_driver: Option<Box<dyn AudioInput>>,
    output_driver: Option<Box<dyn AudioOutput>>,
    render_handle: Option<JoinHandle<()>>,
}

impl AudioEngine {
    pub fn new(config: AudioConfig) -> Self {
        let sample_rate = config.sample_rate;
        let default_style: Style =
            serde_json::from_str(include_str!("../../../styles/blues-shuffle.json"))
                .unwrap_or_else(|_| Style {
                    schema_version: 1,
                    id: "blues-shuffle".into(),
                    name: "Blues Shuffle".into(),
                    genre: "Blues".into(),
                    feel: jam_core::style::StyleFeel {
                        swing: 0.67,
                        time_sig: (4, 4),
                        bpm_range: (60.0, 180.0),
                    },
                    kit_id: "standard-rock-kit".into(),
                    bass_program: "finger-bass".into(),
                    comp_program: "clean-guitar".into(),
                    patterns: vec![],
                    fills: vec![],
                    endings: vec![],
                    humanize: jam_core::style::StyleHumanize {
                        timing_ms: 2.0,
                        velocity: 0.05,
                    },
                });

        let sequencer = BandSequencer::new(default_style, sample_rate, 42);
        let takes_dir = dirs_base().join("takes");
        let recorder = crate::recorder::TakeRecorder::new(sample_rate, takes_dir);

        Self {
            config,
            running: Arc::new(AtomicBool::new(false)),
            tone_active: Arc::new(AtomicBool::new(false)),
            tone_hz: Arc::new(Mutex::new(440.0)),
            tuner_active: Arc::new(AtomicBool::new(true)),
            xruns: Arc::new(AtomicU64::new(0)),
            timeline: Arc::new(Mutex::new(Timeline::new(sample_rate, 120.0, (4, 4)))),
            sequencer: Arc::new(Mutex::new(sequencer)),
            click_volume: Arc::new(Mutex::new(0.7)),
            recorder: Arc::new(Mutex::new(recorder)),
            latest_telemetry: Arc::new(Mutex::new(EngineTelemetry::default())),
            input_driver: None,
            output_driver: None,
            render_handle: None,
        }
    }

    pub fn set_tone(&self, on: bool, hz: f32) {
        self.tone_active.store(on, Ordering::SeqCst);
        *self.tone_hz.lock().unwrap() = hz;
    }

    pub fn set_tuner(&self, on: bool) {
        self.tuner_active.store(on, Ordering::SeqCst);
    }

    pub fn set_click_volume(&self, vol: f32) {
        *self.click_volume.lock().unwrap() = vol.clamp(0.0, 1.0);
    }

    pub fn transport_play(&self) {
        self.timeline.lock().unwrap().play();
    }

    pub fn transport_pause(&self) {
        self.timeline.lock().unwrap().pause();
    }

    pub fn transport_stop(&self) {
        self.timeline.lock().unwrap().stop();
    }

    pub fn transport_seek_bar(&self, bar: u32) {
        self.timeline.lock().unwrap().seek_bar(bar);
    }

    pub fn transport_set_loop(&self, start_bar: u32, end_bar: u32, enabled: bool) {
        self.timeline
            .lock()
            .unwrap()
            .set_loop(start_bar, end_bar, enabled);
    }

    pub fn transport_set_count_in(&self, bars: u32) {
        self.timeline.lock().unwrap().set_count_in(bars);
    }

    pub fn transport_set_tempo(&self, bpm: f64) {
        self.timeline.lock().unwrap().set_bpm(bpm);
    }

    pub fn transport_set_time_signature(&self, ts: (u8, u8)) {
        self.timeline.lock().unwrap().set_time_signature(ts);
    }

    pub fn band_set_style(&self, style: Style) {
        self.sequencer.lock().unwrap().set_style(style);
    }

    pub fn band_set_intensity(&self, intensity: f32) {
        self.sequencer.lock().unwrap().set_intensity(intensity);
    }

    pub fn band_cue(&self, cue: Cue) {
        self.sequencer.lock().unwrap().cue(cue);
    }

    pub fn band_load_chart(&self, chart: ResolvedChart) {
        self.sequencer.lock().unwrap().load_chart(chart);
    }

    pub fn recorder_start(&self, session_id: String) -> String {
        let (style_id, tempo) = {
            let seq = self.sequencer.lock().unwrap();
            (seq.style.id.clone(), self.timeline.lock().unwrap().bpm)
        };
        let chart_id = self
            .sequencer
            .lock()
            .unwrap()
            .current_chart
            .as_ref()
            .map(|c| c.id.clone())
            .unwrap_or_else(|| "blues-12-bar".into());
        self.recorder
            .lock()
            .unwrap()
            .start_take(session_id, style_id, chart_id, tempo)
    }

    pub fn recorder_stop(&self) -> Result<crate::recorder::TakeMetadata, String> {
        self.recorder.lock().unwrap().stop_and_save()
    }

    pub fn recorder_set_latency_compensation(&self, offset_samples: usize) {
        self.recorder
            .lock()
            .unwrap()
            .set_latency_compensation(offset_samples);
    }

    pub fn recorder_is_recording(&self) -> bool {
        self.recorder.lock().unwrap().is_recording()
    }

    pub fn band_set(&self, patch: BandPatch) {
        let mut seq = self.sequencer.lock().unwrap();
        if let Some(st) = patch.style {
            if patch.at_next_bar {
                seq.queue_style_at_next_bar(st);
            } else {
                seq.set_style(st);
            }
        }
        if let Some(int) = patch.intensity {
            if patch.at_next_bar {
                seq.queue_intensity_at_next_bar(int);
            } else {
                seq.set_intensity(int);
            }
        }
        if let Some(follow) = patch.follow_energy {
            seq.set_follow_energy(follow);
        }
        let md = patch.mute_drums.unwrap_or(seq.mute_drums);
        let mb = patch.mute_bass.unwrap_or(seq.mute_bass);
        let mc = patch.mute_comp.unwrap_or(seq.mute_comp);
        seq.set_parts(md, mb, mc);
    }

    pub fn get_telemetry(&self) -> EngineTelemetry {
        self.latest_telemetry.lock().unwrap().clone()
    }

    pub fn start(&mut self) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.running.store(true, Ordering::SeqCst);
        let sample_rate = self.config.sample_rate;
        let buffer_size = self.config.buffer_size as usize;

        let ring_capacity = (sample_rate as usize / 5) * 2; // ~200ms stereo
        let (output_prod, mut output_cons) = RingBuffer::<f32>::new(ring_capacity);
        let (mut input_prod, mut input_cons) = RingBuffer::<f32>::new(ring_capacity);

        let running = Arc::clone(&self.running);
        let tone_active = Arc::clone(&self.tone_active);
        let tone_hz = Arc::clone(&self.tone_hz);
        let tuner_active = Arc::clone(&self.tuner_active);
        let xruns = Arc::clone(&self.xruns);
        let timeline_arc = Arc::clone(&self.timeline);
        let sequencer_arc = Arc::clone(&self.sequencer);
        let click_vol_arc = Arc::clone(&self.click_volume);
        let recorder_arc = Arc::clone(&self.recorder);
        let telemetry = Arc::clone(&self.latest_telemetry);

        let mut prod = output_prod;
        let render_handle = thread::spawn(move || {
            let mut phase: f32 = 0.0;
            let mut pitch_tracker = PitchTracker::new(2048, sample_rate);
            let mut energy_follower = EnergyFollower::new(sample_rate);
            let mut input_accumulator: Vec<f32> = Vec::with_capacity(2048);

            let mut click_active_samples: usize = 0;
            let mut click_freq: f32 = 800.0;
            let click_duration = (sample_rate as f32 * 0.01) as usize; // 10ms click

            let block_frames = 256;
            let mut block_left = vec![0.0f32; block_frames];
            let mut block_right = vec![0.0f32; block_frames];
            let mut band_left = vec![0.0f32; block_frames];
            let mut band_right = vec![0.0f32; block_frames];

            while running.load(Ordering::SeqCst) {
                // Process input samples for metering, tuner, and energy following
                let mut in_samples = Vec::new();
                while let Ok(s) = input_cons.pop() {
                    in_samples.push(s);
                }

                let mut in_meter = MeterTelemetry::default();
                let mut tuner_res: Option<TunerTelemetry> = None;

                if !in_samples.is_empty() {
                    let lvl = calculate_level(&in_samples);
                    in_meter.peak_db = lvl.peak_db;
                    in_meter.rms_db = lvl.rms_db;

                    // Update energy follower
                    let energy = energy_follower.process_block(&in_samples);
                    sequencer_arc.lock().unwrap().update_energy(energy);

                    if tuner_active.load(Ordering::SeqCst) {
                        input_accumulator.extend_from_slice(&in_samples);
                        if input_accumulator.len() >= 2048 {
                            if let Some(p) = pitch_tracker.detect(&input_accumulator) {
                                tuner_res = Some(TunerTelemetry {
                                    hz: p.hz,
                                    note: p.note,
                                    cents: p.cents,
                                    confidence: p.confidence,
                                });
                            }
                            input_accumulator.drain(0..input_accumulator.len() - 1024);
                        }
                    }
                }

                // Advance timeline and dispatch events to BandSequencer
                let (events, transport_telem) = {
                    let mut tl = timeline_arc.lock().unwrap();
                    let evs = tl.advance(block_frames);
                    let pos = tl.current_position();
                    let state_str = match tl.state {
                        TransportState::Stopped => "stopped",
                        TransportState::CountingIn { .. } => "counting_in",
                        TransportState::Playing => "playing",
                        TransportState::Paused => "paused",
                    };
                    let (disp_bar, disp_beat) = match tl.state {
                        TransportState::CountingIn { bar, beat, .. } => (bar, beat),
                        _ => (pos.bar, pos.beat),
                    };

                    (
                        evs,
                        TransportTelemetry {
                            state: state_str.into(),
                            bar: disp_bar,
                            beat: disp_beat,
                            bpm: tl.bpm,
                            time_signature: tl.time_signature,
                            loop_enabled: tl.loop_enabled,
                            loop_start_bar: tl.loop_start_bar,
                            loop_end_bar: tl.loop_end_bar,
                            count_in_bars: tl.count_in_bars,
                        },
                    )
                };

                // Forward events to BandSequencer and render band (drums + bass + comp)
                let band_telem = {
                    let mut seq = sequencer_arc.lock().unwrap();
                    for ev in &events {
                        seq.handle_timeline_event(ev);
                    }

                    band_left.fill(0.0);
                    band_right.fill(0.0);
                    if transport_telem.state == "playing" {
                        seq.render(&mut band_left, &mut band_right);
                    }

                    let cue_to_str = |c: Cue| match c {
                        Cue::None => "none",
                        Cue::Fill => "fill",
                        Cue::Crash => "crash",
                        Cue::Stop => "stop",
                        Cue::Ending => "ending",
                    };

                    BandTelemetry {
                        style_id: seq.style.id.clone(),
                        style_name: seq.style.name.clone(),
                        intensity: seq.intensity,
                        active_cue: cue_to_str(seq.active_cue).into(),
                        pending_cue: cue_to_str(seq.pending_cue).into(),
                        current_chord: seq.current_chord.clone(),
                        next_chord: seq.next_chord.clone(),
                        mute_drums: seq.mute_drums,
                        mute_bass: seq.mute_bass,
                        mute_comp: seq.mute_comp,
                        follow_energy: seq.follow_energy,
                        current_energy: seq.current_energy,
                        pending_style_id: seq.pending_style.as_ref().map(|s| s.id.clone()),
                        pending_intensity: seq.pending_intensity,
                    }
                };

                // Trigger click on Beat event
                for ev in &events {
                    if let TimelineEvent::Beat { beat, .. } = ev {
                        click_freq = if *beat == 1 { 1200.0 } else { 800.0 };
                        click_active_samples = click_duration;
                    }
                }

                block_left.fill(0.0);
                block_right.fill(0.0);

                let is_tone = tone_active.load(Ordering::SeqCst);
                let hz = *tone_hz.lock().unwrap();
                let click_vol = *click_vol_arc.lock().unwrap();
                let is_counting_in = transport_telem.state == "counting_in";

                for i in 0..block_frames {
                    let mut s = 0.0f32;

                    // 440 Hz test tone (muted during count-in)
                    if is_tone && !is_counting_in {
                        s += (phase * 2.0 * std::f32::consts::PI).sin() * 0.5;
                        phase = (phase + hz / sample_rate as f32) % 1.0;
                    }

                    // Render metronome / count-in click
                    if click_active_samples > 0 {
                        let sample_idx = click_duration - click_active_samples;
                        let t = sample_idx as f32 / sample_rate as f32;
                        let decay = click_active_samples as f32 / click_duration as f32;
                        let click_sample =
                            (t * 2.0 * std::f32::consts::PI * click_freq).sin() * decay * click_vol;
                        s += click_sample;
                        click_active_samples -= 1;
                    }

                    // Mix band (drums, bass, comp) + tone/click
                    block_left[i] = s + band_left[i];
                    block_right[i] = s + band_right[i];
                }

                // Stream to take recorder if active
                if recorder_arc.lock().unwrap().is_recording() {
                    let in_block = if in_samples.len() >= block_frames {
                        &in_samples[..block_frames]
                    } else {
                        &block_left[..]
                    };
                    recorder_arc.lock().unwrap().push_block(
                        in_block,
                        &band_left,
                        &band_right,
                        &block_left,
                        &block_right,
                    );
                }

                let out_lvl = calculate_level(&block_left);

                // Push stereo frames into output ring buffer
                let mut can_push = true;
                for i in 0..block_frames {
                    if prod.push(block_left[i]).is_err() || prod.push(block_right[i]).is_err() {
                        xruns.fetch_add(1, Ordering::Relaxed);
                        can_push = false;
                        break;
                    }
                }

                // Update telemetry
                {
                    let mut tel = telemetry.lock().unwrap();
                    tel.xruns = xruns.load(Ordering::Relaxed);
                    tel.input_level = in_meter;
                    tel.output_level = MeterTelemetry {
                        peak_db: out_lvl.peak_db,
                        rms_db: out_lvl.rms_db,
                    };
                    if let Some(t) = tuner_res {
                        tel.tuner = Some(t);
                    }
                    tel.transport = transport_telem;
                    tel.band = band_telem;
                }

                if can_push {
                    thread::sleep(Duration::from_millis(2));
                } else {
                    thread::sleep(Duration::from_millis(5));
                }
            }
        });

        self.render_handle = Some(render_handle);

        let headless = std::env::var("JAM_HEADLESS").unwrap_or_default() == "1";
        let mut output_driver: Box<dyn AudioOutput> = if headless {
            Box::new(NullOutput::new(sample_rate, buffer_size))
        } else {
            Box::new(CpalOutput::new(self.config.output_device.clone()))
        };

        output_driver.start(Box::new(move |buffer: &mut [f32]| {
            for sample in buffer.iter_mut() {
                *sample = output_cons.pop().unwrap_or(0.0);
            }
        }))?;

        self.output_driver = Some(output_driver);

        let fake_wav = std::env::var("JAM_FAKE_INPUT").ok();
        let mut input_driver: Box<dyn AudioInput> = if let Some(path) = fake_wav {
            Box::new(
                FileInput::from_wav_file(&path, buffer_size)
                    .map_err(|e| format!("JAM_FAKE_INPUT={path} failed: {e}"))?,
            )
        } else if headless {
            Box::new(FileInput::from_samples(vec![0.0; buffer_size], buffer_size))
        } else {
            Box::new(CpalInput::new(
                self.config.input_device.clone(),
                self.config.input_channel,
            ))
        };

        input_driver.start(Box::new(move |buffer: &[f32]| {
            for &sample in buffer {
                let _ = input_prod.push(sample);
            }
        }))?;

        self.input_driver = Some(input_driver);

        Ok(())
    }

    pub fn apply_config(&mut self, config: AudioConfig) -> Result<(), String> {
        self.stop()?;
        self.config = config;
        self.start()
    }

    pub fn stop(&mut self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);
        if let Some(mut out) = self.output_driver.take() {
            let _ = out.stop();
        }
        if let Some(mut inp) = self.input_driver.take() {
            let _ = inp.stop();
        }
        if let Some(handle) = self.render_handle.take() {
            let _ = handle.join();
        }
        Ok(())
    }
}

fn dirs_base() -> std::path::PathBuf {
    std::env::var("JAM_DATA_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("josefines_jamstudio"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_live_steering_and_parts_toggle() {
        std::env::set_var("JAM_HEADLESS", "1");
        let config = AudioConfig::default();
        let mut engine = AudioEngine::new(config);

        assert!(engine.start().is_ok());

        // Apply live steering patch (mute drums and bass, keep comp)
        engine.band_set(BandPatch {
            mute_drums: Some(true),
            mute_bass: Some(true),
            mute_comp: Some(false),
            follow_energy: Some(true),
            ..Default::default()
        });

        thread::sleep(Duration::from_millis(50));
        let tel = engine.get_telemetry();
        assert!(tel.band.mute_drums);
        assert!(tel.band.mute_bass);
        assert!(!tel.band.mute_comp);
        assert!(tel.band.follow_energy);

        assert!(engine.stop().is_ok());
    }
}
