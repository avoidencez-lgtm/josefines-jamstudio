//! orchestrator: turns "the song is in the Chorus now" into MIDI on a real port,
//! keeps a monitor log of what was sent, and lets the UI turn amp knobs by CC.

use crate::midi::{describe_message, MemorySink, MidiSink, MidirSink};
use crate::profiles::{Rendered, RigCommand, RigProfile};
use crate::scheduler::{MidiScheduler, CLOCK, CONTINUE, START, STOP};
use jam_core::timeline::{beats_to_samples, samples_to_beats};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

const MONITOR_CAPACITY: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SentMessage {
    /// Milliseconds since the orchestrator was created.
    pub at_ms: u64,
    pub bytes: Vec<u8>,
    pub text: String,
    /// What triggered it ("scene Lead", "section Chorus", "knob Gain", "manual").
    pub reason: String,
    pub live: bool,
}

pub struct RigOrchestrator {
    pub profile: RigProfile,
    sink: Box<dyn MidiSink>,
    pub section_mappings: HashMap<String, usize>,
    /// Temporary song-owned mappings; never persisted as the global Rig setup.
    pub song_mappings: Option<HashMap<String, usize>>,
    pub current_scene: usize,
    /// Last known value per CC, so the UI can show knob positions.
    pub control_values: HashMap<u8, u8>,
    /// Chart sections drive scene changes only when this is on.
    pub follow_sections: bool,
    /// When true, transport clock bytes (start/stop/continue/ticks) are sent.
    pub send_clock: bool,
    /// Log to the monitor without writing the sink (MemorySink tests still see monitor).
    pub dry_run: bool,
    monitor: VecDeque<SentMessage>,
    started: Instant,
    last_section: Option<String>,
    last_sent_scene: Option<usize>,
    scheduler: MidiScheduler,
    clock_running: bool,
    clock_paused: bool,
    next_pulse: u64,
}

impl RigOrchestrator {
    pub fn new(profile: RigProfile, sink: Box<dyn MidiSink>) -> Self {
        let mut me = Self {
            profile,
            sink,
            section_mappings: HashMap::new(),
            song_mappings: None,
            current_scene: 0,
            control_values: HashMap::new(),
            follow_sections: true,
            send_clock: false,
            dry_run: false,
            monitor: VecDeque::with_capacity(MONITOR_CAPACITY),
            started: Instant::now(),
            last_section: None,
            last_sent_scene: None,
            scheduler: MidiScheduler::new(48_000),
            clock_running: false,
            clock_paused: false,
            next_pulse: 0,
        };
        me.reset_controls();
        me
    }

    pub fn with_memory_sink(profile: RigProfile) -> Self {
        Self::new(profile, Box::new(MemorySink::new()))
    }

    fn reset_controls(&mut self) {
        self.control_values = self
            .profile
            .controls
            .iter()
            .map(|c| (c.cc, c.default))
            .collect();
    }

    /// Swaps hardware profile; mappings are kept only if they still point at an
    /// existing scene.
    pub fn set_profile(&mut self, profile: RigProfile) {
        self.song_mappings = None;
        let n = profile.scenes.len();
        self.section_mappings.retain(|_, idx| *idx < n);
        self.profile = profile;
        self.current_scene = 0;
        self.last_sent_scene = None;
        self.last_section = None;
        self.reset_controls();
    }

    /// Opens a real output port. On failure the previous sink stays in place.
    pub fn open_port(&mut self, name: &str) -> Result<String, String> {
        let sink = MidirSink::open(name)?;
        let desc = sink.describe();
        self.set_sink(Box::new(sink));
        Ok(desc)
    }

    /// Back to logging only.
    pub fn close_port(&mut self) {
        self.set_sink(Box::new(MemorySink::new()));
    }

    /// Installs a prepared connection after its settings have been saved.
    pub fn set_sink(&mut self, sink: Box<dyn MidiSink>) {
        self.sink = sink;
    }

    pub fn port_description(&self) -> String {
        self.sink.describe()
    }

    pub fn is_live(&self) -> bool {
        self.sink.is_live()
    }

    pub fn monitor(&self) -> Vec<SentMessage> {
        self.monitor.iter().cloned().collect()
    }

    pub fn clear_monitor(&mut self) {
        self.monitor.clear();
    }

