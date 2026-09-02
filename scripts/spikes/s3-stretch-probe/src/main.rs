#[cxx::bridge]
mod ffi {
    unsafe extern "C++" {
        include!("bridge.h");

        type StretchWrapper;

        fn new_stretch() -> UniquePtr<StretchWrapper>;
        fn test_sine_stretch(
            self: Pin<&mut StretchWrapper>,
            freq_hz: f32,
            stretch_ratio: f32,
            sample_rate: f32,
            duration_sec: f32,
        ) -> f32;
    }
}

fn main() {
    let mut s = ffi::new_stretch();
    let hz = s.pin_mut().test_sine_stretch(1000.0, 1.25, 48000.0, 2.0);
    println!("Estimated output frequency: {:.2} Hz", hz);
    let diff = (hz - 1000.0).abs();
    assert!(diff <= 1.0, "Frequency error {:.2} Hz is greater than 1 Hz!", diff);
    println!("S3 VERIFIED: 1 kHz sine stretched 1.25x keeps pitch within ±1 Hz ({:.2} Hz)!", hz);
}
