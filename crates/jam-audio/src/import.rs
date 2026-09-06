//! Bounded offline decoding and fixed-rate conversion. Never runs on the audio callback.
mod m4a;
use rubato::{audioadapter_buffers::direct::InterleavedSlice, Fft, FixedSync, Resampler};
use std::{
    fs,
    io::BufWriter,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};
use symphonia::core::{
    codecs::audio::AudioDecoderOptions,
    formats::{probe::Hint, TrackType},
    io::MediaSourceStream,
};

struct Converter {
    rate: u32,
    frames: usize,
    max_frames: usize,
    resampler: Option<Fft<f32>>,
    pending: Vec<f32>,
    output: Vec<f32>,
    delay: usize,
}

impl Converter {
    fn new(rate: u32, max_frames: usize) -> Result<Self, String> {
        if !(8000..=192000).contains(&rate) {
            return Err("Choose audio sampled between 8 and 192 kHz.".into());
        }
        let resampler = if rate == 48000 {
            None
        } else {
            let mut r = Fft::new(rate as usize, 48000, 1024, 2, FixedSync::Both)
                .map_err(|e| e.to_string())?;
            // Even FFT lengths keep the filter delay on whole input/output frames.
            // Odd rational blocks otherwise retain a fractional-frame phase shift.
            if r.fft_size_in() % 2 != 0 || r.fft_size_out() % 2 != 0 {
                r = Fft::new(
                    rate as usize,
                    48000,
                    r.fft_size_in() * 2,
                    2,
                    FixedSync::Both,
                )
                .map_err(|e| e.to_string())?;
            }
            Some(r)
        };
        let delay = resampler.as_ref().map_or(0, Resampler::output_delay);
        Ok(Self {
            rate,
            frames: 0,
            max_frames,
            resampler,
            pending: Vec::new(),
            output: Vec::new(),
            delay,
        })
    }
    fn block(&mut self) -> Result<(), String> {
        let resampler = self.resampler.as_mut().unwrap();
        let input = InterleavedSlice::new(&self.pending, 2, resampler.input_frames_next())
            .map_err(|e| e.to_string())?;
        self.output.extend(
            resampler
                .process(&input, None)
                .map_err(|e| e.to_string())?
                .take_data(),
        );
        self.pending.clear();
        Ok(())
    }
    fn push(
        &mut self,
        samples: &[f32],
        channels: usize,
        cancel: &AtomicBool,
    ) -> Result<(), String> {
        if !(1..=2).contains(&channels) || !samples.len().is_multiple_of(channels) {
            return Err(
                "Import mono or stereo audio; export a stereo mix for multichannel files.".into(),
            );
        }
        self.frames += samples.len() / channels;
        if self.frames as u64 * 48000 > self.max_frames as u64 * self.rate as u64 {
            return Err("Audio exceeds the allowed song duration.".into());
        }
        let chunk = self.resampler.as_ref().map(|r| r.input_frames_next() * 2);
        for (i, frame) in samples.chunks_exact(channels).enumerate() {
            if i % 1024 == 0 && cancel.load(Ordering::Relaxed) {
                return Err("Audio import canceled.".into());
            }
            if frame.iter().any(|v| !v.is_finite()) {
                return Err("Audio contains non-finite samples.".into());
            }
            let stereo = [frame[0], frame[channels - 1]];
            if let Some(chunk) = chunk {
                self.pending.extend_from_slice(&stereo);
                if self.pending.len() == chunk {
                    self.block()?;
                }
            } else {
                self.output.extend_from_slice(&stereo);
            }
        }
        Ok(())
    }
    fn finish(mut self, cancel: &AtomicBool) -> Result<Vec<f32>, String> {
        let count = (self.frames as u64 * 48000).div_ceil(self.rate as u64) as usize;
        if count < 4800 {
            return Err("Choose audio lasting at least 0.1 seconds.".into());
        }
        if let Some(r) = &self.resampler {
            let chunk = r.input_frames_next() * 2;
            while self.output.len() < (count + self.delay) * 2 {
                if cancel.load(Ordering::Relaxed) {
                    return Err("Audio import canceled.".into());
                }
                self.pending.resize(chunk, 0.0);
                self.block()?;
            }
            self.output.drain(..self.delay * 2);
        }
        self.output.truncate(count * 2);
        if self.output.iter().any(|sample| !sample.is_finite()) {
            return Err("Audio conversion produced non-finite samples.".into());
        }
        Ok(self.output)
    }
}

