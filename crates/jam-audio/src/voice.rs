//! Bounded microphone capture and speech playback, owned by Rust.
use crate::io::AudioInput;
use crate::workstation::{Audition, Clip, ClipSpec};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

pub const MAX_SECONDS: usize = 20;
const MAX_RATE: usize = 192_000;

pub struct Microphone {
    input: Box<dyn AudioInput>,
    samples: rtrb::Consumer<f32>,
    rate: u32,
}

impl Microphone {
    pub fn start(mut input: Box<dyn AudioInput>) -> Result<Self, String> {
        let (mut producer, samples) = rtrb::RingBuffer::new(MAX_RATE * MAX_SECONDS);
        let limit = Arc::new(AtomicUsize::new(0));
        let callback_limit = Arc::clone(&limit);
        let mut frames = 0;
        input.start(Box::new(move |block| {
            for &sample in block {
                if frames < callback_limit.load(Ordering::Relaxed) {
                    let _ = producer.push(sample);
                    frames += 1;
                }
            }
        }))?;
        let Some(info) = input.info() else {
            let _ = input.stop();
            return Err("Microphone did not report its format.".into());
        };
        let rate = info.sample_rate;
        if !(8_000..=MAX_RATE as u32).contains(&rate) {
            input.stop()?;
            return Err("Microphone must support a rate between 8 and 192 kHz.".into());
        }
        limit.store(rate as usize * MAX_SECONDS, Ordering::Release);
        Ok(Self {
            input,
            samples,
            rate,
        })
    }

    pub fn stop_stream(&mut self) -> Result<(), String> {
        self.input.stop()
    }

    /// Keep the negotiated WAV rate: the provider decodes it without a second
    /// lossy resampling stage. No microphone audio crosses IPC or touches disk.
    pub fn finish(mut self) -> Result<(Vec<u8>, f64), String> {
        self.input.stop()?;
        if self.input.error_count() != 0 {
            return Err("The microphone disconnected or lost audio. Try again.".into());
        }
        let samples: Vec<_> = std::iter::from_fn(|| self.samples.pop().ok()).collect();
        let seconds = samples.len() as f64 / self.rate as f64;
        if seconds < 0.1 {
            return Err("Hold Talk for at least a tenth of a second.".into());
        }
        Ok((wav(&samples, self.rate)?, seconds))
    }
}

impl Drop for Microphone {
    fn drop(&mut self) {
        let _ = self.input.stop();
    }
}

