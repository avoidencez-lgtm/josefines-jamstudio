//! Decoded guitar clips shared by Play, Loop, Record, audition and export (issue
//! #44). Files stay the truth: an entry is keyed by path and checked against the
//! file's size and modification time on every use, so a re-recorded take never
//! plays stale audio. Memory is bounded; the oldest entries leave first.
use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    sync::Arc,
    time::SystemTime,
};

/// Reads a WAV file as mono samples at its own rate. Injected so tests count decodes.
pub type Decoder = Box<dyn Fn(&Path) -> Result<(Vec<f32>, u32), String> + Send>;

#[derive(Clone)]
pub struct DecodedClip {
    pub samples: Arc<Vec<f32>>,
    pub sample_rate: u32,
}

struct Entry {
    size: u64,
    modified: Option<SystemTime>,
    clip: DecodedClip,
}

pub struct ClipCache {
    entries: HashMap<PathBuf, Entry>,
    order: VecDeque<PathBuf>,
    bytes: usize,
    budget: usize,
    decode: Decoder,
}

impl ClipCache {
    /// Half a gigabyte holds a whole song's sixteen layers for typical takes; a
    /// ten-minute mono take at 48 kHz is 115 MB.
    pub const DEFAULT_BUDGET: usize = 512 * 1024 * 1024;

    pub fn new(budget: usize) -> Self {
        Self::with_decoder(budget, Box::new(decode_wav))
    }

    pub fn with_decoder(budget: usize, decode: Decoder) -> Self {
        Self {
            entries: HashMap::new(),
            order: VecDeque::new(),
            bytes: 0,
            budget,
            decode,
        }
    }

    /// The decoded clip for a file, reusing an entry whose size and mtime still match.
    pub fn load(&mut self, path: &Path) -> Result<DecodedClip, String> {
        let meta =
            std::fs::metadata(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
        let size = meta.len();
        let modified = meta.modified().ok();
        if let Some(entry) = self.entries.get(path) {
            if entry.size == size && entry.modified == modified {
                return Ok(entry.clip.clone());
            }
            self.forget(path);
        }
        let (samples, sample_rate) = (self.decode)(path)?;
        let clip = DecodedClip {
            samples: Arc::new(samples),
            sample_rate,
        };
        let cost = clip.samples.len() * std::mem::size_of::<f32>();
        while self.bytes + cost > self.budget {
            let Some(oldest) = self.order.pop_front() else {
                break;
            };
            if let Some(gone) = self.entries.remove(&oldest) {
                self.bytes -= gone.clip.samples.len() * std::mem::size_of::<f32>();
            }
        }
        // A clip larger than the whole budget is served but not kept.
        if cost <= self.budget {
            self.entries.insert(
                path.to_path_buf(),
                Entry {
                    size,
                    modified,
                    clip: clip.clone(),
                },
            );
            self.order.push_back(path.to_path_buf());
            self.bytes += cost;
        }
        Ok(clip)
    }

    fn forget(&mut self, path: &Path) {
        if let Some(gone) = self.entries.remove(path) {
            self.bytes -= gone.clip.samples.len() * std::mem::size_of::<f32>();
            self.order.retain(|p| p != path);
        }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn bytes(&self) -> usize {
        self.bytes
    }
}

fn decode_wav(path: &Path) -> Result<(Vec<f32>, u32), String> {
    let (samples, rate) = jam_audio::recorder::read_wav_mono(path)?;
    if rate == 0 || samples.iter().any(|s| !s.is_finite()) {
        return Err(format!("{} contains invalid samples.", path.display()));
    }
    Ok((samples, rate))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn reuses_decoded_audio_until_the_file_changes_and_stays_within_budget() {
        let dir = std::env::temp_dir().join(format!("jam-clip-cache-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = dir.join("a.wav");
        let b = dir.join("b.wav");
        std::fs::write(&a, [0u8; 8]).unwrap();
        std::fs::write(&b, [0u8; 8]).unwrap();
        let decodes = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&decodes);
        let mut cache = ClipCache::with_decoder(
            6 * std::mem::size_of::<f32>(),
            Box::new(move |p| {
                counter.fetch_add(1, Ordering::SeqCst);
                let frames = if p.ends_with("a.wav") { 4 } else { 3 };
                Ok((vec![0.5; frames], 48_000))
            }),
        );
        let first = cache.load(&a).unwrap();
        let again = cache.load(&a).unwrap();
        assert!(Arc::ptr_eq(&first.samples, &again.samples));
        assert_eq!(decodes.load(Ordering::SeqCst), 1);
        assert_eq!(first.sample_rate, 48_000);

        // The file changed on disk: the old audio is never played again.
        std::fs::write(&a, [0u8; 9]).unwrap();
        let changed = cache.load(&a).unwrap();
        assert!(!Arc::ptr_eq(&first.samples, &changed.samples));
        assert_eq!(decodes.load(Ordering::SeqCst), 2);

        // Budget of six floats: a (4) plus b (3) does not fit, so a leaves when b arrives.
        cache.load(&b).unwrap();
        assert_eq!(cache.len(), 1);
        assert_eq!(cache.bytes(), 3 * std::mem::size_of::<f32>());
        cache.load(&a).unwrap();
        assert_eq!(decodes.load(Ordering::SeqCst), 4);

        // Larger than the whole budget: served, not kept.
        let mut small = ClipCache::with_decoder(
            std::mem::size_of::<f32>(),
            Box::new(|_| Ok((vec![0.0; 10], 48_000))),
        );
        assert_eq!(small.load(&b).unwrap().samples.len(), 10);
        assert!(small.is_empty());
        assert!(cache.load(&dir.join("missing.wav")).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