pub fn decode(input: &Path, max_frames: usize, cancel: &AtomicBool) -> Result<Vec<f32>, String> {
    if cancel.load(Ordering::Relaxed) {
        return Err("Audio import canceled.".into());
    }
    let file = fs::File::open(input).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > 512 * 1024 * 1024 {
        return Err("Choose a local audio file up to 512 MB.".into());
    }
    let mut hint = Hint::new();
    if let Some(ext) = input.extension().and_then(|s| s.to_str()) {
        hint.with_extension(ext);
    }
    let mut format = symphonia::default::get_probe().probe(&hint, MediaSourceStream::new(Box::new(file), Default::default()), Default::default(), Default::default()).map_err(|e| format!("Unsupported or damaged audio: {e}. Export WAV, FLAC, MP3, AAC/ALAC M4A, AIFF or Ogg Vorbis."))?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or("No audio track in this file")?;
    let track_id = track.id;
    let expected = track.num_frames;
    let params = track
        .codec_params
        .as_ref()
        .and_then(|p| p.audio())
        .ok_or("Unsupported audio codec")?;
    let declared_rate = params.sample_rate;
    let window =
        if format.format_info().format == symphonia::core::formats::well_known::FORMAT_ID_ISOMP4 {
            let rate = params.sample_rate.ok_or("M4A sample rate is missing")?;
            let total = expected.ok_or("M4A duration is missing")?;
            if total as u128 * 48000 > (max_frames as u128 + 96000) * rate as u128 {
                return Err("Audio exceeds the allowed song duration.".into());
            }
            Some(m4a::read(input, track_id, rate, total)?)
        } else {
            None
        };
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default())
        .map_err(|e| format!("Unsupported audio codec: {e}"))?;
    let mut converter: Option<Converter> = None;
    let mut samples = Vec::<f32>::new();
    let mut channels = 0;
    let mut decoded = 0u64;
    let mut last_packet = 0;
    while let Some(packet) = format
        .next_packet()
        .map_err(|e| format!("Damaged audio: {e}"))?
    {
        if cancel.load(Ordering::Relaxed) {
            return Err("Audio import canceled.".into());
        }
        if packet.track_id != track_id {
            continue;
        }
        let audio = decoder
            .decode(&packet)
            .map_err(|e| format!("Cannot decode audio: {e}"))?;
        let rate = audio.spec().rate();
        if window.is_some() && declared_rate != Some(rate) {
            return Err("M4A codec and container sample rates disagree.".into());
        }
        let count = audio.spec().channels().count();
        if converter.is_none() {
            let mut c = Converter::new(rate, max_frames)?;
            if let Some(window) = &window {
                if (window.frames as u128 + window.silence as u128) * 48000
                    > max_frames as u128 * rate as u128
                {
                    return Err("Audio exceeds the allowed song duration.".into());
                }
                let mut silence = window.silence;
                while silence > 0 {
                    let frames = silence.min(1024) as usize;
                    c.push(&[0.0; 1024][..frames], 1, cancel)?;
                    silence -= frames as u64;
                }
            }
            converter = Some(c);
            channels = count;
        }
        let converter = converter.as_mut().unwrap();
        if converter.rate != rate || channels != count {
            return Err("Audio changes format midstream. Export a continuous stereo file.".into());
        }
        if audio.samples_interleaved() > 2 * 262144 {
            return Err("Audio packet exceeds the decode limit.".into());
        }
        samples.resize(audio.samples_interleaved(), 0.0);
        audio.copy_to_slice_interleaved(&mut samples);
        if !(1..=2).contains(&channels) {
            return Err("Import mono or stereo audio.".into());
        }
        last_packet = (samples.len() / channels) as u64;
        let end = decoded + last_packet;
        if let Some(window) = &window {
            let start = decoded.max(window.start);
            let stop = end.min(window.start + window.frames);
            if start < stop {
                converter.push(
                    &samples[(start - decoded) as usize * channels
                        ..(stop - decoded) as usize * channels],
                    channels,
                    cancel,
                )?;
            }
            if end > expected.unwrap() + last_packet {
                return Err("M4A exceeds its declared duration.".into());
            }
        } else {
            converter.push(&samples, channels, cancel)?;
        }
        decoded = end;
    }
    let converter = converter.ok_or("No decodable audio samples")?;
    if expected.is_some_and(|frames| {
        if window.is_some() {
            decoded < frames || decoded - frames >= last_packet
        } else {
            frames != decoded
        }
    }) {
        return Err(
            "Decoded audio length differs from the container. The file may be truncated.".into(),
        );
    }
    converter.finish(cancel)
}