fn wav(samples: &[f32], rate: u32) -> Result<Vec<u8>, String> {
    let mut bytes = std::io::Cursor::new(Vec::new());
    let mut writer = hound::WavWriter::new(
        &mut bytes,
        hound::WavSpec {
            channels: 1,
            sample_rate: rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .map_err(|e| e.to_string())?;
    for &sample in samples {
        if !sample.is_finite() {
            return Err("Microphone returned invalid samples.".into());
        }
        writer
            .write_sample((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(bytes.into_inner())
}

pub struct VoiceBus {
    speech: Option<Audition>,
    gain: f32,
    duck: f32,
}

impl Default for VoiceBus {
    fn default() -> Self {
        Self {
            speech: None,
            gain: 1.0,
            duck: 1.0,
        }
    }
}

impl VoiceBus {
    pub fn play(&mut self, pcm: &[u8], duck_db: f32) -> Result<(), String> {
        if pcm.is_empty()
            || !pcm.len().is_multiple_of(2)
            || pcm.len() > 48_000 * 60
            || !duck_db.is_finite()
            || !(-24.0..=0.0).contains(&duck_db)
        {
            return Err("Invalid or oversized speech audio.".into());
        }
        let samples: Vec<f32> = pcm
            .as_chunks::<2>()
            .0
            .iter()
            .map(|s| i16::from_le_bytes([s[0], s[1]]) as f32 / 32768.0)
            .collect();
        let duration = samples.len() as f64 / 24_000.0;
        self.speech = Some(Audition::new(Clip::new(
            ClipSpec {
                take_id: String::new(),
                label: String::new(),
                trim_start: 0.0,
                trim_end: duration,
                start_bar: 1,
                repeats: 1,
                gain: 1.0,
                muted: false,
            },
            Arc::new(samples),
            24_000,
        )?));
        self.duck = 10.0_f32.powf(duck_db / 20.0);
        Ok(())
    }
    pub fn stop(&mut self) {
        self.speech = None;
    }
    pub fn speaking(&self) -> bool {
        self.speech.is_some()
    }

    /// Render worker only. Speech shares the existing clip interpolation and
    /// edge fades; the band attenuation ramps over 150 ms in either direction.
    pub fn render(&mut self, rate: u32, speech: &mut [f32], gains: &mut [f32]) {
        let active = self.speaking();
        speech.fill(0.0);
        if let Some(voice) = &mut self.speech {
            if !voice.render(rate, speech) {
                self.speech = None;
            }
        }
        let target = if active { self.duck } else { 1.0 };
        let step = (1.0 - self.duck) / (rate.max(1) as f32 * 0.15);
        for gain in gains {
            self.gain += (target - self.gain).clamp(-step, step);
            *gain = self.gain;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::io::{InputCallback, StreamInfo};

    struct TestInput(Arc<parking_lot::Mutex<Option<InputCallback>>>);
    impl AudioInput for TestInput {
        fn start(&mut self, callback: InputCallback) -> Result<(), String> {
            *self.0.lock() = Some(callback);
            Ok(())
        }
        fn stop(&mut self) -> Result<(), String> {
            self.0.lock().take();
            Ok(())
        }
        fn is_running(&self) -> bool {
            self.0.lock().is_some()
        }
        fn info(&self) -> Option<StreamInfo> {
            Some(StreamInfo {
                device_name: "fixture".into(),
                sample_rate: 16_000,
                channels: 1,
                buffer_frames: Some(256),
                sample_format: "f32".into(),
            })
        }
    }

    #[test]
    fn microphone_limits_twenty_seconds_and_releases_the_stream() {
        let callback = Arc::new(parking_lot::Mutex::new(None));
        let mic = Microphone::start(Box::new(TestInput(Arc::clone(&callback)))).unwrap();
        for _ in 0..1500 {
            callback.lock().as_mut().unwrap()(&[0.25; 256]);
        }
        let (wav, seconds) = mic.finish().unwrap();
        assert_eq!(seconds, 20.0);
        assert!(callback.lock().is_none());
        let reader = hound::WavReader::new(std::io::Cursor::new(wav)).unwrap();
        assert_eq!(reader.duration(), 320_000);
        assert_eq!(reader.spec().channels, 1);
        assert!(reader
            .into_samples::<i16>()
            .all(|s| (s.unwrap() - 8191).abs() <= 1));
        let mic = Microphone::start(Box::new(TestInput(Arc::clone(&callback)))).unwrap();
        assert!(mic.finish().is_err());
        assert!(callback.lock().is_none());
    }
    #[test]
    fn speech_pcm_ducks_and_recovers_in_150ms_and_rejects_bad_audio() {
        let mut bus = VoiceBus::default();
        let pcm = vec![0u8; 48_000];
        bus.play(&pcm, -9.0).unwrap();
        let mut speech = vec![0.0; 7200];
        let mut gains = speech.clone();
        bus.render(48_000, &mut speech, &mut gains);
        let target = 10.0_f32.powf(-9.0 / 20.0);
        assert!((gains[7199] - target).abs() < 0.0002);
        assert!(gains.windows(2).all(|g| g[1] <= g[0]));
        bus.stop();
        bus.render(48_000, &mut speech, &mut gains);
        assert!((gains[7199] - 1.0).abs() < 0.0002);
        assert!(!bus.speaking());
        assert!(bus.play(&[1], -9.0).is_err());
        assert!(bus.play(&[0, 0], f32::NAN).is_err());
        let bytes = wav(&[0.5; 1600], 16_000).unwrap();
        let reader = hound::WavReader::new(std::io::Cursor::new(bytes)).unwrap();
        assert_eq!(reader.spec().sample_rate, 16_000);
        assert_eq!(reader.duration(), 1600);
        assert!(wav(&[f32::NAN], 48_000).is_err());
    }

    #[test]
    fn speech_preserves_a_1khz_sine_at_48khz_for_100ms() {
        let pcm: Vec<u8> = (0..2400)
            .flat_map(|i| {
                { ((i as f32 * std::f32::consts::TAU / 24.0).sin() * 16000.0) as i16 }.to_le_bytes()
            })
            .collect();
        let mut bus = VoiceBus::default();
        bus.play(&pcm, -9.0).unwrap();
        let mut speech = vec![0.0; 4800];
        bus.render(48_000, &mut speech, &mut vec![0.0; 4800]);
        let crossings = speech[96..4704]
            .windows(2)
            .filter(|w| w[0] <= 0.0 && w[1] > 0.0)
            .count();
        assert!((crossings as i32 - 96).abs() <= 1, "1 kHz within one cycle");
        assert!(speech[96..4704].iter().any(|s| *s > 0.45));
        assert!(!bus.speaking(), "100 ms duration, within one output sample");
    }
}
