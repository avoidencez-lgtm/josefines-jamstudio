# Context: the rig, the signal flow, the product

## The rig

| Role | Gear | What it gives the app |
|---|---|---|
| Guitars | Ibanez RG570 (1992), Ernie Ball Music Man JPX | Nothing electronic. Both have humbuckers and tremolos; tuning drifts, so the tuner matters |
| Modeller / pedalboard | HeadRush Pedalboard (original, 7-inch touchscreen, Eleven HD Expanded DSP, firmware 2.7) | USB audio 4-in/4-out (processed stereo + **dry DI**), MIDI In/Out (receives PC and CC, sends PC only), aux in, headphone out, 20-minute looper |
| Amplifier | Hughes & Kettner Black Spirit 200 (head) | MIDI In/Out/Thru: 128 presets by Program Change and nearly every knob by Control Change; Red Box AE+ DI out; aux in; headphone out |
| Cabinet | Vox 4x12 | Loud. Voice control near it needs push-to-talk and a close microphone |
| Interface | Focusrite Scarlett 2i2 (generation to confirm; 4th gen has loopback) | Alternative input path: Red Box DI from the amp, or a clean DI split; a microphone preamp for Jo |
| DAW | Apple Logic Pro 12 on a Mac (Apple Silicon assumed) | The export target: WAV stems + Standard MIDI File tempo map and markers |
| Computers | His Mac (primary target); Vegar's Windows 11 PC (development, CI, no audio interface) | Windows is a build and test target, not the stage |

Full per-device fact sheets with sources: [docs/hardware/](../hardware/).

## Signal flow

Guitar tone is always made by hardware. The app is never in the monitoring path.

```
                 analogue, zero latency
 Guitar ──► HeadRush Pedalboard ──► Black Spirit 200 ──► Vox 4x12
                 │  ▲                       ▲
     USB (4 in / 4 out)                     │ 5-pin MIDI (PC, CC, clock)
                 ▼  │                       │
 ┌────────────────────────────────────────────────────────────┐
 │  Mac running Josefines Jamstudio                            │
 │   in  ch1/2  processed guitar   (record "amp" track)        │
 │   in  ch3    dry DI guitar      (tuner, energy, analysis)   │
 │   out ch1/2  band / song / Lyria / Jo / click               │
 │             → HeadRush master outs + headphones             │
 │             (does not pass through the rig)                 │
 │   USB-MIDI interface → Black Spirit MIDI In                 │
 │                        → Black Spirit Out/Thru → HeadRush In│
 │   microphone (built-in / headset / Scarlett) → Jo           │
 └────────────────────────────────────────────────────────────┘
```

Why this works: the HeadRush's USB return (computer channels 1/2) lands directly on its master outputs and headphone jack, so the guitarist hears the band and his own zero-latency guitar together in headphones or through the amp's aux path, while the app only *listens* and *plays*. Details and alternatives (Scarlett path, Red Box DI, aux inputs) in [../hardware/cabling.md](../hardware/cabling.md).

Neither the HeadRush nor the Black Spirit exposes USB-MIDI. A USB-to-5-pin MIDI interface is required for rig control ([../hardware/shopping-list.md](../hardware/shopping-list.md)).

## The product in one paragraph

