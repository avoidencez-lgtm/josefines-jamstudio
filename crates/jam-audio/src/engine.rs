//! engine: the audio engine. A render thread runs the transport clock, drives the
//! band sequencer sample-accurately, mixes click/tone/band/input-monitor, feeds the
//! take recorder and publishes telemetry. Device I/O is behind [`AudioOutput`] /
//! [`AudioInput`]: real hardware through cpal, or a headless clock when there is no
//! device (CI, `JAM_HEADLESS=1`) or the device fails to open.
//!
//! Failure is loud: [`EngineStatus`] in the telemetry says which mode the engine is in,
//! what the device actually negotiated and why a fallback happened, so the UI can show
//! it instead of silently playing to nowhere.

use crate::devices::AudioConfig;
use crate::io::{
    AudioInput, AudioOutput, CpalInput, CpalOutput, FileInput, NullOutput, StreamInfo,
};
use jam_band::sequencer::{BandSequencer, Cue};
use jam_core::chart::ResolvedChart;
use jam_core::style::Style;
use jam_core::timeline::{Timeline, TimelineEvent, TransportState};
use jam_dsp::{calculate_level, EnergyFollower, PitchTracker};
use parking_lot::Mutex;
use rtrb::RingBuffer;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

/// Frames rendered per pass. Independent from the device buffer: the ring buffer
/// decouples the two.
const RENDER_BLOCK: usize = 256;
/// Number of render blocks kept ready in the output ring.
const RENDER_AHEAD_BLOCKS: usize = 6;
/// Metronome click length.
const CLICK_SECS: f32 = 0.012;
/// Window for the tuner's pitch detector.
const TUNER_WINDOW: usize = 2048;

/// Reference stems travel through the same queue as playback. The callback adds
/// current hardware DI, so recording never guesses the changing render lead.
#[derive(Clone, Copy, Default)]
struct OutputFrame {
    output: [f32; 2],
    stems: crate::workstation::Frame,
    synthetic: bool,
    take: u64,
    index: u64,
}

struct OutputTap {
    playback: rtrb::Consumer<OutputFrame>,
    input: rtrb::Consumer<f32>,
    recorded: rtrb::Producer<OutputFrame>,
    xruns: Arc<AtomicU64>,
    lost: Arc<AtomicBool>,
    recording: bool,
}

impl OutputTap {
    fn render(&mut self, buffer: &mut [f32]) {
        let mut underrun = false;
        for stereo in buffer.as_chunks_mut::<2>().0 {
            let input = self.input.pop().ok();
            match self.playback.pop() {
                Ok(mut frame) => {
                    // FileInput samples travel with their rendered frame;
                    // timer scheduling gaps do not lose synthetic samples.
                    self.recording = frame.take != 0 && !frame.synthetic;
                    stereo.copy_from_slice(&frame.output);
                    if !frame.synthetic {
                        if input.is_none() && frame.take != 0 {
                            self.lost.store(true, Ordering::Release);
                        }
                        // Master already contains the rendered DI at unity gain.
                        let input = input.unwrap_or(0.0);
                        let change = input - frame.stems[0];
                        frame.stems[0] = input;
                        frame.stems[3] += change;
                        frame.stems[4] += change;
                    }
                    if self.recorded.push(frame).is_err() {
                        self.lost.store(true, Ordering::Release);
                    }
                }
                Err(_) => {
                    stereo.fill(0.0);
                    underrun = true;
                    if self.recording {
                        self.lost.store(true, Ordering::Release);
                    }
                }
            }
        }
        if underrun {
            self.xruns.fetch_add(1, Ordering::Relaxed);
        }
    }
}

#[derive(Default)]
struct RecordingClock {
    active: AtomicBool,
    take: AtomicU64,
    end: AtomicU64,
    drained: AtomicU64,
    lost: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EngineTelemetry {
    pub xruns: u64,
    pub input_level: MeterTelemetry,
    pub output_level: MeterTelemetry,
    pub tuner: Option<TunerTelemetry>,
    pub transport: TransportTelemetry,
    pub band: BandTelemetry,
    pub status: EngineStatus,
    #[serde(default)]
    pub reference: Option<crate::song::ReferenceState>,
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
    /// Absolute song position in beats (fractional), for smooth playheads.
    pub position_beats: f64,
    /// 0..1 progress through the current bar.
    pub bar_progress: f32,
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
            position_beats: 0.0,
            bar_progress: 0.0,
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
    pub current_section: String,
    pub mute_drums: bool,
    pub mute_bass: bool,
    pub mute_comp: bool,
    pub follow_energy: bool,
    pub current_energy: f32,
    pub pending_style_id: Option<String>,
    pub pending_intensity: Option<f32>,
    pub is_stopped: bool,
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
            current_section: String::new(),
            mute_drums: false,
            mute_bass: false,
            mute_comp: false,
            follow_energy: false,
            current_energy: 0.0,
            pending_style_id: None,
            pending_intensity: None,
            is_stopped: false,
        }
    }
}

