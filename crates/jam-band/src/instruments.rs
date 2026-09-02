//! instruments: Instrument trait for virtual band rhythm section.

pub trait Instrument: Send + Sync {
    fn note_on(&mut self, note: u8, velocity: u8);
    fn note_off(&mut self, note: u8);
    fn render(&mut self, left: &mut [f32], right: &mut [f32]);
    fn reset(&mut self);
}
