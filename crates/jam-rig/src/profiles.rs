//! profiles: data-driven rig profiles. A profile describes one piece of hardware
//! (HeadRush Pedalboard, Black Spirit 200, Quad Cortex, ...) as JSON under `rigs/`:
//! which MIDI channel it listens on, which Program Change numbers mean what, which
//! Control Change numbers drive which knobs, and the *scenes* the guitarist switches
//! between. A scene is a short script of MIDI commands (PC, CC, wait), so one scene
//! can change the HeadRush rig and set amp gain in a single footswitch-free move.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
pub enum ModelerKind {
    HeadRush,
    BlackSpirit,
    QuadCortex,
    Helix,
    Kemper,
    AxeFx,
    #[default]
    Generic,
}

/// One MIDI action inside a scene. `wait` exists because some amps (the Black Spirit
/// among them) want a short pause between a Program Change and the CCs that follow.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RigCommand {
    ProgramChange {
        program: u8,
    },
    ControlChange {
        cc: u8,
        value: u8,
    },
    /// Pause before the next command, in milliseconds (clamped to 500 ms).
    Wait {
        ms: u32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub name: String,
    /// Empty means "use the profile's default scene mechanism": `sceneCc` with the
    /// scene index as value when set, otherwise a Program Change with the index.
    #[serde(default)]
    pub commands: Vec<RigCommand>,
}

impl Scene {
    pub fn named(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            commands: Vec::new(),
        }
    }
}

/// A named Program Change slot (a HeadRush rig, a Black Spirit preset).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Program {
    pub number: u8,
    pub name: String,
}

/// A real-time controllable parameter (a knob the app can turn over CC).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Control {
    pub cc: u8,
    pub name: String,
    #[serde(default)]
    pub min: u8,
    #[serde(default = "default_max")]
    pub max: u8,
    #[serde(default)]
    pub default: u8,
    /// True for on/off switches (value 0 = off, >= 64 = on).
    #[serde(default)]
    pub toggle: bool,
}

