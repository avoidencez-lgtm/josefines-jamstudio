//! io: AudioInput and AudioOutput traits with cpal (real hardware), FileInput and
//! NullOutput (headless) implementations.
//!
//! Both cpal drivers open their stream on a dedicated thread (cpal streams are not
//! `Send` on every backend) and report the *actual* negotiated stream parameters via
//! [`StreamInfo`]. Device rates that differ from the engine's fixed 48 kHz domain are
//! converted on bounded worker threads. Stream errors are counted and surfaced.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{
    BufferSize, FromSample, Sample, SampleFormat, SampleRate, SizedSample, StreamConfig,
    SupportedBufferSize, SupportedStreamConfig,
};
use rtrb::RingBuffer;
use rubato::{audioadapter_buffers::direct::InterleavedSlice, Resampler};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub type InputCallback = Box<dyn FnMut(&[f32]) + Send>;
pub type OutputCallback = Box<dyn FnMut(&mut [f32]) + Send>;

/// What a driver actually negotiated with the OS.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StreamInfo {
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
    /// Frames per hardware callback if the backend committed to a fixed size.
    pub buffer_frames: Option<u32>,
    pub sample_format: String,
}

pub trait AudioInput: Send + Sync {
    fn start(&mut self, callback: InputCallback) -> Result<(), String>;
    fn stop(&mut self) -> Result<(), String>;
    fn is_running(&self) -> bool;
    /// Synthetic producers may wait for the scheduler instead of losing input frames.
    fn is_synthetic(&self) -> bool {
        false
    }
    fn info(&self) -> Option<StreamInfo> {
        None
    }
    /// Rate delivered to the engine callback after any device-edge conversion.
    fn callback_sample_rate(&self) -> Option<u32> {
        self.info().map(|info| info.sample_rate)
    }
    /// Number of backend stream errors since `start`.
    fn error_count(&self) -> u64 {
        0
    }
}

pub trait AudioOutput: Send + Sync {
    fn start(&mut self, callback: OutputCallback) -> Result<(), String>;
    /// Release a driver whose device edge was opened before the engine render worker.
    fn activate(&self) {}
    fn stop(&mut self) -> Result<(), String>;
    fn is_running(&self) -> bool;
    fn info(&self) -> Option<StreamInfo> {
        None
    }
    fn error_count(&self) -> u64 {
        0
    }
}

/// NullOutput: A headless output driver that advances clock frames on a timer thread.
/// Used when JAM_HEADLESS=1, on CI runners, or as the fallback when no device opens.
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

    fn info(&self) -> Option<StreamInfo> {
        Some(StreamInfo {
            device_name: "headless".into(),
            sample_rate: self.sample_rate,
            channels: 2,
            buffer_frames: Some(self.buffer_size as u32),
            sample_format: "f32".into(),
        })
    }
}

/// FileInput: Plays a WAV file (or a sample vector) on loop as synthetic guitar DI input.
pub struct FileInput {
    samples: Vec<f32>,
    buffer_size: usize,
    sample_rate: u32,
    running: Arc<AtomicBool>,
    thread_handle: Option<JoinHandle<()>>,
}

impl FileInput {
    pub fn from_wav_file(path: &str, buffer_size: usize) -> Result<Self, String> {
        let mut reader = hound::WavReader::open(path).map_err(|e| e.to_string())?;
        let spec = reader.spec();

        if !(8_000..=192_000).contains(&spec.sample_rate) {
            return Err("WAV sample rate must be between 8 and 192 kHz.".into());
        }

        let raw_samples: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Float => reader
                .samples::<f32>()
                .collect::<Result<_, _>>()
                .map_err(|e| format!("WAV sample is unreadable. {e}"))?,
            hound::SampleFormat::Int => {
                let max_val = (1i64 << (spec.bits_per_sample - 1)) as f32;
                reader
                    .samples::<i32>()
                    .map(|s| s.map(|v| v as f32 / max_val).map_err(|e| e.to_string()))
                    .collect::<Result<_, _>>()?
            }
        };

        if raw_samples.is_empty() {
            return Err("WAV file is empty".into());
        }

