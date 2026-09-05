# Ponytail audit — whole repo, 2026-09-05

Whole-tree over-engineering scan (ponytail-audit): what to delete, simplify, or
replace with stdlib/native equivalents. Audited at `789bb4d` (#77). Scope is
over-engineering and complexity **only** — correctness bugs, security holes and
performance belong to a normal review pass and are deliberately excluded.

Method: three parallel read-only scans (Rust crates, Tauri shell, React UI,
plus config and scripts). Every dead-code claim was grep-verified across the
entire repo (`crates/`, `src-tauri/`, `src/`, `tests/`, `scripts/`) before it
was called dead; the twenty largest claims were re-verified by hand. Findings
are listed, nothing applied.

Ranked biggest cut first. `~N` is the estimated line cut.

## Findings

- **delete:** 4 manifest mirror-types (`StyleManifest`, `ChartManifest`, `RigManifest`, `ControlMapManifest`) + `BUNDLED_CONTROLS` + the whole `seams.rs` test + the `controls/black-spirit-200.json` stub. Nothing — production loads real `Style`/`Chart`/`RigProfile` through the same `SeamRegistry`, and `registry.rs`'s own tests already prove bundled dirs parse; the manifests exist only so a second test can re-parse the same JSON. [crates/jam-core/src/registry.rs:19-115, crates/jam-core/tests/seams.rs] (~128)
- **delete:** per-tool proposal state machine (proposal + fingerprint + changed-guard + apply/dismiss) copy-pasted 8×. One `useProposal()` hook / shared apply path. [src/components/tools/*.tsx, src/components/SongLab.tsx:113-184, src/components/FinishingDesk.tsx:77-104, src/lib/roomActions.ts:25-45] (~100)
- **delete:** `TapTempo` — zero callers in Rust, no IPC command, no TS counterpart. Delete file. [crates/jam-dsp/src/tap_tempo.rs] (~89)
- **delete:** `ClickGenerator` — only caller is its own test; the engine synthesizes clicks itself via `ClickVoice`. Delete file. [crates/jam-band/src/click.rs, cf. crates/jam-audio/src/engine.rs:979-983] (~59)
- **delete:** `IndexStore::rebuild_index` + the whole `library_index` table. Nothing — no caller outside its own unit test, and it scans `songs/recordings/backups` dirs the app never writes (real layout is `takes/`, `originals/`, `music-videos/`). [src-tauri/src/store.rs:175-214, 36-46] (~55)
- **shrink:** atomic temp-write-with-`.bak` hand-rolled 5×. One `atomic_write(path, bytes)` helper. [src-tauri/src/media.rs:54-71, originals.rs:206-216, library.rs:188-199, settings.rs:128-142, controller.rs:53-60] (~50)
- **delete:** "busy wrapper with error message" re-implemented 6×. One shared helper. [src/store/engine.ts:195-207, src/lib/originals.ts:182-193, src/lib/media.ts:270-280, src/components/tools/shared.tsx:13-41, src/components/AiSettings.tsx:34-45, src/screens/Sessions.tsx:238-248] (~45)
- **delete:** `EmptyState` + `ErrorState` components — never rendered anywhere. Remove. [src/components/States.tsx:25-59] (~35)
- **delete:** `providerJson` — exported, zero imports anywhere including tests. Remove. [src/lib/net/providerFetch.ts:33-62] (~30)
- **delete:** `Timeline` dead API — `TempoPoint` (+`Default`), `next_bar_boundary`, `seek_sample`, `Timeline::default`. Nothing (no callers). [crates/jam-core/src/timeline.rs:8-21, 92-96, 187-189, 419-425] (~29)
- **shrink:** `list_devices` — two copy-pasted 30-line halves (inputs/outputs). One helper parameterized by direction, like io.rs `named_or_default_device` already does. [crates/jam-audio/src/devices.rs:41-107] (~28)
- **delete:** `Supports` struct + `supports` field + `yes()` — `program_change`/`control_change` never read by any logic, `midi_clock` read only by one test assert, no screen renders it. Nothing; rig JSON `supports` blocks are simply ignored. [crates/jam-rig/src/profiles.rs:88-111, 138-139] (~27)
- **shrink:** six hand-rolled mm:ss formatters. One 3-line `mmss()` util. [src/screens/MusicVideo.tsx:26-27, Library.tsx:483-488, Sessions.tsx:278-282, Songs.tsx:162-164, WritingDesk.tsx:47-49, Rig.tsx:430-434] (~25)
- **delete:** identical default `clip_audition` spec object built 3×. One `auditionTake(takeId)` helper. [src/screens/Originals.tsx:795-806, src/screens/Sessions.tsx:331-342, src/components/tools/ComparisonTool.tsx:27-37] (~25)
- **delete:** second `NumberField` component (Stage's is a subset of Originals'). One shared component. [src/screens/Stage.tsx:617-640 vs Originals.tsx:850-893] (~25)
- **shrink:** 8 consecutive rig actions repeating `const state = await run(...); if (state) set({ rigState: state })`. Local `rigAct(label, cmd, args)`. [src/store/engine.ts:515-592] (~25)
- **shrink:** hand-written `Default` for `TransportTelemetry`/`BandTelemetry` re-states `Timeline::new`/sequencer defaults (incl. "A7"/"D7"). Derive or construct from the sources they mirror. [crates/jam-audio/src/engine.rs:81-97, 119-140] (~25)
- **delete:** `Kit`/`KitInstrument`/`VelocityLayer` schema — no kit JSON is ever parsed anywhere; the sampler is synthetic-only (`new_with_synthetic_kit`). Nothing. [crates/jam-core/src/style.rs:101-124] (~24)
- **shrink:** three near-identical ASCII id validators. One shared `fn valid_id(s, max, what)`. [src-tauri/src/media.rs:37-47, originals.rs:91-101, net/media.rs:325-335] (~23)
- **shrink:** `default_style()` — 24-line inline `Style` fallback literal. `.unwrap()`; it's an `include_str!` of an in-repo file that golden/seams/library tests prove parses. [crates/jam-audio/src/engine.rs:215-239] (~22)
- **delete:** `spdx-satisfies` devDependency — zero imports; the licence script hand-rolls the exact SPDX OR/AND evaluation the dep ships. Use the dep and drop the hand-rolled parser, or drop both. [package.json:35, scripts/check-js-licences.mjs:36-53] (~20 + 1 dep)
- **shrink:** three bounded-reader implementations (inline chunk loop in `provider_fetch`, `read_bounded` in net/media.rs and agents.rs). One shared helper for the `Response` case. [src-tauri/src/net.rs:380-390, net/media.rs:214-230, agents.rs:112-123] (~20)
- **delete:** `versions.length >= 20` guard duplicated 8×. One `guardVersions()` in the writing store. [src/lib/originals.ts:282, src/lib/controller.ts:151, src/lib/jo/dispatcher.ts:99, src/lib/jo/studioTools.ts:317, src/lib/roomActions.ts:37, src/lib/jo/songLab.ts:96, src/components/FinishingDesk.tsx:95 +1] (~20)
- **shrink:** JSON ```-fence stripping repeated 3×. One `readJson()` helper. [src/lib/media.ts:154-158, src/lib/jo/songLab.ts:64-69, src/components/tools/CoachTool.tsx:60-63] (~10)
- **shrink:** `impl AppSettings { audio_config, set_audio_config }` hand-copies 5 fields both directions. `#[serde(flatten)] pub audio: AudioConfig` (same JSON shape). [src-tauri/src/lib.rs:119-137] (~17)
- **delete:** `SeamRegistry::load_file`, `len`, `is_empty`. Nothing — library.rs uses only `new`/`load_from_dir`/`load_from_fs_dir`/`get`/`list`/`insert`. [crates/jam-core/src/registry.rs:204-212, 224-230] (~16)
- **delete:** `shortestTransposition` — imported only by its own test. Remove with test. [src/lib/chart/transpose.ts:28-33, tests/chart/text.test.ts:168-171] (~15)
- **delete:** `Sampler` dead pub surface — `Default`, `active_voices`, `max_polyphony` (already `#[allow(dead_code)]`), `kit_name` (written, never read); make `new`/`set_choke_group`/`set_pan`/`load_sample` private (only internal callers). [crates/jam-band/src/sampler.rs:24-40, 121-123] (~14)
- **delete:** `styleOverrideId`/`stylehere` — parsed, serialized, sent over the wire, read by nothing on either side (Rust keeps only the field + `None` defaults). Remove from the text format + contract. [src/lib/chart/text.ts:63-64, 82, 231, 306, 450-451, src/ipc/contract.ts:118] (~14)
- **delete:** `metronome_set`, `audio_set_input_monitor`, `audio_get_telemetry` commands — zero invokes from src/ (the 30 Hz emitter already pushes all telemetry); only IPC tests and preview.ts stubs exercise them. Remove commands + stubs (dedicated IPC tests go too). [src-tauri/src/lib.rs:189-191, 237-247, 255-257, src/ipc/preview.ts:562-569] (~25)
- **delete:** `bundled_profiles()` in jam-rig — test-only; src-tauri loads+validates rigs itself. [crates/jam-rig/src/lib.rs:13-25] (~13)
- **delete:** `EnergyFollower::current_energy`, `current_envelope_db`, `sample_rate` field (already `#[allow(dead_code)]`). Nothing — engine only uses `process_block`. [crates/jam-dsp/src/energy.rs:5-6, 70-80] (~12)
- **delete:** `Sf2Synth` dead surface — `Default`, `active_voices`, both-channel `render` (test-only; sequencer uses `render_channel`). Also nothing SF2 about it now that rustysynth is unused (below). [crates/jam-band/src/instruments.rs:24-28, 80-82, 93-96] (~12)
- **delete:** `providerQuery` search input in AiSettings filtering a fixed ≤7-item provider list. Plain list. [src/components/AiSettings.tsx:22, 296-302, 307-312] (~12)
- **native:** `dirs_base()` hand-rolled home-dir resolution (`JAM_DATA_DIR`→`JAM_USER_DIR`→`USERPROFILE`→`HOME`→temp). `dirs::home_dir()` — the workspace already ships `dirs` and src-tauri uses it; today the two resolutions can silently disagree. [crates/jam-audio/src/engine.rs:1206-1220] (~12)
- **yagni:** `ModelerKind` 7-variant enum — nothing matches on any variant, it's JSON passthrough to the UI. `String` (or drop). [crates/jam-rig/src/profiles.rs:10-20] (~11)
- **delete:** `bass_note_for_degree` — delegate with test-only callers (production uses `bass_note_for_chord`). [crates/jam-band/src/voicing.rs:172-181] (~10)
- **delete:** `scene_to_midi` — doc says "for tests and monitors"; only test callers (production path is `scene_commands` + `render`). [crates/jam-rig/src/profiles.rs:226-236] (~10)
- **delete:** `importChartFile` store method — no UI ever calls it. [src/store/engine.ts:127, 451-457] (~9)
- **shrink:** `start()` writes the NullOutput fallback block twice (headless branch and cpal-failure branch). One small helper next to `make_output`. [crates/jam-audio/src/engine.rs:611-635] (~8)
- **shrink:** hand-rolled 12-key select list in Originals when `notes.ts` already exports the names. Derive from `SHARP_NAMES`. [src/screens/Originals.tsx:236-253] (~8)
- **shrink:** `recorder_start` and `originals_record` — two wrappers over the same engine calls. One command. [src-tauri/src/lib.rs:380-388, originals.rs:409-412] (~8)
- **yagni:** four copies of the identical "disposed-flag + late-cleanup" useEffect dance. One `useAsyncSetup(fn)` helper. [src/App.tsx:97-191] (~25)
- **yagni:** `renderScreen` 10-case switch. `SCREENS`-style lookup map of lazy components (the registry pattern exists one file away). [src/App.tsx:210-235] (~12)
- **yagni:** `JAM_DATA_DIR` env var redirects only the takes dir while `JAM_USER_DIR` already redirects everything, and only tests set it. `JAM_USER_DIR`. [src-tauri/src/originals.rs:273-275] (~4 + 11 test usages simplified)
- **yagni:** mobile scaffolding with zero mobile setup (no `gen/android|ios`): `crate-type = ["staticlib", "cdylib", "rlib"]` and `#[cfg_attr(mobile, tauri::mobile_entry_point)]`. Plain rlib, drop the attr. [src-tauri/Cargo.toml:10, src-tauri/src/lib.rs:1182] (~3)
- **delete:** `checkKey` store method — never called (`keysPresent` is filled by `providers_list` in useAi.load). [src/store/engine.ts:175, 674-684] (~14)
- **delete:** `activeSource` store state — initialized `"band"`, never read or written again. Remove field + type. [src/store/engine.ts:65, 212] (~3)
- **delete:** `toneHz` + `hz` param of `setTone` — always 440 (only caller passes 440), never displayed. Hardcode. [src/store/engine.ts:67, 214, 293-296] (~5)
- **delete:** dead CSS selectors `.studio-field`, `.write-selection`, `.video-heading`. Remove. [src/screens/studio.css, originals.css, music-video.css] (~6)
- **stdlib:** hand-rolled `dayKey(d)`. `d.toDateString()` (same local-date-key semantics). [src/lib/sessions/stats.ts:11-13] (~2)
- **stdlib:** zod re-parsing values the same module just parsed/built — `referenceForm` re-parses `Blueprint`, `melodyHarmony` re-parses `MelodyNote[]`, `setlistCue` re-parses one item of an already-parsed list, `captureRig` parses the object it just built. Trust the types. [src/lib/roomTools.ts:64, 226, 417, 491] (~6)
- **yagni:** `BandPatch.atNextBar` — declared, honoured by the preview engine, never passed by any caller. Drop the option. [src/ipc/contract.ts:155, src/ipc/preview.ts:671] (~2)
- **yagni:** unnecessary `export` on module-internal helpers (`readOpenAI`/`readClaude`/`readRouter`, `bundledRigs`/`bundledStyles`/`bundledCharts`, `SHARP_NAMES`/`FLAT_NAMES`, `HELP_LANGUES`, `Cue`) — zero external imports. Unexport (hygiene, 0 lines). [src/lib/jo/providers.ts:63-112, src/ipc/preview.ts:53-128, src/lib/chart/notes.ts:7-35, src/lib/help.ts:4, src/store/engine.ts:38]
- **shrink:** `settings_get` preview handler spreads `...config` then re-lists all five config fields explicitly. Keep only the spread + `schemaVersion`. [src/ipc/preview.ts:490-498] (~5)
- **shrink:** `chartToText(draft) === chartToText(currentChart)` recomputed three times per render. One `const isPlaying = ...`. [src/screens/Library.tsx:440, 454, 463] (~6)
- **shrink:** MusicVideo.tsx — one 1150-line component whose `audioOnly` prop forks labels/views/filters in ~12 ternaries, with AiMusic a 3-line wrapper around it. Extract the shared `<details>` + jobs list as components both screens use. [src/screens/MusicVideo.tsx:88-1240, src/screens/AiMusic.tsx] (~40, mostly readability)
- **delete:** `tauri.conf.json` `resizable: true` / `fullscreen: false` are defaults. Remove the two keys. [src-tauri/tauri.conf.json:20-21] (~2)
- **native (optional swap):** `platform::open_media` hand-rolls `open`/`explorer.exe`/`xdg-open` dispatch. `tauri-plugin-opener` does this natively — only worth it if the plugin is wanted anyway. [src-tauri/src/platform/mod.rs:4-18] (~15, net ~0 after dep)
- **delete:** `ResolvedChart::len_bars` → nothing [crates/jam-core/src/chart.rs:155-158] (~4)
- **delete:** `build_tempo_map_midi` (4/4 wrapper) → call `_with_meter((4,4))` at the one test call site [crates/jam-audio/src/export.rs:34-37] (~4)
- **delete:** `FileInput::from_samples` (hidden 48k default) → `from_samples_at` at the one test call site [crates/jam-audio/src/io.rs:187-189] (~3)
- **delete:** `MidirSink::port_name` → orchestrator uses `describe()` [crates/jam-rig/src/midi.rs:104-106] (~3)
- **delete:** `BandSequencer::sample_rate()` getter → no callers [crates/jam-band/src/sequencer.rs:186-188] (~3)
- **delete:** `LevelResult.peak`/`.rms` linear fields (test-only; all consumers use `peak_db`/`rms_db`), make `amp_to_db` private [crates/jam-dsp/src/level.rs:3-9, 42] (~6)
- **native:** `rustysynth` dependency — zero `use rustysynth` in the repo; the doc comment "rustysynth integration" describes code that doesn't exist. Delete the dep. [Cargo.toml:32, crates/jam-band/Cargo.toml:11] (1 dep)
- **yagni:** `pub struct DawExporter;` zero-sized namespace for 3 associated fns. Free functions (cosmetic). [crates/jam-audio/src/export.rs:7, 33] (~2)

## Verified lean (do not re-audit)

- **Rust io/sequencer/engine core** — `StreamWorker`, `pick_config`, sample-format conversion, span scheduling (swing/humanize/cues/sections), every `transport_*`/`band_*`/`recorder_*`/mixer/`validate_*` call, recorder latency compensation, Reaper/WAV/MIDI export, melody/analysis: all live and IPC-wired. `JAM_FAKE_INPUT`/`JAM_HEADLESS`/`JAM_USER_DIR` are documented CI facilities, not dead config.
- **Traits are real seams, not ceremony** — `MidiSink` (2 impls), `AudioInput` (2), `AudioOutput` (2), `VersionedManifest` (3 live impls), `SecretStore` (prod/test).
- **src-tauri** — every other registered command is invoked from src/ (exhaustive name grep); all 12 emitted events have exactly one UI listener; all other Cargo deps used; provider allow-list and agent list are already tables; media model registry is data-driven; `live_guard`, smoke-exit and `build.rs` manifest linking are load-bearing.
- **UI** — every runtime npm dep genuinely imported except `spdx-satisfies`; deep-clone is `structuredClone`, no hand-rolled debounce/emitter; `SHORTCUTS`, `screens/registry.ts`, `ipc/client.ts` are proper single-source seams; the 876-line preview engine is the documented browser simulation with 1:1 command coverage, not duplication.

**net: ~ −1,240 lines, −2 deps (rustysynth, spdx-satisfies) possible.**