    /// Suppress MIDI returned through the rig's Thru path after this app sent it.
    pub fn is_recent_echo(&self, press: &crate::controller::PedalPress) -> bool {
        let now = self.started.elapsed().as_millis() as u64;
        let kind = match press.kind.as_str() {
            "program" => 0xc0,
            "cc" => 0xb0,
            "note" => 0x90,
            _ => return false,
        };
        self.monitor
            .iter()
            .rev()
            .take_while(|m| now.saturating_sub(m.at_ms) <= 500)
            .any(|m| {
                m.live
                    && m.bytes.len() >= 2
                    && m.bytes[0] == kind | (press.channel - 1)
                    && m.bytes[1] == press.number
            })
    }

    pub fn set_section_mapping(&mut self, section: String, scene_idx: usize) {
        self.section_mappings.insert(section, scene_idx);
    }

    pub fn clear_section_mapping(&mut self, section: &str) {
        self.section_mappings.remove(section);
    }

    fn send_bytes(&mut self, bytes: Vec<u8>, reason: &str) -> Result<(), String> {
        if !self.dry_run {
            self.sink.send(&bytes)?;
        }
        if self.monitor.len() == MONITOR_CAPACITY {
            self.monitor.pop_front();
        }
        self.monitor.push_back(SentMessage {
            at_ms: self.started.elapsed().as_millis() as u64,
            text: describe_message(&bytes),
            bytes,
            reason: reason.to_string(),
            live: self.sink.is_live(),
        });
        Ok(())
    }

    fn run_commands(&mut self, commands: &[RigCommand], reason: &str) -> Result<(), String> {
        for step in self.profile.render(commands) {
            match step {
                Rendered::Bytes(b) => {
                    if b.len() == 3 && b[0] & 0xF0 == 0xB0 {
                        self.control_values.insert(b[1], b[2]);
                    }
                    self.send_bytes(b, reason)?;
                }
                // Only ever a few tens of ms and never on the audio thread.
                Rendered::Wait(ms) if self.sink.is_live() => {
                    std::thread::sleep(Duration::from_millis(u64::from(ms)));
                }
                Rendered::Wait(_) => {}
            }
        }
        Ok(())
    }

    pub fn select_scene(&mut self, scene_idx: usize) -> Result<(), String> {
        let commands = self.profile.scene_commands(scene_idx)?;
        let reason = format!("scene {}", self.profile.scenes[scene_idx].name);
        self.run_commands(&commands, &reason)?;
        self.current_scene = scene_idx;
        self.last_sent_scene = Some(scene_idx);
        Ok(())
    }

    /// Sends a Program Change directly (a HeadRush rig or an amp preset by number).
    pub fn send_program(&mut self, program: u8) -> Result<(), String> {
        if program > 127 {
            return Err(format!("program {program} is above 127"));
        }
        let name = self
            .profile
            .programs
            .iter()
            .find(|p| p.number == program)
            .map(|p| p.name.clone())
            .unwrap_or_else(|| format!("program {program}"));
        self.run_commands(
            &[RigCommand::ProgramChange { program }],
            &format!("manual {name}"),
        )?;
        self.last_sent_scene = None;
        Ok(())
    }

    /// Turns a knob: clamps to the declared range and remembers the value.
    pub fn set_control(&mut self, cc: u8, value: u8) -> Result<u8, String> {
        if cc > 127 {
            return Err(format!("CC {cc} is above 127"));
        }
        let v = self.profile.clamp_control(cc, value);
        let name = self
            .profile
            .controls
            .iter()
            .find(|c| c.cc == cc)
            .map(|c| c.name.clone())
            .unwrap_or_else(|| format!("CC {cc}"));
        self.run_commands(
            &[RigCommand::ControlChange { cc, value: v }],
            &format!("knob {name}"),
        )?;
        Ok(v)
    }

    /// Called from the telemetry loop with the band's current section name. Fires a
    /// scene change once per section entry, never twice for the same section.
    pub fn on_section_change(&mut self, section: &str) -> Result<Option<usize>, String> {
        if self.last_section.as_deref() == Some(section) {
            return Ok(None);
        }
        self.last_section = Some(section.to_string());
        if !self.follow_sections {
            return Ok(None);
        }
        let mappings = self
            .song_mappings
            .as_ref()
            .unwrap_or(&self.section_mappings);
        let Some(&scene_idx) = mappings.get(section) else {
            return Ok(None);
        };
        if self.last_sent_scene == Some(scene_idx) {
            // Already on that scene: do not re-send (a PC re-sent to some amps
            // causes an audible gap).
            return Ok(None);
        }
        let commands = self.profile.scene_commands(scene_idx)?;
        let reason = format!(
            "section {section} -> {}",
            self.profile.scenes[scene_idx].name
        );
        self.run_commands(&commands, &reason)?;
        self.current_scene = scene_idx;
        self.last_sent_scene = Some(scene_idx);
        Ok(Some(scene_idx))
    }

