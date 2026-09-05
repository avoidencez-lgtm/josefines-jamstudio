//! Offline 48 kHz stereo stretch. C++ state stays on the calling worker thread.
use std::sync::atomic::{AtomicBool, Ordering};
pub const MAX_FRAMES: usize = 48_000 * 600 + 4_800;

#[cxx::bridge(namespace = "jam")]
mod ffi {
    unsafe extern "C++" {
        include!("stretch.h");
        type Stretch;
        fn new_stretch(speed: f64, semitones: f64) -> Result<UniquePtr<Stretch>>;
        fn seek_length(&self) -> usize;
        fn seek(self: Pin<&mut Stretch>, input: &[f32]) -> Result<()>;
        fn process(self: Pin<&mut Stretch>, input: &[f32], output: &mut [f32]) -> Result<()>;
    }
}

pub fn validate(speed: f64, semitones: f64) -> Result<(), String> {
    if !speed.is_finite()
        || !(0.5..=1.5).contains(&speed)
        || !semitones.is_finite()
        || !(-12.0..=12.0).contains(&semitones)
    {
        return Err("Choose 50–150% speed and -12 to +12 semitones.".into());
    }
    Ok(())
}

/// Stereo interleaved samples. Speed 0.5 doubles duration without changing pitch.
/// ponytail: one in-memory source and result (about 660 MiB at the ten-minute limit).
/// Stream source/result files if longer songs or multi-stem preparation need more.
pub fn stereo(
    input: &[f32],
    speed: f64,
    semitones: f64,
    cancel: &AtomicBool,
) -> Result<Vec<f32>, String> {
    validate(speed, semitones)?;
    if !input.len().is_multiple_of(2)
        || input.len() < 2
        || input.len() > MAX_FRAMES * 2
        || input.iter().any(|v| !v.is_finite())
    {
        return Err("Stretch needs finite stereo audio up to ten minutes at 48 kHz.".into());
    }
    if cancel.load(Ordering::Relaxed) {
        return Err("Practice copy canceled.".into());
    }
    if speed == 1.0 && semitones == 0.0 {
        return Ok(input.to_vec());
    }
    let frames = input.len() / 2;
    let output_frames = (frames as f64 / speed).round() as usize;
    let mut dsp = ffi::new_stretch(speed, semitones).map_err(|e| e.to_string())?;
    let lead = dsp.seek_length();
    let mut block = vec![0.0; lead.max(6144) * 2];
    let first = input.len().min(lead * 2);
    block[..first].copy_from_slice(&input[..first]);
    dsp.pin_mut()
        .seek(&block[..lead * 2])
        .map_err(|e| e.to_string())?;
    let mut result = vec![0.0; output_frames * 2];
    let mut consumed = 0;
    for start in (0..output_frames).step_by(4096) {
        if cancel.load(Ordering::Relaxed) {
            return Err("Practice copy canceled.".into());
        }
        let end = (start + 4096).min(output_frames);
        let next = (end as f64 * speed).round() as usize;
        let count = next - consumed;
        let source = (lead + consumed) * 2;
        block[..count * 2].fill(0.0);
        if source < input.len() {
            let available = (input.len() - source).min(count * 2);
            block[..available].copy_from_slice(&input[source..source + available]);
        }
        dsp.pin_mut()
            .process(&block[..count * 2], &mut result[start * 2..end * 2])
            .map_err(|e| e.to_string())?;
        consumed = next;
    }
    if result.iter().any(|v| !v.is_finite()) {
        return Err("Stretch produced invalid audio.".into());
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stereo_stretch_keeps_length_within_one_ms_and_pitch_within_five_cents() {
        let input: Vec<f32> = (0..96_000)
            .flat_map(|i| {
                [1000.0, 500.0]
                    .map(|f| (i as f64 * f * std::f64::consts::TAU / 48000.0).sin() as f32 * 0.2)
            })
            .collect();
        for (speed, pitch) in [
            (0.5, 0.0),
            (0.8, 0.0),
            (1.25, 0.0),
            (1.5, 0.0),
            (0.75, 2.0),
            (1.0, -12.0),
            (1.0, 12.0),
        ] {
            let output = stereo(&input, speed, pitch, &AtomicBool::new(false)).unwrap();
            let frames = output.len() / 2;
            assert!((frames as f64 / 48000.0 - 2.0 / speed).abs() <= 0.001);
            for (channel, hz) in [(0, 1000.0), (1, 500.0)] {
                let samples: Vec<f32> = output
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .skip(frames / 4)
                    .take(frames / 2)
                    .map(|v| v[channel])
                    .collect();
                let crossings: Vec<f64> = samples
                    .windows(2)
                    .enumerate()
                    .filter(|(_, p)| p[0] <= 0.0 && p[1] > 0.0)
                    .map(|(i, p)| i as f64 + (-p[0] / (p[1] - p[0])) as f64)
                    .collect();
                assert!(crossings.len() > 100);
                let measured = (crossings.len() - 1) as f64 * 48000.0
                    / (crossings.last().unwrap() - crossings[0]);
                let expected = hz * 2.0f64.powf(pitch / 12.0);
                let cents = 1200.0 * (measured / expected).log2();
                if speed == 0.8 && channel == 0 {
                    assert!((measured - 1000.0).abs() <= 1.0);
                }
                assert!(
                    cents.abs() <= 5.0,
                    "speed {speed}, pitch {pitch}, channel {channel}: {measured} Hz, {cents} cents"
                );
                assert!(
                    output[..4800].iter().any(|x| x.abs() > 0.05),
                    "missing beginning"
                );
                assert!(
                    output[output.len() - 4800..].iter().any(|x| x.abs() > 0.05),
                    "missing ending"
                );
            }
        }
        assert!(stereo(&input, 0.5, 0.0, &AtomicBool::new(true)).is_err());
        assert!(stereo(&[f32::NAN, 0.0], 1.0, 0.0, &AtomicBool::new(false)).is_err());
        for speed in [0.0, 1.51, f64::NAN] {
            assert!(validate(speed, 0.0).is_err());
        }
    }
}