        // Downmix to mono if multi-channel
        let channels = spec.channels as usize;
        if channels == 0 || !raw_samples.len().is_multiple_of(channels) {
            return Err("WAV channel count does not match the sample data.".into());
        }
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
            sample_rate: spec.sample_rate,
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        })
    }

    pub fn from_samples(samples: Vec<f32>, buffer_size: usize) -> Self {
        Self::from_samples_at(samples, buffer_size, 48_000)
    }

    pub fn from_samples_at(samples: Vec<f32>, buffer_size: usize, sample_rate: u32) -> Self {
        Self {
            samples,
            buffer_size,
            sample_rate,
            running: Arc::new(AtomicBool::new(false)),
            thread_handle: None,
        }
    }

    /// A silent input, for headless operation without a fake DI signal.
    pub fn silent(buffer_size: usize, sample_rate: u32) -> Self {
        Self::from_samples_at(vec![0.0; buffer_size.max(1)], buffer_size, sample_rate)
    }

    /// A looping 440 Hz sine at -2 dBFS, handy for exercising the tuner headlessly.
    pub fn sine_440(buffer_size: usize, sample_rate: u32) -> Self {
        let n = sample_rate as usize;
        let s: Vec<f32> = (0..n)
            .map(|i| {
                (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sample_rate as f32).sin() * 0.8
            })
            .collect();
        Self::from_samples_at(s, buffer_size, sample_rate)
    }
}

impl AudioInput for FileInput {
    fn is_synthetic(&self) -> bool {
        true
    }

    fn start(&mut self, mut callback: InputCallback) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }
        if self.samples.is_empty() {
            return Err("FileInput has no samples".into());
        }

        self.running.store(true, Ordering::SeqCst);
        let running = Arc::clone(&self.running);
        let samples = self.samples.clone();
        let buffer_size = self.buffer_size.max(1);
        let block_duration =
            Duration::from_secs_f64(buffer_size as f64 / self.sample_rate.max(1) as f64);

        // A late scheduler used to reset the clock and skip the missed blocks.
        // Produce those immediately, and start a few blocks ahead so the render
        // thread can prime without recording silence.
        const LEAD_BLOCKS: u32 = 8;
        let handle = thread::spawn(move || {
            let mut read_idx = 0;
            let mut buffer = vec![0.0f32; buffer_size];
            let mut next_tick = Instant::now()
                .checked_sub(block_duration.saturating_mul(LEAD_BLOCKS))
                .unwrap_or_else(Instant::now);

            while running.load(Ordering::SeqCst) {
                for sample in buffer.iter_mut() {
                    *sample = samples[read_idx];
                    read_idx = (read_idx + 1) % samples.len();
                }

                callback(&buffer);

                next_tick += block_duration;
                while running.load(Ordering::SeqCst) {
                    let now = Instant::now();
                    if next_tick <= now {
                        break;
                    }
                    thread::sleep((next_tick - now).min(Duration::from_millis(10)));
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

    fn info(&self) -> Option<StreamInfo> {
        Some(StreamInfo {
            device_name: "file".into(),
            sample_rate: self.sample_rate,
            channels: 1,
            buffer_frames: Some(self.buffer_size as u32),
            sample_format: "f32".into(),
        })
    }
}

// ---------------------------------------------------------------------------
// cpal drivers
// ---------------------------------------------------------------------------

fn named_or_default_device(name: Option<&str>, input: bool) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    let kind = if input { "input" } else { "output" };
    if let Some(n) = name.filter(|n| !n.trim().is_empty()) {
        let list = if input {
            host.input_devices()
        } else {
            host.output_devices()
        }
        .map_err(|e| format!("Cannot enumerate {kind} devices. {e}"))?;
        for d in list {
            if d.name().ok().as_deref() == Some(n) {
                return Ok(d);
            }
        }
        return Err(format!(
            "{kind} device \"{n}\" not found (unplugged or renamed). Pick another in Settings."
        ));
    }
    if input {
        host.default_input_device()
            .ok_or_else(|| format!("No default {kind} device."))
    } else {
        host.default_output_device()
            .ok_or_else(|| format!("No default {kind} device."))
    }
}

/// Picks the supported config closest to what we want: the requested sample rate if
/// the device offers it, at least `min_channels` channels (preferring exactly
/// `min_channels`), preferring f32 samples. Falls back to the device default config.
fn pick_config(
    ranges: Vec<cpal::SupportedStreamConfigRange>,
    default: SupportedStreamConfig,
    wanted_rate: u32,
    min_channels: u16,
) -> SupportedStreamConfig {
    let rate = SampleRate(wanted_rate);
    let mut best: Option<(i32, SupportedStreamConfig)> = None;
    for r in ranges {
        if r.channels() < min_channels {
            continue;
        }
        if r.min_sample_rate() > rate || r.max_sample_rate() < rate {
            continue;
        }
        let mut score = 0;
        if r.sample_format() == SampleFormat::F32 {
            score += 10;
        }
        if r.channels() == min_channels {
            score += 5;
        }
        let cfg = r.with_sample_rate(rate);
        if best.as_ref().map(|(s, _)| score > *s).unwrap_or(true) {
            best = Some((score, cfg));
        }
    }
    best.map(|(_, c)| c).unwrap_or(default)
}

fn fixed_buffer_within(supported: &SupportedBufferSize, wanted: u32) -> BufferSize {
    match supported {
        SupportedBufferSize::Range { min, max } if wanted >= *min && wanted <= *max => {
            BufferSize::Fixed(wanted)
        }
        SupportedBufferSize::Range { min, max } => BufferSize::Fixed(wanted.clamp(*min, *max)),
        SupportedBufferSize::Unknown => BufferSize::Default,
    }
}

fn format_name(f: SampleFormat) -> String {
    format!("{f:?}").to_lowercase()
}

/// Shared open/park/stop plumbing for the two cpal drivers.
struct StreamWorker {
    running: Arc<AtomicBool>,
    errors: Arc<AtomicU64>,
    info: Option<StreamInfo>,
    thread_handle: Option<JoinHandle<()>>,
}

struct OpenedStream {
    stream: cpal::Stream,
    info: StreamInfo,
    edge: Option<JoinHandle<()>>,
}

impl StreamWorker {
    fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            errors: Arc::new(AtomicU64::new(0)),
            info: None,
            thread_handle: None,
        }
    }

    /// Runs `open` on a fresh thread, waits for it to report success/failure, then
    /// keeps the thread (and therefore the stream) alive until `stop`.
    fn spawn<F>(&mut self, open: F) -> Result<(), String>
    where
        F: FnOnce(Arc<AtomicBool>) -> Result<OpenedStream, String> + Send + 'static,
    {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }
        self.running.store(true, Ordering::SeqCst);
        self.errors.store(0, Ordering::SeqCst);
        let running = Arc::clone(&self.running);
        let (tx, rx) = mpsc::channel::<Result<StreamInfo, String>>();

        let handle = thread::spawn(move || match open(Arc::clone(&running)) {
            Ok(OpenedStream { stream, info, edge }) => {
                if let Err(e) = stream.play() {
                    let _ = tx.send(Err(format!("Cannot start the audio stream. {e}")));
                    return;
                }
                let _ = tx.send(Ok(info));
                while running.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_millis(20));
                }
                drop(stream);
                if let Some(edge) = edge {
                    let _ = edge.join();
                }
            }
            Err(e) => {
                let _ = tx.send(Err(e));
            }
        });

        match rx.recv_timeout(Duration::from_secs(8)) {
            Ok(Ok(info)) => {
                self.info = Some(info);
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
                Err("timed out opening audio device (8 s)".into())
            }
        }
    }

    fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
        self.info = None;
    }
}