Josefines Jamstudio is a desktop app (Tauri 2, Rust engine, React UI) with one **Stage** screen where the guitarist picks a music source, presses play, and plays. The music source is one of three, mutually exclusive: the **Band** (a virtual drummer, bassist and comp player reading a chord chart in a chosen style), a **Song** (an imported track with the guitar removed, chords on screen, tempo and key adjustable), or **Lyria** (Google's live generative music stream, steered by prompts, bpm and key). Over any source, **Jo** listens when he holds push-to-talk, changes the band, counts in, explains, and coaches. **Rig scenes** bound to chart sections flip the HeadRush rig and Black Spirit preset by MIDI as the arrangement moves. Every jam is **recorded** as aligned stems, reviewed by an LLM, and exportable to Logic Pro with a tempo map. Keys for Google Gemini and ElevenLabs are the guitarist's own and live in the OS keychain.

## Modes and overlays

| Music source (exactly one active) | Content | Milestone |
|---|---|---|
| None | Silence, click optional, tuner | M0, M1a |
| Band | Chart + style, live-steerable | M1b to M1d |
| Song | Imported audio, stems, stretch/transpose, chord timeline | M3 |
| Lyria | Lyria RealTime stream, prompt/bpm/scale steering | M4 |

Overlays that work with any source: **Jo** (M2), **Recorder** (M1e), **Rig scenes** (M5, follow the active chart's sections; in Song mode the analysed sections; in Lyria mode manual only), **Click** (M1a).

Band and Lyria never run together and nothing tries to synchronise Lyria to a chart. Lyria's bpm is a request, not a clock ([ADR 0004](../adr/0004-providers-suno-out-lyria-elevenlabs-musicai.md)).

## What the app never does (product boundaries)

1. It never processes the guitar for monitoring. No amp simulation, no software monitoring on by default, no VST3/AU hosting in v1 ([ADR 0002](../adr/0002-listen-dont-process.md)).
2. It never downloads from YouTube or any streaming service. Songs come from the guitarist's own local files.
3. It never puts an API key in the WebView, a log, a config file or the repository ([ADR 0003](../adr/0003-rust-owns-bytes-js-owns-text.md)).
4. It never sends audio anywhere the guitarist did not ask for. Every provider call is logged locally with provider, model and cost.
5. It never depends on the SQLite database being intact. Files under `~/JosefinesJamstudio/` are the truth ([ADR 0005](../adr/0005-files-are-truth-sqlite-is-cache.md)).
6. It never bundles audio assets of unclear licence. Sample packs are fetched from a GitHub Release with a checksum and a licence line ([ADR 0006](../adr/0006-licence-allowlist-and-assets.md)).
7. It never uses Suno or Udio. Neither has an official API; third-party wrappers risk account bans.

## People

- **The guitarist.** Plays blues, rock, funk and metal at a high level, owns the rig, uses a Mac and Logic Pro. Wants to pick up the guitar and be playing within ten seconds, hands on the instrument, eyes two metres from the screen. Does not want to configure anything twice.
- **Vegar.** Owner of the project. Runs the builder on Windows and tests with the file-backed virtual input. Sessions with the guitarist on his Mac and rig are deferred to V2; they do not block V1. Developer verification and packaging remain V1 requirements ([delivery decision](00-README.md)). Reads reports in English; conversation with Claude is in Norwegian.
- **Jo.** The AI bandleader. English. Confirms actions in at most twelve words ("Blues in A, ninety, shuffle. Counting in."), asks at most one question when something is ambiguous, never lectures unless asked, uses musicians' vocabulary (turnaround, quick change, four on the floor, half-time), and coaches from evidence (the recorded take), not from guesses. Her persona file is `src/ai/jo/persona.md` (M2).

## Development reality

- Windows PC: Node 24, Visual Studio 2022 Build Tools with MSVC, WebView2 runtime, no Rust yet (install in M0), no audio interface. The engine's `FileInput` (looping WAV) and `NullOutput` (fake clock) make every milestone testable here and in CI.
- macOS: GitHub Actions (`macos-latest`) provides automated verification. Developer package/startup verification remains required for V1; personal Mac and rig sessions with the guitarist are deferred to V2. Keep macOS-affecting changes small and frequent.
- Windows audio is a non-goal beyond stereo: WASAPI most likely exposes the HeadRush as a stereo device, so channel 3 (DI) is a Mac-only feature. Document, do not fight it.

## Glossary

| Term | Meaning here |
|---|---|
| DI | The dry, unprocessed guitar signal (HeadRush USB channel 3) |
| Bus | A mix path in the engine: guitar, drums, bass, comp, ai, song, voice, click, master |
| Chart | A chord progression with sections and bars, in a key and time signature |
| Style | A groove definition (drum, bass and comp patterns per intensity band) in JSON |
| Scene | A set of MIDI commands sent to the rig at a section boundary |
| Take | One recording: aligned WAVs for DI, amp, band buses and the mix |
| Session | A jam: a chart or song, a style, the takes, an LLM review |
| Seam | A definition plus a registry plus consumers; the only allowed abstraction |
| Owner gate | A personal Mac/rig verification with the guitarist, deferred to V2; not a V1 release blocker |
| Spike | A time-boxed experiment on a throwaway branch whose findings are recorded in `docs/spikes/` |
