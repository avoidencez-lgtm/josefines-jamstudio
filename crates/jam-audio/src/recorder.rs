//! Bounded disk recording. WAV headers checkpoint every second; manifests are truth.
use crate::workstation::Frame;
use hound::{WavSpec, WavWriter};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
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
    take_dir: Option<PathBuf>,
    latency_offset_samples: usize,
    sender: Option<mpsc::SyncSender<Vec<Frame>>>,
    writer: Option<Writer>,
    failure: Option<String>,
    pub snapshot: serde_json::Value,
    pub midi: Vec<crate::workstation::MidiNote>,
    pub frames_written: u64,
    pub(crate) reference_timing: Option<crate::reference_timing::ReferenceTiming>,
}
impl TakeRecorder {
    pub fn new(sample_rate: u32, base_dir: PathBuf) -> Self {
        Self {
            sample_rate,
            base_dir,
            take_dir: None,
            latency_offset_samples: 0,
            sender: None,
            writer: None,
            failure: None,
            snapshot: serde_json::Value::Null,
            midi: Vec::new(),
            frames_written: 0,
            reference_timing: None,
        }
    }
    pub fn set_latency_compensation(&mut self, samples: usize) {
        self.latency_offset_samples = samples;
    }
    /// Idle recorder with the same configuration, without a writer or MIDI.
    pub(crate) fn idle(&self) -> Self {
        let mut recorder = Self::new(self.sample_rate, self.base_dir.clone());
        recorder.latency_offset_samples = self.latency_offset_samples;
        recorder.snapshot = self.snapshot.clone();
        recorder
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
        // Includes a failed capture whose writer still needs finalising.
        self.writer.is_some()
    }
    pub fn error(&self) -> Option<&str> {
        self.failure.as_deref().filter(|_| self.is_recording())
    }
    pub(crate) fn interrupt(&mut self, reason: &str) {
        if self.is_recording() && self.failure.is_none() {
            self.failure = Some(format!(
                "Recording was interrupted. {reason} Save the partial take."
            ));
            self.sender = None;
        }
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
        fs::create_dir_all(&self.base_dir).map_err(|e| io_at("Cannot create", &self.base_dir, e))?;
        let dir = self.base_dir.join(&id);
        fs::create_dir(&dir).map_err(|e| io_at("Cannot create", &dir, e))?;
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
            .map_err(|e| io_at("Cannot create", &path, e))?;
            stems.insert(name.to_string(), path.to_string_lossy().into_owned());
            writers.push((path, channels.to_vec(), writer));
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
                    for (path, channels, writer) in &mut writers {
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
                                .map_err(|e| io_at("Cannot write", path, e))?;
                        }
                    }
                    peak = peak.max(frame[0].abs()).max(frame[3].abs());
                    frames += 1;
                    if frames.is_multiple_of((rate as usize / 10).max(1)) {
                        peaks.push(peak);
                        peak = 0.0;
                    }
                    if frames - checkpoint >= rate as usize {
                        for (path, _, writer) in &mut writers {
                            writer.flush().map_err(|e| io_at("Cannot write", path, e))?;
                        }
                        checkpoint = frames;
                        // M1e: a crash mid-take still leaves take.json after 10 s.
                        if frames.is_multiple_of((rate as usize).saturating_mul(10).max(1)) {
                            meta.sample_count = frames;
                            meta.duration_secs = frames as f64 / rate as f64;
                            save_manifest(&meta)?;
                        }
                    }
                }
            }
            // Pad the shifted input so every exported stem retains a common duration.
            for (path, channels, writer) in &mut writers {
                if channels == &[0] {
                    for _ in 0..offset.min(frames) {
                        writer
                            .write_sample(0i32)
                            .map_err(|e| io_at("Cannot write", path, e))?;
                    }
                }
            }
            for (path, _, writer) in writers {
                writer
                    .finalize()
                    .map_err(|e| io_at("Cannot write", &path, e))?;
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
        self.take_dir = Some(dir);
        self.failure = None;
        self.midi.clear();
        self.frames_written = 0;
        Ok(id)
    }
    pub(crate) fn push_frames(
        &mut self,
        frames: Vec<Frame>,
        notes: Vec<crate::workstation::MidiNote>,
        clocks: &[crate::reference_timing::Clock],
    ) {
        if let Some(tx) = &self.sender {
            let count = frames.len() as u64;
            if let Err(e) = tx.try_send(frames) {
                let path = self
                    .take_dir
                    .as_ref()
                    .map_or_else(|| self.base_dir.clone(), PathBuf::clone);
                self.failure = Some(format!(
                    "Recording was interrupted. The disk writer stopped accepting audio ({e}). {}. Save the partial take; partial WAVs remain on disk.",
                    io_at("Cannot write", &path, "The disk is full.")
                ));
                self.sender = None;
            } else {
                let base = self.frames_written;
                self.midi.extend(notes.into_iter().map(|mut n| {
                    n.frame += base;
                    n
                }));
                self.frames_written += count;
                if let Some(timing) = &mut self.reference_timing {
                    let result = if clocks.len() as u64 != count {
                        timing.error = Some("Missing reference frame clocks.".into());
                        Err(timing.error.clone().unwrap())
                    } else {
                        timing.capture(base, clocks, self.sample_rate)
                    };
                    if let Err(error) = result {
                        self.interrupt(&error);
                    }
                }
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
        self.take_dir = None;
        let mut meta = writer
            .join()
            .map_err(|_| "Recording writer failed; partial WAVs kept")??;
        meta.midi = std::mem::take(&mut self.midi);
        if let Some(timing) = self.reference_timing.take() {
            meta.extra.insert(
                "referenceTiming".into(),
                serde_json::to_value(timing).map_err(|e| e.to_string())?,
            );
        }
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
    let bytes = serde_json::to_vec_pretty(meta).map_err(|e| e.to_string())?;
    // Never follow or overwrite a pre-existing temporary file/link.
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|e| format!("Cannot create {}. {e}", temp.display()))?;
    let dest = dir.join("take.json");
    let result = file.write_all(&bytes).and_then(|()| file.sync_all());
    drop(file);
    let result = result.and_then(|()| {
        // Windows rename does not replace an existing take.json.
        if dest.exists() {
            fs::remove_file(&dest)?;
        }
        fs::rename(&temp, &dest)
    });
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e| format!("Cannot save {}. {e}", dest.display()))
}