fn resampled_output(
    mut source: OutputCallback,
    source_rate: u32,
    device_rate: u32,
    running: Arc<AtomicBool>,
    active: Arc<AtomicBool>,
    errors: Arc<AtomicU64>,
) -> Result<(OutputCallback, JoinHandle<()>), String> {
    let mut resampler = crate::import::fft_resampler(source_rate, device_rate, 2)?;
    let input_frames = resampler.input_frames_next();
    let output_frames = resampler.output_frames_max();
    let (mut producer, mut consumer) = RingBuffer::new(output_frames * 16);
    let callback_errors = Arc::clone(&errors);
    let callback_active = Arc::clone(&active);
    let device_callback: OutputCallback = Box::new(move |buffer| {
        let mut starved = false;
        for sample in buffer {
            *sample = consumer.pop().unwrap_or_else(|_| {
                starved = true;
                0.0
            });
        }
        if starved && callback_active.load(Ordering::Acquire) {
            callback_errors.fetch_add(1, Ordering::Relaxed);
        }
    });
    let edge = thread::Builder::new()
        .name("jam-output-resampler".into())
        .spawn(move || {
            let mut input = vec![0.0; input_frames * 2];
            let mut output = vec![0.0; output_frames * 2];
            while running.load(Ordering::SeqCst) {
                if !active.load(Ordering::Acquire) {
                    thread::sleep(Duration::from_millis(1));
                    continue;
                }
                if producer.slots() < output.len() {
                    thread::sleep(Duration::from_millis(1));
                    continue;
                }
                source(&mut input);
                let input_adapter = match InterleavedSlice::new(&input, 2, input_frames) {
                    Ok(adapter) => adapter,
                    Err(_) => break,
                };
                let mut output_adapter =
                    match InterleavedSlice::new_mut(&mut output, 2, output_frames) {
                        Ok(adapter) => adapter,
                        Err(_) => break,
                    };
                let produced = match resampler.process_into_buffer(
                    &input_adapter,
                    &mut output_adapter,
                    None,
                ) {
                    Ok((_, frames)) => frames * 2,
                    Err(_) => {
                        errors.fetch_add(1, Ordering::Relaxed);
                        break;
                    }
                };
                for &sample in &output[..produced] {
                    if producer.push(sample).is_err() {
                        errors.fetch_add(1, Ordering::Relaxed);
                        break;
                    }
                }
            }
        })
        .map_err(|e| format!("Cannot start the output resampler. {e}"))?;
    Ok((device_callback, edge))
}

