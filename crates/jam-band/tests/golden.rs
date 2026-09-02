use jam_band::sequencer::BandSequencer;
use jam_core::style::Style;
use jam_core::timeline::{beats_to_samples, Timeline};
use jam_dsp::calculate_level;
use std::time::Instant;

fn render_style_headless(style_json: &str, bars: u32, bpm: f64, seed: u64) -> (Vec<f32>, Vec<f32>) {
    let sample_rate = 48_000;
    let style: Style = serde_json::from_str(style_json).expect("valid style JSON");
    let mut seq = BandSequencer::new(style, sample_rate, seed);

    let mut timeline = Timeline::new(sample_rate, bpm, (4, 4));
    timeline.set_count_in(0);
    timeline.play();

    let total_beats = (bars * 4) as f64;
    let total_frames = beats_to_samples(total_beats, bpm, sample_rate) as usize;

    let block_size = 256;
    let mut out_left = Vec::with_capacity(total_frames);
    let mut out_right = Vec::with_capacity(total_frames);

    let mut blk_l = vec![0.0f32; block_size];
    let mut blk_r = vec![0.0f32; block_size];

    let mut rendered = 0;
    while rendered < total_frames {
        let chunk = block_size.min(total_frames - rendered);
        let evs = timeline.advance(chunk);
        for ev in &evs {
            seq.handle_timeline_event(ev);
        }

        blk_l.fill(0.0);
        blk_r.fill(0.0);
        seq.render(&mut blk_l[..chunk], &mut blk_r[..chunk]);

        out_left.extend_from_slice(&blk_l[..chunk]);
        out_right.extend_from_slice(&blk_r[..chunk]);
        rendered += chunk;
    }

    (out_left, out_right)
}

#[test]
fn test_golden_render_blues_shuffle() {
    let blues_json = include_str!("../../../styles/blues-shuffle.json");
    let (left, right) = render_style_headless(blues_json, 8, 100.0, 42);

    // 8 bars @ 100 bpm in 4/4 = 32 beats = 19.2s = 921,600 samples
    assert_eq!(left.len(), 921_600);
    assert_eq!(right.len(), 921_600);

    let lvl_l = calculate_level(&left);
    let lvl_r = calculate_level(&right);

    println!(
        "Blues Shuffle 8-bar RMS: L={:.2} dB, R={:.2} dB",
        lvl_l.rms_db, lvl_r.rms_db
    );
    assert!(lvl_l.peak_db > -40.0, "Expected audible drum signal");
    assert!(lvl_l.rms_db > -60.0, "Expected non-trivial RMS");

    // Deterministic check: re-render must be 100% bit-identical
    let (left2, _) = render_style_headless(blues_json, 8, 100.0, 42);
    assert_eq!(
        left, left2,
        "Golden render must be deterministic with seed 42"
    );
}

#[test]
fn test_golden_render_rock_straight() {
    let rock_json = include_str!("../../../styles/rock-straight.json");
    let (left, right) = render_style_headless(rock_json, 8, 100.0, 42);

    assert_eq!(left.len(), 921_600);
    assert_eq!(right.len(), 921_600);

    let lvl_l = calculate_level(&left);
    println!("Rock Straight 8-bar RMS: L={:.2} dB", lvl_l.rms_db);
    assert!(lvl_l.peak_db > -40.0);
    assert!(lvl_l.rms_db > -60.0);

    // Deterministic check
    let (left2, _) = render_style_headless(rock_json, 8, 100.0, 42);
    assert_eq!(
        left, left2,
        "Golden render must be deterministic with seed 42"
    );
}

#[test]
fn test_render_worker_benchmark_budget() {
    // 10 000 blocks of 256 frames = 2,560,000 frames = ~53.33s real-time
    let rock_json = include_str!("../../../styles/rock-straight.json");
    let style: Style = serde_json::from_str(rock_json).unwrap();
    let mut seq = BandSequencer::new(style, 48_000, 42);
    let mut timeline = Timeline::new(48_000, 120.0, (4, 4));
    timeline.set_count_in(0);
    timeline.play();

    let mut blk_l = vec![0.0f32; 256];
    let mut blk_r = vec![0.0f32; 256];

    let start = Instant::now();
    for _ in 0..10_000 {
        let evs = timeline.advance(256);
        for ev in &evs {
            seq.handle_timeline_event(ev);
        }
        blk_l.fill(0.0);
        blk_r.fill(0.0);
        seq.render(&mut blk_l, &mut blk_r);
    }
    let elapsed = start.elapsed();

    println!("10,000 blocks (53.3s audio) rendered in: {:?}", elapsed);
    // Real-time = 53.33s. Budget (under 25% of real time) = 13.33s.
    assert!(
        elapsed.as_secs_f64() < 13.33,
        "Render exceeded 25% real-time budget: took {:?}",
        elapsed
    );
}
