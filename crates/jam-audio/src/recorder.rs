//! Bounded disk recording. WAV headers checkpoint every second; manifests are truth.
use crate::workstation::Frame;
use hound::{WavSpec, WavWriter};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
};

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
    #[serde(default)]
    pub stems: BTreeMap<String, String>,
    #[serde(default)]
    pub snapshot: serde_json::Value,
    #[serde(default)]
    pub midi: Vec<crate::workstation::MidiNote>,
    #[serde(default)]
    pub sample_rate: u32,
    #[serde(flatten)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

type Writer = thread::JoinHandle<Result<TakeMetadata, String>>;
pub struct TakeRecorder {
    sample_rate: u32,
    base_dir: PathBuf,
    latency_offset_samples: usize,
    sender: Option<mpsc::SyncSender<Vec<Frame>>>,
    writer: Option<Writer>,
    failure: Option<String>,
    pub snapshot: serde_json::Value,
    pub midi: Vec<crate::workstation::MidiNote>,
    pub frames_written: u64,
}
impl TakeRecorder {
    pub fn new(sample_rate: u32, base_dir: PathBuf) -> Self {
        Self {
            sample_rate,
            base_dir,
            latency_offset_samples: 0,
            sender: None,
            writer: None,
            failure: None,
            snapshot: serde_json::Value::Null,
            midi: Vec::new(),
            frames_written: 0,
        }
    }
    pub fn set_latency_compensation(&mut self, samples: usize) {
        self.latency_offset_samples = samples;
    }
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    pub fn set_sample_rate(&mut self, rate: u32) -> Result<(), String> {
        if self.is_recording() {
            return Err("Stop recording before changing audio devices.".into());
        }
        self.sample_rate = rate.max(1);
        Ok(())
    }
    pub fn is_recording(&self) -> bool {
        self.writer.is_some()
    }
    pub fn start_take(
        &mut self,
        session_id: String,
        style_id: String,
        chart_id: String,
        tempo: f64,
    ) -> Result<String, String> {
        if self.is_recording() {
            return Err("A take is already recording. Stop and save it first.".into());
        }
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?;
        let id = format!("take-{}", now.as_nanos());
        fs::create_dir_all(&self.base_dir).map_err(|e| e.to_string())?;
        let dir = self.base_dir.join(&id);
        fs::create_dir(&dir).map_err(|e| e.to_string())?;
        let layout: [(&str, &[usize]); 6] = [
            ("guitar-di", &[0]),
            ("band", &[1, 2]),
            ("master", &[3, 4]),
            ("drums", &[5, 6]),
            ("bass", &[7]),
            ("comp", &[8]),
        ];
        let mut writers = Vec::new();
        let mut stems = BTreeMap::new();
        for (name, channels) in layout {
            let path = dir.join(format!("{name}.wav"));
            let writer = WavWriter::create(
                &path,
                WavSpec {
                    channels: channels.len() as u16,
                    sample_rate: self.sample_rate,
                    bits_per_sample: 24,
                    sample_format: hound::SampleFormat::Int,
                },
            )
            .map_err(|e| e.to_string())?;
            stems.insert(name.to_string(), path.to_string_lossy().into_owned());
            writers.push((channels.to_vec(), writer));
        }
        let mut meta = TakeMetadata {
            id: id.clone(),
            session_id,
            timestamp: format!("{}.{:03}", now.as_secs(), now.subsec_millis()),
            style_id,
            chart_id,
            tempo,
            path_input: stems["guitar-di"].clone(),
            path_band: stems["band"].clone(),
            path_master: stems["master"].clone(),
            stems,
            snapshot: self.snapshot.clone(),
            sample_rate: self.sample_rate,
            ..Default::default()
        };
        meta.extra
            .insert("schemaVersion".into(), serde_json::json!(1));
        // Keep enough queued audio for disk jitter; never block the render thread.
        let (tx, rx) = mpsc::sync_channel::<Vec<Frame>>(512);
        let rate = self.sample_rate;
        let offset = self.latency_offset_samples;
        let writer = thread::spawn(move || -> Result<TakeMetadata, String> {
            let mut frames = 0usize;
            let mut checkpoint = 0usize;
            let mut peak = 0.0f32;
            let mut peaks = Vec::new();
            for block in rx {
                for frame in block {
                    for (channels, writer) in &mut writers {
                        if channels == &[0] && frames < offset {
                            continue;
                        }
                        for &ch in channels.iter() {
                            let v = frame[ch];
                            if !v.is_finite() {
                                return Err(
                                    "Non-finite audio; partial WAVs kept for recovery.".into()
                                );
                            }
                            writer
                                .write_sample((v.clamp(-1.0, 1.0) * 8_388_607.0) as i32)
                                .map_err(|e| e.to_string())?;
                        }
                    }
                    peak = peak.max(frame[0].abs()).max(frame[3].abs());
                    frames += 1;
                    if frames.is_multiple_of((rate as usize / 10).max(1)) {
                        peaks.push(peak);
                        peak = 0.0;
                    }
                    if frames - checkpoint >= rate as usize {
                        for (_, writer) in &mut writers {
                            writer.flush().map_err(|e| e.to_string())?;
                        }
                        checkpoint = frames;
                    }
                }
            }
            // Pad the shifted input so every exported stem retains a common duration.
            for (channels, writer) in &mut writers {
                if channels == &[0] {
                    for _ in 0..offset.min(frames) {
                        writer.write_sample(0i32).map_err(|e| e.to_string())?;
                    }
                }
            }
            for (_, writer) in writers {
                writer.finalize().map_err(|e| e.to_string())?;
            }
            if peaks.is_empty() {
                peaks.push(peak);
            }
            meta.waveform_peaks = peaks
                .chunks(peaks.len().div_ceil(100))
                .map(|p| p.iter().copied().fold(0.0, f32::max))
                .collect();
            meta.sample_count = frames;
            meta.duration_secs = frames as f64 / rate as f64;
            Ok(meta)
        });
        self.sender = Some(tx);
        self.writer = Some(writer);
        self.failure = None;
        self.midi.clear();
        self.frames_written = 0;
        Ok(id)
    }
    pub fn push_frames(&mut self, frames: Vec<Frame>) {
        if let Some(tx) = &self.sender {
            self.frames_written += frames.len() as u64;
            if let Err(e) = tx.try_send(frames) {
                self.failure = Some(format!(
                    "Recording interrupted by disk backpressure: {e}. Partial WAVs kept."
                ));
                self.sender = None;
            }
        }
    }
    pub fn push_capture(&mut self, frames: &[Frame]) -> Result<(), String> {
        // Called on the command thread, never the audio/render thread.
        for chunk in frames.chunks(256) {
            self.sender
                .as_ref()
                .ok_or("Recorder not running")?
                .send(chunk.to_vec())
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub fn stop_and_save(&mut self) -> Result<TakeMetadata, String> {
        self.sender.take();
        let writer = self.writer.take().ok_or("No active recording")?;
        let mut meta = writer
            .join()
            .map_err(|_| "Recording writer failed; partial WAVs kept")??;
        meta.midi = std::mem::take(&mut self.midi);
        if let Some(e) = self.failure.take() {
            meta.notes = e;
            save_manifest(&meta)?;
            // Files are truth: the take is on disk. Returning Err hid it from
            // Sessions until a manual refresh (#92).
            return Ok(meta);
        }
        save_manifest(&meta)?;
        Ok(meta)
    }
}
impl Drop for TakeRecorder {
    fn drop(&mut self) {
        if self.is_recording() {
            let _ = self.stop_and_save();
        }
    }
}
pub fn save_manifest(meta: &TakeMetadata) -> Result<(), String> {
    let dir = Path::new(&meta.path_input)
        .parent()
        .ok_or("Take directory missing")?;
    let temp = dir.join("take.json.tmp");
    fs::write(
        &temp,
        serde_json::to_vec_pretty(meta).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temp, dir.join("take.json")).map_err(|e| e.to_string())
}

/// Reads a WAV file back as mono f32 in -1..1 (channels are averaged), together with its
/// sample rate. Used by take analysis so it looks at what was actually recorded.
pub fn read_wav_mono(path: &Path) -> Result<(Vec<f32>, u32), String> {
    let mut reader =
        hound::WavReader::open(path).map_err(|e| format!("cannot open {}: {e}", path.display()))?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;
    let interleaved: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .map(|s| s.map_err(|e| e.to_string()))
            .collect::<Result<_, _>>()?,
        hound::SampleFormat::Int => {
            let scale = 1.0 / ((1u64 << (spec.bits_per_sample.max(1) - 1)) as f32);
            reader
                .samples::<i32>()
                .map(|s| s.map(|v| v as f32 * scale).map_err(|e| e.to_string()))
                .collect::<Result<_, _>>()?
        }
    };
    let mono = interleaved
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect();
    Ok((mono, spec.sample_rate))
}

pub fn wav_sample_rate(path: &Path) -> Result<u32, String> {
    hound::WavReader::open(path)
        .map(|r| r.spec().sample_rate)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recording_has_separate_aligned_stems_and_a_durable_snapshot() {
        let root = std::env::temp_dir().join(format!("jam-recording-{}", std::process::id()));
        let mut r = TakeRecorder::new(1000, root.clone());
        r.snapshot = serde_json::json!({"name":"First riff"});
        r.set_latency_compensation(10);
        r.start_take("song".into(), "rock".into(), "verse".into(), 100.0)
            .unwrap();
        assert!(r
            .start_take("x".into(), "x".into(), "x".into(), 100.0)
            .is_err());
        r.push_capture(&vec![[0.5, 0.2, 0.2, 0.7, 0.7, 0.1, 0.1, 0.04, 0.06]; 1000])
            .unwrap();
        let t = r.stop_and_save().unwrap();
        assert_eq!(t.snapshot["name"], "First riff");
        for p in t.stems.values() {
            assert_eq!(read_wav_mono(Path::new(p)).unwrap().0.len(), 1000);
        }
        let input = read_wav_mono(Path::new(&t.path_input)).unwrap().0;
        assert!((input[0] - 0.5).abs() < 1e-6);
        assert_eq!(input[999], 0.0);
        assert!(Path::new(&t.path_input)
            .parent()
            .unwrap()
            .join("take.json")
            .exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn stop_after_backpressure_still_returns_the_saved_take() {
        let root = std::env::temp_dir().join(format!(
            "jam-recording-bp-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut r = TakeRecorder::new(1000, root.clone());
        r.start_take("song".into(), "rock".into(), "verse".into(), 100.0)
            .unwrap();
        r.push_capture(&vec![[0.1; 9]; 64]).unwrap();
        r.failure =
            Some("Recording interrupted by disk backpressure: full. Partial WAVs kept.".into());
        let t = r
            .stop_and_save()
            .expect("saved take stays visible after backpressure");
        assert!(t.notes.contains("interrupted"), "{}", t.notes);
        assert!(Path::new(&t.path_input)
            .parent()
            .unwrap()
            .join("take.json")
            .exists());
        let _ = fs::remove_dir_all(root);
    }
}
