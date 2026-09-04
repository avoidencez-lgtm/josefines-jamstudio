//! jam-rig: MIDI communication for rig control (HeadRush and Black Spirit 200).

pub mod midi;
pub mod orchestrator;
pub mod profiles;

pub use midi::*;
pub use orchestrator::*;
pub use profiles::*;
