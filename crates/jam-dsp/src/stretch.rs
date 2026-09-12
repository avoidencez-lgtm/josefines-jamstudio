//! 48 kHz stereo stretch, offline or in bounded blocks on the native render worker.
use std::sync::atomic::{AtomicBool, Ordering};
pub const MAX_FRAMES: usize = 48_000 * 600 + 4_800;

#[cxx::bridge(namespace = "jam")]
mod ffi {
    unsafe extern "C++" {
        include!("stretch.h");
        type Stretch;
        fn new_stretch(speed: f64, semitones: f64) -> Result<UniquePtr<Stretch>>;
        fn set_parameters(self: Pin<&mut Stretch>, speed: f64, semitones: f64);
        fn seek_length(&self) -> usize;
        fn seek(self: Pin<&mut Stretch>, input: &[f32]) -> Result<()>;
        fn process(self: Pin<&mut Stretch>, input: &[f32], output: &mut [f32]) -> Result<()>;
        fn flush(self: Pin<&mut Stretch>, output: &mut [f32]) -> Result<()>;
    }
}

// SAFETY: Stretch owns its vectors, FFT and seeded random engine, with no thread-local
// state or external pointers. UniquePtr transfers exclusive ownership; mutable calls
// require Pin<&mut Stretch>. This permits transfer, not concurrent access (no Sync).
unsafe impl Send for ffi::Stretch {}

const BLOCK: usize = 256;

/// Prepared off the render thread; one instance per stem, no callback access.
pub struct Stream {
    dsp: cxx::UniquePtr<ffi::Stretch>,
    input: Vec<f32>,
    output: [f32; (BLOCK + 1) * 2],
    primed: bool,
    origin: usize,
    lead: usize,
    produced: usize,
    phase: f64,
    speed: f64,
    loop_start: Option<usize>,
}

impl Stream {
    pub fn new() -> Result<Self, String> {
        // Allocate for the largest supported seek, then restore unity parameters.
        let mut dsp = ffi::new_stretch(1.5, 0.0).map_err(|e| e.to_string())?;
        let capacity = dsp.seek_length().max(BLOCK * 2);
        dsp.pin_mut().set_parameters(1.0, 0.0);
        Ok(Self {
            dsp,
            input: vec![0.0; capacity * 2],
            output: [0.0; (BLOCK + 1) * 2],
            primed: false,
            origin: 0,
            lead: 0,
            produced: 0,
            phase: 0.0,
            speed: 1.0,
            loop_start: None,
        })
    }

    pub fn set_parameters(&mut self, speed: f64, semitones: f64) -> Result<(), String> {
        validate(speed, semitones)?;
        self.dsp.pin_mut().set_parameters(speed, semitones);
        self.speed = speed;
        self.invalidate();
        Ok(())
    }

    pub fn invalidate(&mut self) {
        self.primed = false;
    }

    fn copy_input(&mut self, samples: &[f32], start: usize, frames: usize) -> Result<(), String> {
        let block = self
            .input
            .get_mut(..frames * 2)
            .ok_or("Stretch input block exceeded its prepared capacity.")?;
        block.fill(0.0);
        let total = samples.len() / 2;
        if let Some(loop_origin) = self.loop_start.filter(|origin| *origin < total) {
            let span = total - loop_origin;
            let mut dest = 0;
            let mut src = if start < loop_origin {
                start
            } else {
                loop_origin + (start - loop_origin) % span
            };
            while dest < frames {
                if src >= total {
                    src = loop_origin;
                }
                let chunk = (total - src).min(frames - dest);
                let copy = chunk * 2;
                block[dest * 2..dest * 2 + copy].copy_from_slice(&samples[src * 2..src * 2 + copy]);
                dest += chunk;
                src = loop_origin;
            }
        } else if start < total {
            let available = (total - start).min(frames);
            block[..available * 2].copy_from_slice(&samples[start * 2..start * 2 + available * 2]);
        }
        if block.iter().any(|s| !s.is_finite()) {
            return Err("Stretch source contains invalid audio.".into());
        }
        Ok(())
    }

    fn refill(&mut self, samples: &[f32]) -> Result<(), String> {
        let consumed = (self.produced as f64 * self.speed).round() as usize;
        let next = ((self.produced + BLOCK) as f64 * self.speed).round() as usize;
        let count = next - consumed;
        self.copy_input(samples, self.origin + self.lead + consumed, count)?;
        self.output[0] = self.output[BLOCK * 2];
        self.output[1] = self.output[BLOCK * 2 + 1];
        self.dsp
            .pin_mut()
            .process(&self.input[..count * 2], &mut self.output[2..])
            .map_err(|e| e.to_string())?;
        if self.output.iter().any(|v| !v.is_finite()) {
            return Err("Stretch produced invalid audio.".into());
        }
        self.produced += BLOCK;
        Ok(())
    }

