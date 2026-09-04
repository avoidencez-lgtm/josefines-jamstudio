# Josefines Jamstudio

A desktop studio for writing original songs, rehearsing with a virtual band,
recording guitar, and preparing music videos. Guitar tone stays in the hardware;
the app owns the arrangement, accompaniment, recording and DAW handoff.

> **Stabilised preview, with owner acceptance still pending.** Write, Stage,
> Library, typed Jo, recording/export and file-based media workflows are implemented.
> Native voice, automatic stem analysis/stretch and Lyria RealTime are not built.
> See the [build closeout](docs/reviews/build-closeout.md) and
> [milestone board](docs/plan/00-README.md) for tested scope and remaining gates.

## The idea

The guitar's tone is always made by hardware: HeadRush Pedalboard → Hughes & Kettner Black Spirit 200 → Vox 4x12, zero latency. The app **listens and plays**: it takes the dry DI the HeadRush already sends over USB, plays the band back on the HeadRush's return channels so guitar and band meet in the headphones, and never sits in the monitoring path.

```
Guitar ─► HeadRush ─► Black Spirit 200 ─► Vox 4x12
              │ USB: DI + processed in, band out
              ▼
        Josefines Jamstudio  ─ MIDI ─► HeadRush rigs, Black Spirit presets
        Write · Band · Jo · Rig · Recorder · DAW export · Film
```

## What works today

| Area | State | What is real |
|---|---|---|
| Audio engine | Working | `cpal` input/output with device and sample-rate negotiation, a render-ahead worker, a headless fallback and a fail-loud status pill. Tuner (McLeod pitch) and click are live. |
| Virtual band | Working | Sample-accurate sequencer: drums, bass and comp from a chart, six styles with three intensity tiers each, swing, humanisation, count-in, fills, crash, stop and ending cues, loop points, intensity following the guitarist's energy. Offline render tests check determinism, timing and levels. |
| Chart library | Working | Bundled charts plus a text chart format you can type (`| Am7 D7 | G %|`), a chart editor, transposition, a chord strip that follows the bar, and a soloing helper suggesting scales and arpeggios per chord. |
| Practice tools | Working | Tap tempo, tempo trainer, keyboard shortcuts with a help overlay. |
| Jo | Text tools working | Offline band commands, configurable text providers and installed-agent proposals. Song edits require review. Native microphone input, STT, TTS and voice-bus ducking are not available in this build. |
| Rig over MIDI | Working, hardware gate open | Data-driven profiles for HeadRush Pedalboard, Black Spirit 200, Quad Cortex, Helix, Kemper and Axe-Fx III; real MIDI out through `midir`; section-bound scene changes as the band plays; knobs, program changes and a MIDI monitor. Verified against the real rig: not yet (owner gate). |
| Recorder and export | Working | Every take is written as 24-bit WAV stems (guitar DI, band, master). Analysis measures pick timing against the take's tempo grid, dynamic consistency and intonation on the real DI file. Export writes the stems, a Standard MIDI File tempo map with the chart's section markers, and a JSON sidecar. Latency offset is a manual setting; automatic loopback measurement is not built. |
| Network | Working | An allow-listed proxy in Rust injects API keys from the OS keychain (keys never reach the UI) and keeps a local usage log shown on the Settings screen. |
| Songs / real songs (M3) | Partial | Local audio import, reference playback and Film soundtrack selection. Stem separation, automatic beats/chords and time-stretch remain unbuilt. |
| AI music (M4) | Partial | Music-generation catalog, editable prompts, local ComfyUI workflows and saved job receipts. Lyria RealTime remains unbuilt; provider/GPU owner acceptance is pending. |
| Installers (M7) | Partly | `release.yml` builds macOS and Windows bundles on a tag; code signing and notarisation are not set up, so first launch needs the usual unsigned-app steps. |

Implemented code is checked by CI; real hardware and provider acceptance remain separate. CI runs on Windows and macOS (`cargo fmt`, `clippy -D warnings`, `cargo test` headless, `cargo deny`) and on Linux for the TypeScript side (Biome, `tsc`, Vitest, licence check, Vite build).

## Stack

Tauri 2 · Rust engine (`cpal`, `rtrb`, `hound`, `midir`, `pitch-detection`) · React 19 + TypeScript + Tailwind v4 + zustand · configurable text/media providers and installed coding agents (API keys stay in the OS keychain). Apache-2.0.

## Building

Prerequisites: Node 22 with corepack, Rust stable, and the Tauri 2 platform prerequisites for your OS.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm lint; corepack pnpm typecheck; corepack pnpm test
cargo fmt --all -- --check; cargo clippy --workspace --all-targets -- -D warnings
$env:JAM_HEADLESS = "1"; cargo test --workspace
corepack pnpm tauri dev
```

`corepack pnpm dev` alone runs the UI in a browser against a simulated engine (a banner says so); it is useful for UI work but plays no audio and sends no MIDI.

On Windows with Smart App Control enabled, freshly compiled proc-macro DLLs and test executables can be blocked with "An Application Control policy has blocked this file". CI is the reference build in that case.

## Documents

| | |
|---|---|
| [AGENTS.md](AGENTS.md) | The invariants every change obeys |
| [docs/plan/](docs/plan/00-README.md) | Goal, Definition of Done, status board, build plan M0 to M7, research, kickoff, owner gates |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Process model, buses, clock, IPC contract, data model, seams |
| [docs/EXTENDING.md](docs/EXTENDING.md) | How to add a style, chart, rig profile, control map, Jo tool, provider, instrument, screen |
| [docs/DESIGN.md](docs/DESIGN.md) | The dark stage design system |
| [docs/adr/](docs/adr/0001-tauri-rust-not-juce.md) | Decisions and why |
| [docs/hardware/](docs/hardware/cabling.md) | HeadRush, Black Spirit 200, Scarlett 2i2, cabling, shopping list |

## Licence

Apache-2.0. Sample packs are fetched at first run under their own licences, listed in `assets/LICENSES.md`.

See the [studio room guide](docs/guide/studio-rooms.md) for navigation, drafts, rehearsing, take review and music-video workflows.
