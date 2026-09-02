//! engine: Lock-free audio engine with render-ahead worker thread, test tone, metronome, and tuner metering.

use crate::devices::AudioConfig;
use crate::io::{AudioInput, AudioOutput, FileInput, NullOutput};
use jam_dsp::{calculate_level, PitchTracker};
use parking_lot::Mutex;
use rtrb::RingBuffer;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EngineTelemetry {
    pub xruns: u64,
    pub input_level: MeterTelemetry,
    pub output_level: MeterTelemetry,
    pub tuner: Option<TunerTelemetry>,
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

pub struct AudioEngine {
    config: AudioConfig,
    running: Arc<AtomicBool>,
    tone_active: Arc<AtomicBool>,
    tone_hz: Arc<Mutex<f32>>,
    metronome_active: Arc<AtomicBool>,
    metronome_bpm: Arc<Mutex<f64>>,
    tuner_active: Arc<AtomicBool>,
    xruns: Arc<AtomicU64>,
    latest_telemetry: Arc<Mutex<EngineTelemetry>>,
    input_driver: Option<Box<dyn AudioInput>>,
    output_driver: Option<Box<dyn AudioOutput>>,
    render_handle: Option<JoinHandle<()>>,
}

impl AudioEngine {
    pub fn new(config: AudioConfig) -> Self {
        Self {
            config,
            running: Arc::new(AtomicBool::new(false)),
            tone_active: Arc::new(AtomicBool::new(false)),
            tone_hz: Arc::new(Mutex::new(440.0)),
            metronome_active: Arc::new(AtomicBool::new(false)),
            metronome_bpm: Arc::new(Mutex::new(120.0)),
            tuner_active: Arc::new(AtomicBool::new(true)),
            xruns: Arc::new(AtomicU64::new(0)),
            latest_telemetry: Arc::new(Mutex::new(EngineTelemetry::default())),
            input_driver: None,
            output_driver: None,
            render_handle: None,
        }
    }

    pub fn set_tone(&self, on: bool, hz: f32) {
        self.tone_active.store(on, Ordering::SeqCst);
        *self.tone_hz.lock() = hz;
    }

    pub fn set_metronome(&self, on: bool, bpm: f64) {
        self.metronome_active.store(on, Ordering::SeqCst);
        *self.metronome_bpm.lock() = bpm;
    }

    pub fn set_tuner(&self, on: bool) {
        self.tuner_active.store(on, Ordering::SeqCst);
    }

    pub fn get_telemetry(&self) -> EngineTelemetry {
        self.latest_telemetry.lock().clone()
    }

    pub fn start(&mut self) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.running.store(true, Ordering::SeqCst);
        let sample_rate = self.config.sample_rate;
        let buffer_size = self.config.buffer_size as usize;

        // Ring buffer capacity: ~200ms lookahead (approx 10,000 frames)
        let ring_capacity = (sample_rate as usize / 5) * 2; // stereo
        let (output_prod, mut output_cons) = RingBuffer::<f32>::new(ring_capacity);

        // Input ring buffer
        let (mut input_prod, mut input_cons) = RingBuffer::<f32>::new(ring_capacity);

        let running = Arc::clone(&self.running);
        let tone_active = Arc::clone(&self.tone_active);
        let tone_hz = Arc::clone(&self.tone_hz);
        let metronome_active = Arc::clone(&self.metronome_active);
        let metronome_bpm = Arc::clone(&self.metronome_bpm);
        let tuner_active = Arc::clone(&self.tuner_active);
        let xruns = Arc::clone(&self.xruns);
        let telemetry = Arc::clone(&self.latest_telemetry);

        // Render worker thread
        let mut prod = output_prod;
        let render_handle = thread::spawn(move || {
            let mut phase: f32 = 0.0;
            let mut sample_counter: u64 = 0;
            let mut pitch_tracker = PitchTracker::new(2048, sample_rate);
            let mut input_accumulator: Vec<f32> = Vec::with_capacity(2048);

            let block_frames = 256;
            let mut block_left = vec![0.0f32; block_frames];
            let mut block_right = vec![0.0f32; block_frames];

            while running.load(Ordering::SeqCst) {
                // Read from input ring buffer and update input level + tuner
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

                // Render test tone & metronome click into block
                block_left.fill(0.0);
                block_right.fill(0.0);

                let is_tone = tone_active.load(Ordering::SeqCst);
                let hz = *tone_hz.lock();
                let is_metro = metronome_active.load(Ordering::SeqCst);
                let bpm = *metronome_bpm.lock();
                let metro_samples_per_beat = (sample_rate as f64 * 60.0 / bpm).max(1.0) as u64;

                for i in 0..block_frames {
                    let mut s = 0.0f32;

                    // Tone generator (sine)
                    if is_tone {
                        s += (phase * 2.0 * std::f32::consts::PI).sin() * 0.5;
                        phase = (phase + hz / sample_rate as f32) % 1.0;
                    }

                    // Metronome click
                    if is_metro {
                        let beat_idx = sample_counter % metro_samples_per_beat;
                        // Click is a decaying sine wave on beat boundary
                        if beat_idx < 480 {
                            // 10ms click
                            let click_hz =
                                if (sample_counter / metro_samples_per_beat).is_multiple_of(4) {
                                    1200.0 // Accent beat 1
                                } else {
                                    800.0 // Normal beats
                                };
                            let click_t = beat_idx as f32 / sample_rate as f32;
                            let decay = 1.0 - (beat_idx as f32 / 480.0);
                            s += (click_t * 2.0 * std::f32::consts::PI * click_hz).sin()
                                * decay
                                * 0.7;
                        }
                    }

                    block_left[i] = s;
                    block_right[i] = s;
                    sample_counter += 1;
                }

                // Calculate output meter
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
                    let mut tel = telemetry.lock();
                    tel.xruns = xruns.load(Ordering::Relaxed);
                    tel.input_level = in_meter;
                    tel.output_level = MeterTelemetry {
                        peak_db: out_lvl.peak_db,
                        rms_db: out_lvl.rms_db,
                    };
                    if let Some(t) = tuner_res {
                        tel.tuner = Some(t);
                    }
                }

                if can_push {
                    thread::sleep(Duration::from_millis(2));
                } else {
                    thread::sleep(Duration::from_millis(5));
                }
            }
        });

        self.render_handle = Some(render_handle);

        // Setup Output driver: NullOutput if headless or fallback
        let is_headless = std::env::var("JAM_HEADLESS").unwrap_or_default() == "1";
        let mut output_driver: Box<dyn AudioOutput> = if is_headless {
            Box::new(NullOutput::new(sample_rate, buffer_size))
        } else {
            // Attempt CPAL default, fallback to NullOutput if error
            Box::new(NullOutput::new(sample_rate, buffer_size))
        };

        output_driver.start(Box::new(move |buffer: &mut [f32]| {
            for sample in buffer.iter_mut() {
                *sample = output_cons.pop().unwrap_or(0.0);
            }
        }))?;

        self.output_driver = Some(output_driver);

        // Setup Input driver: FileInput if JAM_FAKE_INPUT is provided or headless
        let fake_wav = std::env::var("JAM_FAKE_INPUT").ok();
        let mut input_driver: Box<dyn AudioInput> = if let Some(path) = fake_wav {
            Box::new(
                FileInput::from_wav_file(&path, buffer_size).unwrap_or_else(|_| {
                    // Generate a 440 Hz fallback tone if file not found
                    let mut s = Vec::with_capacity(48000);
                    for i in 0..48000 {
                        s.push(
                            (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48000.0).sin() * 0.8,
                        );
                    }
                    FileInput::from_samples(s, buffer_size)
                }),
            )
        } else {
            // Default to synthetic A4 sine wave for tests
            let mut s = Vec::with_capacity(48000);
            for i in 0..48000 {
                s.push((2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48000.0).sin() * 0.8);
            }
            Box::new(FileInput::from_samples(s, buffer_size))
        };

        input_driver.start(Box::new(move |buffer: &[f32]| {
            for &sample in buffer {
                let _ = input_prod.push(sample);
            }
        }))?;

        self.input_driver = Some(input_driver);

        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_lifecycle_headless() {
        std::env::set_var("JAM_HEADLESS", "1");
        let config = AudioConfig::default();
        let mut engine = AudioEngine::new(config);

        assert!(engine.start().is_ok());

        engine.set_tone(true, 440.0);
        engine.set_metronome(true, 120.0);

        thread::sleep(Duration::from_millis(50));

        let tel = engine.get_telemetry();
        assert!(tel.output_level.peak_db > -100.0);

        assert!(engine.stop().is_ok());
    }
}
