//! io: AudioInput and AudioOutput traits with cpal (real hardware), FileInput and
//! NullOutput (headless) implementations.
//!
//! Both cpal drivers open their stream on a dedicated thread (cpal streams are not
//! `Send` on every backend) and report the *actual* negotiated stream parameters via
//! [`StreamInfo`], so the engine can run its clock at the true device rate instead of
//! assuming 48 kHz. Stream errors are counted and surfaced instead of being swallowed.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{
    BufferSize, FromSample, Sample, SampleFormat, SampleRate, SizedSample, StreamConfig,
    SupportedBufferSize, SupportedStreamConfig,
};
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
    fn info(&self) -> Option<StreamInfo> {
        None
    }
    /// Number of backend stream errors since `start`.
    fn error_count(&self) -> u64 {
        0
    }
}

pub trait AudioOutput: Send + Sync {
    fn start(&mut self, callback: OutputCallback) -> Result<(), String>;
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
        .map_err(|e| format!("cannot enumerate {kind} devices: {e}"))?;
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
            .ok_or_else(|| format!("no default {kind} device"))
    } else {
        host.default_output_device()
            .ok_or_else(|| format!("no default {kind} device"))
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
        F: FnOnce() -> Result<(cpal::Stream, StreamInfo), String> + Send + 'static,
    {
        if self.running.load(Ordering::SeqCst) {
            return Ok(());
        }
        self.running.store(true, Ordering::SeqCst);
        self.errors.store(0, Ordering::SeqCst);
        let running = Arc::clone(&self.running);
        let (tx, rx) = mpsc::channel::<Result<StreamInfo, String>>();

        let handle = thread::spawn(move || match open() {
            Ok((stream, info)) => {
                if let Err(e) = stream.play() {
                    let _ = tx.send(Err(format!("cannot start stream: {e}")));
                    return;
                }
                let _ = tx.send(Ok(info));
                while running.load(Ordering::SeqCst) {
                    thread::sleep(Duration::from_millis(20));
                }
                drop(stream);
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

/// Real output through the OS audio stack. The engine callback always produces
/// interleaved stereo f32; this driver converts to the device's channel count and
/// sample format.
pub struct CpalOutput {
    device_name: Option<String>,
    wanted_rate: u32,
    wanted_buffer: u32,
    worker: StreamWorker,
}

impl CpalOutput {
    pub fn new(device_name: Option<String>, sample_rate: u32, buffer_size: u32) -> Self {
        Self {
            device_name,
            wanted_rate: sample_rate,
            wanted_buffer: buffer_size,
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
            frame[0] = T::from_sample(stereo[0]);
            if channels > 1 {
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
        .map_err(|e| format!("cannot open output stream: {e}"))
}

impl AudioOutput for CpalOutput {
    fn start(&mut self, callback: OutputCallback) -> Result<(), String> {
        let device_name = self.device_name.clone();
        let wanted_rate = self.wanted_rate;
        let wanted_buffer = self.wanted_buffer;
        let errors = Arc::clone(&self.worker.errors);

        self.worker.spawn(move || {
            let device = named_or_default_device(device_name.as_deref(), false)?;
            let name = device.name().unwrap_or_else(|_| "unknown".into());
            let default = device
                .default_output_config()
                .map_err(|e| format!("{name}: no default output config: {e}"))?;
            let ranges: Vec<_> = device
                .supported_output_configs()
                .map(|it| it.collect())
                .unwrap_or_default();
            let supported = pick_config(ranges, default, wanted_rate, 2);
            let mut cfg = supported.config();
            cfg.buffer_size = fixed_buffer_within(supported.buffer_size(), wanted_buffer);

            // The callback is owned by exactly one stream. If a fixed buffer is rejected,
            // report the device error; a new start creates a fresh callback.
            let stream = match supported.sample_format() {
                SampleFormat::F32 => build_output::<f32>(&device, &cfg, callback, errors),
                SampleFormat::I16 => build_output::<i16>(&device, &cfg, callback, errors),
                SampleFormat::U16 => build_output::<u16>(&device, &cfg, callback, errors),
                SampleFormat::I32 => build_output::<i32>(&device, &cfg, callback, errors),
                other => Err(format!("unsupported output sample format: {other:?}")),
            }?;
            let buffer_frames = match cfg.buffer_size {
                BufferSize::Fixed(n) => Some(n),
                BufferSize::Default => None,
            };

            Ok((
                stream,
                StreamInfo {
                    device_name: name,
                    sample_rate: cfg.sample_rate.0,
                    channels: cfg.channels,
                    buffer_frames,
                    sample_format: format_name(supported.sample_format()),
                },
            ))
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
        .map_err(|e| format!("cannot open input stream: {e}"))
}

impl AudioInput for CpalInput {
    fn start(&mut self, callback: InputCallback) -> Result<(), String> {
        let device_name = self.device_name.clone();
        let channel = self.channel as usize;
        let wanted_rate = self.wanted_rate;
        let wanted_buffer = self.wanted_buffer;
        let errors = Arc::clone(&self.worker.errors);

        self.worker.spawn(move || {
            let device = named_or_default_device(device_name.as_deref(), true)?;
            let name = device.name().unwrap_or_else(|_| "unknown".into());
            let default = device
                .default_input_config()
                .map_err(|e| format!("{name}: no default input config: {e}"))?;
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

            let stream = match supported.sample_format() {
                SampleFormat::F32 => build_input::<f32>(&device, &cfg, channel, callback, errors),
                SampleFormat::I16 => build_input::<i16>(&device, &cfg, channel, callback, errors),
                SampleFormat::U16 => build_input::<u16>(&device, &cfg, channel, callback, errors),
                SampleFormat::I32 => build_input::<i32>(&device, &cfg, channel, callback, errors),
                other => Err(format!("unsupported input sample format: {other:?}")),
            }?;
            let buffer_frames = match cfg.buffer_size {
                BufferSize::Fixed(n) => Some(n),
                BufferSize::Default => None,
            };

            Ok((
                stream,
                StreamInfo {
                    device_name: name,
                    sample_rate: cfg.sample_rate.0,
                    channels: cfg.channels,
                    buffer_frames,
                    sample_format: format_name(supported.sample_format()),
                },
            ))
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

    fn error_count(&self) -> u64 {
        self.worker.errors.load(Ordering::Relaxed)
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
    }
}