fn resampled_input(
    mut sink: InputCallback,
    device_rate: u32,
    sink_rate: u32,
    running: Arc<AtomicBool>,
    errors: Arc<AtomicU64>,
) -> Result<(InputCallback, JoinHandle<()>), String> {
    let mut resampler = crate::import::fft_resampler(device_rate, sink_rate, 1)?;
    let input_frames = resampler.input_frames_next();
    let output_frames = resampler.output_frames_max();
    let (mut producer, mut consumer) = RingBuffer::new(input_frames * 8);
    let callback_errors = Arc::clone(&errors);
    let device_callback: InputCallback = Box::new(move |buffer| {
        let mut overflowed = false;
        for &sample in buffer {
            if producer.push(sample).is_err() {
                overflowed = true;
            }
        }
        if overflowed {
            callback_errors.fetch_add(1, Ordering::Relaxed);
        }
    });
    let edge = thread::Builder::new()
        .name("jam-input-resampler".into())
        .spawn(move || {
            let mut input = vec![0.0; input_frames];
            let mut output = vec![0.0; output_frames];
            while running.load(Ordering::SeqCst) {
                if consumer.slots() < input_frames {
                    thread::sleep(Duration::from_millis(1));
                    continue;
                }
                for sample in &mut input {
                    *sample = consumer.pop().unwrap_or(0.0);
                }
                let input_adapter = match InterleavedSlice::new(&input, 1, input_frames) {
                    Ok(adapter) => adapter,
                    Err(_) => break,
                };
                let mut output_adapter =
                    match InterleavedSlice::new_mut(&mut output, 1, output_frames) {
                        Ok(adapter) => adapter,
                        Err(_) => break,
                    };
                match resampler.process_into_buffer(&input_adapter, &mut output_adapter, None) {
                    Ok((_, frames)) => sink(&output[..frames]),
                    Err(_) => {
                        errors.fetch_add(1, Ordering::Relaxed);
                        break;
                    }
                }
            }
        })
        .map_err(|e| format!("Cannot start the input resampler. {e}"))?;
    Ok((device_callback, edge))
}

/// Real output through the OS audio stack. The engine callback always produces
/// interleaved stereo f32; this driver converts to the device's channel count and
/// sample format.
pub struct CpalOutput {
    device_name: Option<String>,
    wanted_rate: u32,
    callback_rate: u32,
    wanted_buffer: u32,
    active: Arc<AtomicBool>,
    worker: StreamWorker,
}

impl CpalOutput {
    pub fn new(device_name: Option<String>, sample_rate: u32, buffer_size: u32) -> Self {
        Self {
            device_name,
            wanted_rate: sample_rate,
            callback_rate: sample_rate,
            wanted_buffer: buffer_size,
            active: Arc::new(AtomicBool::new(true)),
            worker: StreamWorker::new(),
        }
    }

    pub fn new_resampled(
        device_name: Option<String>,
        device_rate: u32,
        callback_rate: u32,
        buffer_size: u32,
    ) -> Self {
        Self {
            device_name,
            wanted_rate: device_rate,
            callback_rate,
            wanted_buffer: buffer_size,
            active: Arc::new(AtomicBool::new(false)),
            worker: StreamWorker::new(),
        }
    }
}

fn convert_output<T: SizedSample + FromSample<f32>>(
    data: &mut [T],
    channels: usize,
    callback: &mut dyn FnMut(&mut [f32]),
) {
    let mut tmp = [0.0_f32; 2048];
    for block in data.chunks_mut(1024 * channels) {
        let frames = block.len() / channels;
        tmp.fill(0.0);
        callback(&mut tmp[..frames * 2]);
        for (frame, stereo) in block
            .chunks_exact_mut(channels)
            .zip(tmp.as_chunks::<2>().0.iter())
        {
            frame.fill(T::from_sample(0.0_f32));
            if channels == 1 {
                frame[0] = T::from_sample(0.5 * (stereo[0] + stereo[1]));
            } else {
                frame[0] = T::from_sample(stereo[0]);
                frame[1] = T::from_sample(stereo[1]);
            }
        }
    }
}

