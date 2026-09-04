//! midi: MIDI sinks. `MemorySink` records what would have been sent (tests, monitor,
//! and the state before a port is chosen); `MidirSink` writes to a real output port.

use midir::{MidiOutput, MidiOutputConnection};
use serde::{Deserialize, Serialize};

const CLIENT_NAME: &str = "Josefines Jamstudio";

pub trait MidiSink: Send {
    fn send(&mut self, msg: &[u8]) -> Result<(), String>;
    /// Human-readable target ("not connected", "Roland UM-ONE"), shown in the UI.
    fn describe(&self) -> String;
    /// True when bytes leave the computer.
    fn is_live(&self) -> bool;
}

/// MemorySink: in-memory MIDI sink for testing and for when no port is open.
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
}

impl MidiSink for MemorySink {
    fn send(&mut self, msg: &[u8]) -> Result<(), String> {
        self.messages.push(msg.to_vec());
        Ok(())
    }
    fn describe(&self) -> String {
        "no MIDI port open (messages are only logged)".into()
    }
    fn is_live(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MidiPortInfo {
    pub name: String,
}

/// Output ports the OS exposes right now. An error here means the MIDI subsystem
/// itself is unavailable (not merely that nothing is plugged in).
pub fn list_output_ports() -> Result<Vec<MidiPortInfo>, String> {
    let out = MidiOutput::new(CLIENT_NAME).map_err(|e| format!("MIDI output unavailable: {e}"))?;
    let mut ports = Vec::new();
    for p in out.ports() {
        let name = out
            .port_name(&p)
            .unwrap_or_else(|_| "(unnamed port)".to_string());
        ports.push(MidiPortInfo { name });
    }
    Ok(ports)
}

/// MidirSink: a connection to one real output port.
pub struct MidirSink {
    port_name: String,
    conn: MidiOutputConnection,
}

impl MidirSink {
    /// Opens the port whose name matches exactly, or, failing that, the first port
    /// whose name contains `name` (OS port names carry suffixes that change between
    /// boots on some systems).
    pub fn open(name: &str) -> Result<Self, String> {
        let out =
            MidiOutput::new(CLIENT_NAME).map_err(|e| format!("MIDI output unavailable: {e}"))?;
        let ports = out.ports();
        let named: Vec<(String, midir::MidiOutputPort)> = ports
            .into_iter()
            .map(|p| (out.port_name(&p).unwrap_or_default(), p))
            .collect();
        let chosen = named
            .iter()
            .find(|(n, _)| n == name)
            .or_else(|| named.iter().find(|(n, _)| n.contains(name)))
            .ok_or_else(|| {
                let available: Vec<&str> = named.iter().map(|(n, _)| n.as_str()).collect();
                format!(
                    "MIDI port \"{name}\" not found. Available: {}",
                    if available.is_empty() {
                        "none".to_string()
                    } else {
                        available.join(", ")
                    }
                )
            })?;
        let port_name = chosen.0.clone();
        let conn = out
            .connect(&chosen.1, "jamstudio-rig")
            .map_err(|e| format!("could not open MIDI port \"{port_name}\": {e}"))?;
        Ok(Self { port_name, conn })
    }

    pub fn port_name(&self) -> &str {
        &self.port_name
    }
}

impl MidiSink for MidirSink {
    fn send(&mut self, msg: &[u8]) -> Result<(), String> {
        self.conn
            .send(msg)
            .map_err(|e| format!("MIDI send to \"{}\" failed: {e}", self.port_name))
    }
    fn describe(&self) -> String {
        self.port_name.clone()
    }
    fn is_live(&self) -> bool {
        true
    }
}

/// Decodes a channel-voice message for the monitor ("PC 12 ch2", "CC 20 = 64 ch2").
pub fn describe_message(msg: &[u8]) -> String {
    match msg {
        [status, data @ ..] => {
            let ch = (status & 0x0F) + 1;
            match (status & 0xF0, data) {
                (0xC0, [p]) => format!("PC {p} ch{ch}"),
                (0xB0, [cc, v]) => format!("CC {cc} = {v} ch{ch}"),
                (0x90, [n, v]) => format!("Note On {n} vel {v} ch{ch}"),
                (0x80, [n, v]) => format!("Note Off {n} vel {v} ch{ch}"),
                _ => msg
                    .iter()
                    .map(|b| format!("{b:02X}"))
                    .collect::<Vec<_>>()
                    .join(" "),
            }
        }
        [] => "(empty)".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_sink_records_pc_and_cc() {
        let mut sink = MemorySink::new();
        sink.send(&[0xC0, 42]).unwrap();
        sink.send(&[0xB1, 12, 100]).unwrap();
        assert_eq!(sink.messages, vec![vec![0xC0, 42], vec![0xB1, 12, 100]]);
        assert!(!sink.is_live());
    }

    #[test]
    fn describes_messages_for_humans() {
        assert_eq!(describe_message(&[0xC1, 7]), "PC 7 ch2");
        assert_eq!(describe_message(&[0xB0, 20, 64]), "CC 20 = 64 ch1");
        assert_eq!(describe_message(&[0xF8]), "F8");
    }

    #[test]
    fn opening_a_missing_port_reports_the_available_ones() {
        // Whatever the machine has, this name will not be on it.
        let err = match MidirSink::open("definitely-not-a-real-port-9f3a") {
            Ok(_) => panic!("opened a port that should not exist"),
            Err(e) => e,
        };
        assert!(
            err.contains("not found") || err.contains("unavailable"),
            "{err}"
        );
    }
}
