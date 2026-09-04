# Josefines Jamstudio

A desktop AI jam studio for one guitarist and his rig: a virtual band that reads a chord chart, a voice bandleader called **Jo** who changes the band while his hands stay on the guitar, MIDI control of the real amp and pedalboard as the song moves, and every jam recorded, analysed and exportable to Logic Pro. Real-song playback and generative AI music are on the plan and not built yet.

> **Status: engine, band, Jo, rig and recorder work; songs and AI music are placeholders.** The honest per-feature table is below and the milestone board lives in [docs/plan/00-README.md](docs/plan/00-README.md). Screens that are placeholders say so in the app itself and their backend commands refuse with a clear message instead of returning invented data.

## The idea

The guitar's tone is always made by hardware: HeadRush Pedalboard → Hughes & Kettner Black Spirit 200 → Vox 4x12, zero latency. The app **listens and plays**: it takes the dry DI the HeadRush already sends over USB, plays the band back on the HeadRush's return channels so guitar and band meet in the headphones, and never sits in the monitoring path.

```
Guitar ─► HeadRush ─► Black Spirit 200 ─► Vox 4x12
              │ USB: DI + processed in, band out
              ▼
        Josefines Jamstudio  ─ MIDI ─► HeadRush rigs, Black Spirit presets
        Band · Jo · Rig · Recorder · Logic export   (Song · AI music: planned)
```

## What works today

| Area | State | What is real |
|---|---|---|
| Audio engine | Working | `cpal` input/output with device and sample-rate negotiation, a render-ahead worker, a headless fallback and a fail-loud status pill. Tuner (McLeod pitch) and click are live. |
| Virtual band | Working | Sample-accurate sequencer: drums, bass and comp from a chart, six styles with three intensity tiers each, swing, humanisation, count-in, fills, crash, stop and ending cues, loop points, intensity following the guitarist's energy. Golden-render tests pin the output. |
| Chart library | Working | Bundled charts plus a text chart format you can type (`| Am7 D7 | G %|`), a chart editor, transposition, a chord strip that follows the bar, and a soloing helper suggesting scales and arpeggios per chord. |
| Practice tools | Working | Tap tempo, tempo trainer, keyboard shortcuts with a help overlay. |
| Jo (voice bandleader) | Working with caveats | Push-to-talk over the browser Web Speech API, replies over browser speech synthesis. With a Gemini key in the keychain Jo uses Gemini with function calling to drive transport, tempo, style, intensity, parts, cues, charts, loops and recording; without a key a local intent parser handles the common phrases. ElevenLabs voice is not wired. |
| Rig over MIDI | Working, hardware gate open | Data-driven profiles for HeadRush Pedalboard, Black Spirit 200, Quad Cortex, Helix, Kemper and Axe-Fx III; real MIDI out through `midir`; section-bound scene changes as the band plays; knobs, program changes and a MIDI monitor. Verified against the real rig: not yet (owner gate). |
| Recorder and export | Working | Every take is written as 24-bit WAV stems (guitar DI, band, master). Analysis measures pick timing against the take's tempo grid, dynamic consistency and intonation on the real DI file. Export writes the stems, a Standard MIDI File tempo map with the chart's section markers, and a JSON sidecar. Latency offset is a manual setting; automatic loopback measurement is not built. |
| Network | Working | An allow-listed proxy in Rust injects API keys from the OS keychain (keys never reach the UI) and keeps a local usage log shown on the Settings screen. |
| Real songs (M3) | Not built | Import, stems, beats, chords, time-stretch and section looping. The screen shows the intended layout and its commands return an honest error. |
| AI music (M4) | Not built | Lyria RealTime, Lyria 3, ElevenLabs Music. Same: placeholder screen, honest error. |
| Installers (M7) | Partly | `release.yml` builds macOS and Windows bundles on a tag; code signing and notarisation are not set up, so first launch needs the usual unsigned-app steps. |

Everything above is covered by CI on Windows and macOS (`cargo fmt`, `clippy -D warnings`, `cargo test` headless, `cargo deny`) and on Linux for the TypeScript side (Biome, `tsc`, Vitest, licence check, Vite build).

## Stack

Tauri 2 · Rust engine (`cpal`, `rtrb`, `hound`, `midir`, `pitch-detection`) · React 19 + TypeScript + Tailwind v4 + zustand · Google Gemini for Jo (bring your own key; it lives in the OS keychain). Apache-2.0.

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
