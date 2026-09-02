//! io: AudioInput and AudioOutput traits with Cpal, FileInput, and NullOutput implementations.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
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

fn named_or_default_device(name: Option<&str>, input: bool) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if let Some(n) = name {
        let list = if input {
            host.input_devices()
        } else {
            host.output_devices()
        };
        if let Ok(devices) = list {
            for d in devices {
                if d.name().ok().as_deref() == Some(n) {
                    return Ok(d);
                }
            }
        }
        return Err(format!(
            "{} device not found: {n}. Pick another in Settings.",
            if input { "input" } else { "output" }
        ));
    }
    if input {
        host.default_input_device()
            .ok_or_else(|| "no default input device".into())
    } else {
        host.default_output_device()
            .ok_or_else(|| "no default output device".into())
    }
}

pub struct CpalOutput {
    device_name: Option<String>,
    running: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
}

impl CpalOutput {
    pub fn new(device_name: Option<String>) -> Self {
        Self {
            device_name,
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        }
    }
}

impl AudioOutput for CpalOutput {
    fn start(&mut self, mut callback: OutputCallback) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }
        self.running.store(true, Ordering::SeqCst);
        let running = Arc::clone(&self.running);
        let device_name = self.device_name.clone();
        let (tx, rx) = mpsc::channel();

        let handle = thread::spawn(move || {
            let opened = (|| {
                let device = named_or_default_device(device_name.as_deref(), false)?;
                let supported = device.default_output_config().map_err(|e| e.to_string())?;
                let cfg: StreamConfig = supported.clone().into();
                let channels = cfg.channels as usize;
                let stream = match supported.sample_format() {
                    SampleFormat::F32 => {
                        let mut tmp = Vec::new();
                        device
                            .build_output_stream(
                                &cfg,
                                move |data: &mut [f32], _| {
                                    let frames = data.len() / channels.max(1);
                                    tmp.resize(frames * 2, 0.0);
                                    callback(&mut tmp);
                                    for f in 0..frames {
                                        data[f * channels] = tmp[f * 2];
                                        if channels > 1 {
                                            data[f * channels + 1] = tmp[f * 2 + 1];
                                        }
                                        for c in 2..channels {
                                            data[f * channels + c] = 0.0;
                                        }
                                    }
                                },
                                |_| {},
                                None,
                            )
                            .map_err(|e| e.to_string())?
                    }
                    SampleFormat::I16 => {
                        let mut tmp = Vec::new();
                        device
                            .build_output_stream(
                                &cfg,
                                move |data: &mut [i16], _| {
                                    let frames = data.len() / channels.max(1);
                                    tmp.resize(frames * 2, 0.0);
                                    callback(&mut tmp);
                                    for f in 0..frames {
                                        data[f * channels] =
                                            (tmp[f * 2].clamp(-1.0, 1.0) * 32767.0) as i16;
                                        if channels > 1 {
                                            data[f * channels + 1] =
                                                (tmp[f * 2 + 1].clamp(-1.0, 1.0) * 32767.0) as i16;
                                        }
                                        for c in 2..channels {
                                            data[f * channels + c] = 0;
                                        }
                                    }
                                },
                                |_| {},
                                None,
                            )
                            .map_err(|e| e.to_string())?
                    }
                    other => return Err(format!("unsupported output sample format: {other:?}")),
                };
                stream.play().map_err(|e| e.to_string())?;
                Ok(stream)
            })();
            match opened {
                Ok(_stream) => {
                    let _ = tx.send(Ok(()));
                    while running.load(Ordering::SeqCst) {
                        thread::sleep(Duration::from_millis(50));
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(e));
                }
            }
        });

        match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => {
                self.thread_handle = Some(handle);
                Ok(())
            }
            Ok(Err(e)) => {
                self.running.store(false, Ordering::SeqCst);
                let _ = handle.join();
                Err(e)
            }
            Err(_) => {
                self.running.store(false, Ordering::SeqCst);
                let _ = handle.join();
                Err("timed out opening output device".into())
            }
        }
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

pub struct CpalInput {
    device_name: Option<String>,
    channel: usize,
    running: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
}

impl CpalInput {
    pub fn new(device_name: Option<String>, channel: u16) -> Self {
        Self {
            device_name,
            channel: channel as usize,
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        }
    }
}

impl AudioInput for CpalInput {
    fn start(&mut self, mut callback: InputCallback) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }
        self.running.store(true, Ordering::SeqCst);
        let running = Arc::clone(&self.running);
        let device_name = self.device_name.clone();
        let guitar_ch = self.channel;
        let (tx, rx) = mpsc::channel();

        let handle = thread::spawn(move || {
            let opened = (|| {
                let device = named_or_default_device(device_name.as_deref(), true)?;
                let supported = device.default_input_config().map_err(|e| e.to_string())?;
                let cfg: StreamConfig = supported.clone().into();
                let channels = cfg.channels as usize;
                let ch = guitar_ch.min(channels.saturating_sub(1));
                let stream = match supported.sample_format() {
                    SampleFormat::F32 => {
                        let mut tmp = Vec::new();
                        device
                            .build_input_stream(
                                &cfg,
                                move |data: &[f32], _| {
                                    let frames = data.len() / channels.max(1);
                                    tmp.resize(frames, 0.0);
                                    for f in 0..frames {
                                        tmp[f] = data[f * channels + ch];
                                    }
                                    callback(&tmp);
                                },
                                |_| {},
                                None,
                            )
                            .map_err(|e| e.to_string())?
                    }
                    SampleFormat::I16 => {
                        let mut tmp = Vec::new();
                        device
                            .build_input_stream(
                                &cfg,
                                move |data: &[i16], _| {
                                    let frames = data.len() / channels.max(1);
                                    tmp.resize(frames, 0.0);
                                    for f in 0..frames {
                                        tmp[f] = data[f * channels + ch] as f32 / 32768.0;
                                    }
                                    callback(&tmp);
                                },
                                |_| {},
                                None,
                            )
                            .map_err(|e| e.to_string())?
                    }
                    other => return Err(format!("unsupported input sample format: {other:?}")),
                };
                stream.play().map_err(|e| e.to_string())?;
                Ok(stream)
            })();
            match opened {
                Ok(_stream) => {
                    let _ = tx.send(Ok(()));
                    while running.load(Ordering::SeqCst) {
                        thread::sleep(Duration::from_millis(50));
                    }
                }
                Err(e) => {
                    let _ = tx.send(Err(e));
                }
            }
        });

        match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => {
                self.thread_handle = Some(handle);
                Ok(())
            }
            Ok(Err(e)) => {
                self.running.store(false, Ordering::SeqCst);
                let _ = handle.join();
                Err(e)
            }
            Err(_) => {
                self.running.store(false, Ordering::SeqCst);
                let _ = handle.join();
                Err("timed out opening input device".into())
            }
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_input_loops_samples() {
        let mut input = FileInput::from_samples(vec![0.25, -0.5], 2);
        let collected = Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink = Arc::clone(&collected);
        input
            .start(Box::new(move |buf| {
                sink.lock().unwrap().extend_from_slice(buf);
            }))
            .unwrap();
        thread::sleep(Duration::from_millis(30));
        input.stop().unwrap();
        assert!(collected.lock().unwrap().len() >= 2);
    }
}
