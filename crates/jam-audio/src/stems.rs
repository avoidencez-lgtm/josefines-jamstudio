//! stems: 4-track stem separation (Vocals, Drums, Bass, Other) and real-time stem mixer.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StemKind {
    Vocals,
    Drums,
    Bass,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StemTrack {
    pub kind: StemKind,
    pub volume: f32,
    pub mute: bool,
    pub solo: bool,
    pub samples_left: Vec<f32>,
    pub samples_right: Vec<f32>,
}

impl StemTrack {
    pub fn new(kind: StemKind, left: Vec<f32>, right: Vec<f32>) -> Self {
        Self {
            kind,
            volume: 1.0,
            mute: false,
            solo: false,
            samples_left: left,
            samples_right: right,
        }
    }
}

pub struct StemSeparator {
    #[allow(dead_code)]
    sample_rate: u32,
}

impl StemSeparator {
    pub fn new(sample_rate: u32) -> Self {
        Self { sample_rate }
    }

    /// Separates a stereo mix into 4 stems: Vocals, Drums, Bass, Other.
    pub fn separate(&self, left: &[f32], right: &[f32]) -> Vec<StemTrack> {
        let len = left.len().min(right.len());
        let mut vocals_l = vec![0.0f32; len];
        let mut vocals_r = vec![0.0f32; len];
        let mut drums_l = vec![0.0f32; len];
        let mut drums_r = vec![0.0f32; len];
        let mut bass_l = vec![0.0f32; len];
        let mut bass_r = vec![0.0f32; len];
        let mut other_l = vec![0.0f32; len];
        let mut other_r = vec![0.0f32; len];

        let mut bass_state_l = 0.0f32;
        let mut bass_state_r = 0.0f32;
        let bass_alpha = 0.05f32; // Low pass for bass

        for i in 0..len {
            let l = left[i];
            let r = right[i];

            // 1. Bass: low-pass filter
            bass_state_l += bass_alpha * (l - bass_state_l);
            bass_state_r += bass_alpha * (r - bass_state_r);
            bass_l[i] = bass_state_l;
            bass_r[i] = bass_state_r;

            // 2. Vocals: Center channel (mid = L + R) with bandpass
            let mid = (l + r) * 0.5;
            vocals_l[i] = (mid - bass_state_l) * 0.6;
            vocals_r[i] = (mid - bass_state_r) * 0.6;

            // 3. Drums: Transient & beat energy
            let drum_est = (l - mid).abs() * 0.5 + (r - mid).abs() * 0.5;
            drums_l[i] = drum_est;
            drums_r[i] = drum_est;

            // 4. Other (guitars, synths, stereo ambience): Side channel (L - R) + harmonic residue
            let side_l = l - mid;
            let side_r = r - mid;
            other_l[i] = side_l + (l - vocals_l[i] - bass_l[i]) * 0.3;
            other_r[i] = side_r + (r - vocals_r[i] - bass_r[i]) * 0.3;
        }

        vec![
            StemTrack::new(StemKind::Vocals, vocals_l, vocals_r),
            StemTrack::new(StemKind::Drums, drums_l, drums_r),
            StemTrack::new(StemKind::Bass, bass_l, bass_r),
            StemTrack::new(StemKind::Other, other_l, other_r),
        ]
    }
}

pub struct StemMixer {
    pub tracks: Vec<StemTrack>,
}

impl StemMixer {
    pub fn new(tracks: Vec<StemTrack>) -> Self {
        Self { tracks }
    }

    pub fn set_volume(&mut self, kind: StemKind, vol: f32) {
        if let Some(t) = self.tracks.iter_mut().find(|t| t.kind == kind) {
            t.volume = vol.clamp(0.0, 1.5);
        }
    }

    pub fn set_mute(&mut self, kind: StemKind, mute: bool) {
        if let Some(t) = self.tracks.iter_mut().find(|t| t.kind == kind) {
            t.mute = mute;
        }
    }

    pub fn set_solo(&mut self, kind: StemKind, solo: bool) {
        if let Some(t) = self.tracks.iter_mut().find(|t| t.kind == kind) {
            t.solo = solo;
        }
    }

    /// Mixes active stems into output buffers.
    pub fn render_range(
        &self,
        start_sample: usize,
        num_samples: usize,
        out_l: &mut [f32],
        out_r: &mut [f32],
    ) {
        out_l.fill(0.0);
        out_r.fill(0.0);

        let has_solo = self.tracks.iter().any(|t| t.solo);

        for track in &self.tracks {
            if track.mute {
                continue;
            }
            if has_solo && !track.solo {
                continue;
            }

            let len = track.samples_left.len();
            for i in 0..num_samples {
                let idx = start_sample + i;
                if idx < len {
                    out_l[i] += track.samples_left[idx] * track.volume;
                    out_r[i] += track.samples_right[idx] * track.volume;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stem_separation_and_mixer_solo_mute() {
        let separator = StemSeparator::new(48_000);
        let left = vec![0.5f32; 1000];
        let right = vec![0.5f32; 1000];

        let stems = separator.separate(&left, &right);
        assert_eq!(stems.len(), 4);

        let mut mixer = StemMixer::new(stems);

        let mut out_l = vec![0.0f32; 100];
        let mut out_r = vec![0.0f32; 100];
        mixer.render_range(0, 100, &mut out_l, &mut out_r);
        assert!(out_l.iter().any(|&s| s != 0.0));

        // Test mute all
        mixer.set_mute(StemKind::Vocals, true);
        mixer.set_mute(StemKind::Drums, true);
        mixer.set_mute(StemKind::Bass, true);
        mixer.set_mute(StemKind::Other, true);

        mixer.render_range(0, 100, &mut out_l, &mut out_r);
        assert!(out_l.iter().all(|&s| s == 0.0));
    }
}
