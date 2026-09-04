//! recorder: Multi-track take recorder writing 24-bit 48 kHz WAV stems with latency compensation.

use hound::{WavSpec, WavWriter};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TakeMetadata {
    pub id: String,
    pub session_id: String,
    pub timestamp: String,
    pub duration_secs: f64,
    pub style_id: String,
    pub chart_id: String,
    pub tempo: f64,
    pub sample_count: usize,
    pub path_input: String,
    pub path_band: String,
    pub path_master: String,
    pub waveform_peaks: Vec<f32>,
    pub notes: String,
}

pub struct TakeRecorder {
    sample_rate: u32,
    base_dir: PathBuf,
    is_recording: Arc<AtomicBool>,
    current_take_id: Option<String>,
    session_id: String,
    style_id: String,
    chart_id: String,
    tempo: f64,
    latency_offset_samples: usize,
    recorded_input: Vec<f32>,
    recorded_band_left: Vec<f32>,
    recorded_band_right: Vec<f32>,
    recorded_master_left: Vec<f32>,
    recorded_master_right: Vec<f32>,
}

impl TakeRecorder {
    pub fn new(sample_rate: u32, base_dir: PathBuf) -> Self {
        Self {
            sample_rate,
            base_dir,
            is_recording: Arc::new(AtomicBool::new(false)),
            current_take_id: None,
            session_id: "default-session".into(),
            style_id: "blues-shuffle".into(),
            chart_id: "blues-12-bar".into(),
            tempo: 120.0,
            latency_offset_samples: 0,
            recorded_input: Vec::new(),
            recorded_band_left: Vec::new(),
            recorded_band_right: Vec::new(),
            recorded_master_left: Vec::new(),
            recorded_master_right: Vec::new(),
        }
    }

    pub fn set_latency_compensation(&mut self, offset_samples: usize) {
        self.latency_offset_samples = offset_samples;
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Follows a device-rate change. Ignored while a take is in progress so the
    /// WAV header always matches the recorded data.
    pub fn set_sample_rate(&mut self, sample_rate: u32) -> Result<(), String> {
        if self.is_recording() {
            return Err("cannot change sample rate while recording".into());
        }
        if sample_rate > 0 {
            self.sample_rate = sample_rate;
        }
        Ok(())
    }

    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::SeqCst)
    }

    pub fn start_take(
        &mut self,
        session_id: String,
        style_id: String,
        chart_id: String,
        tempo: f64,
    ) -> String {
        let take_id = format!(
            "take-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        );
        self.current_take_id = Some(take_id.clone());
        self.session_id = session_id;
        self.style_id = style_id;
        self.chart_id = chart_id;
        self.tempo = tempo;

        self.recorded_input.clear();
        self.recorded_band_left.clear();
        self.recorded_band_right.clear();
        self.recorded_master_left.clear();
        self.recorded_master_right.clear();

        self.is_recording.store(true, Ordering::SeqCst);
        take_id
    }

    pub fn push_block(
        &mut self,
        input: &[f32],
        band_l: &[f32],
        band_r: &[f32],
        master_l: &[f32],
        master_r: &[f32],
    ) {
        if !self.is_recording.load(Ordering::SeqCst) {
            return;
        }

        self.recorded_input.extend_from_slice(input);
        self.recorded_band_left.extend_from_slice(band_l);
        self.recorded_band_right.extend_from_slice(band_r);
        self.recorded_master_left.extend_from_slice(master_l);
        self.recorded_master_right.extend_from_slice(master_r);
    }

    pub fn stop_and_save(&mut self) -> Result<TakeMetadata, String> {
        self.is_recording.store(false, Ordering::SeqCst);
        let take_id = self
            .current_take_id
            .take()
            .ok_or_else(|| "No active take to stop".to_string())?;

        let take_dir = self.base_dir.join(&take_id);
        fs::create_dir_all(&take_dir).map_err(|e| e.to_string())?;

        let path_input = take_dir.join(format!("{}-input.wav", take_id));
        let path_band = take_dir.join(format!("{}-band.wav", take_id));
        let path_master = take_dir.join(format!("{}-master.wav", take_id));

        // Apply latency compensation shift to recorded input
        let compensated_input = if self.latency_offset_samples < self.recorded_input.len() {
            &self.recorded_input[self.latency_offset_samples..]
        } else {
            &self.recorded_input[..]
        };

        // Write 24-bit PCM WAVs
        write_wav_mono_24(&path_input, compensated_input, self.sample_rate)?;
        write_wav_stereo_24(
            &path_band,
            &self.recorded_band_left,
            &self.recorded_band_right,
            self.sample_rate,
        )?;
        write_wav_stereo_24(
            &path_master,
            &self.recorded_master_left,
            &self.recorded_master_right,
            self.sample_rate,
        )?;

        let sample_count = self.recorded_master_left.len();
        let duration_secs = sample_count as f64 / self.sample_rate as f64;

        // Compute 100-point thumbnail waveform peaks
        let peaks = compute_peaks(&self.recorded_master_left, 100);

        let meta = TakeMetadata {
            id: take_id,
            session_id: self.session_id.clone(),
            timestamp: chrono_now_iso(),
            duration_secs,
            style_id: self.style_id.clone(),
            chart_id: self.chart_id.clone(),
            tempo: self.tempo,
            sample_count,
            path_input: path_input.to_string_lossy().into(),
            path_band: path_band.to_string_lossy().into(),
            path_master: path_master.to_string_lossy().into(),
            waveform_peaks: peaks,
            notes: "".into(),
        };

        Ok(meta)
    }
}

