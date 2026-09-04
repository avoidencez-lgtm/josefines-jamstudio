//! jam-rig: MIDI rig control. Profiles are data (`rigs/*.json`), the orchestrator maps
//! chart sections to scenes and talks to a real port through `midir`.

pub mod midi;
pub mod orchestrator;
pub mod profiles;

pub use midi::*;
pub use orchestrator::*;
pub use profiles::*;

use jam_core::registry::{SeamRegistry, BUNDLED_RIGS};

/// Every rig profile shipped with the app, validated. Errors name the file.
pub fn bundled_profiles() -> Result<Vec<RigProfile>, String> {
    let mut reg: SeamRegistry<RigProfile> = SeamRegistry::new();
    reg.load_from_dir(&BUNDLED_RIGS)?;
    let mut out = Vec::new();
    for p in reg.list() {
        p.validate()?;
        out.push(p.clone());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_rigs_load_and_validate() {
        let rigs = bundled_profiles().expect("rigs parse and validate");
        let ids: Vec<&str> = rigs.iter().map(|r| r.id.as_str()).collect();
        assert!(ids.contains(&"headrush-pedalboard"), "{ids:?}");
        assert!(ids.contains(&"black-spirit-200"), "{ids:?}");
    }

    #[test]
    fn black_spirit_listens_on_channel_two_and_has_gain() {
        let rigs = bundled_profiles().unwrap();
        let bs = rigs.iter().find(|r| r.id == "black-spirit-200").unwrap();
        assert_eq!(
            bs.midi_channel, 1,
            "Black Spirit is on MIDI channel 2 (HeadRush on 1)"
        );
        assert!(bs
            .controls
            .iter()
            .any(|c| c.cc == 20 && c.name.contains("Gain")));
        // The Lead scene recalls a preset first, then pushes gain.
        let lead = bs.scenes.iter().position(|s| s.name == "Lead").unwrap();
        let bytes = bs.scene_to_midi(lead);
        assert_eq!(
            bytes[0][0], 0xC1,
            "first message is a Program Change on ch2"
        );
        assert!(bytes.iter().any(|m| m[0] == 0xB1 && m[1] == 20));
    }

    #[test]
    fn headrush_scenes_are_program_changes_on_channel_one() {
        let rigs = bundled_profiles().unwrap();
        let hr = rigs.iter().find(|r| r.id == "headrush-pedalboard").unwrap();
        assert_eq!(hr.midi_channel, 0);
        assert!(hr.supports.midi_clock);
        assert_eq!(hr.scene_to_midi(1), vec![vec![0xC0, 1]]);
    }
}
