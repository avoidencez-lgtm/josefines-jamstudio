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
type StemWriter = WavWriter<std::io::BufWriter<fs::File>>;

/// Stem files opened on the command thread, then installed under the recorder lock.
pub(crate) struct PreparedTake {
    id: String,
    writers: Vec<(Vec<usize>, StemWriter)>,
    meta: TakeMetadata,
    offset: usize,
    rate: u32,
}

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
        // Includes a failed capture whose writer still needs finalising.
        self.writer.is_some()
    }
    pub fn error(&self) -> Option<&str> {
        self.failure.as_deref().filter(|_| self.is_recording())
    }
    pub(crate) fn base_dir(&self) -> &Path {
        &self.base_dir
    }

    pub(crate) fn latency_offset_samples(&self) -> usize {
        self.latency_offset_samples
    }

    /// Opens the take directory and six WAV writers. Disk I/O only; call
    /// [`install_prepared`] under the recorder lock afterwards.
    pub(crate) fn prepare_take(
        &self,
        session_id: String,
        style_id: String,
        chart_id: String,
        tempo: f64,
    ) -> Result<PreparedTake, String> {
        if self.is_recording() {
            return Err("A take is already recording. Stop and save it first.".into());
        }
        prepare_take_files(
            &self.base_dir,
            self.sample_rate,
            self.latency_offset_samples,
            self.snapshot.clone(),
            (session_id, style_id, chart_id, tempo),
        )
    }

    pub(crate) fn install_prepared(&mut self, prepared: PreparedTake) -> Result<String, String> {
        if self.is_recording() {
            let dir = Path::new(&prepared.meta.path_input)
                .parent()
                .map(|p| p.to_path_buf());
            drop(prepared);
            if let Some(dir) = dir {
                let _ = fs::remove_dir_all(dir);
            }
            return Err("A take is already recording. Stop and save it first.".into());
        }
        let PreparedTake {
            id,
            mut writers,
            mut meta,
            offset,
            rate,
        } = prepared;
        // Keep enough queued audio for disk jitter; never block the render thread.
        let (tx, rx) = mpsc::sync_channel::<Vec<Frame>>(512);
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

    pub fn start_take(
        &mut self,
        session_id: String,
        style_id: String,
        chart_id: String,
        tempo: f64,
    ) -> Result<String, String> {
        let prepared = self.prepare_take(session_id, style_id, chart_id, tempo)?;
        self.install_prepared(prepared)
    }
    pub fn push_frames(&mut self, frames: Vec<Frame>, notes: Vec<crate::workstation::MidiNote>) {
        if let Some(tx) = &self.sender {
            let count = frames.len() as u64;
            if let Err(e) = tx.try_send(frames) {
                self.failure = Some(format!(
                    "Recording interrupted: the disk writer stopped accepting audio ({e}). Save the partial take; partial WAVs remain on disk."
                ));
                self.sender = None;
            } else {
                let base = self.frames_written;
                self.midi.extend(notes.into_iter().map(|mut n| {
                    n.frame += base;
                    n
                }));
                self.frames_written += count;
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
    /// Drops the sender and takes the writer handle. Join it *outside* the
    /// recorder mutex so the render thread can keep pushing (or see idle).
    pub(crate) fn take_writer(&mut self) -> Result<Writer, String> {
        self.sender.take();
        self.writer.take().ok_or("No active recording".into())
    }

    pub(crate) fn apply_stop_fields(&mut self, mut meta: TakeMetadata) -> TakeMetadata {
        meta.midi = std::mem::take(&mut self.midi);
        if let Some(e) = self.failure.take() {
            meta.notes = e;
        }
        meta
    }

    pub fn stop_and_save(&mut self) -> Result<TakeMetadata, String> {
        let writer = self.take_writer()?;
        let meta = writer
            .join()
            .map_err(|_| "Recording writer failed; partial WAVs kept")??;
        let meta = self.apply_stop_fields(meta);
        save_manifest(&meta)?;
        Ok(meta)
    }
}
pub(crate) fn prepare_take_files(
    base_dir: &Path,
    sample_rate: u32,
    offset: usize,
    snapshot: serde_json::Value,
    ids: (String, String, String, f64),
) -> Result<PreparedTake, String> {
    let (session_id, style_id, chart_id, tempo) = ids;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    let id = format!("take-{}", now.as_nanos());
    fs::create_dir_all(base_dir).map_err(|e| e.to_string())?;
    let dir = base_dir.join(&id);
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
                sample_rate,
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
        snapshot,
        sample_rate,
        ..Default::default()
    };
    meta.extra
        .insert("schemaVersion".into(), serde_json::json!(1));
    Ok(PreparedTake {
        id,
        writers,
        meta,
        offset,
        rate: sample_rate,
    })
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
        .map_err(|e| format!("Cannot create {}: {e}", temp.display()))?;
    let result = file.write_all(&bytes).and_then(|()| file.sync_all());
    drop(file);
    let result = result.and_then(|()| fs::rename(&temp, dir.join("take.json")));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e| format!("Cannot save {}: {e}", dir.join("take.json").display()))
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
        assert!(save_manifest(&take).unwrap_err().contains("Cannot create"));
        assert_eq!(fs::read(&victim).unwrap(), b"keep this file");
        assert!(!root.join("take.json").exists());
        fs::remove_dir_all(root).unwrap();
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
    fn rejected_audio_does_not_advance_the_recording() {
        let mut r = TakeRecorder::new(48_000, PathBuf::new());
        let (tx, _rx) = mpsc::sync_channel(1);
        r.sender = Some(tx);
        r.writer = Some(thread::spawn(|| Ok(TakeMetadata::default())));
        let note = crate::workstation::MidiNote {
            frame: 1,
            bytes: [0x90, 60, 100],
        };
        r.push_frames(vec![[0.1; 9]; 4], vec![note.clone()]);
        assert_eq!(r.frames_written, 4);
        assert_eq!(r.midi.len(), 1);
        assert_eq!(r.midi[0].frame, 1);
        for _ in 0..3 {
            r.push_frames(vec![[0.1; 9]; 4], vec![note.clone()]);
            assert!(r.error().unwrap().contains("interrupted"));
            assert!(
                r.is_recording(),
                "partial take must still block close/device changes"
            );
            assert!(r.sender.is_none(), "capture stopped");
            assert_eq!(r.frames_written, 4, "rejected frames are not recorded");
            assert_eq!(r.midi.len(), 1, "no MIDI from rejected or later blocks");
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

    #[test]
    fn stop_does_not_hold_the_recorder_mutex_while_the_writer_joins() {
        use std::sync::{mpsc as std_mpsc, Arc, Mutex};
        use std::time::{Duration, Instant};

        let mut rec = TakeRecorder::new(1000, PathBuf::new());
        let (tx, rx) = mpsc::sync_channel::<Vec<Frame>>(1);
        rec.sender = Some(tx);
        rec.writer = Some(thread::spawn(move || {
            thread::sleep(Duration::from_millis(150));
            drop(rx);
            Ok(TakeMetadata::default())
        }));
        let rec = Arc::new(Mutex::new(rec));
        let probe = Arc::clone(&rec);

        let started = Instant::now();
        let writer = rec.lock().unwrap().take_writer().unwrap();
        let held = started.elapsed();
        assert!(
            held < Duration::from_millis(50),
            "taking the writer joined the thread: {held:?}"
        );

        let (ready_tx, ready_rx) = std_mpsc::channel();
        thread::spawn(move || {
            let _g = probe.lock().unwrap();
            ready_tx.send(()).unwrap();
        });
        ready_rx
            .recv_timeout(Duration::from_millis(50))
            .expect("render thread would block if the lock were still held");

        writer.join().unwrap().unwrap();
        assert!(started.elapsed() >= Duration::from_millis(150));
    }
}