/// Where the engine's audio actually goes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub enum EngineMode {
    /// Not started.
    #[default]
    Stopped,
    /// Real device output (input may still be missing; see `input`).
    Hardware,
    /// No device: clock runs, audio is discarded.
    Headless,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct EngineStatus {
    pub mode: EngineMode,
    pub running: bool,
    /// Negotiated output stream, if any.
    pub output: Option<StreamInfo>,
    /// Negotiated input stream, if any.
    pub input: Option<StreamInfo>,
    /// Rate the clock and instruments run at (the output device's real rate).
    pub sample_rate: u32,
    pub buffer_size: u32,
    /// Human-readable reason for a fallback or the last failure. `None` when healthy.
    pub last_error: Option<String>,
    /// Backend stream errors since start (device unplugged, format change...).
    pub stream_errors: u64,
    /// Blocks where the input ring had fewer frames than needed (input starvation).
    pub input_gaps: u64,
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

/// Mixer knobs shared with the render thread.
struct MixParams {
    tone_hz: f32,
    click_volume: f32,
    band_volume: f32,
    input_monitor: f32,
}

pub struct AudioEngine {
    render_gate: Arc<Mutex<()>>,
    // Serialises file preparation/finalisation; the render worker never takes it.
    recording_operation: Mutex<()>,
    recording_clock: Arc<RecordingClock>,
    pub capture: Arc<Mutex<crate::workstation::Capture>>,
    pub clips: Arc<Mutex<Vec<crate::workstation::Clip>>>,
    pub song_snapshot: serde_json::Value,
    pub audition: Arc<Mutex<Option<crate::workstation::Audition>>>,
    pub voice: Arc<Mutex<crate::voice::VoiceBus>>,
    reference: Arc<Mutex<Option<crate::song::ReferenceSong>>>,
    config: AudioConfig,
    running: Arc<AtomicBool>,
    tone_active: Arc<AtomicBool>,
    tuner_active: Arc<AtomicBool>,
    xruns: Arc<AtomicU64>,
    input_gaps: Arc<AtomicU64>,
    mix: Arc<Mutex<MixParams>>,
    timeline: Arc<Mutex<Timeline>>,
    sequencer: Arc<Mutex<BandSequencer>>,
    recorder: Arc<Mutex<crate::recorder::TakeRecorder>>,
    latest_telemetry: Arc<Mutex<EngineTelemetry>>,
    status: Arc<Mutex<EngineStatus>>,
    input_rate_error: Option<String>,
    input_driver: Option<Box<dyn AudioInput>>,
    output_driver: Option<Box<dyn AudioOutput>>,
    render_handle: Option<JoinHandle<()>>,
}

fn default_style() -> Style {
    serde_json::from_str(include_str!("../../../styles/blues-shuffle.json")).unwrap_or_else(|_| {
        Style {
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
            extra: Default::default(),
        }
    })
}

fn headless_requested() -> bool {
    std::env::var("JAM_HEADLESS")
        .map(|v| v == "1")
        .unwrap_or(false)
}

/// Different in/out rates starve or overrun the input queue: the DI is damaged.
/// Refuse the input (invariant 7) instead of recording a bad take. Resampling
/// is the longer-term invariant-2 work.
fn input_rate_mismatch(input_hz: u32, output_hz: u32) -> Option<String> {
    (input_hz != output_hz && input_hz > 0 && output_hz > 0).then(|| {
        format!(
            "Cannot record: input is {input_hz} Hz and output is {output_hz} Hz. Use one interface for both; a take would be damaged."
        )
    })
}

impl AudioEngine {
    pub fn new(config: AudioConfig) -> Self {
        let sample_rate = config.sample_rate;
        let sequencer = BandSequencer::new(default_style(), sample_rate, 42);
        let recorder = crate::recorder::TakeRecorder::new(sample_rate, dirs_base().join("takes"));

        Self {
            input_rate_error: None,
            render_gate: Arc::new(Mutex::new(())),
            recording_operation: Mutex::new(()),
            recording_clock: Arc::new(RecordingClock::default()),
            capture: Arc::new(Mutex::new(Default::default())),
            clips: Arc::new(Mutex::new(Vec::new())),
            song_snapshot: serde_json::Value::Null,
            audition: Arc::new(Mutex::new(None)),
            voice: Arc::new(Mutex::new(crate::voice::VoiceBus::default())),
            reference: Arc::new(Mutex::new(None)),
            config: config.clone(),
            running: Arc::new(AtomicBool::new(false)),
            tone_active: Arc::new(AtomicBool::new(false)),
            tuner_active: Arc::new(AtomicBool::new(true)),
            xruns: Arc::new(AtomicU64::new(0)),
            input_gaps: Arc::new(AtomicU64::new(0)),
            mix: Arc::new(Mutex::new(MixParams {
                tone_hz: 440.0,
                click_volume: 0.7,
                band_volume: 0.9,
                input_monitor: 0.0,
            })),
            timeline: Arc::new(Mutex::new(Timeline::new(sample_rate, 120.0, (4, 4)))),
            sequencer: Arc::new(Mutex::new(sequencer)),
            recorder: Arc::new(Mutex::new(recorder)),
            latest_telemetry: Arc::new(Mutex::new(EngineTelemetry::default())),
            status: Arc::new(Mutex::new(EngineStatus {
                sample_rate: config.sample_rate,
                buffer_size: config.buffer_size,
                ..Default::default()
            })),
            input_driver: None,
            output_driver: None,
            render_handle: None,
        }
    }

    pub fn config(&self) -> &AudioConfig {
        &self.config
    }

    pub fn status(&self) -> EngineStatus {
        self.status.lock().clone()
    }

    // ----- mixer -----------------------------------------------------------

    pub fn set_tone(&self, on: bool, hz: f32) {
        self.tone_active.store(on, Ordering::SeqCst);
        self.mix.lock().tone_hz = hz.clamp(20.0, 20_000.0);
    }

    pub fn set_tuner(&self, on: bool) {
        self.tuner_active.store(on, Ordering::SeqCst);
    }

    pub fn set_click_volume(&self, vol: f32) {
        self.mix.lock().click_volume = vol.clamp(0.0, 1.0);
    }

    pub fn set_band_volume(&self, vol: f32) {
        self.mix.lock().band_volume = vol.clamp(0.0, 1.0);
    }

    /// Gain for passing the guitar input to the output (0 = off; the guitarist
    /// normally monitors through the amp/modeler, not through us).
    pub fn set_input_monitor(&self, gain: f32) {
        self.mix.lock().input_monitor = gain.clamp(0.0, 1.0);
    }

    // ----- transport -------------------------------------------------------

    pub fn transport_play(&self) {
        self.audition.lock().take();
        if let Some(song) = self.reference.lock().as_mut() {
            song.play();
            return;
        }
        self.timeline.lock().play();
    }

    pub fn transport_pause(&self) {
        if let Some(song) = self.reference.lock().as_mut() {
            song.pause();
        }
        self.timeline.lock().pause();
    }

    pub fn transport_stop(&self) {
        let _gate = self.render_gate.lock();
        self.stop_transport_under_render_gate();
    }

    // Caller holds render_gate so a block cannot pair a stopped clock with old cues.
    fn stop_transport_under_render_gate(&self) {
        if let Some(song) = self.reference.lock().as_mut() {
            song.stop();
        }
        self.audition.lock().take();
        self.timeline.lock().stop();
        self.sequencer.lock().reset();
        self.voice.lock().stop();
    }

    pub fn transport_seek_bar(&self, bar: u32) {
        let _gate = self.render_gate.lock();
        self.timeline.lock().seek_bar(bar);
        self.sequencer.lock().reset();
    }

    pub fn transport_set_loop(&self, start_bar: u32, end_bar: u32, enabled: bool) {
        self.timeline.lock().set_loop(start_bar, end_bar, enabled);
    }

    pub fn transport_set_count_in(&self, bars: u32) {
        self.timeline.lock().set_count_in(bars);
    }

    pub fn transport_set_tempo(&self, bpm: f64) {
        self.timeline.lock().set_bpm(bpm);
    }

    pub fn transport_set_time_signature(&self, ts: (u8, u8)) {
        self.timeline.lock().set_time_signature(ts);
    }

    pub fn transport_bpm(&self) -> f64 {
        self.timeline.lock().bpm
    }

    pub fn ensure_band_grid(&self) -> Result<(), String> {
        if self.reference.lock().is_some() {
            return Err("Reference playback has no analysed beat grid. Use its seconds loop in Songs; make a practice copy to change speed or pitch.".into());
        }
        Ok(())
    }

    pub fn load_reference(&mut self, song: crate::song::ReferenceSong) -> Result<(), String> {
        self.ensure_timing_editable()?;
        let _gate = self.render_gate.lock();
        self.stop_transport_under_render_gate();
        self.clips.lock().clear();
        self.song_snapshot = serde_json::json!({"reference": song.info, "beatGrid": "unanalysed"});
        *self.reference.lock() = Some(song);
        Ok(())
    }

    pub fn unload_reference(&mut self) -> Result<(), String> {
        self.ensure_timing_editable()?;
        let _gate = self.render_gate.lock();
        self.stop_transport_under_render_gate();
        self.reference.lock().take();
        self.song_snapshot = serde_json::Value::Null;
        Ok(())
    }

    pub fn reference_seek(&self, seconds: f64) -> Result<(), String> {
        self.ensure_timing_editable()?;
        self.reference
            .lock()
            .as_mut()
            .ok_or("Load a reference song first.")?
            .seek(seconds)
    }

    pub fn reference_loop(&self, start: f64, end: f64, enabled: bool) -> Result<(), String> {
        self.ensure_timing_editable()?;
        self.reference
            .lock()
            .as_mut()
            .ok_or("Load a reference song first.")?
            .set_loop(start, end, enabled)
    }

    // ----- band ------------------------------------------------------------

    pub fn validate_style_meter(&self, style: &Style) -> Result<(), String> {
        if style.feel.time_sig != self.timeline.lock().time_signature {
            return Err(
                "Style and transport meters differ. Load a chart with a matching style and meter."
                    .into(),
            );
        }
        Ok(())
    }

    pub fn validate_transport_meter(&self, meter: (u8, u8)) -> Result<(), String> {
        if meter != self.sequencer.lock().style.feel.time_sig {
            return Err("Load a chart with a matching style to change meter.".into());
        }
        Ok(())
    }

    pub fn band_set_style(&self, style: Style) {
        self.sequencer.lock().set_style(style);
    }

    pub fn band_set_intensity(&self, intensity: f32) {
        self.sequencer.lock().set_intensity(intensity);
    }

    pub fn band_cue(&self, cue: Cue) {
        self.sequencer.lock().cue(cue);
    }

    pub fn band_load_chart(&mut self, chart: ResolvedChart) {
        self.reference.lock().take();
        self.song_snapshot = serde_json::Value::Null;
        self.clips.lock().clear();
        let mut seq = self.sequencer.lock();
        seq.clear_song();
        seq.load_chart(chart);
    }

    pub fn band_set(&self, patch: BandPatch) {
        let mut seq = self.sequencer.lock();
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

    // ----- recorder --------------------------------------------------------

    pub fn recorder_start(&self, session_id: String) -> Result<String, String> {
        let _operation = self.recording_operation.lock();
        let prepared = self.prepare_recorder(session_id, false)?;
        let _gate = self.render_gate.lock();
        Ok(self.install_recorder(prepared))
    }

    fn prepare_recorder(
        &self,
        session_id: String,
        from_start: bool,
    ) -> Result<(crate::recorder::TakeRecorder, String), String> {
        if !self.status().running {
            return Err("Start a working audio device before recording.".into());
        }
        self.ensure_recordable_input()?;
        self.audition.lock().take();
        let (mut style_id, mut chart_id) = {
            let seq = self.sequencer.lock();
            (
                seq.style.id.clone(),
                seq.current_chart
                    .as_ref()
                    .map(|c| c.id.clone())
                    .unwrap_or_else(|| "blues-12-bar".into()),
            )
        };
        if let Some(song) = self.reference.lock().as_ref() {
            style_id = "reference".into();
            chart_id = song.info.asset_id.clone();
        }
        let (mut tempo, mut meter) = {
            let tl = self.timeline.lock();
            (tl.bpm, tl.time_signature)
        };
        if from_start {
            if let Some(bpm) = self.song_snapshot["body"]["chart"]["defaultBpm"].as_f64() {
                tempo = bpm;
                meter = (4, 4);
            }
        }
        let mut recorder = {
            let current = self.recorder.lock();
            if current.is_recording() {
                return Err("A take is already recording. Stop and save it first.".into());
            }
            current.idle()
        };
        recorder.snapshot = self.song_snapshot.clone();
        if recorder.snapshot.is_null() {
            recorder.snapshot = serde_json::json!({});
        }
        recorder.snapshot["timeSignature"] = serde_json::json!(meter);
        if let Some(song) = self.reference.lock().as_ref() {
            recorder.snapshot["reference"] = serde_json::json!(song.info);
        }
        let id = recorder.start_take(session_id, style_id, chart_id, tempo)?;
        Ok((recorder, id))
    }

    /// Caller holds the render gate; all file creation happened before it.
    fn install_recorder(&self, (prepared, id): (crate::recorder::TakeRecorder, String)) -> String {
        let mut current = self.recorder.lock();
        *current = prepared;
        self.recording_clock.take.fetch_add(1, Ordering::SeqCst);
        self.recording_clock.lost.store(false, Ordering::Release);
        self.recording_clock.active.store(true, Ordering::Release);
        id
    }

    pub fn ensure_timing_editable(&self) -> Result<(), String> {
        if self.recorder_is_recording() {
            return Err("Save the take before changing playback or timing.".into());
        }
        Ok(())
    }

    pub fn record_song(&self, session_id: String) -> Result<String, String> {
        let _operation = self.recording_operation.lock();
        if self.recorder_is_recording() {
            return Err("Save the current take first.".into());
        }
        let prepared = self.prepare_recorder(session_id, true)?;
        let _gate = self.render_gate.lock();
        self.stop_transport_under_render_gate();
        self.transport_set_count_in(0);
        if let Some(bpm) = self.song_snapshot["body"]["chart"]["defaultBpm"].as_f64() {
            self.transport_set_tempo(bpm);
            self.transport_set_time_signature((4, 4));
            self.transport_set_loop(1, 257, false);
        }
        let id = self.install_recorder(prepared);
        self.transport_play();
        Ok(id)
    }

    pub fn keep_capture(
        &self,
        session_id: String,
    ) -> Result<crate::recorder::TakeMetadata, String> {
        self.ensure_recordable_input()?;
        let frames = self.capture.lock().snapshot()?;
        let mut r =
            crate::recorder::TakeRecorder::new(self.sample_rate(), dirs_base().join("takes"));
        r.snapshot = serde_json::json!({"capture": true});
        r.start_take(
            session_id,
            "captured-idea".into(),
            "free-time".into(),
            self.transport_bpm(),
        )?;
        r.push_capture(&frames)?;
        r.stop_and_save()
    }

    fn ensure_recordable_input(&self) -> Result<(), String> {
        self.input_rate_error.clone().map_or(Ok(()), Err)
    }

    pub fn configure_song(
        &mut self,
        chart: ResolvedChart,
        sections: std::collections::BTreeMap<String, jam_band::sequencer::SectionBand>,
        clips: Vec<crate::workstation::Clip>,
        snapshot: serde_json::Value,
    ) -> Result<(), String> {
        if self.recorder_is_recording() {
            return Err("Save the recording before changing the song.".into());
        }
        self.transport_stop();
        self.reference.lock().take();
        self.transport_set_tempo(chart.default_bpm);
        self.transport_set_time_signature(chart.time_sig);
        self.transport_set_loop(1, chart.bars.len() as u32 + 1, false);
        let mut seq = self.sequencer.lock();
        seq.set_follow_energy(false);
        seq.section_bands = sections;
        seq.load_chart(chart);
        *self.clips.lock() = clips;
        self.song_snapshot = snapshot;
        Ok(())
    }

    /// Update the loaded original's chords without stopping, clearing the loop
    /// or re-reading guitar clips (Stage `[` / `]` after Play song).
    pub fn replace_song_chart(
        &mut self,
        chart: ResolvedChart,
        sections: std::collections::BTreeMap<String, jam_band::sequencer::SectionBand>,
        snapshot: serde_json::Value,
    ) -> Result<(), String> {
        self.ensure_band_grid()?;
        if self.recorder_is_recording() {
            return Err("Save the recording before changing the song.".into());
        }
        if self.song_snapshot.is_null() {
            return Err("Load a song before updating its chart.".into());
        }
        let pos = self.timeline.lock().current_position();
        let mut seq = self.sequencer.lock();
        seq.section_bands = sections;
        seq.retarget_chart(chart, pos.bar, pos.beat);
        drop(seq);
        self.song_snapshot = snapshot;
        Ok(())
    }

    pub fn recorder_stop(&self) -> Result<crate::recorder::TakeMetadata, String> {
        let _operation = self.recording_operation.lock();
        let end = {
            let _gate = self.render_gate.lock();
            self.recording_clock.active.store(false, Ordering::Release);
            self.recording_clock.end.load(Ordering::Acquire)
        };
        // Finish the already queued tail before closing WAVs. Never wait under
        // the recorder/render mutex, and never hang on a vanished output device.
        let deadline = Instant::now() + Duration::from_secs(2);
        while self.recording_clock.drained.load(Ordering::Acquire) < end {
            if Instant::now() >= deadline || !self.running.load(Ordering::Acquire) {
                self.recorder
                    .lock()
                    .interrupt("Audio output stopped before the recorded tail was received.");
                break;
            }
            thread::sleep(Duration::from_millis(1));
        }
        let mut finished = {
            let mut current = self.recorder.lock();
            let idle = current.idle();
            std::mem::replace(&mut *current, idle)
        };
        finished.stop_and_save()
    }

    pub fn recorder_set_latency_compensation(&self, offset_samples: usize) {
        self.recorder
            .lock()
            .set_latency_compensation(offset_samples);
    }

    pub fn recorder_is_recording(&self) -> bool {
        self.recorder.lock().is_recording()
    }

    pub fn recorder_error(&self) -> Option<String> {
        self.recorder.lock().error().map(str::to_owned)
    }

    /// The rate the recorder (and the running stream) currently uses.
    pub fn sample_rate(&self) -> u32 {
        self.recorder.lock().sample_rate()
    }

    pub fn get_telemetry(&self) -> EngineTelemetry {
        let mut tel = self.latest_telemetry.lock().clone();
        tel.status = self.status.lock().clone();
        tel.reference = self.reference.lock().as_ref().map(|song| song.info.clone());
        if let Some(reference) = &tel.reference {
            tel.transport.state = reference.state.clone();
            tel.band.current_chord.clear();
            tel.band.next_chord = None;
            tel.band.current_section.clear();
            tel.band.style_id = "reference".into();
            tel.band.style_name = "Reference audio".into();
        }
        tel
    }

    // ----- lifecycle -------------------------------------------------------

    /// Stops, swaps the configuration and starts again. Returns the error of the
    /// restart (the engine will be in headless fallback in that case, not dead).
    pub fn apply_config(&mut self, config: AudioConfig) -> Result<(), String> {
        if self.recorder_is_recording() {
            return Err("Save the recording before changing audio devices.".into());
        }
        let _ = self.stop();
        self.config = config;
        self.start()
    }

    /// Opens the devices and starts the render thread. Never leaves the engine dead:
    /// if the output device fails to open, the engine runs headless and reports why in
    /// [`EngineStatus::last_error`]. That situation is also returned as `Err`.
    pub fn start(&mut self) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        let requested_rate = self.config.sample_rate.max(8_000);
        let requested_buffer = self.config.buffer_size.max(32);
        let mut status = EngineStatus {
            mode: EngineMode::Hardware,
            running: false,
            output: None,
            input: None,
            sample_rate: requested_rate,
            buffer_size: requested_buffer,
            last_error: None,
            stream_errors: 0,
            input_gaps: 0,
        };
        let mut problems: Vec<String> = Vec::new();

        // Ring capacity must cover a large device callback plus our render-ahead.
        let ring_capacity = (RENDER_BLOCK * 2 * (RENDER_AHEAD_BLOCKS + 2)).max(16_384);
        self.xruns.store(0, Ordering::SeqCst);
        self.input_gaps.store(0, Ordering::SeqCst);
        self.recording_clock.end.store(0, Ordering::Release);
        self.recording_clock.drained.store(0, Ordering::Release);

        // A failed `start` consumes its callback, so each attempt gets a fresh ring.
        let xruns = Arc::clone(&self.xruns);
        let lost = Arc::clone(&self.recording_clock.lost);
        let make_output = move || {
            let (prod, playback) = RingBuffer::new(ring_capacity / 2);
            let (input_prod, input) = RingBuffer::new(ring_capacity);
            let (recorded, captured) = RingBuffer::new(ring_capacity);
            let mut tap = OutputTap {
                playback,
                input,
                recorded,
                xruns: Arc::clone(&xruns),
                lost: Arc::clone(&lost),
                recording: false,
            };
            let cb: crate::io::OutputCallback = Box::new(move |buffer| tap.render(buffer));
            (prod, cb, input_prod, captured)
        };

        // --- output ---
        let (output_driver, output_prod, mut recording_input, captured): (
            Box<dyn AudioOutput>,
            _,
            _,
            _,
        ) = if headless_requested() {
            status.mode = EngineMode::Headless;
            let (prod, cb, input, captured) = make_output();
            let mut null = NullOutput::new(requested_rate, requested_buffer as usize);
            null.start(cb)?;
            (Box::new(null), prod, input, captured)
        } else {
            let (prod, cb, input, captured) = make_output();
            let mut cpal_out = CpalOutput::new(
                self.config.output_device.clone(),
                requested_rate,
                requested_buffer,
            );
            match cpal_out.start(cb) {
                Ok(()) => (Box::new(cpal_out), prod, input, captured),
                Err(e) => {
                    problems.push(format!("output: {e}; running headless"));
                    status.mode = EngineMode::Headless;
                    let (prod, cb, input, captured) = make_output();
                    let mut null = NullOutput::new(requested_rate, requested_buffer as usize);
                    null.start(cb)?;
                    (Box::new(null), prod, input, captured)
                }
            }
        };

        status.output = output_driver.info();
        let effective_rate = status
            .output
            .as_ref()
            .map(|i| i.sample_rate)
            .filter(|r| *r > 0)
            .unwrap_or(requested_rate);
        if effective_rate != requested_rate {
            problems.push(format!(
                "device runs at {effective_rate} Hz, not the requested {requested_rate} Hz; following the device"
            ));
        }
        status.sample_rate = effective_rate;

        // --- input ---
        let fake_wav = std::env::var("JAM_FAKE_INPUT").ok();
        let live_input = fake_wav.is_none() && !headless_requested();
        let (mut input_prod, input_cons) = RingBuffer::<f32>::new(ring_capacity);
        let clock = Arc::clone(&self.recording_clock);
        let input_callback = Box::new(move |buffer: &[f32]| {
            for &sample in buffer {
                // Dropping on overflow is the right call: the render thread bounds
                // the backlog anyway.
                let _ = input_prod.push(sample);
                if live_input
                    && recording_input.push(sample).is_err()
                    && clock.active.load(Ordering::Acquire)
                {
                    clock.lost.store(true, Ordering::Release);
                }
            }
        });
        let mut input_driver: Box<dyn AudioInput> = match (&fake_wav, headless_requested()) {
            (Some(path), _) => match FileInput::from_wav_file(path, requested_buffer as usize) {
                Ok(f) => Box::new(f),
                Err(e) => {
                    problems.push(format!("JAM_FAKE_INPUT {path}: {e}; using 440 Hz sine"));
                    Box::new(FileInput::sine_440(
                        requested_buffer as usize,
                        effective_rate,
                    ))
                }
            },
            (None, true) => Box::new(FileInput::sine_440(
                requested_buffer as usize,
                effective_rate,
            )),
            (None, false) => Box::new(CpalInput::new(
                self.config.input_device.clone(),
                self.config.input_channel,
                effective_rate,
                requested_buffer,
            )),
        };
        let mut input_driver: Box<dyn AudioInput> = match input_driver.start(input_callback) {
            Ok(()) => input_driver,
            Err(e) => {
                problems.push(format!("input: {e}; tuner and recording input are silent"));
                // The failed driver consumed the callback; the silent input needs none
                // because nothing reads from it.
                Box::new(FileInput::silent(requested_buffer as usize, effective_rate))
            }
        };
        status.input = input_driver.info().filter(|_| input_driver.is_running());
        self.input_rate_error = status
            .input
            .as_ref()
            .and_then(|input| input_rate_mismatch(input.sample_rate, effective_rate));
        if let Some(msg) = &self.input_rate_error {
            problems.push(msg.clone());
            let _ = input_driver.stop();
            input_driver = Box::new(FileInput::silent(requested_buffer as usize, effective_rate));
            status.input = None;
        }

        // --- clock and instruments follow the device rate ---
        {
            let mut tl = self.timeline.lock();
            tl.stop();
            tl.sample_rate = effective_rate;
        }
        self.sequencer.lock().set_sample_rate(effective_rate);
        let _ = self.recorder.lock().set_sample_rate(effective_rate);
        // Audio from before a device restart has a different clock/rate.
        let mut capture = self.capture.lock();
        let seconds = capture.seconds;
        capture.arm(seconds)?;
        drop(capture);

        status.last_error = if problems.is_empty() {
            None
        } else {
            Some(problems.join(" | "))
        };
        status.running = true;
        let headless = status.mode == EngineMode::Headless;
        *self.status.lock() = status;

        self.running.store(true, Ordering::SeqCst);
        let wait_for_input = input_driver.is_running() && input_driver.is_synthetic();
        self.spawn_render_thread(
            output_prod,
            input_cons,
            captured,
            effective_rate,
            wait_for_input,
        );

        self.output_driver = Some(output_driver);
        self.input_driver = Some(input_driver);

        if headless && !headless_requested() {
            Err(self
                .status
                .lock()
                .last_error
                .clone()
                .unwrap_or_else(|| "no audio output".into()))
        } else {
            Ok(())
        }
    }

    fn spawn_render_thread(
        &mut self,
        mut prod: rtrb::Producer<OutputFrame>,
        mut input_cons: rtrb::Consumer<f32>,
        mut captured: rtrb::Consumer<OutputFrame>,
        sample_rate: u32,
        wait_for_input: bool,
    ) {
        let running = Arc::clone(&self.running);
        let tone_active = Arc::clone(&self.tone_active);
        let tuner_active = Arc::clone(&self.tuner_active);
        let xruns = Arc::clone(&self.xruns);
        let input_gaps = Arc::clone(&self.input_gaps);
        let mix = Arc::clone(&self.mix);
        let timeline_arc = Arc::clone(&self.timeline);
        let sequencer_arc = Arc::clone(&self.sequencer);
        let recorder_arc = Arc::clone(&self.recorder);
        let gate = Arc::clone(&self.render_gate);
        let clock = Arc::clone(&self.recording_clock);
        let capture = Arc::clone(&self.capture);
        let clips = Arc::clone(&self.clips);
        let audition = Arc::clone(&self.audition);
        let voice_bus = Arc::clone(&self.voice);
        let reference = Arc::clone(&self.reference);
        let telemetry = Arc::clone(&self.latest_telemetry);
        let status_arc = Arc::clone(&self.status);

        let handle = thread::Builder::new()
            .name("jam-render".into())
            .spawn(move || {
                let mut ctx = RenderContext::new(sample_rate);
                let block_len = RENDER_BLOCK;
                let mut input_queue: VecDeque<f32> = VecDeque::with_capacity(block_len * 16);
                let mut primed = false;
                let mut output_index = 0u64;
                let mut pending_notes: VecDeque<(u64, u64, crate::workstation::MidiNote)> =
                    VecDeque::new();

                while running.load(Ordering::SeqCst) {
                    // Audio callback only copies fixed-size frames. Disk queueing,
                    // MIDI matching and retrospective capture stay on this worker.
                    let _gate = gate.lock();
                    let mut frames = Vec::with_capacity(block_len);
                    let mut notes = Vec::new();
                    let mut heard = Vec::with_capacity(block_len);
                    let mut drained = clock.drained.load(Ordering::Relaxed);
                    while let Ok(frame) = captured.pop() {
                        heard.push(frame.stems);
                        let keep =
                            frame.take != 0 && frame.take == clock.take.load(Ordering::Acquire);
                        while pending_notes
                            .front()
                            .is_some_and(|(_, index, _)| *index <= frame.index)
                        {
                            let (take, index, mut note) = pending_notes.pop_front().unwrap();
                            if keep && take == frame.take && index == frame.index {
                                note.frame = frames.len() as u64;
                                notes.push(note);
                            }
                        }
                        if keep {
                            frames.push(frame.stems);
                        }
                        drained = frame.index + 1;
                        if heard.len() == block_len {
                            break;
                        }
                    }
                    capture.lock().push(&heard, sample_rate);
                    {
                        let mut recorder = recorder_arc.lock();
                        if clock.lost.swap(false, Ordering::AcqRel) {
                            recorder
                                .interrupt("Audio input, output or the capture queue lost frames.");
                        }
                        if !frames.is_empty() {
                            recorder.push_frames(frames, notes);
                        }
                    }
                    clock.drained.store(drained, Ordering::Release);
                    drop(_gate);
                    let mut rendered = false;
                    while prod.slots() >= block_len {
                        while let Ok(s) = input_cons.pop() {
                            input_queue.push_back(s);
                        }
                        // Bound the backlog so a drifting input clock cannot add latency
                        // forever; keep two blocks so the recorder sees continuous audio.
                        if input_queue.len() > block_len * 16 {
                            let drop = input_queue.len() - block_len * 2;
                            input_queue.drain(..drop);
                        }
                        if !primed && input_queue.len() >= block_len * 2 {
                            primed = true;
                        }

                        let _gate = gate.lock();
                        // Input for this block.
                        ctx.in_block.fill(0.0);
                        let available = input_queue.len();
                        if wait_for_input && (!primed || available < block_len) {
                            if primed {
                                input_gaps.fetch_add(1, Ordering::Relaxed);
                            }
                            break;
                        }
                        if primed && available >= block_len {
                            for s in ctx.in_block.iter_mut() {
                                *s = input_queue.pop_front().unwrap_or(0.0);
                            }
                        } else if primed {
                            for s in ctx.in_block.iter_mut().take(available) {
                                *s = input_queue.pop_front().unwrap_or(0.0);
                            }
                            input_gaps.fetch_add(1, Ordering::Relaxed);
                        }

                        let (transport_telem, band_telem) = ctx.render_block(
                            &timeline_arc,
                            &sequencer_arc,
                            &mix,
                            tone_active.load(Ordering::SeqCst),
                            tuner_active.load(Ordering::SeqCst),
                        );
                        let reference_loaded = {
                            let mut reference = reference.lock();
                            if let Some(song) = reference.as_mut() {
                                ctx.render_reference(song);
                            }
                            reference.is_some()
                        };

                        // Previously recorded clips are heard in Rust and never fed back to the input.
                        let mut playback = vec![0.0; block_len];
                        for clip in clips.lock().iter() {
                            clip.render(
                                &ctx.spans,
                                transport_telem.bpm,
                                transport_telem.time_signature.0 as f64,
                                sample_rate,
                                &mut playback,
                            );
                        }
                        for (i, v) in playback.iter().enumerate() {
                            ctx.out_left[i] += v;
                            ctx.out_right[i] += v;
                        }
                        playback.fill(0.0);
                        let mut preview = audition.lock();
                        if let Some(voice) = preview.as_mut() {
                            if !voice.render(sample_rate, &mut playback) {
                                *preview = None;
                            }
                            for (i, v) in playback.iter().enumerate() {
                                ctx.out_left[i] += v;
                                ctx.out_right[i] += v;
                            }
                        }
                        drop(preview);
                        ctx.render_voice(&mut voice_bus.lock());
                        let (mut parts, mut notes) = {
                            let seq = sequencer_arc.lock();
                            (seq.part_audio.clone(), seq.note_events.clone())
                        };
                        if reference_loaded {
                            for part in &mut parts {
                                part.fill(0.0);
                            }
                            notes.clear();
                        }
                        let input_gain = 1.0 - mix.lock().input_monitor;
                        let frames: Vec<crate::workstation::Frame> = (0..block_len)
                            .map(|i| {
                                [
                                    ctx.in_block[i],
                                    ctx.band_left[i],
                                    ctx.band_right[i],
                                    ctx.out_left[i] + ctx.in_block[i] * input_gain,
                                    ctx.out_right[i] + ctx.in_block[i] * input_gain,
                                    parts[0][i],
                                    parts[1][i],
                                    parts[2][i],
                                    parts[3][i],
                                ]
                            })
                            .collect();
                        let take = if clock.active.load(Ordering::Acquire) {
                            clock.take.load(Ordering::Acquire)
                        } else {
                            0
                        };
                        if take != 0 {
                            for note in notes {
                                pending_notes.push_back((take, output_index + note.frame, note));
                            }
                            // Drum note-offs can name a future block before its
                            // note-on is appended; merge them with later events.
                            pending_notes
                                .make_contiguous()
                                .sort_by_key(|(_, index, _)| *index);
                        }

                        for (i, stems) in frames.into_iter().enumerate() {
                            // slots() was checked above, so these cannot fail.
                            let _ = prod.push(OutputFrame {
                                output: [ctx.out_left[i], ctx.out_right[i]],
                                stems,
                                synthetic: wait_for_input,
                                take,
                                index: output_index + i as u64,
                            });
                        }
                        output_index += block_len as u64;
                        if take != 0 {
                            clock.end.store(output_index, Ordering::Release);
                        }
                        rendered = true;

                        let out_lvl = calculate_level(&ctx.out_left);
                        let in_lvl = calculate_level(&ctx.in_block);
                        {
                            let mut tel = telemetry.lock();
                            tel.xruns = xruns.load(Ordering::Relaxed);
                            tel.input_level = MeterTelemetry {
                                peak_db: in_lvl.peak_db,
                                rms_db: in_lvl.rms_db,
                            };
                            tel.output_level = MeterTelemetry {
                                peak_db: out_lvl.peak_db,
                                rms_db: out_lvl.rms_db,
                            };
                            tel.tuner = ctx.tuner_latest.clone();
                            tel.transport = transport_telem;
                            tel.band = band_telem;
                        }
                        {
                            let mut st = status_arc.lock();
                            st.input_gaps = input_gaps.load(Ordering::Relaxed);
                        }
                    }

                    if !rendered && captured.is_empty() {
                        thread::sleep(Duration::from_micros(500));
                    }
                }
            })
            .expect("spawn render thread");

        self.render_handle = Some(handle);
    }

    pub fn stop(&mut self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.render_handle.take() {
            let _ = handle.join();
        }
        if let Some(mut out) = self.output_driver.take() {
            let _ = out.stop();
        }
        if let Some(mut inp) = self.input_driver.take() {
            let _ = inp.stop();
        }
        self.timeline.lock().stop();
        self.sequencer.lock().reset();
        self.voice.lock().stop();
        if let Some(song) = self.reference.lock().as_mut() {
            song.stop();
        }
        {
            let mut st = self.status.lock();
            st.running = false;
            st.mode = EngineMode::Stopped;
            st.output = None;
            st.input = None;
        }
        Ok(())
    }

    /// Refreshes `stream_errors` from the drivers (cheap; call from the telemetry poller).
    pub fn poll_stream_errors(&self) {
        let n = self
            .output_driver
            .as_ref()
            .map(|d| d.error_count())
            .unwrap_or(0)
            + self
                .input_driver
                .as_ref()
                .map(|d| d.error_count())
                .unwrap_or(0);
        self.status.lock().stream_errors = n;
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

/// Per-thread render scratch state.
struct RenderContext {
    sample_rate: u32,
    band_volume: f32,
    voice_audio: Vec<f32>,
    voice_duck: Vec<f32>,
    in_block: Vec<f32>,
    band_left: Vec<f32>,
    band_right: Vec<f32>,
    out_left: Vec<f32>,
    out_right: Vec<f32>,
    spans: Vec<jam_core::timeline::Span>,
    tone_phase: f32,
    click: Option<ClickVoice>,
    click_len: usize,
    pitch_tracker: PitchTracker,
    energy_follower: EnergyFollower,
    tuner_buf: Vec<f32>,
    /// Last confident reading; cleared after `TUNER_HOLD_WINDOWS` misses so the
    /// needle drops when the guitarist stops playing but does not flicker between notes.
    tuner_latest: Option<TunerTelemetry>,
    tuner_misses: u32,
}

const TUNER_HOLD_WINDOWS: u32 = 6;

struct ClickVoice {
    freq: f32,
    pos: usize,
    volume: f32,
}

impl RenderContext {
    fn render_reference(&mut self, song: &mut crate::song::ReferenceSong) {
        for i in 0..self.out_left.len() {
            self.out_left[i] -= self.band_left[i] * self.band_volume;
            self.out_right[i] -= self.band_right[i] * self.band_volume;
        }
        song.render(self.sample_rate, &mut self.band_left, &mut self.band_right);
        for i in 0..self.out_left.len() {
            self.out_left[i] += self.band_left[i] * self.band_volume;
            self.out_right[i] += self.band_right[i] * self.band_volume;
        }
    }

    fn render_voice(&mut self, voice: &mut crate::voice::VoiceBus) {
        voice.render(
            self.sample_rate,
            &mut self.voice_audio,
            &mut self.voice_duck,
        );
        for i in 0..self.out_left.len() {
            self.out_left[i] += self.band_left[i] * self.band_volume * (self.voice_duck[i] - 1.0)
                + self.voice_audio[i];
            self.out_right[i] += self.band_right[i] * self.band_volume * (self.voice_duck[i] - 1.0)
                + self.voice_audio[i];
        }
    }

    fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            band_volume: 0.0,
            voice_audio: vec![0.0; RENDER_BLOCK],
            voice_duck: vec![1.0; RENDER_BLOCK],
            in_block: vec![0.0; RENDER_BLOCK],
            band_left: vec![0.0; RENDER_BLOCK],
            band_right: vec![0.0; RENDER_BLOCK],
            out_left: vec![0.0; RENDER_BLOCK],
            out_right: vec![0.0; RENDER_BLOCK],
            spans: Vec::new(),
            tone_phase: 0.0,
            click: None,
            click_len: (sample_rate as f32 * CLICK_SECS) as usize,
            pitch_tracker: PitchTracker::new(TUNER_WINDOW, sample_rate),
            energy_follower: EnergyFollower::new(sample_rate),
            tuner_buf: Vec::with_capacity(TUNER_WINDOW * 2),
            tuner_latest: None,
            tuner_misses: 0,
        }
    }

    fn render_block(
        &mut self,
        timeline: &Mutex<Timeline>,
        sequencer: &Mutex<BandSequencer>,
        mix: &Mutex<MixParams>,
        tone_on: bool,
        tuner_on: bool,
    ) -> (TransportTelemetry, BandTelemetry) {
        let frames = RENDER_BLOCK;

        // --- input analysis (metering is done by the caller) ---
        let energy = self.energy_follower.process_block(&self.in_block);
        if tuner_on {
            self.tuner_buf.extend_from_slice(&self.in_block);
            if self.tuner_buf.len() >= TUNER_WINDOW {
                match self.pitch_tracker.detect(&self.tuner_buf) {
                    Some(p) => {
                        self.tuner_latest = Some(TunerTelemetry {
                            hz: p.hz,
                            note: p.note,
                            cents: p.cents,
                            confidence: p.confidence,
                        });
                        self.tuner_misses = 0;
                    }
                    None => {
                        self.tuner_misses += 1;
                        if self.tuner_misses > TUNER_HOLD_WINDOWS {
                            self.tuner_latest = None;
                        }
                    }
                }
                let keep = TUNER_WINDOW / 2;
                let excess = self.tuner_buf.len() - keep;
                self.tuner_buf.drain(..excess);
            }
        } else {
            self.tuner_buf.clear();
            self.tuner_latest = None;
        }

        // --- clock ---
        let (events, spans, transport) = {
            let mut tl = timeline.lock();
            let (events, spans) = tl.advance_with_spans(frames);
            let pos = tl.current_position();
            let (state_str, disp_bar, disp_beat) = match tl.state {
                TransportState::Stopped => ("stopped", pos.bar, pos.beat),
                TransportState::CountingIn { bar, beat, .. } => ("counting_in", bar, beat),
                TransportState::Playing => ("playing", pos.bar, pos.beat),
                TransportState::Paused => ("paused", pos.bar, pos.beat),
            };
            let bpb = tl.time_signature.0.max(1) as f64;
            let bar_progress = ((pos.beats / bpb).fract()) as f32;
            (
                events,
                spans,
                TransportTelemetry {
                    state: state_str.into(),
                    bar: disp_bar,
                    beat: disp_beat,
                    position_beats: pos.beats,
                    bar_progress,
                    bpm: tl.bpm,
                    time_signature: tl.time_signature,
                    loop_enabled: tl.loop_enabled,
                    loop_start_bar: tl.loop_start_bar,
                    loop_end_bar: tl.loop_end_bar,
                    count_in_bars: tl.count_in_bars,
                },
            )
        };
        self.spans = spans.clone();
        let samples_per_beat = 60.0 / transport.bpm * self.sample_rate as f64;
        let beats_per_bar = transport.time_signature.0.max(1) as f64;

        // --- band ---
        self.band_left.fill(0.0);
        self.band_right.fill(0.0);
        let (band, ending_done) = {
            let mut seq = sequencer.lock();
            seq.begin_block();
            seq.update_energy(energy);
            for ev in &events {
                seq.handle_timeline_event(ev);
            }
            if spans.is_empty() {
                // Paused/stopped/count-in: let ringing voices decay naturally.
                seq.render(&mut self.band_left, &mut self.band_right);
            } else {
                let mut cursor = 0usize;
                for span in &spans {
                    if span.offset > cursor {
                        seq.render(
                            &mut self.band_left[cursor..span.offset],
                            &mut self.band_right[cursor..span.offset],
                        );
                    }
                    let end = (span.offset + span.frames).min(frames);
                    seq.render_span(
                        span,
                        samples_per_beat,
                        beats_per_bar,
                        &mut self.band_left[span.offset..end],
                        &mut self.band_right[span.offset..end],
                    );
                    cursor = end;
                }
                if cursor < frames {
                    seq.render(
                        &mut self.band_left[cursor..],
                        &mut self.band_right[cursor..],
                    );
                }
            }
            let ending_done = seq.take_ending_complete();

            let cue_to_str = |c: Cue| match c {
                Cue::None => "none",
                Cue::Fill => "fill",
                Cue::Crash => "crash",
                Cue::Stop => "stop",
                Cue::Ending => "ending",
            };
            let telem = BandTelemetry {
                style_id: seq.style.id.clone(),
                style_name: seq.style.name.clone(),
                intensity: seq.intensity,
                active_cue: cue_to_str(seq.active_cue).into(),
                pending_cue: cue_to_str(seq.pending_cue).into(),
                current_chord: seq.current_chord.clone(),
                next_chord: seq.next_chord.clone(),
                current_section: seq.current_section.clone(),
                mute_drums: seq.mute_drums,
                mute_bass: seq.mute_bass,
                mute_comp: seq.mute_comp,
                follow_energy: seq.follow_energy,
                current_energy: seq.current_energy,
                pending_style_id: seq.pending_style.as_ref().map(|s| s.id.clone()),
                pending_intensity: seq.pending_intensity,
                is_stopped: seq.is_stopped,
            };
            (telem, ending_done)
        };
        if ending_done {
            timeline.lock().stop();
            sequencer.lock().reset();
        }

        // --- click + tone + monitor mix ---
        let (tone_hz, click_vol, band_vol, monitor) = {
            let m = mix.lock();
            (m.tone_hz, m.click_volume, m.band_volume, m.input_monitor)
        };
        let counting_in = transport.state == "counting_in";
        self.band_volume = band_vol;
        let mut click_starts: Vec<(usize, f32)> = Vec::new();
        for ev in &events {
            if let TimelineEvent::Beat { beat, offset, .. } = ev {
                let freq = if *beat == 1 { 1200.0 } else { 800.0 };
                click_starts.push(((*offset).min(frames - 1), freq));
            }
        }
        click_starts.sort_by_key(|(o, _)| *o);
        let mut next_click = 0usize;
        let phase_inc = tone_hz / self.sample_rate as f32;

        for i in 0..frames {
            while next_click < click_starts.len() && click_starts[next_click].0 == i {
                self.click = Some(ClickVoice {
                    freq: click_starts[next_click].1,
                    pos: 0,
                    volume: click_vol,
                });
                next_click += 1;
            }

            let mut s = 0.0f32;
            if tone_on && !counting_in {
                s += (self.tone_phase * std::f32::consts::TAU).sin() * 0.5;
                self.tone_phase = (self.tone_phase + phase_inc).fract();
            }
            if let Some(c) = &mut self.click {
                if c.pos < self.click_len {
                    let t = c.pos as f32 / self.sample_rate as f32;
                    let env = 1.0 - c.pos as f32 / self.click_len as f32;
                    s += (t * std::f32::consts::TAU * c.freq).sin() * env * env * c.volume;
                    c.pos += 1;
                } else {
                    self.click = None;
                }
            }
            let mon = self.in_block[i] * monitor;
            self.out_left[i] = s + mon + self.band_left[i] * band_vol;
            self.out_right[i] = s + mon + self.band_right[i] * band_vol;
        }

        (transport, band)
    }
}

fn dirs_base() -> std::path::PathBuf {
    std::env::var("JAM_DATA_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("JAM_USER_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| {
                    std::env::var_os("USERPROFILE")
                        .or_else(|| std::env::var_os("HOME"))
                        .map(std::path::PathBuf::from)
                        .unwrap_or_else(std::env::temp_dir)
                        .join("JosefinesJamstudio")
                })
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_cannot_split_a_render_blocks_transport_and_band_state() {
        let engine = AudioEngine::new(AudioConfig::default());
        engine.transport_set_count_in(0);
        engine.transport_play();
        engine.sequencer.lock().active_cue = Cue::Fill;
        let gate = engine.render_gate.lock();
        thread::scope(|scope| {
            let (started, ready) = std::sync::mpsc::channel();
            let (finished, done) = std::sync::mpsc::channel();
            let engine = &engine;
            scope.spawn(move || {
                started.send(()).unwrap();
                engine.transport_stop();
                finished.send(()).unwrap();
            });
            ready.recv_timeout(Duration::from_secs(2)).unwrap();
            let blocked = done.recv_timeout(Duration::from_millis(50)).is_err();
            drop(gate);
            assert!(blocked, "Stop must wait for the current render block");
            done.recv_timeout(Duration::from_secs(2)).unwrap();
        });
        assert_eq!(engine.timeline.lock().state, TransportState::Stopped);
        assert_eq!(engine.sequencer.lock().active_cue, Cue::None);
    }

    #[test]
    fn reference_transport_records_stereo_source_without_generated_parts_or_midi() {
        let mut engine = headless_engine();
        let root =
            std::env::temp_dir().join(format!("jam-reference-engine-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        *engine.recorder.lock() = crate::recorder::TakeRecorder::new(48_000, root.clone());
        let samples = (0..96_000).flat_map(|_| [0.25, -0.125]).collect();
        engine
            .load_reference(
                crate::song::ReferenceSong::new("source".into(), "Reference".into(), samples)
                    .unwrap(),
            )
            .unwrap();
        assert!(engine.ensure_band_grid().is_err());
        engine.start().unwrap();
        engine.transport_play();
        engine.recorder_start("reference".into()).unwrap();
        assert!(engine.reference_seek(0.5).is_err());
        assert!(engine.reference_loop(0.0, 1.0, true).is_err());
        assert!(engine.unload_reference().is_err());
        thread::sleep(Duration::from_millis(300));
        let take = engine.recorder_stop().unwrap();
        engine.stop().unwrap();
        assert!(take.sample_count > 1000);
        assert_eq!(take.snapshot["reference"]["asset_id"], "source");
        assert_eq!(take.snapshot["beatGrid"], "unanalysed");
        assert!(take.midi.is_empty());
        let mut band = hound::WavReader::open(&take.path_band).unwrap();
        assert_eq!(band.spec().channels, 2);
        let samples: Vec<_> = band.samples::<i32>().map(Result::unwrap).collect();
        let nonzero: Vec<_> = samples
            .as_chunks::<2>()
            .0
            .iter()
            .filter(|p| p[0] > 1000)
            .collect();
        assert!(nonzero.len() > 1000);
        assert!(
            nonzero.iter().all(|p| (p[0] + 2 * p[1]).abs() <= 2),
            "stereo channel ratio within two 24-bit units"
        );
        for name in ["drums", "bass", "comp"] {
            let (samples, _) =
                crate::recorder::read_wav_mono(std::path::Path::new(&take.stems[name])).unwrap();
            assert!(
                samples.iter().all(|v| *v == 0.0),
                "generated {name} must be silent"
            );
        }
        engine.unload_reference().unwrap();
        assert!(engine.ensure_band_grid().is_ok());
        assert!(engine.get_telemetry().reference.is_none());
        drop(band);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn voice_ducking_preserves_monitor_and_does_not_unmute_the_band() {
        let mut ctx = RenderContext::new(48_000);
        let mut voice = crate::voice::VoiceBus::default();
        voice.play(&vec![0; 48_000], -9.0).unwrap();
        ctx.band_left.fill(0.5);
        ctx.band_right.fill(0.5);
        for volume in [0.0, 0.5] {
            ctx.band_volume = volume;
            ctx.out_left.fill(0.25 + 0.5 * volume);
            ctx.out_right.clone_from(&ctx.out_left);
            ctx.render_voice(&mut voice);
            for i in 0..ctx.out_left.len() {
                let expected = 0.25 + 0.5 * volume * ctx.voice_duck[i];
                assert!((ctx.out_left[i] - expected).abs() < 1e-6);
                assert_eq!(ctx.out_left[i], ctx.out_right[i]);
                assert_eq!(ctx.band_left[i], 0.5, "recorder band remains dry");
            }
        }
    }

    #[test]
    fn output_tap_aligns_all_stems_with_live_di_despite_variable_render_lead() {
        let (mut playback, output) = RingBuffer::new(16_384);
        let (mut input, guitar) = RingBuffer::new(16_384);
        let (recorded, mut captured) = RingBuffer::new(16_384);
        let lost = Arc::new(AtomicBool::new(false));
        let mut tap = OutputTap {
            playback: output,
            input: guitar,
            recorded,
            xruns: Arc::new(AtomicU64::new(0)),
            lost: Arc::clone(&lost),
            recording: false,
        };
        // Render a long way ahead. Actual DI arrives only at each output callback.
        for index in 0..10_000 {
            let pulse = if index % 997 == 0 { 0.25 } else { 0.0 };
            playback
                .push(OutputFrame {
                    output: [pulse; 2],
                    stems: [0.0, pulse, pulse, pulse, pulse, pulse, pulse, pulse, pulse],
                    take: 7,
                    index,
                    synthetic: false,
                })
                .unwrap();
        }
        let mut position = 0;
        for count in [1, 255, 1024, 7, 4096, 3617, 1000] {
            for index in position..position + count {
                input
                    .push(if index % 997 == 0 { 0.25 } else { 0.0 })
                    .unwrap();
            }
            let mut buffer = vec![0.0; count * 2];
            tap.render(&mut buffer);
            for i in 0..count {
                let frame = captured.pop().unwrap();
                let expected = if (position + i) % 997 == 0 { 0.25 } else { 0.0 };
                assert_eq!(frame.index, (position + i) as u64);
                assert_eq!(frame.take, 7);
                assert_eq!(
                    frame.stems,
                    [
                        expected,
                        expected,
                        expected,
                        2.0 * expected,
                        2.0 * expected,
                        expected,
                        expected,
                        expected,
                        expected
                    ]
                );
                assert_eq!(&buffer[i * 2..i * 2 + 2], &[expected; 2]);
            }
            position += count;
        }
        assert_eq!(position, 10_000);
        assert!(
            !lost.load(Ordering::Acquire),
            "zero samples may be lost or repeated"
        );
        // A missing output frame is visible to the recording worker, never hidden.
        tap.render(&mut [0.0; 2]);
        assert!(lost.load(Ordering::Acquire));
        lost.store(false, Ordering::Release);
        playback
            .push(OutputFrame {
                synthetic: true,
                take: 8,
                stems: [0.25; 9],
                ..Default::default()
            })
            .unwrap();
        tap.render(&mut [0.0; 2]);
        assert_eq!(captured.pop().unwrap().stems, [0.25; 9]);
        tap.render(&mut [0.0; 2]);
        assert!(
            !lost.load(Ordering::Acquire),
            "synthetic timer gaps do not lose FileInput samples"
        );
    }

    #[test]
    fn incompatible_meter_is_refused_before_groove_change() {
        let engine = AudioEngine::new(AudioConfig::default());
        let ballad: Style =
            serde_json::from_str(include_str!("../../../styles/ballad-68.json")).unwrap();
        assert!(engine.validate_style_meter(&ballad).is_err());
        assert!(engine.validate_transport_meter((6, 8)).is_err());
        engine.transport_set_time_signature((6, 8));
        assert!(engine.validate_style_meter(&ballad).is_ok());
        engine.band_set_style(ballad);
        assert!(engine.validate_transport_meter((6, 8)).is_ok());
    }

    fn headless_engine() -> AudioEngine {
        std::env::set_var("JAM_HEADLESS", "1");
        AudioEngine::new(AudioConfig::default())
    }

    #[test]
    fn original_records_parts_notes_and_snapshot_then_clears_for_a_regular_chart() {
        let mut engine = headless_engine();
        let root = std::env::temp_dir().join(format!("jam-song-engine-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        *engine.recorder.lock() = crate::recorder::TakeRecorder::new(48_000, root.clone());
        let doc: serde_json::Value =
            serde_json::from_str(include_str!("../../../tests/fixtures/seams/original.json"))
                .unwrap();
        let chart: jam_core::chart::Chart =
            serde_json::from_value(doc["body"]["chart"].clone()).unwrap();
        let style = engine.sequencer.lock().style.clone();
        let sections = [(
            "verse".into(),
            jam_band::sequencer::SectionBand {
                styles: [style.clone(), style.clone(), style],
                intensity: [0.5; 3],
                gains: [1.0; 3],
                muted: [false; 3],
                swing: 0.5,
            },
        )]
        .into();
        engine
            .configure_song(chart.resolve(), sections, vec![], doc.clone())
            .unwrap();
        assert!(engine.recorder_start("no-device".into()).is_err());
        engine.start().unwrap();
        engine.transport_set_tempo(99.0);
        engine.record_song("test".into()).unwrap();
        assert!(engine.ensure_timing_editable().is_err());
        assert!(engine.record_song("duplicate".into()).is_err());
        thread::sleep(Duration::from_millis(220));
        let take = engine.recorder_stop().unwrap();
        engine.stop().unwrap();
        let mut recorded = doc.clone();
        recorded["timeSignature"] = serde_json::json!([4, 4]);
        assert_eq!(take.snapshot, recorded);
        assert_eq!(
            take.tempo,
            doc["body"]["chart"]["defaultBpm"].as_f64().unwrap()
        );
        assert!(take.sample_count > 1000);
        assert!(take.midi.iter().any(|n| n.bytes[0] == 0x99));
        assert!(take.midi.iter().any(|n| n.bytes[0] == 0x90));
        let first_drum = take.midi.iter().find(|n| n.bytes[0] == 0x99).unwrap().frame;
        let drums = crate::recorder::read_wav_mono(std::path::Path::new(&take.stems["drums"]))
            .unwrap()
            .0;
        let onset = drums.iter().position(|s| s.abs() > 0.0001).unwrap() as u64;
        assert!(
            onset.abs_diff(first_drum) <= 2,
            "MIDI {first_drum} and WAV {onset} must agree within two samples"
        );
        for path in take.stems.values() {
            let (samples, rate) =
                crate::recorder::read_wav_mono(std::path::Path::new(path)).unwrap();
            assert_eq!(samples.len(), take.sample_count);
            assert_eq!(rate, take.sample_rate);
            assert!(
                samples.iter().any(|x| x.abs() > 0.0001),
                "silent stem: {path}"
            );
        }
        let midi_path = root.join("notes.mid");
        crate::export::write_performance_midi(&midi_path, &take, (4, 4)).unwrap();
        let bytes = std::fs::read(midi_path).unwrap();
        assert_eq!(&bytes[..4], b"MThd");
        assert!(bytes
            .windows(3)
            .any(|b| b[0] == 0x99 && b[1] == 36 && b[2] > 0));
        engine.band_load_chart(chart.resolve());
        assert!(engine.song_snapshot.is_null());
        assert!(engine.sequencer.lock().section_bands.is_empty());
        assert!(engine.ensure_timing_editable().is_ok());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn test_engine_live_steering_and_parts_toggle() {
        let mut engine = headless_engine();
        assert!(engine.start().is_ok());
        assert_eq!(engine.status().mode, EngineMode::Headless);
        assert!(engine.status().running);

        engine.band_set(BandPatch {
            mute_drums: Some(true),
            mute_bass: Some(true),
            mute_comp: Some(false),
            follow_energy: Some(true),
            ..Default::default()
        });

        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        while !engine.get_telemetry().band.mute_drums && std::time::Instant::now() < deadline {
            thread::sleep(Duration::from_millis(10));
        }
        let tel = engine.get_telemetry();
        assert!(tel.band.mute_drums);
        assert!(tel.band.mute_bass);
        assert!(!tel.band.mute_comp);
        assert!(tel.band.follow_energy);
        assert!(engine.stop().is_ok());
        assert!(!engine.status().running);
    }

    #[test]
    fn headless_engine_plays_and_reports_position() {
        let mut engine = headless_engine();
        engine.start().unwrap();
        engine.transport_set_count_in(0);
        engine.transport_set_tempo(240.0);
        engine.transport_play();
        let mut loudest = f32::NEG_INFINITY;
        for _ in 0..20 {
            thread::sleep(Duration::from_millis(20));
            loudest = loudest.max(engine.get_telemetry().output_level.peak_db);
        }
        let tel = engine.get_telemetry();
        assert_eq!(tel.transport.state, "playing");
        assert!(
            tel.transport.position_beats > 0.5,
            "clock should advance: {:?}",
            tel.transport
        );
        assert!(loudest > -60.0, "band should be audible, peak {loudest} dB");
        engine.transport_stop();
        thread::sleep(Duration::from_millis(50));
        let tel = engine.get_telemetry();
        assert_eq!(tel.transport.state, "stopped");
        engine.stop().unwrap();
    }

    #[test]
    fn apply_config_restarts_cleanly() {
        let mut engine = headless_engine();
        engine.start().unwrap();
        let cfg = AudioConfig {
            buffer_size: 128,
            ..AudioConfig::default()
        };
        engine.apply_config(cfg).unwrap();
        assert!(engine.status().running);
        assert_eq!(engine.status().buffer_size, 128);
        engine.stop().unwrap();
    }

    #[test]
    fn tuner_reads_the_headless_sine() {
        let mut engine = headless_engine();
        engine.start().unwrap();
        engine.set_tuner(true);
        let mut seen = None;
        for _ in 0..40 {
            thread::sleep(Duration::from_millis(50));
            if let Some(t) = engine.get_telemetry().tuner {
                seen = Some(t);
                break;
            }
        }
        let t = seen.expect("tuner should lock onto the 440 Hz test input");
        assert!((t.hz - 440.0).abs() < 5.0, "got {} Hz", t.hz);
        assert!(t.note.starts_with('A'));
        engine.stop().unwrap();
    }

    #[test]
    fn input_rate_mismatch_names_both_rates_and_the_recording() {
        let msg = super::input_rate_mismatch(44_100, 48_000).unwrap();
        assert!(msg.contains("44100"), "{msg}");
        assert!(msg.contains("48000"), "{msg}");
        assert!(msg.contains("Cannot record"), "{msg}");
        assert!(super::input_rate_mismatch(48_000, 48_000).is_none());
        assert!(super::input_rate_mismatch(0, 48_000).is_none());
    }
}
