//! One explicitly opened MIDI input. The callback only filters presses into a bounded queue.
use midir::{Ignore, MidiInput, MidiInputConnection};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::mpsc};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PedalPress {
    pub kind: String,
    pub channel: u8,
    pub number: u8,
}

#[derive(Default)]
pub struct PressFilter {
    held: BTreeMap<(u8, u8, u8), bool>,
    last_program: Option<(u8, u8, u64)>,
}
impl PressFilter {
    pub fn receive(&mut self, time_us: u64, bytes: &[u8]) -> Option<PedalPress> {
        let (&status, data) = bytes.split_first()?;
        let channel = (status & 15) + 1;
        let kind = status & 0xf0;
        let (&number, rest) = data.split_first()?;
        if number > 127 {
            return None;
        }
        let name = match (kind, rest) {
            (0xc0, []) => {
                if self.last_program.is_some_and(|(ch, n, at)| {
                    ch == channel && n == number && time_us.saturating_sub(at) < 250_000
                }) {
                    return None;
                }
                self.last_program = Some((channel, number, time_us));
                "program"
            }
            (0xb0 | 0x90 | 0x80, [value]) if *value < 128 => {
                let group = if kind == 0xb0 { 0xb0 } else { 0x90 };
                let down = if kind == 0xb0 {
                    *value >= 64
                } else {
                    kind == 0x90 && *value > 0
                };
                let was_down = self
                    .held
                    .insert((group, channel, number), down)
                    .unwrap_or(false);
                if !down || was_down {
                    return None;
                }
                if group == 0xb0 {
                    "cc"
                } else {
                    "note"
                }
            }
            _ => return None,
        };
        Some(PedalPress {
            kind: name.into(),
            channel,
            number,
        })
    }
}

pub struct ControllerInput {
    _connection: MidiInputConnection<()>,
    receiver: mpsc::Receiver<PedalPress>,
}
impl ControllerInput {
    pub fn ports() -> Result<Vec<String>, String> {
        let input = MidiInput::new("Jamstudio foot controls").map_err(|e| e.to_string())?;
        input
            .ports()
            .iter()
            .map(|p| input.port_name(p).map_err(|e| e.to_string()))
            .collect()
    }
    pub fn open(name: &str) -> Result<Self, String> {
        let mut input = MidiInput::new("Jamstudio foot controls").map_err(|e| e.to_string())?;
        input.ignore(Ignore::None);
        let port = input
            .ports()
            .into_iter()
            .find(|p| input.port_name(p).ok().as_deref() == Some(name))
            .ok_or("MIDI input disappeared. Rescan and choose the port again.")?;
        let (sender, receiver) = mpsc::sync_channel(32);
        let mut filter = PressFilter::default();
        let connection = input
            .connect(
                &port,
                "jamstudio-foot-control",
                move |time, bytes, _| {
                    if let Some(press) = filter.receive(time, bytes) {
                        // ponytail: 32 queued presses cover human use; drop excess MIDI feedback bursts.
                        let _ = sender.try_send(press);
                    }
                },
                (),
            )
            .map_err(|e| e.to_string())?;
        Ok(Self {
            _connection: connection,
            receiver,
        })
    }
    pub fn drain(&self) -> Vec<PedalPress> {
        self.receiver.try_iter().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_presses_fire_and_channels_and_programs_are_preserved() {
        let mut f = PressFilter::default();
        assert!(f.receive(0, &[0xf8]).is_none());
        assert!(f.receive(0, &[0xb0, 64, 0]).is_none());
        assert_eq!(f.receive(1, &[0xb1, 64, 127]).unwrap().channel, 2);
        assert!(f.receive(2, &[0xb1, 64, 127]).is_none());
        assert!(f.receive(3, &[0xb1, 64, 0]).is_none());
        assert!(f.receive(4, &[0xb1, 64, 127]).is_some());
        assert!(f.receive(5, &[0x90, 60, 90]).is_some());
        assert!(f.receive(6, &[0x80, 60, 0]).is_none());
        assert!(f.receive(7, &[0x90, 60, 90]).is_some());
        assert_eq!(f.receive(8, &[0xc0, 12]).unwrap().number, 12);
        assert!(f.receive(9, &[0xc0, 12]).is_none());
        assert!(f.receive(300_000, &[0xc0, 12]).is_some());
        assert!(f.receive(400_000, &[0xc0, 255]).is_none());
    }
}