    /// `samples` ends at the active loop/file boundary. When `loop_start` is set,
    /// lookahead wraps to that frame; otherwise it is zero-padded.
    /// `position` is in original 48 kHz frames and is read only after invalidation.
    pub fn frame(
        &mut self,
        samples: &[f32],
        position: f64,
        rate: u32,
        loop_start: Option<usize>,
    ) -> Result<[f32; 2], String> {
        if rate == 0 || !position.is_finite() || position < 0.0 || !samples.len().is_multiple_of(2)
        {
            return Err("Invalid stretch source position or output rate.".into());
        }
        if !self.primed {
            self.origin = position.floor() as usize;
            self.loop_start = loop_start;
            self.lead = self.dsp.seek_length();
            self.copy_input(samples, self.origin, self.lead)?;
            self.dsp
                .pin_mut()
                .seek(&self.input[..self.lead * 2])
                .map_err(|e| e.to_string())?;
            self.produced = 0;
            self.output.fill(0.0);
            self.refill(samples)?;
            self.phase = 1.0 + position.fract() / self.speed;
            self.primed = true;
        }
        while self.phase >= BLOCK as f64 {
            self.refill(samples)?;
            self.phase -= BLOCK as f64;
        }
        let a = self.phase.floor() as usize;
        let fraction = self.phase.fract() as f32;
        let output = [0, 1].map(|c| {
            self.output[a * 2 + c]
                + (self.output[(a + 1) * 2 + c] - self.output[a * 2 + c]) * fraction
        });
        self.phase += 48_000.0 / rate as f64;
        Ok(output)
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
    let flush_frames = ((lead as f64 / speed).round() as usize).min(output_frames);
    let process_frames = output_frames - flush_frames;
    let remaining_input = frames.saturating_sub(lead);
    let mut result = vec![0.0; output_frames * 2];
    let mut consumed = 0;
    for start in (0..process_frames).step_by(4096) {
        if cancel.load(Ordering::Relaxed) {
            return Err("Practice copy canceled.".into());
        }
        let end = (start + 4096).min(process_frames);
        let next = if process_frames == 0 {
            0
        } else {
            (end as f64 * remaining_input as f64 / process_frames as f64).round() as usize
        };
        let count = next.saturating_sub(consumed);
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
    if flush_frames > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Err("Practice copy canceled.".into());
        }
        dsp.pin_mut()
            .flush(&mut result[process_frames * 2..])
            .map_err(|e| e.to_string())?;
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
    }

    #[test]
    fn time_stretch_125_length_and_dominant_bin() {
        // ARCHITECTURE §9.1: 1 kHz sine × 1.25; length ±1 ms; dominant bin ±1 Hz.
        let input: Vec<f32> = (0..96_000)
            .flat_map(|i| {
                let v = (i as f64 * 1000.0 * std::f64::consts::TAU / 48_000.0).sin() as f32 * 0.2;
                [v, v]
            })
            .collect();
        let output = stereo(&input, 1.25, 0.0, &AtomicBool::new(false)).unwrap();
        let frames = output.len() / 2;
        assert!((frames as f64 / 48_000.0 - 2.0 / 1.25).abs() <= 0.001);
        let start = frames / 2 - 24_000;
        let mut samples: Vec<f64> = output
            .as_chunks::<2>()
            .0
            .iter()
            .skip(start)
            .take(48_000)
            .map(|c| c[0] as f64)
            .collect();
        assert_eq!(samples.len(), 48_000);
        let fft = realfft::RealFftPlanner::<f64>::new().plan_fft_forward(48_000);
        let mut spectrum = fft.make_output_vec();
        let mut scratch = fft.make_scratch_vec();
        fft.process_with_scratch(&mut samples, &mut spectrum, &mut scratch)
            .unwrap();
        let bin = spectrum
            .iter()
            .enumerate()
            .skip(1)
            .max_by(|a, b| a.1.norm_sqr().total_cmp(&b.1.norm_sqr()))
            .map(|(i, _)| i)
            .unwrap();
        assert!((bin as i32 - 1000).abs() <= 1, "dominant bin {bin} Hz");
    }