fn default_max() -> u8 {
    127
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Supports {
    #[serde(default = "yes")]
    pub program_change: bool,
    #[serde(default = "yes")]
    pub control_change: bool,
    #[serde(default)]
    pub midi_clock: bool,
}

fn yes() -> bool {
    true
}

impl Default for Supports {
    fn default() -> Self {
        Self {
            program_change: true,
            control_change: true,
            midi_clock: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RigProfile {
    #[serde(default = "one")]
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    /// Free text describing the physical unit (what the OS or the manual calls it).
    #[serde(default, alias = "target_device")]
    pub target_device: String,
    #[serde(default)]
    pub kind: ModelerKind,
    /// 0-based MIDI channel (0 = channel 1 on the front panel).
    #[serde(default)]
    pub midi_channel: u8,
    /// CC number that selects scenes/snapshots on modelers that work that way
    /// (Quad Cortex 43, Helix 69, Axe-Fx III 34). `None` = Program Change.
    #[serde(default)]
    pub scene_cc: Option<u8>,
    #[serde(default)]
    pub programs: Vec<Program>,
    #[serde(default)]
    pub controls: Vec<Control>,
    #[serde(default)]
    pub scenes: Vec<Scene>,
    #[serde(default)]
    pub supports: Supports,
    /// Setup hints shown in the Rig screen ("set Omni Off, channel 2").
    #[serde(default)]
    pub notes: Option<String>,
}

fn one() -> u32 {
    1
}

impl RigProfile {
    /// A channel-1 profile with eight Program Change scenes; the fallback when no
    /// rig JSON is available.
    pub fn generic() -> Self {
        Self {
            schema_version: 1,
            id: "generic".into(),
            name: "Generic MIDI device".into(),
            target_device: "Any MIDI device".into(),
            kind: ModelerKind::Generic,
            midi_channel: 0,
            scene_cc: None,
            programs: Vec::new(),
            controls: Vec::new(),
            scenes: (1..=8)
                .map(|i| Scene::named(format!("Program {i}")))
                .collect(),
            supports: Supports::default(),
            notes: None,
        }
    }

    pub fn channel_nibble(&self) -> u8 {
        self.midi_channel & 0x0F
    }

    pub fn program_change(&self, program: u8) -> Vec<u8> {
        vec![0xC0 | self.channel_nibble(), program & 0x7F]
    }

    pub fn control_change(&self, cc: u8, value: u8) -> Vec<u8> {
        vec![0xB0 | self.channel_nibble(), cc & 0x7F, value & 0x7F]
    }

    /// Clamps a value into a control's declared range, or passes it through when the
    /// CC is not declared (a hand-typed CC is still allowed).
    pub fn clamp_control(&self, cc: u8, value: u8) -> u8 {
        match self.controls.iter().find(|c| c.cc == cc) {
            Some(c) => value.clamp(c.min, c.max).min(127),
            None => value.min(127),
        }
    }

    /// The commands that select a scene, with the profile defaults filled in for
    /// scenes that do not spell out their own.
    pub fn scene_commands(&self, scene_idx: usize) -> Result<Vec<RigCommand>, String> {
        let scene = self
            .scenes
            .get(scene_idx)
            .ok_or_else(|| format!("scene {scene_idx} does not exist on {}", self.name))?;
        if !scene.commands.is_empty() {
            return Ok(scene.commands.clone());
        }
        let idx = u8::try_from(scene_idx).map_err(|_| "scene index above 127".to_string())?;
        Ok(match self.scene_cc {
            Some(cc) => vec![RigCommand::ControlChange { cc, value: idx }],
            None => vec![RigCommand::ProgramChange { program: idx }],
        })
    }

    /// Renders a command list to MIDI bytes, keeping `Wait`s as `None` gaps so the
    /// caller decides how to pause (sleep in production, ignore in tests).
    pub fn render(&self, commands: &[RigCommand]) -> Vec<Rendered> {
        commands
            .iter()
            .map(|c| match c {
                RigCommand::ProgramChange { program } => {
                    Rendered::Bytes(self.program_change(*program))
                }
                RigCommand::ControlChange { cc, value } => {
                    Rendered::Bytes(self.control_change(*cc, self.clamp_control(*cc, *value)))
                }
                RigCommand::Wait { ms } => Rendered::Wait((*ms).min(500)),
            })
            .collect()
    }

    /// Only the bytes of a scene (no waits), for tests and monitors.
    pub fn scene_to_midi(&self, scene_idx: usize) -> Vec<Vec<u8>> {
        let cmds = self.scene_commands(scene_idx).unwrap_or_default();
        self.render(&cmds)
            .into_iter()
            .filter_map(|r| match r {
                Rendered::Bytes(b) => Some(b),
                Rendered::Wait(_) => None,
            })
            .collect()
    }

    /// Structural checks so a hand-edited JSON fails at load time, not on stage.
    pub fn validate(&self) -> Result<(), String> {
        if self.id.trim().is_empty() {
            return Err("rig id is empty".into());
        }
        if self.midi_channel > 15 {
            return Err(format!(
                "{}: midiChannel {} is above 15",
                self.id, self.midi_channel
            ));
        }
        if let Some(cc) = self.scene_cc {
            if cc > 127 {
                return Err(format!("{}: sceneCc {cc} is above 127", self.id));
            }
        }
        for c in &self.controls {
            if c.cc > 127 || c.max > 127 || c.min > c.max {
                return Err(format!(
                    "{}: control \"{}\" has an invalid range (cc {}, {}..{})",
                    self.id, c.name, c.cc, c.min, c.max
                ));
            }
            if c.default < c.min || c.default > c.max {
                return Err(format!(
                    "{}: control \"{}\" default {} is outside {}..{}",
                    self.id, c.name, c.default, c.min, c.max
                ));
            }
        }
        for p in &self.programs {
            if p.number > 127 {
                return Err(format!("{}: program \"{}\" is above 127", self.id, p.name));
            }
        }
        if self.scenes.is_empty() {
            return Err(format!("{}: a rig needs at least one scene", self.id));
        }
        if self.scenes.len() > 128 {
            return Err(format!("{}: more than 128 scenes", self.id));
        }
        for (i, s) in self.scenes.iter().enumerate() {
            for cmd in &s.commands {
                match cmd {
                    RigCommand::ProgramChange { program } if *program > 127 => {
                        return Err(format!("{}: scene {i} program above 127", self.id));
                    }
                    RigCommand::ControlChange { cc, value } if *cc > 127 || *value > 127 => {
                        return Err(format!("{}: scene {i} CC out of range", self.id));
                    }
                    _ => {}
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rendered {
    Bytes(Vec<u8>),
    Wait(u32),
}

impl jam_core::registry::VersionedManifest for RigProfile {
    fn schema_version(&self) -> u32 {
        self.schema_version
    }
    fn id(&self) -> &str {
        &self.id
    }
    fn name(&self) -> &str {
        &self.name
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quad_cortex_like() -> RigProfile {
        RigProfile {
            scene_cc: Some(43),
            scenes: (b'A'..=b'H')
                .map(|c| Scene::named(format!("Scene {}", c as char)))
                .collect(),
            ..RigProfile::generic()
        }
    }

    #[test]
    fn default_scene_uses_scene_cc_when_declared() {
        let p = quad_cortex_like();
        assert_eq!(p.scene_to_midi(2), vec![vec![0xB0, 43, 2]]);
    }

    #[test]
    fn default_scene_falls_back_to_program_change() {
        let p = RigProfile {
            midi_channel: 1,
            ..RigProfile::generic()
        };
        assert_eq!(p.scene_to_midi(5), vec![vec![0xC1, 5]]);
    }

    #[test]
    fn explicit_scene_commands_render_in_order_and_clamp() {
        let p = RigProfile {
            midi_channel: 1,
            controls: vec![Control {
                cc: 20,
                name: "Gain".into(),
                min: 0,
                max: 100,
                default: 50,
                toggle: false,
            }],
            scenes: vec![Scene {
                name: "Lead".into(),
                commands: vec![
                    RigCommand::ProgramChange { program: 7 },
                    RigCommand::Wait { ms: 20 },
                    RigCommand::ControlChange { cc: 20, value: 127 },
                ],
            }],
            ..RigProfile::generic()
        };
        let r = p.render(&p.scene_commands(0).unwrap());
        assert_eq!(
            r,
            vec![
                Rendered::Bytes(vec![0xC1, 7]),
                Rendered::Wait(20),
                Rendered::Bytes(vec![0xB1, 20, 100]),
            ]
        );
    }

    #[test]
    fn validate_catches_bad_ranges() {
        let mut p = RigProfile::generic();
        p.midi_channel = 16;
        assert!(p.validate().unwrap_err().contains("midiChannel"));
        let mut p = RigProfile::generic();
        p.scenes.clear();
        assert!(p.validate().unwrap_err().contains("at least one scene"));
    }

    #[test]
    fn json_round_trip_keeps_commands() {
        let p = quad_cortex_like();
        let json = serde_json::to_string(&p).unwrap();
        let back: RigProfile = serde_json::from_str(&json).unwrap();
        assert_eq!(p, back);
    }
}
