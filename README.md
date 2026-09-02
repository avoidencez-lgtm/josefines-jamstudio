# Josefines Jamstudio

A premium desktop AI jam studio for one guitarist and his rig: a virtual band that reads a chord chart, a voice bandleader called **Jo** who changes the band while his hands stay on the guitar, real songs with the guitar removed and the chords on screen, Google Lyria's live generative band, MIDI control of the real amp and pedalboard, and every jam recorded, reviewed and exportable to Logic Pro.

> **Status: planning complete, no application code yet.** The architecture, the build plan and the repository skeleton were written on 2026-09-02. The app is being built milestone by milestone by Gemini 3.8 Flash in Google Antigravity; the status board in [docs/plan/00-README.md](docs/plan/00-README.md) is the truth about what works.

## The idea

The guitar's tone is always made by hardware: HeadRush Pedalboard → Hughes & Kettner Black Spirit 200 → Vox 4x12, zero latency. The app **listens and plays**: it takes the dry DI and the processed signal the HeadRush already sends over USB, plays the band back on the HeadRush's return channels so guitar and band meet in the headphones, and never sits in the monitoring path.

```
Guitar ─► HeadRush ─► Black Spirit 200 ─► Vox 4x12
              │ USB: DI + processed in, band out
              ▼
        Josefines Jamstudio  ─ MIDI ─► HeadRush rigs, Black Spirit presets
        Band · Song · Lyria · Jo · Recorder · Logic export
```

## What it does (the four pillars)

1. **Virtual band.** Drums, bass and comp from a chord chart in a style (blues shuffle, straight rock, funk, swing, 6/8 ballad, metal), any key, 40 to 240 bpm, count-in, fills and endings on command, intensity that follows how hard he plays.
2. **Jo, the voice bandleader.** Hold a pedal or a key, say "blues in A, ninety, shuffle", release. Jo confirms in her own voice and counts it in. She explains, loops sections, and coaches from the recorded take.
3. **Real songs.** Drop an audio file; get stems (guitar removed), chords, beats, key and sections; slow it down, transpose it, loop the solo.
4. **AI music.** Lyria RealTime as an endless, steerable band; Lyria 3 and ElevenLabs Music for full tracks that land in the library already analysed.

Plus rig scenes over MIDI, session recording with an LLM review, and export to Logic Pro 12 (stems + tempo map + markers).

## Stack

Tauri 2 · Rust engine (`cpal`, lock-free render-ahead, `midir`) · React + TypeScript + Tailwind · Google Gemini (LLM, Lyria) · ElevenLabs (voice, music, stems) · Music.ai (analysis). Bring your own keys; they live in the OS keychain. Public repository under Apache-2.0.

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

## Building

From M0 onward: see the commands in [AGENTS.md](AGENTS.md) and the prerequisites in [docs/plan/05-kickoff.md](docs/plan/05-kickoff.md). Releases (macOS Apple Silicon `.dmg`, Windows installer) appear under GitHub Releases from M7.

## Licence

Apache-2.0. Sample packs are fetched at first run under their own licences, listed in `assets/LICENSES.md`.