    #[test]
    fn pitch_shift_plus_two_semitones_is_1122_5_hz() {
        // ARCHITECTURE §9.1: 1 kHz sine +2 semitones; f0 = 1122.5 ±5 Hz.
        let input: Vec<f32> = (0..96_000)
            .flat_map(|i| {
                let v = (i as f64 * 1000.0 * std::f64::consts::TAU / 48_000.0).sin() as f32 * 0.2;
                [v, v]
            })
            .collect();
        let output = stereo(&input, 1.0, 2.0, &AtomicBool::new(false)).unwrap();
        let frames = output.len() / 2;
        let samples: Vec<f32> = output
            .as_chunks::<2>()
            .0
            .iter()
            .skip(frames / 4)
            .take(frames / 2)
            .map(|c| c[0])
            .collect();
        let crossings: Vec<f64> = samples
            .windows(2)
            .enumerate()
            .filter(|(_, p)| p[0] <= 0.0 && p[1] > 0.0)
            .map(|(i, p)| i as f64 + (-p[0] / (p[1] - p[0])) as f64)
            .collect();
        let f0 =
            (crossings.len() - 1) as f64 * 48_000.0 / (crossings.last().unwrap() - crossings[0]);
        assert!((f0 - 1122.5).abs() <= 5.0, "f0 {f0} Hz");
    }

    #[test]
    fn cancel_and_validate_still_reject() {
        let input: Vec<f32> = (0..96_000)
            .flat_map(|i| {
                [1000.0, 500.0]
                    .map(|f| (i as f64 * f * std::f64::consts::TAU / 48000.0).sin() as f32 * 0.2)
            })
            .collect();
        assert!(stereo(&input, 0.5, 0.0, &AtomicBool::new(true)).is_err());
        assert!(stereo(&[f32::NAN, 0.0], 1.0, 0.0, &AtomicBool::new(false)).is_err());
        for speed in [0.0, 1.51, f64::NAN] {
            assert!(validate(speed, 0.0).is_err());
        }
    }

    #[test]
    fn offline_stereo_flush_keeps_the_tail_within_six_db_of_the_steady_tone() {
        // Without Signalsmith flush(), the last ~90–150 ms is stretched zeros.
        // Tail RMS of a 2 s 1 kHz tone at 0.5× must stay within 6 dB of the
        // middle (tolerance: last 50 ms vs mid-second RMS).
        let input: Vec<f32> = (0..96_000)
            .flat_map(|i| {
                let v = (i as f64 * 1000.0 * std::f64::consts::TAU / 48_000.0).sin() as f32 * 0.2;
                [v, v]
            })
            .collect();
        let output = stereo(&input, 0.5, 0.0, &AtomicBool::new(false)).unwrap();
        let frames = output.len() / 2;
        let rms = |start: usize, count: usize| {
            let sum: f32 = output
                .as_chunks::<2>()
                .0
                .iter()
                .skip(start)
                .take(count)
                .map(|c| c[0] * c[0])
                .sum();
            (sum / count as f32).sqrt()
        };
        let mid = rms(frames / 2, 48_000);
        let tail = rms(frames - 2_400, 2_400);
        assert!(
            tail > 0.05 && tail >= mid / 2.0,
            "tail RMS {tail} vs mid {mid} (6 dB)"
        );
    }

    #[test]
    fn live_loop_lookahead_wraps_to_loop_start_instead_of_silence() {
        // Seek 1.85 s into a 1–2 s loop at 0.5×. Lookahead past loop_end must
        // wrap to loop_start so the last 100 ms of output is still the 1 kHz
        // tone, not stretched zeros (tolerance: RMS > 0.05).
        let full: Vec<f32> = (0..96_000)
            .flat_map(|i| {
                let v = (i as f64 * 1000.0 * std::f64::consts::TAU / 48_000.0).sin() as f32 * 0.2;
                [v, v]
            })
            .collect();
        let loop_end = 96_000;
        let samples = &full[..loop_end * 2];
        let mut stream = Stream::new().unwrap();
        stream.set_parameters(0.5, 0.0).unwrap();
        let mut out = Vec::with_capacity(14_400);
        for i in 0..14_400 {
            let position = 1.85 * 48_000.0;
            let frame = stream
                .frame(samples, position, 48_000, Some(48_000))
                .unwrap_or_else(|e| panic!("frame {i}: {e}"));
            out.push(frame[0]);
        }
        let tail = &out[out.len() - 4_800..];
        let rms = (tail.iter().map(|s| s * s).sum::<f32>() / tail.len() as f32).sqrt();
        assert!(
            rms > 0.05,
            "loop wrap lookahead was silence: tail RMS {rms}"
        );
    }
}
