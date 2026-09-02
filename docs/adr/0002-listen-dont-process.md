# ADR 0002: Listen, don't process

**Status:** Accepted, 2026-09-02

## Context

The guitarist owns a HeadRush Pedalboard, a Hughes & Kettner Black Spirit 200 and a Vox 4x12. His tone is made by that hardware with zero latency. The HeadRush sends both the processed stereo signal and the dry DI to the computer over USB, and its USB return lands on its master outputs and headphones without passing through the rig.

## Decision

The app never sits in the guitar's monitoring path in v1. It captures (DI for analysis, processed for the keeper take) and plays (band, song, Lyria, Jo, click) back through the HeadRush return or any other output. No software monitoring is enabled by default; no amp simulation; no VST3/AU hosting.

## Consequences

- Playback latency is a constant the player adapts to (the band is late by the output latency, which is inaudible in practice at 256 to 512 frames). Recording alignment is handled by latency calibration ([ARCHITECTURE §4.4](../ARCHITECTURE.md)).
- Windows without ASIO is acceptable because there is no monitoring path.
- The engine can be simpler (render-ahead, block-quantised changes) and fully deterministic.
- A software monitoring path or amp-sim mode is a backlog feature gated by [ADR 0001](0001-tauri-rust-not-juce.md).
- The cabling guide must explain the return path clearly, since the whole product feel depends on hearing the band and the guitar together in headphones or the room.