pub fn normalize(
    input: &Path,
    output: &Path,
    max_frames: usize,
    cancel: &AtomicBool,
) -> Result<f64, String> {
    let samples = decode(input, max_frames, cancel)?;
    let seconds = samples.len() as f64 / 96000.0;
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48000,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        let mut writer =
            hound::WavWriter::new(BufWriter::new(file), spec).map_err(|e| e.to_string())?;
        for chunk in samples.chunks(8192) {
            if cancel.load(Ordering::Relaxed) {
                return Err("Audio import canceled.".into());
            }
            for sample in chunk {
                writer.write_sample(*sample).map_err(|e| e.to_string())?;
            }
        }
        writer.finalize().map_err(|e| e.to_string())?;
        Ok(seconds)
    })();
    if result.is_err() {
        let _ = fs::remove_file(output);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "uses locally generated synthetic codec fixtures in JAM_IMPORT_FIXTURES"]
    fn native_decoders_preserve_synthetic_codec_timing_and_channels() {
        let root = std::path::PathBuf::from(std::env::var("JAM_IMPORT_FIXTURES").unwrap());
        for name in [
            "input.wav",
            "input.flac",
            "input.aiff",
            "input.mp3",
            "input-vorbis.ogg",
            "input-aac.m4a",
            "input-alac.m4a",
        ] {
            let samples = decode(&root.join(name), 96000, &AtomicBool::new(false))
                .unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(
                (samples.len() as i64 - 96000).abs() <= 2,
                "{name}: {} frames",
                samples.len() / 2
            );
            let mut error = 0.0;
            for i in 2000..46000 {
                let expected = 0.2 * (std::f64::consts::TAU * 997.0 * i as f64 / 48000.0).sin();
                error += (samples[i * 2] as f64 - expected).powi(2);
                assert!(
                    (samples[i * 2] + samples[i * 2 + 1]).abs() < 0.01,
                    "{name}: channels"
                );
            }
            let rmse = (error / 44000.0).sqrt();
            assert!(rmse < 0.015, "{name}: phase/amplitude RMSE {rmse}");
            println!("{name}: {} frames, RMSE {rmse}", samples.len() / 2);
        }
    }
    #[test]
    fn resampling_preserves_duration_phase_and_rejects_aliases() {
        let cancel = AtomicBool::new(false);
        for rate in [11025, 32000, 44100, 48000, 88200, 96000, 192000] {
            let mut converter = Converter::new(rate, 48000).unwrap();
            let mut samples = Vec::new();
            for i in 0..rate {
                let v = 0.2 * (std::f32::consts::TAU * 1000.0 * i as f32 / rate as f32).sin();
                samples.extend([v, -v]);
            }
            for block in samples.chunks(734) {
                converter.push(block, 2, &cancel).unwrap();
            }
            let out = converter.finish(&cancel).unwrap();
            assert_eq!(out.len(), 96000);
            let mut error = 0.0;
            for i in 2000..46000 {
                let expected = 0.2 * (std::f64::consts::TAU * 1000.0 * i as f64 / 48000.0).sin();
                error += (out[2 * i] as f64 - expected).powi(2);
                assert!((out[2 * i] + out[2 * i + 1]).abs() < 1e-6);
            }
            assert!(
                (error / 44000.0).sqrt() < 3e-4,
                "rate {rate}: phase/amplitude RMSE {}",
                (error / 44000.0).sqrt()
            );
        }
        let mut c = Converter::new(96000, 48000).unwrap();
        let signal: Vec<f32> = (0..96000)
            .map(|i| (0.2 * (std::f64::consts::TAU * 30000.0 * i as f64 / 96000.0).sin()) as f32)
            .collect();
        c.push(&signal, 1, &cancel).unwrap();
        let out = c.finish(&cancel).unwrap();
        let rms = (out[4000..92000]
            .iter()
            .map(|s| (*s as f64).powi(2))
            .sum::<f64>()
            / 88000.0)
            .sqrt();
        assert!(rms < 1e-4, "30 kHz alias RMS {rms}");
    }
    #[test]
    fn native_wav_import_is_bounded_cancelable_and_never_overwrites() {
        let dir = std::env::temp_dir().join(format!("jam-native-import-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let input = dir.join("mono.wav");
        let output = dir.join("source.wav");
        let mut writer = hound::WavWriter::create(
            &input,
            hound::WavSpec {
                channels: 1,
                sample_rate: 44100,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            },
        )
        .unwrap();
        for _ in 0..44100 {
            writer.write_sample(4096i16).unwrap();
        }
        writer.finalize().unwrap();
        let before = fs::read(&input).unwrap();
        let cancel = AtomicBool::new(false);
        assert_eq!(normalize(&input, &output, 48000, &cancel).unwrap(), 1.0);
        let (samples, _) = crate::practice::read_stereo(&output, 48000, &cancel).unwrap();
        assert!(samples[4000..92000]
            .iter()
            .all(|s| (*s - 0.125).abs() < 1e-5));
        let saved = fs::read(&output).unwrap();
        assert!(normalize(&input, &output, 48000, &cancel).is_err());
        assert_eq!(fs::read(&output).unwrap(), saved);
        assert!(decode(&input, 47999, &cancel).is_err());
        assert!(decode(&input, 48000, &AtomicBool::new(true)).is_err());
        assert_eq!(fs::read(&input).unwrap(), before);
        fs::write(&input, &before[..before.len() - 200]).unwrap();
        assert!(decode(&input, 48000, &cancel).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
