//! instruments: sine-voice bass and comp (named Sf2Synth for the planned SoundFont path).

use jam_core::timeline::SAMPLE_RATE;

#[derive(Clone)]
struct SynthVoice {
    channel: u8,
    key: u8,
    phase: f32,
    phase_inc: f32,
    velocity: f32,
    age_samples: usize,
    decay_samples: usize,
    is_bass: bool,
}

pub struct Sf2Synth {
    sample_rate: u32,
    voices: Vec<SynthVoice>,
    max_polyphony: usize,
}

impl Default for Sf2Synth {
    fn default() -> Self {
        Self::new(SAMPLE_RATE)
    }
}

impl Sf2Synth {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            voices: Vec::with_capacity(32),
            max_polyphony: 32,
        }
    }

    pub fn note_on(&mut self, channel: u8, key: u8, velocity: f32) {
        let is_bass = channel == 0; // channel 0 = bass, channel 1 = comp
        let freq = 440.0 * 2.0f32.powf((key as f32 - 69.0) / 12.0);
        let phase_inc = freq / self.sample_rate as f32;

        let decay_sec = if is_bass { 0.8 } else { 1.2 };
        let decay_samples = (self.sample_rate as f32 * decay_sec) as usize;

        // Stop any existing voice with the same channel and key
        self.voices
            .retain(|v| !(v.channel == channel && v.key == key));

        if self.voices.len() >= self.max_polyphony {
            self.voices.remove(0); // Oldest voice stealing
        }

        self.voices.push(SynthVoice {
            channel,
            key,
            phase: 0.0,
            phase_inc,
            velocity: velocity.clamp(0.0, 1.0),
            age_samples: 0,
            decay_samples,
            is_bass,
        });
    }

    pub fn note_off(&mut self, channel: u8, key: u8) {
        for v in self.voices.iter_mut() {
            if v.channel == channel && v.key == key {
                // Accelerate decay
                v.decay_samples = v.age_samples + (self.sample_rate as f32 * 0.05) as usize;
            }
        }
    }

    pub fn all_notes_off(&mut self) {
        self.voices.clear();
    }

    /// Voices whose note-off has not been requested yet.
    pub fn sustaining_voices(&self, channel: u8) -> usize {
        let short_release = (self.sample_rate as f32 * 0.05) as usize;
        self.voices
            .iter()
            .filter(|v| v.channel == channel && v.decay_samples > v.age_samples + short_release)
            .count()
    }

    pub fn render(&mut self, left: &mut [f32], right: &mut [f32]) {
        self.render_channel(0, left, right);
        self.render_channel(1, left, right);
    }

    pub fn render_channel(&mut self, channel: u8, left: &mut [f32], right: &mut [f32]) {
        let frames = left.len().min(right.len());

        for v in self.voices.iter_mut().filter(|v| v.channel == channel) {
            let start_age = v.age_samples;
            let end_age = start_age + frames;

            if start_age >= v.decay_samples {
                continue;
            }

            for i in 0..frames {
                let current_age = start_age + i;
                if current_age >= v.decay_samples {
                    break;
                }

                let t = current_age as f32 / self.sample_rate as f32;
                let env = (-4.0 * t).exp() * v.velocity;

                let sample = if v.is_bass {
                    // Warm electric bass: Fundamental + gentle 2nd harmonic + lowpass
                    let s1 = (v.phase * 2.0 * std::f32::consts::PI).sin();
                    let s2 = (v.phase * 4.0 * std::f32::consts::PI).sin() * 0.35;
                    (s1 + s2) * env * 0.7
                } else {
                    // Clean comping piano/guitar: Warm bell-like harmonics
                    let s1 = (v.phase * 2.0 * std::f32::consts::PI).sin();
                    let s2 = (v.phase * 6.0 * std::f32::consts::PI).sin() * 0.2;
                    let s3 = (v.phase * 8.0 * std::f32::consts::PI).sin() * 0.1;
                    (s1 + s2 + s3) * env * 0.4
                };

                v.phase = (v.phase + v.phase_inc) % 1.0;

                left[i] += sample;
                right[i] += sample;
            }

            v.age_samples = end_age;
        }

        self.voices.retain(|v| v.age_samples < v.decay_samples);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sf2_synth_bass_and_comp_render() {
        let mut synth = Sf2Synth::new(48_000);

        // Bass note A1 (MIDI 33)
        synth.note_on(0, 33, 0.9);

        // Comp chord A7: A3 (57), C#4 (61), G4 (67)
        synth.note_on(1, 57, 0.7);
        synth.note_on(1, 61, 0.7);
        synth.note_on(1, 67, 0.7);

        let mut left = vec![0.0f32; 512];
        let mut right = vec![0.0f32; 512];
        synth.render(&mut left, &mut right);

        assert!(left.iter().any(|&s| s.abs() > 0.05));
        assert!(right.iter().any(|&s| s.abs() > 0.05));
    }
}