fn convert_input<T: SizedSample>(
    data: &[T],
    channels: usize,
    ch: usize,
    callback: &mut dyn FnMut(&[f32]),
) where
    f32: FromSample<T>,
{
    let mut tmp = [0.0_f32; 1024];
    for block in data.chunks(1024 * channels) {
        let frames = block.len() / channels;
        for (sample, frame) in tmp.iter_mut().zip(block.chunks_exact(channels)) {
            *sample = f32::from_sample(frame[ch]);
        }
        callback(&tmp[..frames]);
    }
}

fn build_output<T>(
    device: &cpal::Device,
    cfg: &StreamConfig,
    mut callback: OutputCallback,
    errors: Arc<AtomicU64>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = cfg.channels.max(1) as usize;
    device
        .build_output_stream(
            cfg,
            move |data: &mut [T], _| convert_output(data, channels, &mut callback),
            move |_err| {
                errors.fetch_add(1, Ordering::Relaxed);
            },
            None,
        )
        .map_err(|e| format!("Cannot open the output stream. {e}"))
}

impl AudioOutput for CpalOutput {
    fn start(&mut self, callback: OutputCallback) -> Result<(), String> {
        let device_name = self.device_name.clone();
        let wanted_rate = self.wanted_rate;
        let callback_rate = self.callback_rate;
        let wanted_buffer = self.wanted_buffer;
        let active = Arc::clone(&self.active);
        let errors = Arc::clone(&self.worker.errors);

        self.worker.spawn(move |running| {
            let device = named_or_default_device(device_name.as_deref(), false)?;
            let name = device.name().unwrap_or_else(|_| "unknown".into());
            let default = device
                .default_output_config()
                .map_err(|e| format!("{name} has no default output config. {e}"))?;
            let ranges: Vec<_> = device
                .supported_output_configs()
                .map(|it| it.collect())
                .unwrap_or_default();
            let supported = pick_config(ranges, default, wanted_rate, 2);
            let mut cfg = supported.config();
            cfg.buffer_size = fixed_buffer_within(supported.buffer_size(), wanted_buffer);
            let (callback, edge) = if cfg.sample_rate.0 == callback_rate {
                (callback, None)
            } else {
                let (callback, edge) = resampled_output(
                    callback,
                    callback_rate,
                    cfg.sample_rate.0,
                    running,
                    active,
                    Arc::clone(&errors),
                )?;
                (callback, Some(edge))
            };

            // The callback is owned by exactly one stream. If a fixed buffer is rejected,
            // report the device error; a new start creates a fresh callback.
            let stream = match supported.sample_format() {
                SampleFormat::F32 => build_output::<f32>(&device, &cfg, callback, errors),
                SampleFormat::I16 => build_output::<i16>(&device, &cfg, callback, errors),
                SampleFormat::U16 => build_output::<u16>(&device, &cfg, callback, errors),
                SampleFormat::I32 => build_output::<i32>(&device, &cfg, callback, errors),
                other => Err(format!(
                    "The output sample format {other:?} is not supported."
                )),
            }?;
            let buffer_frames = match cfg.buffer_size {
                BufferSize::Fixed(n) => Some(n),
                BufferSize::Default => None,
            };

            Ok(OpenedStream {
                stream,
                info: StreamInfo {
                    device_name: name,
                    sample_rate: cfg.sample_rate.0,
                    channels: cfg.channels,
                    buffer_frames,
                    sample_format: format_name(supported.sample_format()),
                },
                edge,
            })
        })
    }

    fn activate(&self) {
        self.active.store(true, Ordering::Release);
    }

    fn stop(&mut self) -> Result<(), String> {
        self.worker.stop();
        Ok(())
    }

    fn is_running(&self) -> bool {
        self.worker.running.load(Ordering::SeqCst)
    }

    fn info(&self) -> Option<StreamInfo> {
        self.worker.info.clone()
    }

    fn error_count(&self) -> u64 {
        self.worker.errors.load(Ordering::Relaxed)
    }
}

