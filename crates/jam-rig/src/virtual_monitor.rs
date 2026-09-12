//! Developer virtual-MIDI monitor. Not a HeadRush or Black Spirit claim.
pub const NOT_CONFIGURED: &str = "Virtual MIDI monitor is not configured. Create a loopMIDI port named Jam Virtual (Windows) or enable the IAC Driver (macOS), set JAM_MIDI_VIRTUAL to that port name, and set JAM_LIVE=1. Headless CI uses JAM_MIDI_FIXTURE=1. This does not claim HeadRush or Black Spirit.";

pub const PROGRAMS: [u8; 2] = [3, 12];

pub fn is_virtual_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.contains("loopmidi") || n.contains("iac") || n.contains("jam virtual")
}

pub fn expected_bytes(channel_nibble: u8) -> Vec<Vec<u8>> {
    PROGRAMS
        .into_iter()
        .map(|program| vec![0xC0 | (channel_nibble & 0x0F), program])
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_loopmidi_and_iac_and_refuses_hardware_ids() {
        assert!(is_virtual_name("loopMIDI Port"));
        assert!(is_virtual_name("IAC Driver Bus 1"));
        assert!(is_virtual_name("Jam Virtual"));
        assert!(!is_virtual_name("HeadRush Pedalboard"));
        assert_eq!(expected_bytes(0), vec![vec![0xC0, 3], vec![0xC0, 12]]);
    }
}
