# Build plan for Josefines Jamstudio

This folder is the **governing plan** for building Josefines Jamstudio. It was written by Claude (Fable 5.1, architect and lead planner) on 2026-09-02 for **Gemini 3.8 Flash running in Google Antigravity** on Vegar's Windows PC, which builds the product. Everything here is written to be read cold: no knowledge of earlier sessions is needed beyond this repository.

## The goal, in Vegar's words

> "Målet er å lage software til Windows og Mac, så han kan jamme på høyt nivå, og integrere AI i jamsessions. Målet er å lage et mye bedre oppsett for ham enn det hardware-produsentene har gjort. Dette skal være premium. Det må være enkelt å bruke og det må funke. Og det må kunne bygges på i det hinsides."

In English: desktop software for macOS and Windows that lets Vegar's friend jam at a high level with AI in the loop, a far better setup than the hardware makers ship, premium, simple to use, working, and extensible without limit.

Who it is for: one guitarist and his rig (see [01-context.md](01-context.md)). "Josefine" is a dedication. The AI bandleader persona is called **Jo**.

What "better than the manufacturers" means, concretely (from the competitive research in [04-research.md](04-research.md)):

1. Desktop-native with a big screen, real audio I/O and multitrack recording. Every competing AI-jam feature lives on a phone.
2. Analyses the clean DI signal the HeadRush already sends over USB, not a room microphone.
3. Drives the actual rig over MIDI (HeadRush rigs, Black Spirit presets and parameters) as the song moves.
4. Exports real stems and a tempo map into Logic Pro. Every competitor is a walled garden.
5. Talks: a voice bandleader that changes the band while his hands are on the guitar.
6. Stays extensible: styles, charts, rig profiles, tools and providers are seams anyone can add to.

## Reading order

| File | What | When |
|---|---|---|
| [01-context.md](01-context.md) | The rig, the signal flow, what each box can do, the product's modes and boundaries | First session, and whenever something is unclear |
| [02-working-method.md](02-working-method.md) | Toolchain on Windows, the gates, git flow, spikes, reporting, per-task checklist | Every session (checklist) |
| [03-build-plan.md](03-build-plan.md) | Milestones M0 to M7 and spikes S1 to S5 with tasks, files and acceptance criteria | Governs the work |
| [04-research.md](04-research.md) | Verified facts about APIs, libraries and prices, with sources and "verify before coding" flags | When a milestone touches a provider or library |
| [05-kickoff.md](05-kickoff.md) | Prerequisites on the PC and the copy-paste prompts for Antigravity | At the start of every session |
| [06-owner-verification.md](06-owner-verification.md) | The gates only the real rig on the Mac can prove | At the end of milestones that touch hardware |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | Process model, buses, clock, IPC contract, data model, seams | Before writing any engine, IPC or provider code |
| [../EXTENDING.md](../EXTENDING.md) | Recipes for adding styles, charts, rigs, tools, providers, instruments, screens | Whenever something new is added |
| [../DESIGN.md](../DESIGN.md) | The design system and screen inventory | Before writing any UI |
| [../adr/](../adr/) | The decisions and why | When tempted to change an architectural choice |
| [../hardware/](../hardware/) | Per-device fact sheets, cabling, shopping list | M0 (device selection), M5 (rig), owner gates |

`AGENTS.md` in the repository root is the law. This folder adds *what* to build and *how* we work; it never overrides the invariants.

## Definition of Done for the project

The project is done when every point below is true and verified, the owner gates in [06-owner-verification.md](06-owner-verification.md) are ticked, and the status board shows every milestone ✅.

1. **Installs and runs on the guitarist's Apple Silicon Mac** from a GitHub Release. Onboarding completes with the HeadRush Pedalboard selected as a 4-channel input (dry DI on channel 3) and the HeadRush USB return as output. Latency calibration returns a stable offset within ±2 samples across 5 runs.
2. **Band.** At least 6 styles, any key, 40 to 240 bpm, chart editor with presets, count-in, cues (fill, crash, stop, ending), intensity following the guitarist's energy.
3. **Jo.** At least 90 % correct actions on the 30-utterance script in `tests/fixtures/jo/script.json` (mocked STT), and a median of at most 2.5 s from push-to-talk release to the first spoken word on the Mac.
4. **Songs.** Import a local audio file and get stems, chords, beats and key; a minus-guitar mix with residual guitar at or below -6 dB; time-stretch from 50 % to 150 % with transposition; section looping.
5. **AI music.** Lyria RealTime plays for at least 10 minutes continuously including one reconnect; a generated track (Lyria 3 or ElevenLabs Music) lands in the library already analysed.
6. **Rig.** Section-bound scenes change the HeadRush rig and the Black Spirit preset on the real rig (owner gate 5).
7. **Sessions.** Every jam is recorded; recorded stems open in Logic Pro 12 at bar 1 with less than 1 ms drift over 5 minutes; the exported Standard MIDI File imports with the correct tempo map and markers.
8. **Gates.** CI green on Windows and macOS on `main`; gitleaks, `cargo deny` and the JavaScript licence check green; docs current.
9. **Extensibility proven.** `tests/invariants/` adds a synthetic style, chart, rig profile, control map, Jo tool and provider from fixtures with zero changes to core files, and every recipe in `docs/EXTENDING.md` has been executed once as a test.

## Status board (the builder updates this after every milestone)

| Milestone | Content | Status | PR / release |
|---|---|---|---|
| M0 | Foundation: scaffold, crates, gates, CI, design shell, keychain settings, seam registries, tuner, metronome, spikes S1 to S3 | ✅ | #2 |
| M1a | Transport, timeline, click, count-in | ✅ | #4 |
| M1b | Drums: sampler, style engine, cues, render-ahead worker | ✅ | #6 |
| M1c | Bass, comp, chart, six styles, chart presets, golden renders | ✅ | #8 |
| M1d | Live steering and the Stage screen | ⏳ | |
| M1e | Recorder, latency calibration, take browser | ☐ | |
| M2 | Jo v1: push-to-talk, STT, LLM tools, TTS, persona (spike S5) | ☐ | |
| M3 | Real songs: import, analysis, stems, stretch, chord timeline, looping | ☐ | |
| M4 | AI music: Lyria RealTime, Lyria 3, ElevenLabs Music (spike S4) | ☐ | |
| M5 | Rig orchestration over MIDI | ☐ | |
| M6 | Sessions: take analysis, LLM review, Logic export, progress | ☐ | |
| M7 | Polish and distribution | ☐ | |

Rules for the board: ☐ becomes ⏳ when work starts, and ✅ only when **all** acceptance criteria in [03-build-plan.md](03-build-plan.md) are green, CI is green on both operating systems, and any owner gate the milestone names is ticked (or explicitly recorded as pending owner). Write the PR number or release tag in the last column. Partially done is ⏳ with one line under the board saying what remains.

## Where the truth lives

- Invariants: [`AGENTS.md`](../../AGENTS.md).
- Architecture, contracts, seams: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), [`docs/EXTENDING.md`](../EXTENDING.md).
- Decisions and their reasons: [`docs/adr/`](../adr/).
- Facts about hardware and providers: [`docs/hardware/`](../hardware/), [`04-research.md`](04-research.md).
- Spike findings: [`docs/spikes/`](../spikes/).
- Code (from M0): `crates/`, `src-tauri/`, `src/`, `tests/`, `styles/`, `charts/`, `rigs/`, `controls/`.
- The guitarist's data at runtime: `~/JosefinesJamstudio/` (files are truth; SQLite is a cache).