/// Real input from the OS audio stack. Delivers one mono channel (`channel`, 0-based,
/// e.g. the HeadRush dry DI) as f32 to the engine callback.
pub struct CpalInput {
    device_name: Option<String>,
    channel: u16,
    wanted_rate: u32,
    callback_rate: u32,
    wanted_buffer: u32,
    worker: StreamWorker,
}

impl CpalInput {
    pub fn new(
        device_name: Option<String>,
        channel: u16,
        sample_rate: u32,
        buffer_size: u32,
    ) -> Self {
        Self {
            device_name,
            channel,
            wanted_rate: sample_rate,
            callback_rate: sample_rate,
            wanted_buffer: buffer_size,
            worker: StreamWorker::new(),
        }
    }

    pub fn new_resampled(
        device_name: Option<String>,
        channel: u16,
        device_rate: u32,
        callback_rate: u32,
        buffer_size: u32,
    ) -> Self {
        Self {
            device_name,
            channel,
            wanted_rate: device_rate,
            callback_rate,
            wanted_buffer: buffer_size,
            worker: StreamWorker::new(),
        }
    }
}

fn build_input<T>(
    device: &cpal::Device,
    cfg: &StreamConfig,
    channel: usize,
    mut callback: InputCallback,
    errors: Arc<AtomicU64>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = cfg.channels.max(1) as usize;
    let ch = channel.min(channels - 1);
    device
        .build_input_stream(
            cfg,
            move |data: &[T], _| convert_input(data, channels, ch, &mut callback),
            move |_err| {
                errors.fetch_add(1, Ordering::Relaxed);
            },
            None,
        )
        .map_err(|e| format!("Cannot open the input stream. {e}"))
}

impl AudioInput for CpalInput {
    fn start(&mut self, callback: InputCallback) -> Result<(), String> {
        let device_name = self.device_name.clone();
        let channel = self.channel as usize;
        let wanted_rate = self.wanted_rate;
        let callback_rate = self.callback_rate;
        let wanted_buffer = self.wanted_buffer;
        let errors = Arc::clone(&self.worker.errors);

        self.worker.spawn(move |running| {
            let device = named_or_default_device(device_name.as_deref(), true)?;
            let name = device.name().unwrap_or_else(|_| "unknown".into());
            let default = device
                .default_input_config()
                .map_err(|e| format!("{name} has no default input config. {e}"))?;
            let ranges: Vec<_> = device
                .supported_input_configs()
                .map(|it| it.collect())
                .unwrap_or_default();
            // Need enough channels to reach the requested DI channel; otherwise take
            // whatever the device offers and clamp.
            let min_channels = (channel as u16 + 1).max(1);
            let supported = {
                let c = pick_config(ranges.clone(), default.clone(), wanted_rate, min_channels);
                if c.channels() < min_channels {
                    pick_config(ranges, default, wanted_rate, 1)
                } else {
                    c
                }
            };
            let mut cfg = supported.config();
            cfg.buffer_size = fixed_buffer_within(supported.buffer_size(), wanted_buffer);
            let (callback, edge) = if cfg.sample_rate.0 == callback_rate {
                (callback, None)
            } else {
                let (callback, edge) = resampled_input(
                    callback,
                    cfg.sample_rate.0,
                    callback_rate,
                    running,
                    Arc::clone(&errors),
                )?;
                (callback, Some(edge))
            };

            let stream = match supported.sample_format() {
                SampleFormat::F32 => build_input::<f32>(&device, &cfg, channel, callback, errors),
                SampleFormat::I16 => build_input::<i16>(&device, &cfg, channel, callback, errors),
                SampleFormat::U16 => build_input::<u16>(&device, &cfg, channel, callback, errors),
                SampleFormat::I32 => build_input::<i32>(&device, &cfg, channel, callback, errors),
                other => Err(format!(
                    "The input sample format {other:?} is not supported."
                )),
            }?;
            let buffer_frames = match cfg.buffer_size {
                BufferSize::Fixed(n) => Some(n),
                BufferSize::Default => None,
            };

            Ok(OpenedStream {
                stream,
                info: StreamInfo {
                    device_name: name,
                    sample_rate: cfg.sample_rate.0,
                    channels: cfg.channels,
                    buffer_frames,
                    sample_format: format_name(supported.sample_format()),
                },
                edge,
            })
        })
    }

    fn stop(&mut self) -> Result<(), String> {
        self.worker.stop();
        Ok(())
    }

    fn is_running(&self) -> bool {
        self.worker.running.load(Ordering::SeqCst)
    }

    fn info(&self) -> Option<StreamInfo> {
        self.worker.info.clone()
    }

