//! io: AudioInput and AudioOutput traits with Cpal, FileInput, and NullOutput implementations.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub type InputCallback = Box<dyn FnMut(&[f32]) + Send>;
pub type OutputCallback = Box<dyn FnMut(&mut [f32]) + Send>;

pub trait AudioInput: Send + Sync {
    fn start(&mut self, callback: InputCallback) -> Result<(), String>;
    fn stop(&mut self) -> Result<(), String>;
    fn is_running(&self) -> bool;
}

pub trait AudioOutput: Send + Sync {
    fn start(&mut self, callback: OutputCallback) -> Result<(), String>;
    fn stop(&mut self) -> Result<(), String>;
    fn is_running(&self) -> bool;
}

/// NullOutput: A headless output driver that advances clock frames on a timer thread.
/// Used when JAM_HEADLESS=1 or on CI runners with no physical sound device.
pub struct NullOutput {
    sample_rate: u32,
    buffer_size: usize,
    running: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
}

impl NullOutput {
    pub fn new(sample_rate: u32, buffer_size: usize) -> Self {
        Self {
            sample_rate,
            buffer_size,
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        }
    }
}

impl AudioOutput for NullOutput {
    fn start(&mut self, mut callback: OutputCallback) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.running.store(true, Ordering::SeqCst);
        let running = Arc::clone(&self.running);
        let buffer_size = self.buffer_size;
        let sample_rate = self.sample_rate;
        let block_duration = Duration::from_secs_f64(buffer_size as f64 / sample_rate as f64);

        let handle = thread::spawn(move || {
            let mut buffer = vec![0.0f32; buffer_size * 2]; // stereo buffer
            let mut next_tick = Instant::now();

            while running.load(Ordering::SeqCst) {
                buffer.fill(0.0);
                callback(&mut buffer);

                next_tick += block_duration;
                let now = Instant::now();
                if next_tick > now {
                    thread::sleep(next_tick - now);
                } else {
                    // Slight drift compensation
                    next_tick = now;
                }
            }
        });

        self.thread_handle = Some(handle);
        Ok(())
    }

    fn stop(&mut self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
        Ok(())
    }

    fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

/// FileInput: Plays a WAV file on loop as synthetic guitar DI input.
pub struct FileInput {
    samples: Vec<f32>,
    buffer_size: usize,
    running: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
}

impl FileInput {
    pub fn from_wav_file(path: &str, buffer_size: usize) -> Result<Self, String> {
        let mut reader = hound::WavReader::open(path).map_err(|e| e.to_string())?;
        let spec = reader.spec();

        let raw_samples: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Float => reader.samples::<f32>().filter_map(Result::ok).collect(),
            hound::SampleFormat::Int => {
                let max_val = (1i64 << (spec.bits_per_sample - 1)) as f32;
                reader
                    .samples::<i32>()
                    .filter_map(Result::ok)
                    .map(|s| s as f32 / max_val)
                    .collect()
            }
        };

        if raw_samples.is_empty() {
            return Err("WAV file is empty".into());
        }

        // Downmix to mono if multi-channel
        let channels = spec.channels as usize;
        let mono_samples = if channels > 1 {
            raw_samples
                .chunks_exact(channels)
                .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                .collect()
        } else {
            raw_samples
        };

        Ok(Self {
            samples: mono_samples,
            buffer_size,
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        })
    }

    pub fn from_samples(samples: Vec<f32>, buffer_size: usize) -> Self {
        Self {
            samples,
            buffer_size,
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        }
    }
}

impl AudioInput for FileInput {
    fn start(&mut self, mut callback: InputCallback) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.running.store(true, Ordering::SeqCst);
        let running = Arc::clone(&self.running);
        let samples = self.samples.clone();
        let buffer_size = self.buffer_size;
        let block_duration = Duration::from_secs_f64(buffer_size as f64 / 48000.0);

        let handle = thread::spawn(move || {
            let mut read_idx = 0;
            let mut buffer = vec![0.0f32; buffer_size];
            let mut next_tick = Instant::now();

            while running.load(Ordering::SeqCst) {
                for sample in buffer.iter_mut() {
                    *sample = samples[read_idx];
                    read_idx = (read_idx + 1) % samples.len();
                }

                callback(&buffer);

                next_tick += block_duration;
                let now = Instant::now();
                if next_tick > now {
                    thread::sleep(next_tick - now);
                } else {
                    next_tick = now;
                }
            }
        });

        self.thread_handle = Some(handle);
        Ok(())
    }

    fn stop(&mut self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
        Ok(())
    }

    fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}
