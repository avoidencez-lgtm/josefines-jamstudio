# ADR 0011: Correct McLeod pitch measurements with pitch-estimate

Date: 2026-09-05. Status: accepted.
Supersedes only the pitch-library choice in [ADR 0006](0006-licence-allowlist-and-assets.md).

## Evidence and decision

The shared tuner, melody extractor and take analyzer used `pitch-detection` 0.3.0.
A stationary guitar-range regression reproduced 15.953264 cents of error at
80.75762 Hz, 44.1 kHz, amplitude 0.1 and phase zero. This fails M6's ±3-cent target.
Its `detector/internals.rs` computes an unnormalized inverse FFT autocorrelation;
the normalized-square-difference denominator starts at that scaled value but
subtracts unscaled time-domain samples. It also subtracts only one window edge.
Changing the displayed score or relaxing the tolerance would retain the bias.

Replace it with exact-pinned `pitch-estimate` 0.1.0 behind the existing
`PitchTracker`. Its McLeod implementation normalizes the FFT and removes both
window edges in the denominator. Keep 2048-frame windows, clarity threshold 0.7,
and the previous total-energy gate of 5, expressed as mean square `5 / window_size`
for the new API. No second detector interface or handwritten FFT implementation.

Sources inspected on 2026-09-05: the published registry source and
[pitch-estimate API](https://docs.rs/pitch-estimate/0.1.0/pitch_estimate/),
[McLeod API](https://docs.rs/pitch-estimate/0.1.0/pitch_estimate/struct.McLeodDetector.html),
and [upstream repository](https://github.com/hey-jj/pitch-estimate).
The published source identifies commit `62be8786694cfedad287d119af3207aa14ddbc9f`.
It is MIT, has no build script, forbids unsafe code, and declares Rust 1.70
(below this workspace's 1.88 minimum). Its only direct dependency is `realfft`;
the lockfile adds realfft 3.5.0 and keeps rustfft 6.4.1. Source inspection found
no filesystem, process or network operations. Cargo.lock records registry checksums.

## Verification and limits

`guitar_range_pitch_errors_stay_within_three_cents` covers 648 stationary signals:
nine base frequencies from E2 to E6, detuning -35/0/+35 cents, three phases,
two amplitudes, with/without a second harmonic, at 44.1/48 kHz. The observed
worst error on Windows was 0.0737 cents; the asserted tolerance is ±3 cents.
The take-analysis regression covers five pitches with three detunings through
the full analysis loop, and native IPC checks the saved A3 measurement within
three cents. Invalid, silent, quiet and nonfinite frames return no pitch and
do not poison the next valid frame. Run with:

```powershell
cargo test -p jam-dsp -- --nocapture
cargo test -p jam-audio analysis::tests
$env:JAM_HEADLESS = "1"; cargo test -p src-tauri --test ipc_takes
```

This verifies stationary synthetic precision, not real-guitar accuracy, bend
exclusion, vibrato, noisy sweeps or polyphonic recognition. Those acceptance
targets remain open. The detector plans/buffers are allocated at construction;
the wrapper still allocates a note-name String and belongs off the audio callback.

Saved analysis advances to analyzer version 2, retaining schema version 1.
Version-1 evidence stays on disk but the UI offers Analyze again, so biased
measurements are not silently presented as current results. Re-analysis preserves
unknown metadata fields. Recordings and source audio are unchanged.
