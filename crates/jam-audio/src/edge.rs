//! Device/file-edge conversion onto the internal 48 kHz clock. Not the audio callback.
use rubato::{audioadapter_buffers::direct::InterleavedSlice, Fft, FixedSync, Resampler};
use std::collections::VecDeque;

pub const INTERNAL_RATE: u32 = 48_000;

fn fft_resampler(from: u32, to: u32, channels: usize) -> Result<Fft<f32>, String> {
    let mut r = Fft::new(from as usize, to as usize, 1024, channels, FixedSync::Both)
        .map_err(|e| e.to_string())?;
    if r.fft_size_in() % 2 != 0 || r.fft_size_out() % 2 != 0 {
        r = Fft::new(
            from as usize,
            to as usize,
            r.fft_size_in() * 2,
            channels,
            FixedSync::Both,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(r)
}

/// Convert mono PCM to 48 kHz. Used by FileInput so the engine clock stays fixed.
pub fn resample_mono_to_48k(input: &[f32], from: u32) -> Result<Vec<f32>, String> {
    if from == 0 {
        return Err("Cannot convert audio with a zero sample rate.".into());
    }
    if input.iter().any(|s| !s.is_finite()) {
        return Err("Cannot convert non-finite audio.".into());
    }
    if from == INTERNAL_RATE {
        return Ok(input.to_vec());
    }
    if !(8000..=192000).contains(&from) {
        return Err(format!(
            "Cannot convert {from} Hz to 48 kHz. Use audio sampled between 8 and 192 kHz."
        ));
    }
    let mut r = fft_resampler(from, INTERNAL_RATE, 1)?;
    let delay = Resampler::output_delay(&r);
    let count = (input.len() as u64 * u64::from(INTERNAL_RATE)).div_ceil(u64::from(from)) as usize;
    let mut pending = Vec::new();
    let mut output = Vec::new();
    let mut i = 0usize;
    while output.len() < count + delay {
        let need = r.input_frames_next();
        pending.clear();
        for _ in 0..need {
            if i < input.len() {
                pending.push(input[i]);
                i += 1;
            } else {
                pending.push(0.0);
            }
        }
        let slice = InterleavedSlice::new(&pending, 1, need).map_err(|e| e.to_string())?;
        output.extend(
            r.process(&slice, None)
                .map_err(|e| e.to_string())?
                .take_data(),
        );
    }
    output.drain(..delay.min(output.len()));
    output.truncate(count);
    if output.iter().any(|s| !s.is_finite()) {
        return Err("Audio conversion produced non-finite samples.".into());
    }
    Ok(output)
}

pub fn output_rate_unsupported(device_hz: u32) -> String {
    format!(
        "Output is {device_hz} Hz. The engine stays at 48 kHz. Device-edge playback conversion is not configured. Select a 48 kHz output and Restart this audio."
    )
}

pub fn input_rate_unsupported(device_hz: u32, reason: &str) -> String {
    format!(
        "Cannot convert input at {device_hz} Hz to 48 kHz. {reason} Select a 48 kHz input and Restart this audio."
    )
}

/// 48 kHz stereo → device rate on the render worker. The output callback only copies.
pub struct StereoOutEdge {
    pub to_hz: u32,
    resampler: Fft<f32>,
    pending: Vec<f32>,
    ready: VecDeque<[f32; 2]>,
    skip: usize,
}

impl StereoOutEdge {
    pub fn to_device(to: u32) -> Result<Self, String> {
        if to == 0 {
            return Err("Cannot convert audio with a zero sample rate.".into());
        }
        if to == INTERNAL_RATE {
            return Err("Playback edge is only for a device that is not 48 kHz.".into());
        }
        if !(8000..=192000).contains(&to) {
            return Err(format!(
                "Cannot convert 48 kHz to {to} Hz. Use a device between 8 and 192 kHz."
            ));
        }
        let r = fft_resampler(INTERNAL_RATE, to, 2)?;
        let skip = Resampler::output_delay(&r);
        Ok(Self {
            to_hz: to,
            resampler: r,
            pending: Vec::new(),
            ready: VecDeque::new(),
            skip,
        })
    }

    pub fn push(&mut self, left: f32, right: f32) -> Result<(), String> {
        if !left.is_finite() || !right.is_finite() {
            return Err("Cannot convert non-finite audio.".into());
        }
        self.pending.extend_from_slice(&[left, right]);
        loop {
            let need = self.resampler.input_frames_next();
            if self.pending.len() < need * 2 {
                break;
            }
            let chunk: Vec<f32> = self.pending.drain(..need * 2).collect();
            let slice = InterleavedSlice::new(&chunk, 2, need).map_err(|e| e.to_string())?;
            let out = self
                .resampler
                .process(&slice, None)
                .map_err(|e| e.to_string())?
                .take_data();
            if out.iter().any(|s| !s.is_finite()) {
                return Err("Audio conversion produced non-finite samples.".into());
            }
            for pair in out.chunks_exact(2) {
                if self.skip > 0 {
                    self.skip -= 1;
                    continue;
                }
                self.ready.push_back([pair[0], pair[1]]);
            }
        }
        Ok(())
    }

    pub fn pop(&mut self) -> Option<[f32; 2]> {
        self.ready.pop_front()
    }
}

/// Device rate → 48 kHz mono on the render worker. The input callback only copies.
pub struct MonoInEdge {
    pub from_hz: u32,
    resampler: Fft<f32>,
    pending: Vec<f32>,
    ready: VecDeque<f32>,
    skip: usize,
}

impl MonoInEdge {
    pub fn from_device(from: u32) -> Result<Self, String> {
        if from == 0 {
            return Err("Cannot convert audio with a zero sample rate.".into());
        }
        if from == INTERNAL_RATE {
            return Err("Capture edge is only for a device that is not 48 kHz.".into());
        }
        if !(8000..=192000).contains(&from) {
            return Err(format!(
                "Cannot convert {from} Hz to 48 kHz. Use a device between 8 and 192 kHz."
            ));
        }
        let r = fft_resampler(from, INTERNAL_RATE, 1)?;
        let skip = Resampler::output_delay(&r);
        Ok(Self {
            from_hz: from,
            resampler: r,
            pending: Vec::new(),
            ready: VecDeque::new(),
            skip,
        })
    }

    pub fn push(&mut self, sample: f32) -> Result<(), String> {
        if !sample.is_finite() {
            return Err("Cannot convert non-finite audio.".into());
        }
        self.pending.push(sample);
        loop {
            let need = self.resampler.input_frames_next();
            if self.pending.len() < need {
                break;
            }
            let chunk: Vec<f32> = self.pending.drain(..need).collect();
            let slice = InterleavedSlice::new(&chunk, 1, need).map_err(|e| e.to_string())?;
            let out = self
                .resampler
                .process(&slice, None)
                .map_err(|e| e.to_string())?
                .take_data();
            if out.iter().any(|s| !s.is_finite()) {
                return Err("Audio conversion produced non-finite samples.".into());
            }
            for sample in out {
                if self.skip > 0 {
                    self.skip -= 1;
                    continue;
                }
                self.ready.push_back(sample);
            }
        }
        Ok(())
    }

    pub fn pop(&mut self) -> Option<f32> {
        self.ready.pop_front()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forty_four_one_sine_converts_to_48k_within_one_ms_and_one_hz() {
        let from = 44_100u32;
        let hz = 1000.0f64;
        let input: Vec<f32> = (0..from)
            .map(|i| (std::f64::consts::TAU * hz * i as f64 / f64::from(from)).sin() as f32)
            .collect();
        let out = resample_mono_to_48k(&input, from).unwrap();
        let expected = INTERNAL_RATE as usize;
        assert!(
            out.len().abs_diff(expected) <= 48,
            "length {} expected {expected} ±1 ms",
            out.len()
        );
        let start = 2000.min(out.len().saturating_sub(2000));
        let end = out.len().saturating_sub(1000);
        let slice = &out[start..end];
        let mut crossings = 0u32;
        for w in slice.windows(2) {
            if w[0] < 0.0 && w[1] >= 0.0 {
                crossings += 1;
            }
        }
        let secs = slice.len() as f64 / f64::from(INTERNAL_RATE);
        let measured = crossings as f64 / secs;
        assert!((measured - hz).abs() <= 1.0, "frequency {measured} Hz");
    }

    #[test]
    fn forty_eight_sine_converts_to_44k1_within_one_ms_and_one_hz() {
        let to = 44_100u32;
        let hz = 1000.0f64;
        let mut edge = StereoOutEdge::to_device(to).unwrap();
        for i in 0..INTERNAL_RATE {
            let v = (std::f64::consts::TAU * hz * i as f64 / f64::from(INTERNAL_RATE)).sin() as f32;
            edge.push(v, v).unwrap();
        }
        for _ in 0..2048 {
            edge.push(0.0, 0.0).unwrap();
        }
        let mut out = Vec::new();
        while let Some(frame) = edge.pop() {
            out.push(frame[0]);
        }
        let expected = to as usize;
        assert!(
            out.len() >= expected,
            "converted length {} expected at least {expected}",
            out.len()
        );
        let slice = &out[..expected];
        let start = 2000;
        let end = expected - 1000;
        let region = &slice[start..end];
        let mut crossings = 0u32;
        for w in region.windows(2) {
            if w[0] < 0.0 && w[1] >= 0.0 {
                crossings += 1;
            }
        }
        let secs = region.len() as f64 / f64::from(to);
        let measured = crossings as f64 / secs;
        assert!((measured - hz).abs() <= 1.0, "frequency {measured} Hz");
        assert!(
            StereoOutEdge::to_device(INTERNAL_RATE).is_err(),
            "identity playback is the 48 kHz ring, not an edge"
        );
    }

    #[test]
    fn forty_four_one_capture_converts_to_48k_within_one_ms_and_one_hz() {
        let from = 44_100u32;
        let hz = 1000.0f64;
        let mut edge = MonoInEdge::from_device(from).unwrap();
        for i in 0..from {
            let v = (std::f64::consts::TAU * hz * i as f64 / f64::from(from)).sin() as f32;
            edge.push(v).unwrap();
        }
        for _ in 0..2048 {
            edge.push(0.0).unwrap();
        }
        let mut out = Vec::new();
        while let Some(sample) = edge.pop() {
            out.push(sample);
        }
        let expected = INTERNAL_RATE as usize;
        assert!(
            out.len() >= expected,
            "converted length {} expected at least {expected}",
            out.len()
        );
        let slice = &out[..expected];
        let start = 2000;
        let end = expected - 1000;
        let region = &slice[start..end];
        let mut crossings = 0u32;
        for w in region.windows(2) {
            if w[0] < 0.0 && w[1] >= 0.0 {
                crossings += 1;
            }
        }
        let secs = region.len() as f64 / f64::from(INTERNAL_RATE);
        let measured = crossings as f64 / secs;
        assert!((measured - hz).abs() <= 1.0, "frequency {measured} Hz");
        assert!(
            MonoInEdge::from_device(INTERNAL_RATE).is_err(),
            "identity capture is the 48 kHz ring, not an edge"
        );
        let msg = input_rate_unsupported(44_100, "no converter");
        assert!(msg.contains("44100"), "{msg}");
        assert!(msg.contains("48 kHz"), "{msg}");
    }

    #[test]
    fn already_48k_is_unchanged_and_zero_rate_fails_loud() {
        let input = vec![0.1, -0.2, 0.3];
        assert_eq!(resample_mono_to_48k(&input, INTERNAL_RATE).unwrap(), input);
        assert!(resample_mono_to_48k(&input, 0)
            .unwrap_err()
            .contains("zero sample rate"));
    }
}
