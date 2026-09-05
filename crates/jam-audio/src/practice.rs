//! Prepare a separate, stereo practice WAV outside the audio/render threads.
pub use jam_dsp::stretch::validate;
use std::{
    io::BufWriter,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};

pub fn read_stereo(
    input: &Path,
    max_frames: usize,
    cancel: &AtomicBool,
) -> Result<(Vec<f32>, hound::WavSpec), String> {
    let mut reader = hound::WavReader::open(input).map_err(|e| e.to_string())?;
    let spec = reader.spec();
    if spec.channels != 2
        || spec.sample_rate != 48_000
        || spec.bits_per_sample != 32
        || spec.sample_format != hound::SampleFormat::Float
        || reader.duration() as usize > max_frames
        || reader.duration() < 4800
    {
        return Err(
            "Decoded audio must be 48 kHz stereo float WAV within the allowed duration.".into(),
        );
    }
    let mut samples = Vec::with_capacity(reader.len() as usize);
    for (i, sample) in reader.samples::<f32>().enumerate() {
        if i % 8192 == 0 && cancel.load(Ordering::Relaxed) {
            return Err("Audio preparation canceled.".into());
        }
        samples.push(sample.map_err(|e| e.to_string())?);
    }
    Ok((samples, spec))
}

pub fn render(
    input: &Path,
    output: &Path,
    speed: f64,
    semitones: f64,
    cancel: &AtomicBool,
) -> Result<f64, String> {
    validate(speed, semitones)?;
    let (samples, spec) = read_stereo(input, jam_dsp::stretch::MAX_FRAMES, cancel)?;
    let rendered = jam_dsp::stretch::stereo(&samples, speed, semitones, cancel)?;
    drop(samples);
    let seconds = rendered.len() as f64 / 96_000.0;
    // Never replace either the source or an existing destination.
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)
        .map_err(|e| e.to_string())?;
    let result = (|| {
        let mut writer =
            hound::WavWriter::new(BufWriter::new(file), spec).map_err(|e| e.to_string())?;
        for chunk in rendered.chunks(8192) {
            if cancel.load(Ordering::Relaxed) {
                return Err("Practice copy canceled.".to_string());
            }
            for sample in chunk {
                writer.write_sample(*sample).map_err(|e| e.to_string())?;
            }
        }
        writer.finalize().map_err(|e| e.to_string())?;
        std::fs::OpenOptions::new()
            .write(true)
            .open(output)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(seconds)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(output);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn practice_wav_keeps_original_and_existing_output_and_writes_exact_duration() {
        let root = std::env::temp_dir().join(format!("jam-practice-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let input = root.join("source.wav");
        let output = root.join("practice.wav");
        let mut writer = hound::WavWriter::create(
            &input,
            hound::WavSpec {
                channels: 2,
                sample_rate: 48000,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            },
        )
        .unwrap();
        for i in 0..48000 {
            let sample = (i as f32 * 440.0 * std::f32::consts::TAU / 48000.0).sin() * 0.2;
            writer.write_sample(sample).unwrap();
            writer.write_sample(-sample).unwrap();
        }
        writer.finalize().unwrap();
        let original = std::fs::read(&input).unwrap();
        assert_eq!(
            render(&input, &output, 0.5, 2.0, &AtomicBool::new(false)).unwrap(),
            2.0
        );
        let result = hound::WavReader::open(&output).unwrap();
        assert_eq!(result.duration(), 96000);
        assert_eq!(result.spec().channels, 2);
        assert_eq!(std::fs::read(&input).unwrap(), original);
        let saved = std::fs::read(&output).unwrap();
        assert!(render(&input, &output, 1.0, 0.0, &AtomicBool::new(false)).is_err());
        assert_eq!(std::fs::read(&output).unwrap(), saved);
        assert!(render(
            &input,
            &root.join("cancelled.wav"),
            1.0,
            0.0,
            &AtomicBool::new(true)
        )
        .is_err());
        assert!(!root.join("cancelled.wav").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
}