/// M1e: disk-full and permission errors name the path so the UI can fail loud.
fn io_at(action: &str, path: &Path, err: impl std::fmt::Display) -> String {
    let detail = err.to_string();
    let lower = detail.to_ascii_lowercase();
    let reason = if lower.contains("no space")
        || lower.contains("not enough space")
        || lower.contains("disk is full")
        || lower.contains("disk full")
    {
        Some("The disk is full.")
    } else if lower.contains("permission denied")
        || lower.contains("access is denied")
        || lower.contains("access denied")
    {
        Some("Permission denied.")
    } else {
        None
    };
    match reason {
        Some(reason) => format!("{action} {}. {reason}", path.display()),
        None => format!("{action} {}. {detail}", path.display()),
    }
}

/// Reads a WAV file back as mono f32 in -1..1 (channels are averaged), together with its
/// sample rate. Used by take analysis so it looks at what was actually recorded.
pub fn read_wav_mono(path: &Path) -> Result<(Vec<f32>, u32), String> {
    let mut reader =
        hound::WavReader::open(path).map_err(|e| format!("Cannot open {}. {e}", path.display()))?;
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
    fn manifest_write_never_overwrites_an_existing_temporary_link() {
        let root = std::env::temp_dir().join(format!("jam-manifest-link-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let victim = root.join("keep.txt");
        fs::write(&victim, b"keep this file").unwrap();
        fs::hard_link(&victim, root.join("take.json.tmp")).unwrap();
        let take = TakeMetadata {
            path_input: root.join("guitar-di.wav").to_string_lossy().into_owned(),
            ..Default::default()
        };
        assert!(save_manifest(&take)
            .unwrap_err()
            .starts_with("Cannot create "));
        assert_eq!(fs::read(&victim).unwrap(), b"keep this file");
        assert!(!root.join("take.json").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn disk_full_and_permission_errors_name_the_path() {
        let dir = Path::new("C:\\JosefinesJamstudio\\takes\\blocked");
        assert_eq!(
            io_at("Cannot write", dir, "There is not enough space on the disk."),
            format!("Cannot write {}. The disk is full.", dir.display())
        );
        assert_eq!(
            io_at("Cannot create", dir, "Access is denied. (os error 5)"),
            format!("Cannot create {}. Permission denied.", dir.display())
        );
    }

    #[test]
    fn permission_error_on_start_names_the_path() {
        let root = std::env::temp_dir().join(format!(
            "jam-recording-perm-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&root, b"not a directory").unwrap();
        let mut r = TakeRecorder::new(1000, root.clone());
        let err = r
            .start_take("song".into(), "rock".into(), "verse".into(), 100.0)
            .unwrap_err();
        assert!(
            err.contains(&root.to_string_lossy().as_ref()),
            "{err}"
        );
        assert!(
            err.starts_with("Cannot create "),
            "{err}"
        );
        let _ = fs::remove_file(root);
    }

    #[test]
    fn missing_wav_names_the_path() {
        let err = read_wav_mono(Path::new("no-such.wav")).unwrap_err();
        assert!(
            err.starts_with("Cannot open ") && err.contains("no-such.wav"),
            "{err}"
        );
    }

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
    fn recorded_impulse_and_click_align_within_one_sample_after_the_offset() {
        let root = std::env::temp_dir().join(format!("jam-align-{}", std::process::id()));
        let mut r = TakeRecorder::new(48_000, root.clone());
        let delay = 480usize;
        let click_at = 24_000usize;
        r.set_latency_compensation(delay);
        r.start_take("align".into(), "rock".into(), "verse".into(), 120.0)
            .unwrap();
        let mut frames = vec![[0.0f32; 9]; click_at + delay + 64];
        frames[click_at + delay][0] = 1.0;
        frames[click_at][5] = 1.0;
        frames[click_at][6] = 1.0;
        r.push_capture(&frames).unwrap();
        let t = r.stop_and_save().unwrap();
        let guitar = read_wav_mono(Path::new(&t.path_input)).unwrap().0;
        let drums = read_wav_mono(Path::new(&t.stems["drums"])).unwrap().0;
        let guitar_at = guitar.iter().position(|s| s.abs() > 0.5).unwrap();
        let click_pos = drums.iter().position(|s| s.abs() > 0.5).unwrap();
        assert!(
            guitar_at.abs_diff(click_pos) <= 1,
            "guitar {guitar_at} click {click_pos}"
        );
        assert_eq!(click_pos, click_at);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejected_audio_does_not_advance_the_recording() {
        let mut r = TakeRecorder::new(48_000, PathBuf::new());
        let (tx, _rx) = mpsc::sync_channel(1);
        r.sender = Some(tx);
        r.writer = Some(thread::spawn(|| Ok(TakeMetadata::default())));
        r.reference_timing = Some(
            serde_json::from_str(include_str!(
                "../../../tests/invariants/reference-timing.json"
            ))
            .unwrap(),
        );
        r.reference_timing.as_mut().unwrap().segments.clear();
        let clocks = [crate::reference_timing::Clock {
            position: 0.0,
            speed: 0.0,
        }; 4];
        let note = crate::workstation::MidiNote {
            frame: 1,
            bytes: [0x90, 60, 100],
        };
        r.push_frames(vec![[0.1; 9]; 4], vec![note.clone()], &clocks);
        assert_eq!(r.frames_written, 4);
        assert_eq!(r.midi.len(), 1);
        assert_eq!(r.midi[0].frame, 1);
        for _ in 0..3 {
            r.push_frames(vec![[0.1; 9]; 4], vec![note.clone()], &clocks);
            assert!(r.error().unwrap().contains("interrupted"));
            assert!(
                r.is_recording(),
                "partial take must still block close/device changes"
            );
            assert!(r.sender.is_none(), "capture stopped");
            assert_eq!(r.frames_written, 4, "rejected frames are not recorded");
            assert_eq!(r.midi.len(), 1, "no MIDI from rejected or later blocks");
            assert_eq!(r.reference_timing.as_ref().unwrap().segments.len(), 1);
        }
        r.writer.take().unwrap().join().unwrap().unwrap();
        assert!(r.error().is_none());
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
        r.take_dir = Some(root.join("take-full"));
        r.failure = Some(format!(
            "Recording was interrupted. The disk writer stopped accepting audio (full). {}. Save the partial take; partial WAVs remain on disk.",
            io_at("Cannot write", &root.join("take-full"), "The disk is full.")
        ));
        let t = r
            .stop_and_save()
            .expect("saved take stays visible after backpressure");
        assert!(t.notes.contains("interrupted"), "{}", t.notes);
        assert!(
            t.notes.contains(&root.join("take-full").to_string_lossy().as_ref()),
            "{}",
            t.notes
        );
        assert!(t.notes.contains("The disk is full."), "{}", t.notes);
        assert!(Path::new(&t.path_input)
            .parent()
            .unwrap()
            .join("take.json")
            .exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sixty_second_take_stems_match_length_to_the_sample() {
        let root = std::env::temp_dir().join(format!(
            "jam-recording-60s-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let rate = 48_000u32;
        let expected = (rate as usize).saturating_mul(60);
        // 10 ms guitar delay: the writer skips then pads so every stem stays 60 s.
        let offset = 480usize;
        let mut r = TakeRecorder::new(rate, root.clone());
        r.set_latency_compensation(offset);
        r.start_take("song".into(), "rock".into(), "verse".into(), 120.0)
            .unwrap();
        let block = vec![[0.1f32; 9]; 4_800];
        for _ in 0..(expected / block.len()) {
            r.push_capture(&block).unwrap();
        }
        let t = r.stop_and_save().unwrap();
        assert_eq!(t.sample_count, expected);
        assert!((t.duration_secs - 60.0).abs() < 1e-9);
        let mut lengths = Vec::new();
        for p in t.stems.values() {
            let reader = hound::WavReader::open(p).unwrap();
            assert_eq!(reader.spec().sample_rate, rate);
            lengths.push(reader.duration() as usize);
        }
        assert!(
            lengths.iter().all(|&n| n == expected),
            "stem lengths {lengths:?} expected {expected}"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn crash_after_ten_seconds_leaves_a_take_manifest() {
        let root = std::env::temp_dir().join(format!(
            "jam-recording-chk-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut r = TakeRecorder::new(10, root.clone());
        let id = r
            .start_take("song".into(), "rock".into(), "verse".into(), 100.0)
            .unwrap();
        let manifest = root.join(&id).join("take.json");
        assert!(!manifest.exists(), "no take.json before 10 seconds");
        r.push_capture(&vec![[0.1; 9]; 100]).unwrap();
        let started = std::time::Instant::now();
        while !manifest.exists() && started.elapsed() < std::time::Duration::from_secs(2) {
            thread::sleep(std::time::Duration::from_millis(5));
        }
        assert!(
            manifest.exists(),
            "take.json must exist after 10 recorded seconds"
        );
        let checkpoint: TakeMetadata =
            serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
        assert!(
            checkpoint.sample_count >= 100,
            "checkpoint samples {}",
            checkpoint.sample_count
        );
        assert!(
            checkpoint.duration_secs >= 10.0,
            "checkpoint duration {}",
            checkpoint.duration_secs
        );
        r.push_capture(&vec![[0.1; 9]; 100]).unwrap();
        let started = std::time::Instant::now();
        while started.elapsed() < std::time::Duration::from_secs(2) {
            if let Ok(bytes) = fs::read(&manifest) {
                if let Ok(next) = serde_json::from_slice::<TakeMetadata>(&bytes) {
                    if next.sample_count >= 200 {
                        break;
                    }
                }
            }
            thread::sleep(std::time::Duration::from_millis(5));
        }
        let second: TakeMetadata = serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
        assert!(
            second.sample_count >= 200,
            "second checkpoint samples {}",
            second.sample_count
        );
        std::mem::forget(r);
        assert!(
            manifest.exists(),
            "a crash after the checkpoint must leave take.json"
        );
        let _ = fs::remove_dir_all(root);
    }
}