    fn callback_sample_rate(&self) -> Option<u32> {
        self.is_running().then_some(self.callback_rate)
    }

    fn error_count(&self) -> u64 {
        self.worker.errors.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_edges_convert_between_44100_and_48000_off_the_callback() {
        let running = Arc::new(AtomicBool::new(true));
        let errors = Arc::new(AtomicU64::new(0));
        let rendered = Arc::new(AtomicU64::new(0));
        let rendered_in_callback = Arc::clone(&rendered);
        let output_active = Arc::new(AtomicBool::new(false));
        let (mut output, output_thread) = resampled_output(
            Box::new(move |buffer| {
                rendered_in_callback.fetch_add((buffer.len() / 2) as u64, Ordering::Relaxed);
                buffer.fill(0.25);
            }),
            48_000,
            44_100,
            Arc::clone(&running),
            Arc::clone(&output_active),
            Arc::clone(&errors),
        )
        .unwrap();
        thread::sleep(Duration::from_millis(20));
        assert_eq!(rendered.load(Ordering::Relaxed), 0);
        output_active.store(true, Ordering::Release);
        let mut heard = vec![0.0; 441 * 2];
        let mut nonzero = 0;
        // The worker fills a bounded ring; a loaded scheduler can starve the
        // first device pulls with zeros. Wait on rendered/nonzero instead of a
        // fixed 100-pull wall clock (Windows rust job flake).
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline
            && (rendered.load(Ordering::Relaxed) < 48_000 || nonzero <= 80_000)
        {
            output(&mut heard);
            nonzero += heard.iter().filter(|sample| sample.abs() > 0.2).count();
            thread::sleep(Duration::from_millis(1));
        }
        running.store(false, Ordering::SeqCst);
        output_thread.join().unwrap();
        let rendered_frames = rendered.load(Ordering::Relaxed);
        assert!(
            rendered_frames >= 48_000,
            "resampled output should render a second of source, got {rendered_frames}"
        );
        assert!(
            nonzero > 80_000,
            "resampled output should contain the source, nonzero={nonzero}"
        );

        let running = Arc::new(AtomicBool::new(true));
        let captured = Arc::new(AtomicU64::new(0));
        let captured_nonzero = Arc::new(AtomicU64::new(0));
        let captured_in_callback = Arc::clone(&captured);
        let nonzero_in_callback = Arc::clone(&captured_nonzero);
        let (mut input, input_thread) = resampled_input(
            Box::new(move |buffer| {
                captured_in_callback.fetch_add(buffer.len() as u64, Ordering::Relaxed);
                nonzero_in_callback.fetch_add(
                    buffer.iter().filter(|sample| sample.abs() > 0.1).count() as u64,
                    Ordering::Relaxed,
                );
            }),
            44_100,
            48_000,
            Arc::clone(&running),
            errors,
        )
        .unwrap();
        let block = [0.25; 441];
        for _ in 0..100 {
            input(&block);
            thread::sleep(Duration::from_millis(1));
        }
        for _ in 0..100 {
            if captured.load(Ordering::Relaxed) >= 48_000 {
                break;
            }
            thread::sleep(Duration::from_millis(2));
        }
        running.store(false, Ordering::SeqCst);
        input_thread.join().unwrap();
        let captured = captured.load(Ordering::Relaxed);
        assert!((46_000..=49_000).contains(&captured), "captured {captured}");
        assert!(captured_nonzero.load(Ordering::Relaxed) > 40_000);
    }

    #[test]
    fn file_input_emits_a_lead_burst_before_the_wall_clock() {
        // One-second blocks distinguish a burst from paced delivery without
        // requiring the OS to schedule this thread within two milliseconds.
        let mut input = FileInput::from_samples(vec![0.5; 4096], 48_000);
        assert!(input.is_synthetic());
        let (ready, received) = mpsc::channel();
        let mut blocks = 0;
        let mut valid = true;
        input
            .start(Box::new(move |buf| {
                valid &= buf.len() == 48_000 && buf.iter().all(|s| *s == 0.5);
                blocks += 1;
                if blocks == 8 {
                    let _ = ready.send(valid);
                }
            }))
            .unwrap();
        let burst = received.recv_timeout(Duration::from_secs(3));
        input.stop().unwrap();
        assert_eq!(
            burst,
            Ok(true),
            "eight paced blocks would take seven seconds"
        );
    }

    #[test]
    fn from_wav_file_rejects_unreadable_samples_and_illegal_rates() {
        let root = std::env::temp_dir().join(format!(
            "jam-fileinput-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let ok = root.join("ok.wav");
        let mut writer = hound::WavWriter::create(
            &ok,
            hound::WavSpec {
                channels: 2,
                sample_rate: 48_000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .unwrap();
        writer.write_sample(1000_i16).unwrap();
        writer.write_sample(-1000_i16).unwrap();
        writer.finalize().unwrap();
        assert!(FileInput::from_wav_file(ok.to_str().unwrap(), 256).is_ok());

        let truncated = root.join("truncated.wav");
        let mut bytes = std::fs::read(&ok).unwrap();
        bytes.truncate(bytes.len().saturating_sub(2));
        std::fs::write(&truncated, &bytes).unwrap();
        match FileInput::from_wav_file(truncated.to_str().unwrap(), 256) {
            Err(err) => assert!(
                err.contains("unreadable")
                    || err.contains("WAV")
                    || err.contains("channel")
                    || err.contains("bytes")
                    || err.contains("sample"),
                "{err}"
            ),
            Ok(_) => panic!("truncated stereo WAV must fail loud"),
        }

        let zero = root.join("zero-rate.wav");
        let mut header = std::fs::read(&ok).unwrap();
        header[24..28].copy_from_slice(&0u32.to_le_bytes());
        header[28..32].copy_from_slice(&0u32.to_le_bytes());
        std::fs::write(&zero, &header).unwrap();
        match FileInput::from_wav_file(zero.to_str().unwrap(), 256) {
            Err(err) => assert!(err.contains("8") && err.contains("192"), "{err}"),
            Ok(_) => panic!("0 Hz WAV must fail loud"),
        }
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn file_input_stop_returns_without_waiting_out_a_long_block() {
        let mut input = FileInput::from_samples_at(vec![0.1; 8], 256, 1);
        input.start(Box::new(|_| {})).unwrap();
        let started = Instant::now();
        input.stop().unwrap();
        assert!(
            started.elapsed() < Duration::from_millis(200),
            "stop() must interrupt the block sleep"
        );
    }

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
        let got = collected.lock().unwrap();
        assert!(got.len() >= 2);
        assert_eq!(got[0], 0.25);
        assert_eq!(got[1], -0.5);
    }

    #[test]
    fn null_output_reports_headless_info() {
        let out = NullOutput::new(44_100, 128);
        let info = out.info().unwrap();
        assert_eq!(info.device_name, "headless");
        assert_eq!(info.sample_rate, 44_100);
        assert_eq!(info.buffer_frames, Some(128));
    }

    #[test]
    fn fixed_buffer_is_clamped_to_supported_range() {
        let r = SupportedBufferSize::Range { min: 64, max: 512 };
        assert_eq!(fixed_buffer_within(&r, 256), BufferSize::Fixed(256));
        assert_eq!(fixed_buffer_within(&r, 32), BufferSize::Fixed(64));
        assert_eq!(fixed_buffer_within(&r, 4096), BufferSize::Fixed(512));
        assert_eq!(
            fixed_buffer_within(&SupportedBufferSize::Unknown, 256),
            BufferSize::Default
        );
    }
}

#[cfg(test)]
mod conversion_tests {
    #[test]
    fn oversized_driver_buffers_keep_every_frame_and_channel() {
        let mut output = vec![99.0_f32; 9001 * 3];
        let mut rendered = 0;
        super::convert_output(&mut output, 3, &mut |block| {
            assert!(block.len() <= 2048);
            for frame in block.as_chunks_mut::<2>().0 {
                frame[0] = 0.25;
                frame[1] = -0.5;
                rendered += 1;
            }
        });
        assert_eq!(rendered, 9001);
        assert!(output
            .as_chunks::<3>()
            .0
            .iter()
            .all(|f| *f == [0.25, -0.5, 0.0]));
        let mut captured = Vec::new();
        super::convert_input(&output, 3, 1, &mut |block| {
            assert!(block.len() <= 1024);
            captured.extend_from_slice(block);
        });
        assert_eq!(captured, vec![-0.5; 9001]);
        let mut mono = [0_i16; 1];
        super::convert_output(&mut mono, 1, &mut |block| block.fill(0.5));
        assert!(mono[0] > 16_000);
        let mut panned = [0_i16; 1];
        super::convert_output(&mut panned, 1, &mut |block| {
            for frame in block.as_chunks_mut::<2>().0 {
                frame[0] = 0.0;
                frame[1] = 1.0;
            }
        });
        assert!(
            panned[0] > 16_000,
            "mono output must downmix 0.5*(L+R) so a right-panned signal is heard"
        );
    }
}