fn write_wav_mono_24(path: &Path, samples: &[f32], sample_rate: u32) -> Result<(), String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 24,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for &s in samples {
        let val = (s.clamp(-1.0, 1.0) * 8_388_607.0) as i32;
        writer.write_sample(val).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())
}

fn write_wav_stereo_24(
    path: &Path,
    left: &[f32],
    right: &[f32],
    sample_rate: u32,
) -> Result<(), String> {
    let spec = WavSpec {
        channels: 2,
        sample_rate,
        bits_per_sample: 24,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    let len = left.len().min(right.len());
    for i in 0..len {
        let l = (left[i].clamp(-1.0, 1.0) * 8_388_607.0) as i32;
        let r = (right[i].clamp(-1.0, 1.0) * 8_388_607.0) as i32;
        writer.write_sample(l).map_err(|e| e.to_string())?;
        writer.write_sample(r).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())
}

fn compute_peaks(samples: &[f32], num_points: usize) -> Vec<f32> {
    if samples.is_empty() || num_points == 0 {
        return vec![0.0; num_points];
    }
    let chunk_size = (samples.len() / num_points).max(1);
    let mut peaks = Vec::with_capacity(num_points);

    for chunk in samples.chunks(chunk_size).take(num_points) {
        let mut max_val = 0.0f32;
        for &s in chunk {
            let abs_s = s.abs();
            if abs_s > max_val {
                max_val = abs_s;
            }
        }
        peaks.push(max_val);
    }

    while peaks.len() < num_points {
        peaks.push(0.0);
    }

    peaks
}

fn chrono_now_iso() -> String {
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    format!("{}.{}", dur.as_secs(), dur.subsec_millis())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_take_recorder_and_wav_generation() {
        let temp_dir = std::env::temp_dir().join("jam_test_takes");
        let _ = fs::remove_dir_all(&temp_dir);

        let mut recorder = TakeRecorder::new(48_000, temp_dir.clone());
        recorder.set_latency_compensation(10);

        let take_id = recorder.start_take(
            "session-1".into(),
            "blues-shuffle".into(),
            "blues-12-bar".into(),
            120.0,
        );
        assert!(!take_id.is_empty());
        assert!(recorder.is_recording());

        // Simulate 48,000 samples (1 second)
        let in_buf = vec![0.5f32; 4800];
        let band_buf = vec![0.3f32; 4800];
        for _ in 0..10 {
            recorder.push_block(&in_buf, &band_buf, &band_buf, &band_buf, &band_buf);
        }

        let meta = recorder.stop_and_save().expect("save succeeds");
        assert_eq!(meta.id, take_id);
        assert!((meta.duration_secs - 1.0).abs() < 0.01);
        assert_eq!(meta.waveform_peaks.len(), 100);

        assert!(Path::new(&meta.path_input).exists());
        assert!(Path::new(&meta.path_band).exists());
        assert!(Path::new(&meta.path_master).exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
