//! jam-audio: lock-free audio engine, ring buffers, cpal I/O, file input, and null output.

pub mod ai_music;
pub mod analysis;
pub mod calibration;
pub mod devices;
pub mod engine;
pub mod export;
pub mod io;
pub mod melody;
pub mod recorder;
pub mod stems;

pub use ai_music::*;
pub use analysis::*;
pub use calibration::*;
pub use devices::*;
pub use engine::*;
pub use export::*;
pub use io::*;
pub use recorder::*;
pub use stems::*;

pub mod workstation;
