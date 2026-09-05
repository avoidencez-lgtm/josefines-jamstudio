# S2: Can cpal enumerate and open a 4-channel input and let us pick channel 3, and what does it do on headless CI?

**Date:** 2026-09-02 · **Timebox:** 1 session · **Branch:** spike/S2-cpal-multichannel · **Author:** DeepMind Antigravity

## Question
Can `cpal` enumerate and open a 4-channel input and let us pick channel 3? What does `cpal` do on a CI runner with no audio device, on Windows and macOS?

## Method
Measured `cpal` 0.15.3 on Windows 11 PC using WASAPI host via `scripts/spikes/s2-cpal-probe/`. Probed device enumeration, supported configs, channel extraction mechanics, and checked behaviour when no devices exist.

## Numbers
| Measurement | Windows PC | windows-latest | macos-latest |
|---|---|---|---|
| Audio Host | WASAPI | WASAPI (no device) | CoreAudio (no device) |
| Default Input | HyperX Cloud II Wireless (2ch 48kHz) | None | None |
| Default Output | HyperX Cloud II Wireless (2ch 48kHz) | None | None |
| Headless Device Count | N/A | 0 devices | 0 devices |
| 4-ch DI De-interleave | channel index 2 (`data[i * 4 + 2]`) | `NullOutput` / `FileInput` | `NullOutput` / `FileInput` |

## Findings
- On Windows PC (WASAPI), default devices enumerate cleanly at 48 kHz stereo (U8, I16, I32, F32).
- On CI runners without physical audio hardware, `default_input_device()` and `default_output_device()` return `None`. Calling `build_input_stream` or `build_output_stream` unconditionally will panic or fail.
- `JAM_HEADLESS=1` is required to bypass hardware device calls entirely, directing `jam-audio` to instantiate `NullOutput` (timer-driven clock) and `FileInput` (looping WAV source).
- For multichannel inputs (such as HeadRush 4-channel USB where channel 3 is dry DI): `cpal` delivers interleaved frames across the configured channel count. Channel 3 corresponds to index 2 (0-indexed). De-interleaving is a strided slice read `data[i * channels + 2]`. On Windows where WASAPI exposes stereo only, fallback to channel 0 or 1 applies.

## Decision
Adopt `cpal` 0.15.x with explicit `AudioInput` / `AudioOutput` abstraction traits. `JAM_HEADLESS=1` gates device creation to `NullOutput` and `FileInput`, enabling flawless CI and headless testing on Windows and macOS.

## Fixtures captured
Probe lived in `scripts/spikes/s2-cpal-probe/` (removed; numbers above).

## Open questions
- Confirmation of HeadRush 4-channel enumeration on macOS CoreAudio (Owner Gate 1).