    /// Forget the last section, so the next `on_section_change` fires even if the
    /// song restarts in the same section.
    pub fn reset_section_tracking(&mut self) {
        self.last_section = None;
        self.last_sent_scene = None;
    }

    pub fn set_clock(&mut self, on: bool) {
        if self.send_clock && !on && (self.clock_running || self.clock_paused) {
            let _ = self.send_bytes(vec![STOP], "clock");
            self.clock_running = false;
            self.clock_paused = false;
            self.scheduler.clear();
        }
        self.send_clock = on;
    }

    pub fn set_dry_run(&mut self, on: bool) {
        self.dry_run = on;
    }

    /// Transport clock byte when `send_clock` is on.
    pub fn send_clock_byte(&mut self, status: u8) -> Result<bool, String> {
        if !self.send_clock {
            return Ok(false);
        }
        self.send_bytes(vec![status], "clock")?;
        Ok(true)
    }

    pub fn on_transport_play(&mut self, now_sample: u64, bpm: f64) -> Result<(), String> {
        if !self.send_clock {
            return Ok(());
        }
        let resume = self.clock_paused;
        let status = if resume { CONTINUE } else { START };
        self.clock_paused = false;
        self.clock_running = true;
        self.send_clock_byte(status)?;
        let beats = samples_to_beats(now_sample, bpm, 48_000);
        self.next_pulse = (beats * f64::from(crate::PPQN)).ceil() as u64;
        if resume && bpm > 0.0 {
            while Self::pulse_sample(self.next_pulse, bpm) <= now_sample {
                self.next_pulse += 1;
            }
            self.scheduler.clear();
        }
        self.pump_clock(now_sample, bpm)
    }

    pub fn on_transport_pause(&mut self) -> Result<(), String> {
        if !self.send_clock || !self.clock_running {
            return Ok(());
        }
        self.clock_running = false;
        self.clock_paused = true;
        self.scheduler.clear();
        self.send_clock_byte(STOP)?;
        Ok(())
    }

    pub fn on_transport_stop(&mut self) -> Result<(), String> {
        let was = self.clock_running || self.clock_paused;
        self.clock_running = false;
        self.clock_paused = false;
        self.next_pulse = 0;
        self.scheduler.clear();
        if self.send_clock && was {
            self.send_clock_byte(STOP)?;
        }
        Ok(())
    }

    pub fn on_transport_tick(&mut self, now_sample: u64, bpm: f64) -> Result<(), String> {
        if !self.send_clock || !self.clock_running {
            return Ok(());
        }
        self.pump_clock(now_sample, bpm)
    }

    fn pulse_sample(pulse: u64, bpm: f64) -> u64 {
        beats_to_samples(pulse as f64 / f64::from(crate::PPQN), bpm, 48_000)
    }

    fn pump_clock(&mut self, now_sample: u64, bpm: f64) -> Result<(), String> {
        if bpm <= 0.0 {
            return Ok(());
        }
        let horizon = now_sample + beats_to_samples(1.0, bpm, 48_000);
        while Self::pulse_sample(self.next_pulse, bpm) <= horizon {
            let at = Self::pulse_sample(self.next_pulse, bpm);
            if at >= now_sample {
                self.scheduler.schedule_at(at, vec![CLOCK]);
            }
            self.next_pulse += 1;
        }
        for (_, bytes) in self.scheduler.due(now_sample) {
            self.send_bytes(bytes, "clock")?;
        }
        Ok(())
    }

    /// All notes off and reset all controllers on the profile channel.
    pub fn panic(&mut self) -> Result<(), String> {
        let notes_off = self.profile.control_change(123, 0);
        let reset = self.profile.control_change(121, 0);
        self.send_bytes(notes_off, "panic")?;
        self.send_bytes(reset, "panic")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiles::{Control, Scene};

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
    fn scene_and_section_automation() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        orch.set_section_mapping("Verse".into(), 0);
        orch.set_section_mapping("Chorus".into(), 2);

        assert_eq!(orch.on_section_change("Chorus").unwrap(), Some(2));
        assert_eq!(orch.current_scene, 2);
        // Same section again: nothing is re-sent.
        assert_eq!(orch.on_section_change("Chorus").unwrap(), None);
        assert_eq!(orch.monitor().len(), 1);
        assert_eq!(orch.monitor()[0].bytes, vec![0xB0, 43, 2]);
        assert!(orch.monitor()[0].reason.contains("Chorus"));

        orch.select_scene(3).unwrap();
        assert_eq!(orch.current_scene, 3);
        assert_eq!(orch.monitor().len(), 2);
    }

