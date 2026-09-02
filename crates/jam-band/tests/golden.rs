use jam_band::sequencer::BandSequencer;
use jam_core::style::Style;
use jam_core::timeline::{beats_to_samples, Timeline};
use jam_dsp::calculate_level;
use std::time::Instant;

fn render_style_headless(style_json: &str, bars: u32, bpm: f64, seed: u64) -> (Vec<f32>, Vec<f32>) {
    let sample_rate = 48_000;
    let style: Style = serde_json::from_str(style_json).expect("valid style JSON");
    let beats_per_bar = style.feel.time_sig.0 as f64;
    let mut seq = BandSequencer::new(style.clone(), sample_rate, seed);

    let mut timeline = Timeline::new(sample_rate, bpm, style.feel.time_sig);
    timeline.set_count_in(0);
    timeline.play();

    let total_beats = bars as f64 * beats_per_bar;
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
    let json = include_str!("../../../styles/blues-shuffle.json");
    let (l, r) = render_style_headless(json, 8, 100.0, 42);
    assert_eq!(l.len(), 921_600);
    assert_eq!(r.len(), 921_600);
    let lvl = calculate_level(&l);
    assert!(lvl.peak_db > -40.0 && lvl.rms_db > -60.0);
    let (l2, _) = render_style_headless(json, 8, 100.0, 42);
    assert_eq!(l, l2, "Deterministic golden render seed 42");
}

#[test]
fn test_golden_render_rock_straight() {
    let json = include_str!("../../../styles/rock-straight.json");
    let (l, _) = render_style_headless(json, 8, 100.0, 42);
    assert_eq!(l.len(), 921_600);
    let lvl = calculate_level(&l);
    assert!(lvl.peak_db > -40.0 && lvl.rms_db > -60.0);
    let (l2, _) = render_style_headless(json, 8, 100.0, 42);
    assert_eq!(l, l2);
}

#[test]
fn test_golden_render_funk_16() {
    let json = include_str!("../../../styles/funk-16.json");
    let (l, _) = render_style_headless(json, 8, 100.0, 42);
    assert_eq!(l.len(), 921_600);
    let lvl = calculate_level(&l);
    assert!(lvl.peak_db > -40.0 && lvl.rms_db > -60.0);
    let (l2, _) = render_style_headless(json, 8, 100.0, 42);
    assert_eq!(l, l2);
}

#[test]
fn test_golden_render_jazz_swing() {
    let json = include_str!("../../../styles/jazz-swing.json");
    let (l, _) = render_style_headless(json, 8, 120.0, 42);
    let lvl = calculate_level(&l);
    assert!(lvl.peak_db > -40.0 && lvl.rms_db > -60.0);
    let (l2, _) = render_style_headless(json, 8, 120.0, 42);
    assert_eq!(l, l2);
}

#[test]
fn test_golden_render_ballad_68() {
    let json = include_str!("../../../styles/ballad-68.json");
    let (l, _) = render_style_headless(json, 8, 60.0, 42);
    let lvl = calculate_level(&l);
    assert!(lvl.peak_db > -40.0 && lvl.rms_db > -60.0);
    let (l2, _) = render_style_headless(json, 8, 60.0, 42);
    assert_eq!(l, l2);
}

#[test]
fn test_golden_render_metal_gallop() {
    let json = include_str!("../../../styles/metal-gallop.json");
    let (l, _) = render_style_headless(json, 8, 140.0, 42);
    let lvl = calculate_level(&l);
    assert!(lvl.peak_db > -40.0 && lvl.rms_db > -60.0);
    let (l2, _) = render_style_headless(json, 8, 140.0, 42);
    assert_eq!(l, l2);
}

#[test]
fn test_render_worker_benchmark_budget() {
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
    assert!(
        elapsed.as_secs_f64() < 13.33,
        "Render exceeded 25% budget: took {:?}",
        elapsed
    );
}
