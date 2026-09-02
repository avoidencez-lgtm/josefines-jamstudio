//! sequencer: Step scheduler and groove sequencer.

use jam_core::timeline::Position;

#[derive(Default)]
pub struct BandSequencer {
    pub current_position: Position,
}