    #[test]
    fn unmapped_sections_and_follow_off_are_silent() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        assert_eq!(orch.on_section_change("Bridge").unwrap(), None);
        orch.set_section_mapping("Solo".into(), 4);
        orch.follow_sections = false;
        assert_eq!(orch.on_section_change("Solo").unwrap(), None);
        assert!(orch.monitor().is_empty());
    }

    #[test]
    fn follow_sections_off_is_silent_even_when_song_mappings_exist() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        orch.song_mappings = Some([("Chorus".into(), 2)].into());
        orch.follow_sections = false;
        assert_eq!(orch.on_section_change("Chorus").unwrap(), None);
        assert!(orch.monitor().is_empty());
    }

    #[test]
    fn knobs_clamp_and_remember() {
        let profile = RigProfile {
            midi_channel: 1,
            controls: vec![Control {
                cc: 20,
                name: "Gain".into(),
                min: 0,
                max: 100,
                default: 40,
                toggle: false,
            }],
            ..RigProfile::generic()
        };
        let mut orch = RigOrchestrator::with_memory_sink(profile);
        assert_eq!(orch.control_values.get(&20), Some(&40));
        assert_eq!(orch.set_control(20, 127).unwrap(), 100);
        assert_eq!(orch.control_values.get(&20), Some(&100));
        assert_eq!(orch.monitor()[0].bytes, vec![0xB1, 20, 100]);
        assert_eq!(orch.monitor()[0].text, "CC 20 = 100 ch2");
        assert!(orch.set_control(200, 1).is_err());
        assert!(orch.send_program(200).is_err());
        assert!(orch.send_program(127).is_ok());
    }

    #[test]
    fn send_program_invalidates_last_sent_scene_so_section_automation_can_return() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        orch.set_section_mapping("Verse".into(), 0);
        orch.set_section_mapping("Bridge".into(), 0);
        assert_eq!(orch.on_section_change("Verse").unwrap(), Some(0));
        orch.send_program(3).unwrap();
        assert_eq!(
            orch.on_section_change("Bridge").unwrap(),
            Some(0),
            "manual PC must not suppress the next mapped scene"
        );
    }

    #[test]
    fn changing_profile_drops_mappings_that_no_longer_fit() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        orch.set_section_mapping("Chorus".into(), 7);
        orch.set_section_mapping("Verse".into(), 1);
        let small = RigProfile {
            scenes: vec![Scene::named("Clean"), Scene::named("Lead")],
            ..RigProfile::generic()
        };
        orch.set_profile(small);
        assert_eq!(orch.section_mappings.get("Verse"), Some(&1));
        assert_eq!(orch.section_mappings.get("Chorus"), None);
        assert!(orch.select_scene(5).is_err());
    }

    #[test]
    fn play_restart_and_profile_swap_resend_the_current_section_scene() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        orch.set_section_mapping("Verse".into(), 0);
        assert_eq!(orch.on_section_change("Verse").unwrap(), Some(0));
        orch.reset_section_tracking();
        assert_eq!(
            orch.on_section_change("Verse").unwrap(),
            Some(0),
            "a new playthrough must send the mapped scene again"
        );

        orch.set_profile(quad_cortex_like());
        orch.set_section_mapping("Verse".into(), 1);
        assert_eq!(
            orch.on_section_change("Verse").unwrap(),
            Some(1),
            "a new profile must send the current section on the new device"
        );
    }

    #[test]
    fn monitor_is_bounded() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        for i in 0..(MONITOR_CAPACITY + 10) {
            orch.select_scene(i % 8).unwrap();
        }
        assert_eq!(orch.monitor().len(), MONITOR_CAPACITY);
    }
    #[test]
    fn song_tones_do_not_replace_global_mappings_and_midi_thru_is_filtered() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        orch.set_section_mapping("Verse".into(), 1);
        orch.song_mappings = Some([("Verse".into(), 2)].into());
        assert_eq!(orch.on_section_change("Verse").unwrap(), Some(2));
        assert_eq!(orch.section_mappings["Verse"], 1);
        orch.song_mappings = None;
        orch.reset_section_tracking();
        assert_eq!(orch.on_section_change("Verse").unwrap(), Some(1));
        orch.monitor.push_back(SentMessage {
            at_ms: 0,
            bytes: vec![0xc0, 12],
            text: String::new(),
            reason: String::new(),
            live: true,
        });
        let press = crate::controller::PedalPress {
            kind: "program".into(),
            channel: 1,
            number: 12,
        };
        assert!(orch.is_recent_echo(&press));
        assert!(!orch.is_recent_echo(&crate::controller::PedalPress {
            number: 13,
            ..press.clone()
        }));
        orch.started = Instant::now() - Duration::from_secs(1);
        assert!(!orch.is_recent_echo(&press));
    }

    #[test]
    fn panic_sends_all_notes_off_and_reset_controllers() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        orch.panic().unwrap();
        let mon = orch.monitor();
        assert_eq!(mon[0].bytes, vec![0xB0, 123, 0]);
        assert_eq!(mon[1].bytes, vec![0xB0, 121, 0]);
        assert!(mon.iter().all(|m| m.reason == "panic"));
    }

    #[test]
    fn clock_is_silent_until_enabled_and_dry_run_still_logs() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        assert!(!orch.send_clock_byte(crate::START).unwrap());
        assert!(orch.monitor().is_empty());
        orch.set_clock(true);
        assert!(orch.send_clock_byte(crate::START).unwrap());
        assert!(orch.send_clock_byte(crate::CLOCK).unwrap());
        assert!(orch.send_clock_byte(crate::STOP).unwrap());
        assert!(orch.send_clock_byte(crate::CONTINUE).unwrap());
        let kinds: Vec<u8> = orch.monitor().iter().map(|m| m.bytes[0]).collect();
        assert_eq!(
            kinds,
            vec![crate::START, crate::CLOCK, crate::STOP, crate::CONTINUE]
        );
        orch.clear_monitor();
        orch.set_dry_run(true);
        orch.send_program(3).unwrap();
        assert_eq!(orch.monitor()[0].bytes, vec![0xC0, 3]);
        assert_eq!(orch.monitor()[0].reason, "manual program 3");
    }

    #[test]
    fn transport_play_pause_stop_drive_clock_bytes() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        orch.on_transport_play(0, 120.0).unwrap();
        assert!(orch.monitor().is_empty());
        orch.set_clock(true);
        orch.on_transport_play(0, 120.0).unwrap();
        let first: Vec<u8> = orch.monitor().iter().map(|m| m.bytes[0]).collect();
        assert_eq!(first[0], START);
        assert!(first.contains(&CLOCK));
        orch.clear_monitor();
        orch.on_transport_pause().unwrap();
        assert_eq!(orch.monitor()[0].bytes, vec![STOP]);
        orch.clear_monitor();
        orch.on_transport_play(36_000, 120.0).unwrap();
        assert_eq!(orch.monitor()[0].bytes, vec![CONTINUE]);
        orch.on_transport_tick(48_000, 120.0).unwrap();
        assert!(orch.monitor().iter().any(|m| m.bytes == [CLOCK]));
        orch.clear_monitor();
        orch.on_transport_stop().unwrap();
        assert_eq!(orch.monitor()[0].bytes, vec![STOP]);
        orch.clear_monitor();
        orch.on_transport_play(0, 120.0).unwrap();
        assert_eq!(orch.monitor()[0].bytes, vec![START]);
    }

    #[test]
    fn resume_does_not_flush_a_clock_pulse_already_sent_before_pause() {
        let mut orch = RigOrchestrator::with_memory_sink(quad_cortex_like());
        orch.set_clock(true);
        orch.on_transport_play(0, 120.0).unwrap();
        orch.on_transport_tick(100, 120.0).unwrap();
        orch.on_transport_pause().unwrap();
        orch.clear_monitor();
        orch.on_transport_play(101, 120.0).unwrap();
        let clocks = orch
            .monitor()
            .iter()
            .filter(|m| m.bytes == [CLOCK])
            .count();
        assert_eq!(
            clocks, 0,
            "pulse 1 at sample 100 must not fire again at 101"
        );
        assert_eq!(orch.monitor()[0].bytes, vec![CONTINUE]);
    }
}
