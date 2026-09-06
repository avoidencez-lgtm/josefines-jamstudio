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

These are the original full-product targets, not claims about the current preview. The V1/V2 decision below supersedes references to friend-led owner acceptance as a V1 release blocker throughout this plan.

### V1 delivery and V2 friend testing (user decision, 2026-09-05)

Vegar wants a finished, polished product to hand to his friend. The friend's usability sessions and checks on his personal Mac/rig are deferred to **V2**. Do not request those sessions to unblock V1, and do not mark them passed. Keep their procedures in [06-owner-verification.md](06-owner-verification.md), labelled **deferred to V2**.

This changes who must test before handoff, not the promised feature scope. Unbuilt voice, stem separation, analysis, time-stretch, realtime generation, calibration and other agreed capabilities remain unfinished work; the deferral does not turn placeholders into completed features. Document external service or hardware requirements and failures clearly.

V1 still requires completed workflows, the agreed focused songwriting UI and personalization, accessible controls, and English/Bokmål help available beside the relevant features. The builder verifies persistence and recovery, audio/export behavior with synthetic fixtures, keyboard/accessibility behavior, rendered UI, and install/startup behavior on the available platforms. Required CI, security, licence and packaging checks remain release gates. Automated checks do not prove the friend's subjective experience or his physical setup.

For each milestone, report implementation status, developer verification evidence and deferred V2 friend checks separately. A passing narrow regression or a merged PR is not proof that the whole milestone is finished. Signing/notarisation and any other missing release prerequisite remain open until completed or explicitly decided by Vegar.

### Original product targets

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

2026-09-06 M3 Jo song loading: `load_song(query)` searches fresh native library
metadata and loads an exact title/ID or unique title fragment through the
existing reference player. English `load song …` and Bokmål `last inn sangen …`
work offline; configured speech uses the same dispatcher. Ambiguous matches,
recording, busy media work and native failures are explicit. Stage opens paused
with saved stems/practice settings. Songs shares the accepted-load UI reset.
Jo command sequences stop at a failed action, preserving the previous source
instead of playing it after a failed load. Synthetic invariant tests cover the
flow; cross-platform CI remains required before merge. This is one M3 slice;
provider analysis, automatic sections, reference ramps, realtime generation,
developer hardware/voice acceptance and distribution still remain V1 work.

2026-09-05 build integration: PRs #200 (chart duration precision), #204 (count-in
destination) and #207 (native logging) are merged. PR #192 replaces estimated
render-lead delays with output-callback frame pairing and drains the queued take
tail before finalisation. Synthetic callback alignment and WAV/MIDI onset checks
cover the implementation; current-head Windows/macOS CI remains the merge gate.
This does not complete the remaining V1 capabilities or signing, and friend-led
hardware checks remain deferred to V2.

PR #210 integrates #192 while moving file preparation and finalisation outside
the render/recorder locks. Recording activates atomically with song playback;
metadata uses the song tempo and failed capture saves preserve the idea buffer.
Current-head CI remains required before merge. The remaining V1 scope is unchanged.

