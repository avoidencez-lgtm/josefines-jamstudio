# Josefines Jamstudio

A desktop AI jam studio for one guitarist and his rig: a virtual band that reads a chord chart, a voice bandleader called **Jo**, real songs with guitar-out stems, MIDI control of the amp and pedalboard, and every jam recorded for review and Logic Pro export.

The guitar's tone is always hardware. The app listens and plays. It is never in the monitoring path.

```
Guitar ─► HeadRush ─► Black Spirit 200 ─► Vox 4x12
              │ USB: DI + processed in, band out
              ▼
        Josefines Jamstudio  ─ MIDI ─► HeadRush rigs, Black Spirit presets
        Band · Song · Lyria · Jo · Recorder · Logic export
```

> **Status: v0.1.0 on `main`.** Milestones M0–M7 are merged. The offline band, transport, recorder, MIDI rig profiles and Stage UI run without cloud keys. Lyria RealTime, ElevenLabs Music and neural stem separation still need provider wiring; until then the app stays offline and says so.

## What works offline

1. **Virtual band.** Six styles, preset charts, count-in, cues, intensity, part mutes.
2. **Jo.** Push-to-talk (`T`) with an offline intent parser. Cloud STT/TTS when keys are in Settings.
3. **Recorder.** Multi-track takes, latency calibration, DAW export (stems + tempo map).
4. **Rig.** Profile/scene MIDI maps for HeadRush, Black Spirit 200 and common modelers.

## Stack

Tauri 2 · Rust (`cpal`, lock-free render-ahead, `midir`) · React + TypeScript + Tailwind · keys in the OS keychain. Apache-2.0.

## Run

```powershell
corepack pnpm install --frozen-lockfile
$env:JAM_HEADLESS = "1"
$env:JAM_FAKE_INPUT = "tests/fixtures/audio/guitar-e-blues-120.wav"
corepack pnpm tauri dev
```

Gates and invariants: [AGENTS.md](AGENTS.md). Hardware setup: [docs/QUICKSTART.md](docs/QUICKSTART.md).

## Documents

| | |
|---|---|
| [AGENTS.md](AGENTS.md) | Invariants |
| [docs/plan/](docs/plan/00-README.md) | Goal, Definition of Done, status board M0–M7 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Process model, clock, IPC, seams |
| [docs/EXTENDING.md](docs/EXTENDING.md) | Add a style, chart, rig, tool, provider, screen |
| [docs/DESIGN.md](docs/DESIGN.md) | Dark stage design system |
| [docs/adr/](docs/adr/0001-tauri-rust-not-juce.md) | Decisions |
| [docs/hardware/](docs/hardware/cabling.md) | HeadRush, Black Spirit 200, Scarlett 2i2 |

## Licence

Apache-2.0. Sample packs are fetched at first run under their own licences, listed in `assets/LICENSES.md`.
