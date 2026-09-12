//! Headless band render. Same sequencer as live play.
use crate::sequencer::BandSequencer;
use jam_core::chart::ResolvedChart;
use jam_core::style::Style;
use jam_core::timeline::{beats_to_samples, Timeline};

fn rms_db(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return -120.0;
    }
    let mean = samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32;
    let rms = mean.sqrt();
    if rms < 1e-12 {
        -120.0
    } else {
        20.0 * rms.log10()
    }
}

pub fn render_style(
    style: Style,
    bars: u32,
    bpm: f64,
    seed: u64,
    chart: Option<ResolvedChart>,
) -> Result<(Vec<f32>, Vec<f32>), String> {
    render_style_parts(style, bars, bpm, seed, chart, false, false, false)
}

/// Rising edges of |x| above `threshold` after at least 20 ms of quiet.
/// The synthetic kick starts on a zero crossing, so the first audible sample is 1.
pub fn onsets(signal: &[f32], threshold: f32) -> Vec<usize> {
    let mut result = Vec::new();
    let mut quiet = 1_000usize;
    for (i, s) in signal.iter().enumerate() {
        if s.abs() > threshold {
            if quiet > 960 {
                result.push(i);
            }
            quiet = 0;
        } else {
            quiet += 1;
        }
    }
    result
}

/// Per-bus RMS and drum onsets of the same render as `render_style`. ARCHITECTURE §9.2.
pub fn bus_rms_db(
    style: Style,
    bars: u32,
    bpm: f64,
    seed: u64,
    chart: Option<ResolvedChart>,
) -> Result<(f32, f32, f32, Vec<usize>), String> {
    let drums = render_style_parts(
        style.clone(),
        bars,
        bpm,
        seed,
        chart.clone(),
        false,
        true,
        true,
    )?;
    let bass = render_style_parts(
        style.clone(),
        bars,
        bpm,
        seed,
        chart.clone(),
        true,
        false,
        true,
    )?;
    let comp = render_style_parts(style, bars, bpm, seed, chart, true, true, false)?;
    Ok((
        rms_db(&drums.0),
        rms_db(&bass.0),
        rms_db(&comp.0),
        onsets(&drums.0, 1e-4),
    ))
}

#[allow(clippy::too_many_arguments)]
fn render_style_parts(
    style: Style,
    bars: u32,
    bpm: f64,
    seed: u64,
    chart: Option<ResolvedChart>,
    mute_drums: bool,
    mute_bass: bool,
    mute_comp: bool,
) -> Result<(Vec<f32>, Vec<f32>), String> {
    if bars == 0 || bars > 64 {
        return Err("Offline render needs 1 to 64 bars.".into());
    }
    if !(40.0..=240.0).contains(&bpm) {
        return Err("Offline render needs 40 to 240 bpm.".into());
    }
    let sample_rate = 48_000;
    let beats_per_bar = style.feel.time_sig.0 as f64;
    let mut seq = BandSequencer::new(style.clone(), sample_rate, seed);
    seq.set_parts(mute_drums, mute_bass, mute_comp);
    if let Some(chart) = chart {
        seq.load_chart(chart);
    }
    let mut timeline = Timeline::new(sample_rate, bpm, style.feel.time_sig);
    timeline.set_count_in(0);
    timeline.play();
    let total_beats = f64::from(bars) * beats_per_bar;
    let total_frames = beats_to_samples(total_beats, bpm, sample_rate) as usize;
    let block_size = 256;
    let mut out_left = Vec::with_capacity(total_frames);
    let mut out_right = Vec::with_capacity(total_frames);
    let mut blk_l = vec![0.0f32; block_size];
    let mut blk_r = vec![0.0f32; block_size];
    let mut rendered = 0;
    while rendered < total_frames {
        let chunk = block_size.min(total_frames - rendered);
        let (evs, spans) = timeline.advance_with_spans(chunk);
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
                beats_per_bar,
                &mut blk_l[span.offset..end],
                &mut blk_r[span.offset..end],
            );
        }
        out_left.extend_from_slice(&blk_l[..chunk]);
        out_right.extend_from_slice(&blk_r[..chunk]);
        rendered += chunk;
    }
    Ok((out_left, out_right))
}

pub fn write_wav(path: &std::path::Path, left: &[f32], right: &[f32]) -> Result<usize, String> {
    if left.len() != right.len() {
        return Err("Offline render channels differ in length.".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let spec = hound::WavSpec {
        channels: 2,
        sample_rate: 48_000,
        bits_per_sample: 24,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for i in 0..left.len() {
        let l = (left[i].clamp(-1.0, 1.0) * 8_388_607.0).round() as i32;
        let r = (right[i].clamp(-1.0, 1.0) * 8_388_607.0).round() as i32;
        writer.write_sample(l).map_err(|e| e.to_string())?;
        writer.write_sample(r).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(left.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_bar_at_120_is_exact_frames() {
        let _lock = crate::kit::lock_test_env();
        std::env::set_var("JAM_SYNTHETIC_KIT", "1");
        let style: Style = serde_json::from_str(include_str!("../../../styles/rock-straight.json"))
            .expect("bundled style");
        let (left, right) = render_style(style, 1, 120.0, 1, None).expect("render");
        assert_eq!(left.len(), 96_000);
        assert_eq!(right.len(), 96_000);
        assert!(left.iter().any(|s| s.abs() > 1e-4));
    }

    #[test]
    fn bus_rms_repeats_within_half_a_decibel() {
        let _lock = crate::kit::lock_test_env();
        std::env::set_var("JAM_SYNTHETIC_KIT", "1");
        let style: Style = serde_json::from_str(include_str!("../../../styles/rock-straight.json"))
            .expect("bundled style");
        let a = bus_rms_db(style.clone(), 1, 120.0, 1, None).expect("buses");
        let b = bus_rms_db(style, 1, 120.0, 1, None).expect("buses");
        assert!(a.0 > -60.0 && a.1 > -60.0 && a.2 > -60.0, "{a:?}");
        assert!((a.0 - b.0).abs() <= 0.05);
        assert!((a.1 - b.1).abs() <= 0.05);
        assert!((a.2 - b.2).abs() <= 0.05);
    }

    #[test]
    fn kick_onsets_land_within_one_sample() {
        let _lock = crate::kit::lock_test_env();
        std::env::set_var("JAM_SYNTHETIC_KIT", "1");
        let style: Style =
            serde_json::from_str(include_str!("../../../tests/fixtures/band/onset-grid.json"))
                .expect("onset style");
        let (_, _, _, found) = bus_rms_db(style, 1, 120.0, 1, None).expect("buses");
        for expect in [0usize, 24_000, 48_000, 72_000] {
            assert!(
                found.iter().any(|&o| o.abs_diff(expect) <= 1),
                "expected onset at {expect} ±1, got {found:?}"
            );
        }
    }
}
