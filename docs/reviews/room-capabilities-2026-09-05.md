# Room capabilities validation — 2026-09-05

This pass adds one capability to each studio room. Expand the named tool above the existing workspace; collapse it to return to the normal working area. The existing visual style, audio engine, media pipeline and provider adapters are reused. See [scope and prior art](../research/room-capabilities.md) and the [bilingual manuals](../guide/manual-en.md).

## Local evidence

- Frontend lint, types, 96 tests across 19 files, licence allowlist and production build pass. No dependencies were added. Vite retains the existing non-fatal large-bundle warning.
- Rust formatting, Clippy with warnings denied, 126 workspace tests, and cargo-deny pass. The native debug app builds with embedded frontend. The melody synthetic test verifies A4/C5 order, start timing within 60 ms, note duration within 80 ms, and silence rejection.
- Browser controls pass at 1440 and 1100 pixels: all ten rooms, no horizontal overflow, accessible labelled controls, melody variation/Undo, stale-preview rejection, setlist edits/reordering and persistence across navigation, audio profiles, reference form, arrangement brief, film cut timing, blind identity reveal and tone capture. No page errors. Impeccable's new-component scan reported no findings; one batched visual review and a confirmation pass completed.
- An isolated Windows headless desktop app read synthetic WAVs through `takes_melody`, detected MIDI 69/76, preserved excerpt-relative timing and rejected missing take/out-of-range start/overlong excerpt requests. Song variations, versions and tone snapshots survived native save/reload.
- The native setlist cued 123 BPM with a two-bar count-in, loop disabled and transport still stopped. Native guitar-only A/B audition and favourite persistence passed. MIDI memory-sink recall kept the port and disabled section following. Audio profile persistence passed. Bokmål help was checked in the native app.
- Jo declarations for harmony variations and reference blueprints validate and enter the same reviewed, versioned song-edit boundary as other studio actions.

## Test incident and correction

The intended native coach fixture interception did not replace Tauri's read-only `invoke`. One real signed-in Codex CLI request ran successfully (14.175 seconds, 3,302 outgoing and 997 incoming bytes in the metadata log; monetary cost unavailable). It may have consumed account quota. This was disclosed immediately after verification, and no further model requests were issued. The returned coach response was used to check drafting an experiment in Jo and keeping it in song notes. It is **live-call evidence**, not a fixture result.

`AgentRunner` now rejects requests in headless/test execution unless `JAM_LIVE=1` is explicitly set. Its regression test proves rejection happens before executable lookup. Normal desktop operation remains available with the user's explicit Ask action. Automated model tests remain fixture-based; future live acceptance must be separately authorised.

## Review and remaining gates

Ponytail diff review: **Lean already. Ship.** Native `<details>`, current stores, existing IPC, existing Tonal/DSP and existing Undo replace any new framework. A regular correctness pass checked file bounds, stale previews, recording guards, preset validation, partial MIDI errors and source preservation.

Windows/macOS CI and unsigned preview installer results are recorded on the associated PR and build workflow. Headless/browser success does not close real Mac/device acceptance, physical MIDI, input latency, actual profile switching, artist-recorded recognition quality or video-model quality gates. No API-provider generation was run in this pass. Apple signing/notarisation and Windows signing remain owner release work; no roadmap milestone is marked complete here.
