use jam_band::offline;
use jam_band::sequencer::BandSequencer;
use jam_core::style::Style;
use jam_core::timeline::Timeline;
use jam_dsp::calculate_level;
use std::time::Instant;

fn render_style_headless(style_json: &str, bars: u32, bpm: f64, seed: u64) -> (Vec<f32>, Vec<f32>) {
    std::env::set_var("JAM_SYNTHETIC_KIT", "1");
    let style: Style = serde_json::from_str(style_json).expect("valid style JSON");
    offline::render_style(style, bars, bpm, seed, None).expect("offline render")
}

/// Every style must produce audible bass and comp on their own, not just drums.
fn render_part_only(style_json: &str, drums: bool, bass: bool, comp: bool) -> f32 {
    std::env::set_var("JAM_SYNTHETIC_KIT", "1");
    let style: Style = serde_json::from_str(style_json).expect("valid style JSON");
    let bpb = style.feel.time_sig.0 as f64;
    let mut seq = BandSequencer::new(style.clone(), 48_000, 3);
    seq.set_parts(!drums, !bass, !comp);
    let mut tl = Timeline::new(48_000, 110.0, style.feel.time_sig);
    tl.set_count_in(0);
    tl.play();
    let frames = (bpb * 2.0 * tl.samples_per_beat()) as usize;
    let mut l = vec![0.0f32; frames];
    let mut r = vec![0.0f32; frames];
    let mut done = 0;
    while done < frames {
        let n = 256.min(frames - done);
        let (evs, spans) = tl.advance_with_spans(n);
        for e in &evs {
            seq.handle_timeline_event(e);
        }
        for s in &spans {
            let end = done + s.offset + s.frames;
            seq.render_span(
                s,
                tl.samples_per_beat(),
                bpb,
                &mut l[done + s.offset..end],
                &mut r[done + s.offset..end],
            );
        }
        done += n;
    }
    calculate_level(&l).peak_db
}

#[test]
fn every_style_has_audible_drums_bass_and_comp() {
    let styles = [
        (
            "blues-shuffle",
            include_str!("../../../styles/blues-shuffle.json"),
        ),
        (
            "rock-straight",
            include_str!("../../../styles/rock-straight.json"),
        ),
        ("funk-16", include_str!("../../../styles/funk-16.json")),
        (
            "jazz-swing",
            include_str!("../../../styles/jazz-swing.json"),
        ),
        ("ballad-68", include_str!("../../../styles/ballad-68.json")),
        (
            "metal-gallop",
            include_str!("../../../styles/metal-gallop.json"),
        ),
    ];
    for (id, json) in styles {
        let d = render_part_only(json, true, false, false);
        let b = render_part_only(json, false, true, false);
        let c = render_part_only(json, false, false, true);
        assert!(d > -30.0, "{id}: drums silent ({d:.1} dBFS)");
        assert!(b > -30.0, "{id}: bass silent ({b:.1} dBFS)");
        assert!(c > -30.0, "{id}: comp silent ({c:.1} dBFS)");
    }
}

#[test]
fn every_style_has_three_intensity_tiers() {
    let styles = [
        include_str!("../../../styles/blues-shuffle.json"),
        include_str!("../../../styles/rock-straight.json"),
        include_str!("../../../styles/funk-16.json"),
        include_str!("../../../styles/jazz-swing.json"),
        include_str!("../../../styles/ballad-68.json"),
        include_str!("../../../styles/metal-gallop.json"),
    ];
    for json in styles {
        let style: Style = serde_json::from_str(json).unwrap();
        assert!(
            style.patterns.len() >= 3,
            "{} has {} intensity tiers, want at least 3",
            style.id,
            style.patterns.len()
        );
        for probe in [0.0f32, 0.5, 1.0] {
            assert!(
                style
                    .patterns
                    .iter()
                    .any(|p| probe >= p.intensity.0 && probe <= p.intensity.1),
                "{}: no pattern covers intensity {probe}",
                style.id
            );
        }
    }
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
fn fixture_style_golden_renders_without_entering_bundled_styles() {
    let json = include_str!("../../../tests/fixtures/seams/extending-style.json");
    let style: Style = serde_json::from_str(json).expect("fixture style parses");
    assert_eq!(style.id, "fixture-style");
    assert!(style.patterns.len() >= 3);
    assert!(!style.fills.is_empty());
    assert!(!style.endings.is_empty());
    let (l, r) = render_style_headless(json, 8, 100.0, 42);
    assert_eq!(l.len(), 921_600);
    assert_eq!(r.len(), 921_600);
    let lvl = calculate_level(&l);
    assert!(lvl.peak_db > -40.0 && lvl.rms_db > -60.0);
    let (again, _) = render_style_headless(json, 8, 100.0, 42);
    assert_eq!(l, again);
}

#[test]
fn test_render_worker_benchmark_budget() {
    // ARCHITECTURE §9.1: 10 000 blocks of the busiest style (funk-16) < 25% RT.
    std::env::set_var("JAM_SYNTHETIC_KIT", "1");
    let json = include_str!("../../../styles/funk-16.json");
    let style: Style = serde_json::from_str(json).unwrap();
    let meter = style.feel.time_sig;
    let mut seq = BandSequencer::new(style, 48_000, 42);
    let mut timeline = Timeline::new(48_000, 120.0, meter);
    timeline.set_count_in(0);
    timeline.play();

    let mut blk_l = vec![0.0f32; 256];
    let mut blk_r = vec![0.0f32; 256];

    let start = Instant::now();
    for _ in 0..10_000 {
        let (evs, spans) = timeline.advance_with_spans(256);
        for ev in &evs {
            seq.handle_timeline_event(ev);
        }
        blk_l.fill(0.0);
        blk_r.fill(0.0);
        for span in &spans {
            let end = span.offset + span.frames;
            seq.render_span(
                span,
                timeline.samples_per_beat(),
                f64::from(meter.0),
                &mut blk_l[span.offset..end],
                &mut blk_r[span.offset..end],
            );
        }
    }
    let elapsed = start.elapsed();

    println!("10,000 blocks (53.3s audio) rendered in: {:?}", elapsed);
    assert!(
        elapsed.as_secs_f64() < 13.33,
        "Render exceeded 25% budget: took {:?}",
        elapsed
    );
}
