//! Bounded disk recording. WAV headers checkpoint every second; manifests are truth.
use crate::analysis::TakeAnalyzer;
use crate::workstation::Frame;
use hound::{WavSpec, WavWriter};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::{Seek, Write},
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
    pub(crate) reference_timing: Option<crate::reference_timing::ReferenceTiming>,
    /// Take-relative sample where each loop pass began. Pass 1 is always 0.
    pub(crate) pass_starts: Vec<u64>,
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
            reference_timing: None,
            pass_starts: Vec::new(),
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
            let mut write_error = None;
            'recording: for block in rx {
                for frame in block {
                    if frame.iter().any(|v| !v.is_finite()) {
                        write_error = Some("Non-finite audio.".into());
                        break 'recording;
                    }
                    for (channels, writer) in &mut writers {
                        if channels == &[0] && frames < offset {
                            continue;
                        }
                        for &ch in channels.iter() {
                            let v = frame[ch];
                            if let Err(e) =
                                writer.write_sample((v.clamp(-1.0, 1.0) * 8_388_607.0) as i32)
                            {
                                write_error = Some(e.to_string());
                                break 'recording;
                            }
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
                            if let Err(e) = writer.flush() {
                                write_error = Some(e.to_string());
                                break 'recording;
                            }
                        }
                        checkpoint = frames;
                    }
                }
            }
            // Pad the shifted input so every exported stem retains a common duration.
            for (channels, writer) in writers {
                let padding = if channels == [0] {
                    offset.min(frames)
                } else {
                    0
                };
                finish_writer(writer, padding, &mut write_error);
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
            if let Some(e) = write_error {
                meta.notes =
                    format!("Recording was interrupted. {e} Partial WAVs were kept for recovery.");
            }
            Ok(meta)
        });
        self.sender = Some(tx);
        self.writer = Some(writer);
        self.failure = None;
        self.midi.clear();
        self.frames_written = 0;
        self.pass_starts = vec![0];
        Ok(id)
    }

    /// First audio before a wrap is pass 1. Each wrap starts the next pass.
    pub(crate) fn note_loop_wrap(&mut self, at_sample: u64) {
        if self.is_recording() {
            record_loop_pass(&mut self.pass_starts, at_sample);
        }
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
                self.failure = Some(format!(
                    "Recording was interrupted. The disk writer stopped accepting audio ({e}). Save the partial take; partial WAVs remain on disk."
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
        let mut meta = writer
            .join()
            .map_err(|_| "Recording writer failed; partial WAVs kept")??;
        meta.midi = std::mem::take(&mut self.midi);
        persist_loop_passes(&mut meta.extra, &self.pass_starts);
        split_and_analyze_loop_passes(&mut meta, &self.pass_starts)?;
        if let Some(timing) = self.reference_timing.take() {
            meta.extra.insert(
                "referenceTiming".into(),
                serde_json::to_value(timing).map_err(|e| e.to_string())?,
            );
        }
        if let Some(e) = self.failure.take() {
            meta.notes = if meta.notes.is_empty() {
                e
            } else {
                format!("{} {e}", meta.notes)
            };
        }
        save_manifest(&meta)?;
        // Return the saved partial take too, so Sessions can list it (#92, #368).
        Ok(meta)
    }
}

/// Finish every stem even after capture, padding or header/flush errors. The
/// first error survives into the manifest instead of skipping metadata recovery.
fn finish_writer<W: Write + Seek>(
    mut writer: WavWriter<W>,
    padding: usize,
    error: &mut Option<String>,
) {
    if error.is_none() {
        for _ in 0..padding {
            if let Err(e) = writer.write_sample(0i32) {
                *error = Some(e.to_string());
                break;
            }
        }
    }
    if let Err(e) = writer.finalize() {
        error.get_or_insert_with(|| e.to_string());
    }
}

impl Drop for TakeRecorder {
    fn drop(&mut self) {
        if self.is_recording() {
            let _ = self.stop_and_save();
        }
    }
}
/// First pass starts at sample 0. Each wrap appends the take sample of the wrap.
pub(crate) fn record_loop_pass(starts: &mut Vec<u64>, at_sample: u64) {
    if starts.is_empty() {
        starts.push(0);
    }
    if starts.last().is_some_and(|&last| at_sample > last) {
        starts.push(at_sample);
    }
}

fn persist_loop_passes(extra: &mut BTreeMap<String, serde_json::Value>, starts: &[u64]) {
    let starts = if starts.is_empty() { &[0] } else { starts };
    extra.insert("passes".into(), serde_json::json!(starts.len() as u64));
    extra.insert("passStarts".into(), serde_json::json!(starts));
}

/// Split the guitar DI at loop-pass sample boundaries and analyse each pass.
/// Only runs when there are at least two pass starts. Unknown extra fields stay.
fn split_and_analyze_loop_passes(meta: &mut TakeMetadata, starts: &[u64]) -> Result<(), String> {
    if starts.len() < 2 {
        return Ok(());
    }
    let src = Path::new(&meta.path_input);
    let dir = src.parent().ok_or("Take directory missing")?;
    fs::create_dir_all(dir.join("passes"))
        .map_err(|e| format!("Cannot create the passes folder. {e}"))?;
    let total = meta.sample_count as u64;
    let mut files = Vec::new();
    let mut analyses = Vec::new();
    for (i, start) in starts.iter().copied().enumerate() {
        let end = starts.get(i + 1).copied().unwrap_or(total);
        let n = i + 1;
        let rel = format!("passes/pass-{n}.wav");
        let dest = dir.join(&rel);
        let frames = write_wav_range(src, &dest, start, end)?;
        files.push(rel);
        analyses.push(analyze_pass_wav(&dest, meta.tempo, frames)?);
    }
    meta.extra
        .insert("passFiles".into(), serde_json::json!(files));
    meta.extra
        .insert("passAnalysis".into(), serde_json::json!(analyses));
    Ok(())
}

fn analyze_pass_wav(path: &Path, tempo: f64, frames: u64) -> Result<serde_json::Value, String> {
    let rate_hint = wav_sample_rate(path).unwrap_or(1).max(1);
    if frames == 0 {
        let mut fields = serde_json::to_value(TakeAnalyzer::new(rate_hint).analyze(&[], tempo))
            .map_err(|e| e.to_string())?;
        stamp_pass_analysis(&mut fields, rate_hint, 0, tempo);
        return Ok(fields);
    }
    let (samples, rate) = read_wav_mono(path)?;
    let mut fields = serde_json::to_value(TakeAnalyzer::new(rate).analyze(&samples, tempo))
        .map_err(|e| e.to_string())?;
    stamp_pass_analysis(&mut fields, rate, samples.len(), tempo);
    Ok(fields)
}

fn stamp_pass_analysis(fields: &mut serde_json::Value, rate: u32, samples: usize, tempo: f64) {
    let Some(obj) = fields.as_object_mut() else {
        return;
    };
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    obj.entry("schemaVersion".to_string())
        .or_insert(serde_json::json!(1));
    obj.entry("analyzerVersion".to_string())
        .or_insert(serde_json::json!(2));
    obj.insert("analyzedAtMs".into(), serde_json::json!(at));
    obj.insert("sourceSampleRate".into(), serde_json::json!(rate));
    obj.insert("sourceSampleCount".into(), serde_json::json!(samples));
    obj.insert("sourceTempo".into(), serde_json::json!(tempo));
}

fn write_wav_range(src: &Path, dest: &Path, start: u64, end: u64) -> Result<u64, String> {
    let reader =
        hound::WavReader::open(src).map_err(|e| format!("Cannot open {}. {e}", src.display()))?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as u64;
    let total_frames = u64::from(reader.duration());
    drop(reader);
    let start = start.min(total_frames);
    let end = end.min(total_frames).max(start);
    let frames = end - start;
    let start_sample = start * channels;
    let sample_count = frames * channels;
    match spec.sample_format {
        hound::SampleFormat::Float => {
            write_sample_range::<f32>(src, dest, spec, start_sample, sample_count)?;
        }
        hound::SampleFormat::Int if spec.bits_per_sample <= 16 => {
            write_sample_range::<i16>(src, dest, spec, start_sample, sample_count)?;
        }
        hound::SampleFormat::Int => {
            write_sample_range::<i32>(src, dest, spec, start_sample, sample_count)?;
        }
    }
    Ok(frames)
}

fn write_sample_range<S: hound::Sample + Copy>(
    src: &Path,
    dest: &Path,
    spec: WavSpec,
    start: u64,
    count: u64,
) -> Result<(), String> {
    let mut reader =
        hound::WavReader::open(src).map_err(|e| format!("Cannot open {}. {e}", src.display()))?;
    let samples: Vec<S> = reader
        .samples::<S>()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let start = (start as usize).min(samples.len());
    let end = (start + count as usize).min(samples.len());
    let mut writer = WavWriter::create(dest, spec)
        .map_err(|e| format!("Cannot create {}. {e}", dest.display()))?;
    for &s in &samples[start..end] {
        writer.write_sample(s).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(())
}

fn pass_file_path(
    take: &TakeMetadata,
    dest_root: &Path,
    pass_index: u32,
) -> Result<PathBuf, String> {
    let files = take
        .extra
        .get("passFiles")
        .and_then(|v| v.as_array())
        .filter(|files| !files.is_empty())
        .ok_or_else(|| "This take has no loop passes to keep.".to_string())?;
    if pass_index == 0 || pass_index as usize > files.len() {
        return Err(format!(
            "Pass {pass_index} is not in this take. Choose a pass from 1 to {}.",
            files.len()
        ));
    }
    let rel = files[(pass_index as usize) - 1]
        .as_str()
        .ok_or_else(|| "Pass file path is missing.".to_string())?;
    let rel_path = Path::new(rel);
    if rel_path.is_absolute()
        || rel_path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Pass file is not inside the take directory.".into());
    }
    let take_dir = dest_root.join(&take.id);
    let src = take_dir.join(rel_path);
    let take_dir = take_dir
        .canonicalize()
        .map_err(|e| format!("Cannot open the take folder. {e}"))?;
    let src = src
        .canonicalize()
        .map_err(|e| format!("Cannot open the pass file. {e}"))?;
    if !src.starts_with(&take_dir) {
        return Err("Pass file is not inside the take directory.".into());
    }
    Ok(src)
}

fn write_silence(path: &Path, rate: u32, channels: u16, frames: usize) -> Result<(), String> {
    let mut writer = WavWriter::create(
        path,
        WavSpec {
            channels,
            sample_rate: rate.max(1),
            bits_per_sample: 24,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .map_err(|e| format!("Cannot create {}. {e}", path.display()))?;
    let n = frames.saturating_mul(channels.max(1) as usize);
    for _ in 0..n {
        writer.write_sample(0i32).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(())
}

/// Copy one numbered loop pass into a new take in the same session. Never renames the source.
pub fn keep_loop_pass(
    source: &TakeMetadata,
    pass_index: u32,
    dest_root: &Path,
) -> Result<TakeMetadata, String> {
    let src_wav = pass_file_path(source, dest_root, pass_index)?;
    let reader =
        hound::WavReader::open(&src_wav).map_err(|e| format!("Cannot open the pass file. {e}"))?;
    let spec = reader.spec();
    let frames = reader.duration() as usize;
    drop(reader);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    let id = format!("take-{}", now.as_nanos());
    fs::create_dir_all(dest_root).map_err(|e| e.to_string())?;
    let dir = dest_root.join(&id);
    fs::create_dir(&dir).map_err(|e| e.to_string())?;
    let dest_input = dir.join("guitar-di.wav");
    fs::copy(&src_wav, &dest_input)
        .map_err(|e| format!("Cannot copy the pass into the new take. {e}"))?;
    let layout: [(&str, u16); 5] = [
        ("band", 2),
        ("master", 2),
        ("drums", 2),
        ("bass", 1),
        ("comp", 1),
    ];
    let mut stems = BTreeMap::new();
    stems.insert(
        "guitar-di".into(),
        dest_input.to_string_lossy().into_owned(),
    );
    for (name, channels) in layout {
        let path = dir.join(format!("{name}.wav"));
        write_silence(&path, spec.sample_rate, channels, frames)?;
        stems.insert(name.to_string(), path.to_string_lossy().into_owned());
    }
    let mut take = TakeMetadata {
        id,
        session_id: source.session_id.clone(),
        timestamp: format!("{}.{:03}", now.as_secs(), now.subsec_millis()),
        duration_secs: frames as f64 / spec.sample_rate.max(1) as f64,
        style_id: source.style_id.clone(),
        chart_id: source.chart_id.clone(),
        tempo: source.tempo,
        sample_count: frames,
        path_input: stems["guitar-di"].clone(),
        path_band: stems["band"].clone(),
        path_master: stems["master"].clone(),
        notes: format!("Pass {pass_index} kept from {}.", source.id),
        stems,
        snapshot: serde_json::json!({
            "keptPass": { "takeId": source.id, "passIndex": pass_index }
        }),
        sample_rate: spec.sample_rate,
        ..Default::default()
    };
    take.extra
        .insert("schemaVersion".into(), serde_json::json!(1));
    take.extra.insert(
        "label".into(),
        serde_json::json!(format!("Pass {pass_index} of {}", source.id)),
    );
    save_manifest(&take)?;
    Ok(take)
}

pub fn save_manifest(meta: &TakeMetadata) -> Result<(), String> {
    let dir = Path::new(&meta.path_input)
        .parent()
        .ok_or("Take directory missing")?;
    let dest = dir.join("take.json");
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp = dir.join(format!("take.json.tmp.{}.{}", std::process::id(), nanos));
    let bytes = serde_json::to_vec_pretty(meta).map_err(|e| e.to_string())?;
    // Unique suffix so a leftover take.json.tmp cannot lock out later saves.
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|e| format!("Cannot create {}. {e}", temp.display()))?;
    let result = file.write_all(&bytes).and_then(|()| file.sync_all());
    drop(file);
    let result = result.and_then(|()| fs::rename(&temp, &dest));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e| format!("Cannot save {}. {e}", dest.display()))
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
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    #[derive(Default)]
    struct FaultWriter {
        bytes: std::io::Cursor<Vec<u8>>,
        fail_writes: std::sync::Arc<AtomicBool>,
        fail_flush: bool,
        flushes: std::sync::Arc<AtomicUsize>,
    }
    impl Write for FaultWriter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if self.fail_writes.load(Ordering::Relaxed) {
                return Err(std::io::Error::other("synthetic disk write failure"));
            }
            self.bytes.write(bytes)
        }
        fn flush(&mut self) -> std::io::Result<()> {
            self.flushes.fetch_add(1, Ordering::Relaxed);
            if self.fail_flush {
                return Err(std::io::Error::other("synthetic disk flush failure"));
            }
            Ok(())
        }
    }
    impl Seek for FaultWriter {
        fn seek(&mut self, pos: std::io::SeekFrom) -> std::io::Result<u64> {
            self.bytes.seek(pos)
        }
    }

    #[test]
    fn loop_pass_starts_at_zero_and_appends_each_wrap() {
        let mut starts = Vec::new();
        record_loop_pass(&mut starts, 0);
        assert_eq!(starts, [0]);
        record_loop_pass(&mut starts, 48_000);
        record_loop_pass(&mut starts, 48_000);
        record_loop_pass(&mut starts, 24_000);
        record_loop_pass(&mut starts, 96_000);
        assert_eq!(starts, [0, 48_000, 96_000]);
        let mut extra = BTreeMap::new();
        extra.insert("futureField".into(), serde_json::json!({"keep": true}));
        persist_loop_passes(&mut extra, &starts);
        assert_eq!(extra["passes"], serde_json::json!(3));
        assert_eq!(extra["passStarts"], serde_json::json!([0, 48_000, 96_000]));
        assert_eq!(extra["futureField"], serde_json::json!({"keep": true}));
    }

    #[test]
    fn stop_writes_loop_pass_boundaries_into_take_extra() {
        let root = std::env::temp_dir().join(format!(
            "jam-loop-pass-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut r = TakeRecorder::new(48_000, root.clone());
        r.start_take("song".into(), "rock".into(), "verse".into(), 120.0)
            .unwrap();
        r.note_loop_wrap(48_000);
        r.note_loop_wrap(96_000);
        r.push_capture(&vec![[0.0; 9]; 8]).unwrap();
        let take = r.stop_and_save().unwrap();
        assert_eq!(take.extra["passes"], serde_json::json!(3));
        assert_eq!(
            take.extra["passStarts"],
            serde_json::json!([0, 48_000, 96_000])
        );
        let files = take.extra["passFiles"].as_array().unwrap();
        assert_eq!(files.len(), 3);
        assert_eq!(take.extra["passAnalysis"].as_array().unwrap().len(), 3);
        let dir = Path::new(&take.path_input).parent().unwrap();
        let disk: serde_json::Value =
            serde_json::from_slice(&fs::read(dir.join("take.json")).unwrap()).unwrap();
        assert_eq!(disk["passes"], 3);
        assert_eq!(disk["passStarts"], serde_json::json!([0, 48_000, 96_000]));
        assert_eq!(disk["passFiles"], take.extra["passFiles"]);
        assert_eq!(disk["schemaVersion"], 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn stop_splits_guitar_passes_and_keep_copies_the_chosen_pass() {
        let root = std::env::temp_dir().join(format!(
            "jam-loop-pass-split-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut r = TakeRecorder::new(48_000, root.clone());
        r.start_take("song".into(), "rock".into(), "verse".into(), 120.0)
            .unwrap();
        r.note_loop_wrap(30);
        r.note_loop_wrap(60);
        let mut frames = vec![[0.0f32; 9]; 90];
        for frame in frames.iter_mut().take(30) {
            frame[0] = 0.1;
        }
        for frame in frames.iter_mut().skip(30).take(30) {
            frame[0] = 0.2;
        }
        for frame in frames.iter_mut().skip(60) {
            frame[0] = 0.3;
        }
        r.push_capture(&frames).unwrap();
        let take = r.stop_and_save().unwrap();
        let starts: Vec<u64> = take.extra["passStarts"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_u64().unwrap())
            .collect();
        assert_eq!(starts, [0, 30, 60]);
        let files = take.extra["passFiles"].as_array().unwrap();
        assert_eq!(files.len(), starts.len());
        let dir = Path::new(&take.path_input).parent().unwrap();
        for (i, file) in files.iter().enumerate() {
            let path = dir.join(file.as_str().unwrap());
            assert!(path.is_file(), "{}", path.display());
            let (samples, _) = read_wav_mono(&path).unwrap();
            let end = starts
                .get(i + 1)
                .copied()
                .unwrap_or(take.sample_count as u64);
            assert_eq!(
                samples.len() as u64,
                end - starts[i],
                "pass {} length; starts={starts:?}",
                i + 1
            );
        }
        assert_eq!(
            take.extra["passAnalysis"].as_array().unwrap().len(),
            starts.len()
        );
        let pass2 = dir.join(files[1].as_str().unwrap());
        let kept = keep_loop_pass(&take, 2, &root).unwrap();
        assert_ne!(kept.id, take.id);
        assert_eq!(kept.session_id, take.session_id);
        assert_eq!(
            fs::read(&kept.path_input).unwrap(),
            fs::read(&pass2).unwrap()
        );
        assert_eq!(kept.notes, format!("Pass 2 kept from {}.", take.id));
        assert_eq!(
            kept.extra.get("label"),
            Some(&serde_json::json!(format!("Pass 2 of {}", take.id)))
        );
        assert_eq!(dir.file_name().unwrap().to_string_lossy(), take.id.as_str());
        let err = keep_loop_pass(&take, 0, &root).unwrap_err();
        assert!(
            err.starts_with("Pass 0 is not in this take.") && err.contains("1 to 3"),
            "{err}"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn padding_header_and_flush_errors_survive_while_other_stems_are_finalized() {
        let spec = WavSpec {
            channels: 1,
            sample_rate: 48_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        for (padding, fail_writes, fail_flush, prior) in [
            (1, true, false, None),
            (0, true, false, None),
            (0, false, true, None),
            (1, true, true, Some("capture failed")),
        ] {
            let bad = FaultWriter {
                fail_flush,
                ..Default::default()
            };
            let fail = bad.fail_writes.clone();
            let writer = WavWriter::new(bad, spec).unwrap();
            fail.store(fail_writes, Ordering::Relaxed);
            let good = FaultWriter::default();
            let flushes = good.flushes.clone();
            let other = WavWriter::new(good, spec).unwrap();
            let mut error = prior.map(str::to_owned);
            finish_writer(writer, padding, &mut error);
            let expected = prior.unwrap_or(if fail_writes {
                "synthetic disk write failure"
            } else {
                "synthetic disk flush failure"
            });
            assert!(
                error.as_ref().is_some_and(|e| e.contains(expected)),
                "{error:?}"
            );
            finish_writer(other, 0, &mut error);
            assert_eq!(flushes.load(Ordering::Relaxed), 1);
            assert!(error.unwrap().contains(expected));
        }
    }

    #[test]
    fn manifest_write_never_overwrites_an_existing_temporary_link() {
        let root = std::env::temp_dir().join(format!("jam-manifest-link-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let victim = root.join("keep.txt");
        fs::write(&victim, b"keep this file").unwrap();
        fs::hard_link(&victim, root.join("take.json.tmp")).unwrap();
        let take = TakeMetadata {
            path_input: root.join("guitar-di.wav").to_string_lossy().into_owned(),
            id: "take-stale".into(),
            ..Default::default()
        };
        save_manifest(&take).expect("stale take.json.tmp must not lock out later saves");
        assert_eq!(fs::read(&victim).unwrap(), b"keep this file");
        assert!(root.join("take.json").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn writer_error_still_writes_take_json_with_notes() {
        let root = std::env::temp_dir().join(format!(
            "jam-recording-nan-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut r = TakeRecorder::new(1000, root.clone());
        r.start_take("song".into(), "rock".into(), "verse".into(), 100.0)
            .unwrap();
        r.push_capture(&[[f32::NAN; 9]; 1]).unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        while !r.writer.as_ref().unwrap().is_finished() {
            assert!(
                std::time::Instant::now() < deadline,
                "failed writer must stop accepting audio before Save"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        r.push_frames(vec![[0.1; 9]], vec![], &[]);
        assert!(r.error().unwrap().contains("interrupted"));
        let t = r
            .stop_and_save()
            .expect("partial take stays listed after a writer error");
        assert!(
            t.notes.contains("finite") || t.notes.contains("Non-finite"),
            "{}",
            t.notes
        );
        assert!(
            t.notes.contains("interrupted"),
            "the UI must warn that this take is partial"
        );
        assert!(Path::new(&t.path_input)
            .parent()
            .unwrap()
            .join("take.json")
            .exists());
        let _ = fs::remove_dir_all(root);
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
        r.failure =
            Some("Recording was interrupted by disk backpressure. The disk is full. Partial WAVs were kept.".into());
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
