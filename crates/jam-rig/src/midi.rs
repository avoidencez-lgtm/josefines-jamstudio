//! midi: in-memory MIDI capture and Black Spirit message builders.

#[derive(Default, Debug, Clone)]
pub struct MemorySink {
    pub messages: Vec<Vec<u8>>,
}

impl MemorySink {
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
        }
    }

    pub fn send(&mut self, msg: &[u8]) {
        self.messages.push(msg.to_vec());
    }
}

pub struct BlackSpiritMidi;

impl BlackSpiritMidi {
    pub const CHANNEL: u8 = 0;

    pub fn program_change(preset: u8) -> [u8; 2] {
        [0xC0 | (Self::CHANNEL & 0x0F), preset & 0x7F]
    }

    pub fn control_change(controller: u8, value: u8) -> [u8; 3] {
        [
            0xB0 | (Self::CHANNEL & 0x0F),
            controller & 0x7F,
            value & 0x7F,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_sink_pc_and_cc() {
        let mut sink = MemorySink::new();
        sink.send(&BlackSpiritMidi::program_change(42));
        sink.send(&BlackSpiritMidi::control_change(12, 100));

        assert_eq!(sink.messages.len(), 2);
        assert_eq!(sink.messages[0], vec![0xC0, 42]);
        assert_eq!(sink.messages[1], vec![0xB0, 12, 100]);
    }
}
