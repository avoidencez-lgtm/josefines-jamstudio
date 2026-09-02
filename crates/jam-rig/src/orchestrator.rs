//! orchestrator: Rig automation timeline and MIDI device orchestration.

use crate::midi::{MemorySink, MidiSink};
use crate::profiles::RigProfile;
use std::collections::HashMap;

pub struct RigOrchestrator {
    pub profile: RigProfile,
    pub sink: Box<dyn MidiSink>,
    pub section_mappings: HashMap<String, usize>,
    pub current_scene: usize,
}

impl RigOrchestrator {
    pub fn new(profile: RigProfile, sink: Box<dyn MidiSink>) -> Self {
        Self {
            profile,
            sink,
            section_mappings: HashMap::new(),
            current_scene: 0,
        }
    }

    pub fn with_memory_sink(profile: RigProfile) -> Self {
        Self::new(profile, Box::new(MemorySink::new()))
    }

    pub fn set_section_mapping(&mut self, section: String, scene_idx: usize) {
        self.section_mappings.insert(section, scene_idx);
    }

    pub fn select_scene(&mut self, scene_idx: usize) -> Result<(), String> {
        let midi = self.profile.scene_to_midi(scene_idx);
        self.sink.send(&midi)?;
        self.current_scene = scene_idx;
        Ok(())
    }

    pub fn on_section_change(&mut self, section: &str) -> Result<Option<usize>, String> {
        if let Some(&scene_idx) = self.section_mappings.get(section) {
            self.select_scene(scene_idx)?;
            Ok(Some(scene_idx))
        } else {
            Ok(None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_orchestrator_scene_and_section_automation() {
        let profile = RigProfile::quad_cortex();
        let mut orch = RigOrchestrator::with_memory_sink(profile);

        // Map sections
        orch.set_section_mapping("Verse".into(), 0); // Scene A (CC 43, value 0)
        orch.set_section_mapping("Chorus".into(), 2); // Scene C (CC 43, value 2)

        // Section change to Chorus
        let switched = orch.on_section_change("Chorus").unwrap();
        assert_eq!(switched, Some(2));
        assert_eq!(orch.current_scene, 2);

        // Direct scene selection
        orch.select_scene(3).unwrap(); // Scene D
        assert_eq!(orch.current_scene, 3);
    }
}