2026-09-05 Jo action results (issue #166): transport, band and recording refusals
reach Jo as explicit failures while retaining the normal UI notice. Success uses
the accepted command value, including clamped tempo, and unchanged document edits
are reported without claiming a change. Failing-IPC regressions cover every legacy
engine action. This advances reliable AI control; voice and other unbuilt V1
capabilities remain unfinished. Friend-led testing remains deferred to V2.

2026-09-05 Write follow-up ([PR #119](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/119), merged): the workspace names the arrangement loaded in the band and distinguishes it from the current draft, including band settings and guitar layers. Play, loop and record share the accepted-snapshot update; failed loads preserve the previous indicator. Contextual help and both exported manuals explain Save versus Play versus Space.

2026-09-05 rig persistence follow-up ([PR #117](https://github.com/avoidencez-lgtm/josefines-jamstudio/pull/117), merged): profile, section mapping, follow-section and MIDI connection changes save before replacing the active configuration. IPC regression coverage verifies corrupt-file and write failures leave the previous runtime state and settings file intact, including an existing synthetic MIDI connection. Hardware verification is not claimed.

2026-09-05: PR #77 completes the IPC/store test harness and built-app startup smoke.
See [coverage and excluded regression candidates](../reviews/2026-09-05-e2e-completion.md); this does not close physical owner gates.

2026-09-05 (bug sweep, later the same day): PRs #66 to #74 closed 24 review issues, split the bundle, and added section deletion, setlist grooves, an always-open Jo composer and chord shapes; see [the bug-sweep report](../reviews/2026-09-05-bugsweep.md). Earlier that day: ten room tools merged in #57. The storage-recovery follow-up addresses #31/#48 and records the already-authorized bilingual-help exception (#49). See [issue triage](../reviews/issues-2026-09-05.md) for all 25 reviewed reports, including the per-open help-language claim that was not reproduced. Other follow-ups and owner hardware gates remain open.


| Milestone | Content | Status | PR / release |
|---|---|---|---|
| M0 | Foundation: scaffold, crates, gates, CI, design shell, keychain settings, seam registries, tuner, metronome, spikes S1 to S3 | ✅ | #2, reworked in #28 |
| M1a | Transport, timeline, click, count-in | ✅ | #4, #28 |
| M1b | Drums: sampler, style engine, cues, render-ahead worker | ✅ | #6, #28 |
| M1c | Bass, comp, chart, six styles, chart presets, golden renders | ✅ | #8, #28 |
| M1d | Live steering and the Stage screen | ✅ | #10, #28 |
| M1e | Recorder, latency calibration, take browser | ⏳ | #12, #28 |
| M2 | Jo v1: push-to-talk, STT, LLM tools, TTS, persona (spike S5) | ⏳ | #14, #28 |
| M3 | Real songs: import, analysis, stems, stretch, chord timeline, looping | ⏳ | native stem mixing, ElevenLabs upload, live per-stem speed/key and Jo controls added; real provider/guitar-removal acceptance, provider analysis, automatic downbeats/sections and full transport-grid integration pending; confirmed section loops and canonical song-file storage added |
| M4 | AI music: Lyria RealTime, Lyria 3, ElevenLabs Music (spike S4) | ⏳ | file-generation catalog/workflows in #29; RealTime and owner acceptance pending |
| M5 | Rig orchestration over MIDI | ⏳ | #20, #28 |
| M6 | Sessions: take analysis, LLM review, Logic export, progress | ⏳ | #22, #28 |
| M7 | Polish and distribution | ⏳ | #28 |

What remains, per open milestone:

- **M1e**: takes record as 24-bit WAV stems and the take browser works. Latency compensation is a manual offset; the automatic loopback measurement is not built.
- **M2**: typed Jo, configurable providers, offline intents and installed-agent proposals are available. Native STT/TTS and the voice bus are implemented with bounded capture, cancellation and synthetic tests. Stage presence, an explicitly enabled global hold shortcut and two-press MIDI activation now share the same conversation and voice lifecycle. Submitted STT seconds, TTS characters and configurable estimates now appear in the existing usage log. Provider-reported LLM tokens, the planned recorded 30-utterance fixture and live latency gate remain outstanding. Browser speech has been removed.
- **M3**, **M4**: local media import/reference playback, music/video generation, ComfyUI workflows and Film rendering exist in #29. Local Signalsmith practice copies change speed and pitch without replacing the source. Native references now share transport/recording, seconds loops, stem mixing and live speed/key processing. Songs saves low-confidence tempo/chord/key estimates with the source hash. ElevenLabs separation submission and local ZIP import exist; real provider/guitar-removal acceptance, Music.ai, provider analysis, downbeat/section detection, beat-grid synchronisation and Lyria RealTime remain unfinished. Friend-operated model/GPU acceptance is deferred to V2.
- **M5**: six rig profiles, real MIDI out, section-bound scenes and a monitor are in and tested against a memory sink. Owner gate 5 (the real HeadRush and Black Spirit) is pending owner.
- **M6**: analysis reads the recorded DI (timing, dynamics, McLeod-based intonation) and export writes stems, a tempo map with the chart's markers and a sidecar. The LLM review of a take and the Logic Pro drift measurement (owner gate) are outstanding.
- **M7**: CI is green on Windows and macOS; `release.yml` builds bundles on a tag. Signing, notarisation, onboarding and the `tests/invariants/` extensibility proofs are outstanding.

History: PRs #2 to #25 marked every milestone ✅ while most of M3, M4 and M6 were stubs returning fixed data. #28 replaced the stubs with working code where it could and honest refusals where it could not, and reset this board to match.

Rules for the board: ☐ becomes ⏳ when work starts, and ✅ only when the implementation and developer acceptance criteria in [03-build-plan.md](03-build-plan.md) are verified and CI is green on both operating systems. Friend-led owner checks are separately recorded as deferred to V2, never as passed. Write the PR number or release tag in the last column. Partially implemented or unverified work stays ⏳ with one line saying what remains. Historical entries below retain their original evidence; read their owner-gate wording under the V1/V2 decision above.

## Where the truth lives

- Invariants: [`AGENTS.md`](../../AGENTS.md).
- Architecture, contracts, seams: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), [`docs/EXTENDING.md`](../EXTENDING.md).
- Decisions and their reasons: [`docs/adr/`](../adr/).
- Facts about hardware and providers: [`docs/hardware/`](../hardware/), [`04-research.md`](04-research.md).
- Spike findings: [`docs/spikes/`](../spikes/).
- Code (from M0): `crates/`, `src-tauri/`, `src/`, `tests/`, `styles/`, `charts/`, `rigs/`, `controls/`.
- The guitarist's data at runtime: `~/JosefinesJamstudio/` (files are truth; SQLite is a cache).
# Songwriting slice: writing and recording originals

Added on top of the real-band rebuild: Write editor, independent section parts and
groove locks, optional rolling capture, trimmed guitar layers, overdub recording,
undo/versions, favourite takes, durable song/take files and separated DAW exports.
The follow-up adds learned PC/CC/note pedals, section rehearsal loops, guitar/trim
audition, and optional song-owned rig scenes with MIDI echo suppression.
Complete exports now also include a REAPER session builder for aligned tracks,
section markers and editable band MIDI; Logic export remains available.
See [the user guide and owner acceptance session](../guide/songwriting.md).
This does not complete the broader M3/M4 provider work or the hardware/Logic gates.
Verification results belong in the associated PR; owner acceptance remains pending.

The API follow-up connects OpenAI Responses, Claude Messages and OpenRouter
alongside Gemini, with shared editable model/limit settings and a Song Lab for
reviewable chords, bridges, lyric seeds and arrangement advice. This is text-only;
At that stage cloud audio was unimplemented. Live provider/account acceptance is
pending; documented synthetic fixtures are not live API evidence.
See [the current API guide](../guide/api-options.md).

The installed-agent slice adds a persistent in-app assistant, dynamic API model
catalogs, Codex/Claude Code CLI connections and six practical studio tools. A live
Codex structured-reply check passed with this host's saved ChatGPT login. Claude
Code was unavailable locally; live Claude and Mac owner acceptance remain pending.
Studio action groups preserve versions and reject stale/invalid/locked edits.
The installed-agent slice does not implement an embedded terminal or external MCP control.

The music-video slice adds Film projects, retained media jobs, imported or recorded
soundtracks, editable section-based cuts and local FFmpeg MP4 rendering. The shared
catalog includes Lyria 3.5, Eleven Music, MiniMax Music 3, Omni, Runway Gen-4.5,
Veo 3.1, Hailuo 3, Seedance 2.5, Wan 3 and configurable ComfyUI workflows for local
Wan, ACE-Step and MiniMax Music. Agent shot edits use Undo and never generate media.
This replaces the AI Music placeholder with an actual generation workflow; live
streaming, separation and broader M3/M4 work remain incomplete. Paid model access,
GPU generation and native Mac preview/playback remain owner gates. The local
synthetic MP4 test passed with duration and AAC signal tolerances. See the
[music-video guide](../guide/music-video.md) and [ADR 0008](../adr/0008-music-video-workspace.md).


The Write redesign puts the song map and beat-aware chord grid first, with local
harmony exploration, independent section variations, phrase transforms, locked-part
energy controls and durable section lyrics. AI lyric proposals target the section
sheet after review. Capture, pedals, layers and versions remain available in focused
views. See [prior art and limits](../research/write-workspace.md). This UI/text slice
does not complete native audio, transcription or Mac owner acceptance gates.


The studio-room redesign extends #29 across Stage, Library, Jo, Songs, AI Music,
Film, Sessions, Rig and Settings. Distinct labelled icons, task views, searchable
collections, arranged-section practice loops, persistent chart/conversation drafts,
reviewed Jo song edits and take keeper workflows are implemented. Songs now uses
real local media import/player commands; it does not complete M3 stem/stretch
work. See [room guide](../guide/studio-rooms.md) and [research](../research/studio-workspaces.md).
Frontend checks, headless Rust gates and multi-size browser checks pass locally;
Windows/macOS CI and owner acceptance are tracked in #29. No milestones are marked
complete by this UI slice alone.

## Build integration

The clip-catalog follow-up (#221, awaiting renewed review and CI) reads the take
catalog once for a layered-song load, DAW export or media mix. Per-clip ID checks
and decoded-audio caching remain in place. Songs without clips skip the catalog
entirely, so a broken take folder cannot block their load. A native IPC regression
uses an unreadable catalog fixture and verifies this independence.

The rate-mismatch follow-up (#211, awaiting renewed review and CI) closes an input
whose rate differs from the output and refuses jam/song recording and recent-idea
capture before creating files. A dedicated input-error state supplies the shared
guard; displayed error wording does not control eligibility. The isolated
file-input regression verifies all three paths and recovery after a matching
restart. Settings help explains this in English/Bokmål. This is damage prevention;
edge resampling and the fixed internal 48 kHz requirement remain unfinished (#184).

The licence-gate follow-up for #157 (awaiting review and CI) uses the existing
SPDX evaluator so grouped AND/OR expressions retain their meaning. Malformed
tables, package groups and records fail closed; records require a name and the
non-empty `versions` array emitted by pinned pnpm 11. Existing allowlist entries,
package-specific exceptions and the minimum inventory size are unchanged.
The command-level regressions in `tests/invariants/js-licences.test.mjs` run with
controlled pnpm output, including failed commands and malformed JSON. The real
installed inventory is also checked; no generated licence report is trusted
solely because it contains fifty records.

The follow-up to merged PR #205 (awaiting current-head review and CI)
routes Settings/Film links through the native browser opener and reports launch
failures with a copyable URL. The shared macOS browser/player path checks opener
completion; Windows confirms only the Explorer handoff. A rejected IPC regression
failed before the notice fix. English/Bokmål troubleshooting explains recovery.

The current build is stabilised separately from the unbuilt roadmap above. See
[build closeout](../reviews/build-closeout.md) for native IPC, persistence, meter
export and installer validation. Owner hardware/provider gates remain open;
no milestone is marked complete by a headless or browser-only check.

## Documentation and original-song finishing

The 2026-09-05 pass adds searchable English/Bokmål help, generated manuals for all rooms, save/recovery/trainer fixes, and Write → Finish (structural review, transition variants and compatible section comps). [Verification and remaining owner gates](../reviews/studio-verification-2026-09-05.md) and [research decisions](../research/song-finishing.md) describe the scope. This pass does not complete the unbuilt voice, stem/stretch, realtime generation or hardware acceptance milestones.

## One capability per studio room

The next 2026-09-05 pass adds melody-to-harmony sketches, rehearsal setlists, harmonic discovery, three-perspective coaching, reference forms, arrangement briefs, beat-grid cuts, blind take comparisons, song tone snapshots and audio setup profiles. English/Bokmål help covers all ten; [validation, the live-test incident and remaining owner gates](../reviews/room-capabilities-2026-09-05.md) distinguish browser, native headless, live CLI and physical-hardware evidence. The existing roadmap and signing/owner gates remain open.

### 2026-09-05 take-analysis evidence (PR #125, merged)

Sessions now presents measured grid distance, early/late bias, spread, attack-level
variation and pitch coverage. Missing evidence is explicit. Local exercises do not
rate musical quality; Analysis help opens the English/Bokmål explanation beside
the take. Existing cached scores can be reanalysed. The IPC adds raw measurements
without removing legacy fields. This advances M6 but does not complete durable
analysis, bend-aware precision, chord agreement or structured provider reviews.

The persistence follow-up (PR #126, merged) saves versioned measurements and source details into
the take manifest before reporting success. Sessions restores them when reopened,
including with an empty index, and offers Analyze again for damaged or unsupported
evidence. Metadata writes stay inside the validated take directory and refuse
pre-existing temporary files. This completes analysis persistence; structured
provider reviews and the remaining M6 measurement targets are still unfinished.

The pitch-precision follow-up replaces the shared detector per
[ADR 0011](../adr/0011-pitch-measurement-precision.md). Stationary synthetic
signals now meet ±3 cents across 648 detector cases and 15 take-analysis cases.
Saved analysis advances to analyzer version 2; older evidence offers Analyze again.
This applies to the tuner, melody extraction and take analysis. It does not
complete bend exclusion, noisy-sweep acceptance, chord agreement or structured
provider feedback. Friend-led testing remains deferred to V2.

### Count-in meter changes (PR #167)

A different meter restarts an active count-in so its clicks match the new chart.
An unchanged or invalid meter preserves progress. The regression advances beyond
the shortened boundary that caused the original underflow, then verifies four
restarted clicks, exact playback spans and one completion event. This developer
verification is separate from the friend-led checks deferred to V2.

The destination follow-up (PR #204, awaiting review and CI) preserves the selected
bar when the count-in completes. At the song beginning an armed loop supplies the
entry bar. Preview playback reads the existing song position instead of caching
the count-in display bar, so repeated Play, late seeks and newly armed loops do
not lose the destination. Native tests verify the surplus render span and one
downbeat at the correct offset. English/Bokmål Stage help documents this behavior.

### Recording interruption feedback (issue #137)

Rejected disk-queue blocks no longer advance the accepted-frame count or collect
MIDI. The native control thread reports a capture failure while preserving the
pending take for finalisation. Transport, Sessions and Write offer Save partial
take and stop presenting capture as live. The close/device guards stay active
until finalisation. Native backpressure and frontend failure/recovery regressions
cover this path; alignment and start/stop disk-lock work remain separate.

### Chart duration precision (PR #200, awaiting review and CI)

The shared text formatter preserves numeric beat durations instead of rounding
each chord to two decimals. Mixed thirds and dense bars survive repeated
format/parse cycles without losing a bar or accumulating drift. Short scientific
notation emitted for tiny durations is readable by the parser. Explicit bar
totals retain the existing 1e-6 tolerance. English/Bokmål chart help explains
mixed counted/shared beats. This does not complete the separate tempo-range or
schema-validation work.

### Credential recovery (PR #194, merged)

Keychain read failures remain distinct from missing keys through provider status,
Jo and media preflight. Settings shows unavailable access and offers Check key
status after unlocking the OS keychain; successful retry restores availability.
Failed removal is reported, and a failed Jo provider request cannot run offline
commands. English/Bokmål help explains recovery. Developer checks cover failed
stores, production error mapping, provider/preflight results and browser controls;
no live keychain or paid-provider verification is claimed. Friend checks remain V2.

## Native reference stems — 2026-09-06 implementation evidence

Songs can import a local stem ZIP or submit a confirmed ElevenLabs separation
request, preserve the paid ZIP for recovery, and load the resulting tracks in the
native player. Songs and Stage share persistent per-track gain/mute and explicit
guitar selection with minus/restore guitar. Original stereo playback remains
available. The output and recording queue stay shared; recordings contain the
stereo backing mix and its stem settings in the take snapshot.

Local verification: 315 Rust tests passed (five opt-in tests ignored in the
standard run); the additional FFmpeg WAV/MP3 stem import/reload/recovery test
passed explicitly. Frontend: 262 tests, lint/types/build, JavaScript licences,
Rust formatting/Clippy and cargo-deny passed. Static component QA checked Songs
and Stage at 930 px without horizontal overflow. The native desktop build and
25-second frontend-handshake smoke passed locally. Windows/macOS CI remains
required before merging this slice.

No paid provider call was made and no real response fixture was recorded. This
is not M3 acceptance: real-song guitar removal, Music.ai, stem-aware stretching,
provider analysis and analysed-grid controls remain unfinished. The rest of V1,
including realtime Lyria, retains its original scope. Friend-led physical rig
checks remain deferred to V2, not passed.

## Live reference practice — 2026-09-06 implementation evidence

Songs and Stage can apply and save 50–150% speed and ±12 whole semitones to
native stereo references or each loaded stem. The original files, stem mix and
guitar DI are preserved. The source-second loop/cursor and consumed-output chord
readout follow processing; recording includes the processed backing and actual
settings. Jo uses the same guarded partial-update IPC, with explicit English
and Bokmål offline commands. Recording blocks settings changes.

Local checks: 319 Rust tests passed, six opt-in tests ignored; 265 frontend tests
passed. FFmpeg WAV/MP3 import and practice-setting reload passed separately.
An eight-stem synthetic CPU probe produced eight seconds in 1.230 seconds,
with a 10.582 ms worst block. Pitch is checked within five cents at
44.1/48/96 kHz; source position within one source frame. Native half-speed/+2
recording checks pitch, stereo correlation, RMS and silent blocks. Original
stereo's two-LSB assertion stays intact. Initial recording/import test failures
came from applying raw-path assertions to processed audio; the raw and processed
checks now explicitly exercise their respective paths without relaxing the raw
tolerance. Lint/types/build, formatting, Clippy and licence gates passed.
Static Songs/Stage component QA at 930 px found no horizontal overflow.
The native debug desktop build and 25-second frontend-handshake smoke passed
locally. Windows/macOS CI on the PR head is required before merging.

This advances M3, without claiming a physical-device dropout or subjective
quality gate. No paid call or recorded provider fixture was obtained. Analysed
sections/grids, real-song separation acceptance, Music.ai, Jo tempo ramps and
realtime Lyria remain unfinished V1 work. Friend rig checks remain V2.

## Confirmed reference sections — 2026-09-06 implementation evidence

Songs can save explicit user confirmation of the first downbeat, estimated beats
per bar and named sections. Native playback consumes that map for bar/beat/section
readout and downbeat-to-downbeat section loops in Songs and Stage. Jo can select
a unique confirmed section by name. Source hashes and displayed beat arrays guard
against stale edits; unknown metadata survives, and the full map goes into take
snapshots. No provider downbeat or section detection is inferred by this feature.

Local checks: 323 Rust tests passed (six opt-in tests ignored), 267 frontend tests
passed; the FFmpeg WAV/MP3 import/reload test passed separately with grid reload
and stale-hash recovery. The OutputTap regression varies render lead and callback
sizes at 44.1/48/96 kHz and 50/75/150% speed, verifies consumed source position
within one 48 kHz frame and loop wraps within one output step plus one source
frame. IPC checks source/section IDs, capture guards and the recorded grid.
Initial fixture-path and manual-vocabulary test errors were corrected without
weakening their guards. Lint/types/build, Clippy, formatting and licence gates
passed. Static Songs/Stage QA at 930 px found no horizontal overflow.
The native desktop build and 25-second frontend-handshake smoke passed locally;
Windows/macOS CI on the PR head is required before merge.

This is the confirmed-grid transport slice, not completion of M3. Automatic
Music.ai/provider analysis still needs verified response fixtures and real-song
acceptance; the public-schema ambiguity is recorded in 04-research.md. Canonical
song-file migration, full band/MIDI/DAW tempo-map integration, practice ramps,
realtime Lyria and the rest of V1 remain unfinished. Friend rig checks remain V2.

### M3 canonical song-file storage — 2026-09-06

New imported/generated audio, clean take mixes and practice copies now publish
`songs/<id>/source.wav` and `song.json`. Existing Songs entries can be consolidated
with their verified stems, retaining IDs, unknown metadata and legacy files.
Analysis, confirmed maps, stem mixes and practice settings share that canonical
file; relative paths permit moving the whole song folder. Film resolves the same
asset ID. Corrupt/future canonical files report warnings instead of silently
falling back. The import still uses installed FFmpeg. Native symphonia decoding,
file dialogs/drop, the richer provider `analysis[]`/`tempoMap`/chart contract,
Music.ai orchestration, automatic analysis acceptance, full grid integration,
practice ramps and Lyria realtime remain V1 work. This is not M3/V1 completion.

Local validation: 324 Rust tests passed (seven opt-in tests ignored), 267 frontend tests passed. Real FFmpeg migration, practice/analysis, stems and Film timing checks passed separately. Formatting, Clippy, lint/types/build and licence gates passed; the native desktop build completed its 25-second frontend-handshake smoke. CI on Windows/macOS remains the merge gate.

### M3 native import and file selection — 2026-09-06

Songs can choose a file through the native dialog, receive one dropped file or
import a pasted path. Bundled Symphonia/Rubato decode and normalize the planned
WAV/MP3/FLAC/M4A/AIFF formats plus Ogg Vorbis; reference, analysis, stem and
practice paths share that decoder. M4A priming/padding are applied before rate
conversion. Originals remain intact beside canonical source.wav and song.json.
Complex M4A edit sequences, protected files and raw ADTS AAC need prior WAV/FLAC
conversion. Film and clean-take soundtrack mixing still need installed FFmpeg.

The ordinary synthetic tests cover rate/delay/alias bounds, cancellation, damaged
metadata and IPC import/storage/reload. The separately run seven-codec fixture
test checks duration and phase. Local validation: 267 frontend tests passed; 234 Rust tests passed before
Windows Application Control blocked ipc_originals (eight opt-in tests ignored).
All 24 media/rig IPC tests, including import/storage/reload, passed separately,
as did the seven-codec test. Lint/types, Clippy and licence gates passed. The
local desktop build completed its 25-second frontend-handshake smoke. No policy
was bypassed; full Windows/macOS CI on the PR head remains the merge gate.

All five optional real-tool media regressions also passed: migration, stems,
practice/analysis, clean take mixing and Film. Film checks each exported stereo
channel at the original amplitude (AAC RMSE 0.000116 against the unchanged 0.015
bound); the test avoids FFmpeg's gain-adding stereo-to-mono rematrix.
An additional short M4A fixture passes at 10,849 frames with a millisecond
movie clock; native metadata tests cover rounded EOF and reject larger overruns.

This completes an import slice, not all of M3 or V1. Provider analysis fixtures,
the richer analysis/tempoMap/chart contract, full band/MIDI/DAW grid integration,
practice ramps, realtime Lyria, voice/rig acceptance and distribution remain.
Friend-operated hardware acceptance remains deferred to V2.
