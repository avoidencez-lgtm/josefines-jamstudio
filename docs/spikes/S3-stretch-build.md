# S3: Signalsmith Stretch integration and verification

**Rechecked:** 2026-09-06. The 2026-09-02 spike proposed an in-tree CXX bridge;
its throwaway probe was removed and its historical numbers were not independently
reproduced. The earlier claim that Stretch has no dependencies was incorrect for
the version integrated here. This document records the current implementation.

## Sources and decision

- [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch),
  version 1.3.2, commit `57b93f4e9206a089a45387eaa39bdc9f310d3308`, MIT.
- Its CMake dependency is [Signalsmith Linear](https://github.com/Signalsmith-Audio/linear)
  0.3.1, commit `5668673560146a9cfe38c25315071e3fd68c8317`, MIT.
- The upstream documentation describes `outputSeekLength`, `outputSeek` and
  different input/output block lengths. The wrapper primes the documented
  lookahead and pads the end with silence, without exposing PCM to the WebView.

Vendor the four required headers and both licence notices, with LF line endings
and trailing whitespace removed; no functional source changes. Their source revisions
and SHA-256 hashes are in `crates/jam-dsp/cxx/vendor/sources.json` and verified by
`pnpm licenses:check`. Use the built-in FFT backend, without optional native FFT
libraries, CMake downloads, bindgen or libclang. The small CXX bridge compiles as
C++17, with optimisation also enabled in debug builds. No third-party wrapper
crate is used. A fixed seed makes the synthetic checks deterministic.

## Implemented product path

Songs → Make a practice copy → `media_stretch` decodes a library asset through the
existing user-installed FFmpeg path, calls `jam-audio::practice::render` and
`jam-dsp::stretch::stereo` on a worker, then publishes a new stereo float WAV and
asset receipt. The source stays untouched. Speed is 50–150%; transpose is ±12
semitones. This is offline preparation, with one source/result in memory (about
660 MiB at the maximum source length). Existing library playback uses the system
player. Subsequent native reference work shares the desktop output/recording
queue, per-stem mixing and local low-confidence analysis; see ARCHITECTURE.

## Live implementation follow-up (2026-09-06)

The same vendored bridge now supplies bounded 256-frame render-worker streams,
one per loaded stem. Native controls apply 50–150% speed and ±12 whole semitones,
save settings for reload, and preserve source-second loops and dry guitar DI.
No new DSP dependency or vendor source modification was needed. Jo uses the same
partial-update IPC. Synthetic rate/pitch/cursor tests and a half-speed/+2 native
recording test complement the original offline checks. Eight stems produced
8 seconds in 1.230 seconds locally; worst block was 10.582 ms. This does not
establish physical-device dropout or subjective quality acceptance. Analysed
sections, tempo ramps and broader provider work remain unfinished.

## Verification

- `cargo test -p jam-dsp stretch`: synthetic two-second stereo 1 kHz/500 Hz tones;
  output length ±1 ms, frequency ±5 cents at speed 0.5, 0.8, 1.25 and 1.5, and
  combined speed/transpose cases including ±12 semitones. The 0.8 speed / 1.25
  duration case also requires the 1 kHz tone within ±1 Hz. Beginning and ending
  retain signal. Cancellation and invalid input are refused.
- `cargo test -p jam-audio practice`: a two-second output from a one-second source,
  source bytes unchanged, stereo header, existing output preserved, cancellation.
- `JAM_MEDIA_TEST=1 cargo test -p src-tauri local_practice_copy --lib -- --ignored`:
  passed locally on Windows with the real installed FFmpeg/ffprobe. A 44.1 kHz
  synthetic source becomes a 48 kHz, four-second practice copy at half speed with
  +2 semitones, with its source receipt and library entry. Temporary decode removed.
- `cargo test -p src-tauri --test ipc_rig_media`: command registration and refusal
  of invalid rates, out-of-library IDs and missing sources before tool execution.

Windows MSVC DSP and WAV checks pass locally. Windows/macOS CI must pass before
merge. The full local Rust run was interrupted before the empty app-binary test
harness started: Windows Application Control returned OS error 4551. No security
policy was changed or bypassed. The separate integration and documentation tests
passed; this is not a claim that the full local command passed.
The FFmpeg integration check is explicitly ignored in the normal suite
because FFmpeg is user-installed; the DSP and WAV checks always run on both OSes.
No physical playback or subjective sound-quality acceptance is claimed.
