# Extending Josefines Jamstudio

The extension rule is **every capability is a seam** (a definition, one registry, consumers), and adding to an existing seam must not require edits to core consumers. Review the PR diff for that requirement. The current `tests/invariants/seams.test.ts` checks bundled manifest fields, and `crates/jam-core/tests/seams.rs` checks bundled style, chart and control registries. Neither checks changed-file scope or automatically discovers every fixture under `tests/fixtures/seams/`. Per-extension fixture and registry coverage remains required; do not treat these two tests alone as proof that an extension recipe works.

Each recipe below names the exact files to add and the test that proves it worked. When a milestone adds a seam, it adds the recipe here and a fixture there, in the same PR. Recipes are executed once by the builder as a test before they are considered true.

## Add a style (a groove) in ten minutes

1. Copy `styles/blues-shuffle.json` to `styles/<id>.json` (or `~/JosefinesJamstudio/styles/<id>.json` for a personal style; same schema).
2. Set `id`, `name`, `genre`, `feel.swing`, `feel.bpmRange`, `kitId`, `bassProgram`, `compProgram`.
3. Write at least one entry in `patterns` per intensity band (`[0, 0.34]`, `[0.34, 0.67]`, `[0.67, 1]`), one `fills` pattern and one `endings` pattern. Beats are floats from the start of the pattern; instrument names come from the kit (`kick`, `snare`, `hat_closed`, `hat_open`, `ride`, `crash`, `tom_hi`, `tom_lo`); bass `degree` is relative to the chord root (0 = root, 4 = fifth, 7 = octave); comp `voicing` is one of `shell`, `triad`, `drop2`, `power`.
4. Run `pnpm test -- styles` (schema validation) and `cargo test -p jam-band golden -- <id>` to create the golden render (first run writes `tests/fixtures/golden/<id>.json`, second run asserts).
5. Play it on the Stage. No code change is needed; the registry picks it up at startup.

Ask Jo to author one: the `create_style` tool (backlog) writes the same JSON.

## Add a chart preset

1. Write `charts/<id>.json` (schema in ARCHITECTURE §7) or a text chart in `charts/<id>.chart`:
   ```
   title: Slow blues in G
   key: G major
   time: 4/4
   bpm: 66
   style: blues-shuffle
   [A] | G7 | C7 | G7 | G7 | C7 | C7 | G7 | G7 | D7 | C7 | G7 | D7 |
   ```
2. `pnpm test -- charts` parses every preset and transposes it through all twelve keys.
3. It appears in the Stage chart picker and Jo's `load_chart` accepts its id and its title.

## Add a rig profile (any amp, pedalboard or modeller)

1. Copy `rigs/black-spirit-200.json` to `rigs/<id>.json`. Set `midiChannel` (never omni), `supports`, the `programs` list (number and name), and `controls` (cc, name, min, max, default, unit). Clamps come from `min` and `max`; the scheduler never sends outside them.
2. `cargo test -p jam-core rigs` validates it; `cargo test -p jam-rig profile_<id>` (add a two-line test that sends a program change through `MemorySink` and asserts the bytes).
3. Open the Rig screen, assign a port, press "send now". Document the device in `docs/hardware/<id>.md` if it is a real device.

## Add a control map (pedal, keyboard, MIDI controller)

1. Write `controls/<id>.json`: bindings from `key`, `midi_pc` or `midi_cc` sources to action ids. Action ids are the Jo tool names plus `ptt`; arguments are the tool's arguments.
2. `pnpm test -- controls` validates every binding against the tool registry (unknown action ids fail).
3. Select it in Settings → Controls.

## Add a Jo tool

1. Create `src/ai/tools/<name>.tool.ts`:
   ```ts
   import { z } from 'zod';
   import { defineTool } from './define';
   export default defineTool({
     name: 'set_swing',
     description: 'Set the swing amount of the band, 0 = straight, 1 = full triplet swing. Applies at the next bar.',
     schema: z.object({ amount: z.number().min(0).max(1) }),
     async run({ amount }, ctx) { await ctx.ipc.band.set({ swing: amount }, 'next_bar'); return `Swing ${Math.round(amount * 100)} percent at the next bar.`; },
   });
   ```
2. The registry (`src/ai/tools/index.ts`) collects it automatically. Add one case to `tests/fixtures/jo/script.json` and a recorded LLM fixture if the tool changes what Jo says.
3. `pnpm test -- tools` validates the schema and runs the script. The tool is now callable by voice, by text, and from control maps.

Rules: one tool does one thing; the return string is what Jo may say (twelve words or fewer); tools never read secrets; tools that only explain return text and have no side effects.

## Add a provider (STT, TTS, music stream, generator, stems, analysis, or an LLM target)

1. Add a row to `src-tauri/src/net/registry.rs`: id, base URL, auth scheme, kinds.
2. Create `src-tauri/src/net/<id>.rs` implementing the trait(s) from ARCHITECTURE §6.1. The key is fetched from `SecretStore` inside the call; never stored in the struct; never logged.
3. Record fixtures: run the live call once with `JAM_RECORD_FIXTURES=1` and a key in the keychain; the recorder writes scrubbed request and response files under `tests/fixtures/providers/<id>/`. Commit them with a README (what was scrubbed, date, docs URL).
4. Write the unit test against the fixtures and an `#[ignore]` live test.
5. Add `providers.<id>` to the settings defaults and the price table; the Settings screen shows a toggle and a "test key" button automatically from the registry.
6. For an LLM target: also add the AI SDK provider package in `src/ai/llm/providers.ts` (one line) with the `provider_fetch` shim.

## Add an instrument

1. Implement `Instrument` in `crates/jam-band/src/instruments/<name>.rs` (`note_on(note, velocity)`, `note_off(note)`, `render(out: &mut [f32])`, `set_sample_rate` is fixed at 48 kHz). No allocation in `render`.
2. Register it in `instruments::factory` by a string id usable from `Style.bassProgram` or `compProgram`.
3. Add a render test: a single note for one second has the expected RMS and no NaN; a golden render for one style that uses it.

## Add an audio source or sink

Implement `AudioInput` or `AudioOutput` in `crates/jam-audio/src/io/<name>.rs`, add it to `io::select`, and add a test that drives it with `NullOutput` for one second and checks the frame counter. The engine does not care where samples come from.

## Add an analysis kind

1. Extend `AnalysisKind` in `src/ipc/contract.ts` and the Rust mirror (additive; bump nothing).
2. Add a step in `src-tauri/src/analysis/steps.rs` that picks a provider by kind and writes its result into `song.json` under a new field with `schemaVersion` unchanged (new optional field).
3. Add the local fallback in `jam-dsp::offline` or mark the step `cloud_only`.
4. Fixture test plus a synthetic ground-truth test if a fallback exists.

## Add a screen

1. Create `src/screens/<name>/<Name>Screen.tsx` using the design primitives (no new colours, no new radii; see DESIGN.md).
2. Add the screen ID to `ScreenId` in `src/store/engine.ts`, its component route in `src/App.tsx`, and one `SCREENS` entry in `src/screens/registry.ts` with `id`, `label`, `description` and a distinct `iconName` from `SCREEN_ICONS`. That mapping supplies both the sidebar and `WorkspaceHeader`; there is no second icon switch.
3. Empty, loading and error states are part of the screen from the first commit.

## Add an IPC domain

1. Create `src-tauri/src/ipc/<domain>.rs` with the commands and one `<domain>.state` event, and `src/ipc/<domain>.ts` with the typed wrappers and the store slice.
2. Add the types to `contract.ts` and the Rust mirror; add a round-trip serialization test.
3. Register the domain in `src-tauri/src/ipc/mod.rs` and `src/ipc/index.ts`. Changes to existing domains are additive; removing or renaming a field bumps `IPC_VERSION` and needs an ADR.

## Add a data-file schema version

1. Bump `schemaVersion` in the type, add `migrate_v<n>_to_v<n+1>` in `crates/jam-core/src/schema/<file>.rs`, keep unknown fields.
2. Add a fixture of the old version under `tests/fixtures/schema/` and a test that migrates it and re-validates.

## Future directions (backlog, not promises)

User-installable style and rig packs from a folder, a community styles repository, WASM instruments and tools behind the same traits, more voice sessions (ElevenLabs Agents, Gemini Live), local models. Each will be a seam added by this document's rules, not a rewrite.
# Tweak the implemented songwriting workflow

Start in **Write**: sections, chords, tempo, key, repeats, instrument grooves,
intensity, gain, mute, swing, guitar trims and versions are ordinary controls.
The step-by-step guide is [songwriting.md](guide/songwriting.md).

- Song defaults live together in `newOriginal()` and `defaultSection()` in
  `src/lib/originals.ts`. Keep the starter chart and section IDs consistent.
- A new groove is an existing style JSON, shared with Stage. Put a compatible
  style under the user folder's `styles/` directory and restart the app. No new
  engine branch is needed. Writing uses three style choices per section.
- Saved originals are ordinary JSON under `~/JosefinesJamstudio/originals/`.
  `body.chart` uses the chart format; `body.sections[id]` holds swing and the
  drums/bass/comp settings; `body.clips` references take IDs, trim times and bars.
  Keep audio under `takes/`; back up the whole user folder. Unknown fields survive.
  Do not hand-edit a song while it is open; revisions reject competing saves.
- The `songwriting` Jo declaration is in `src/lib/jo/tools.ts`, its dispatcher in
  `dispatcher.ts`, and local phrases in `intent.ts`. It uses the same editor state.
  H works with keyboard-emulating foot pedals. Raw MIDI input is learned in Write;
  `controller.json` stores the same action and press data illustrated in
  `tests/fixtures/seams/controller.json`. The Rust press filter accepts PC, CC and
  notes; the frontend action registry lives in `src/lib/controller.ts`.
- Song tones use `body.toneProfileId` and `body.sections[id].rigScene` (a scene index
  in the existing rig profile). To rename or change available hardware scenes,
  copy the rig's JSON into the user `rigs/` folder and edit its `scenes` commands;
  restart to reload the registry. MIDI values remain validated by that profile.
- `tests/fixtures/seams/original.json` demonstrates the document. Run
  `pnpm test -- originals` and `cargo test -p src-tauri originals` for its round trip.

The older recipes below describe the broader architecture plan; use the actual
module paths above for the implemented songwriting slice.

## Extend the REAPER handoff

`crates/jam-audio/src/export.rs::write_reaper_import` derives session data from the
completed export and actual scheduled MIDI. `reaper_import.lua` is the single
consumer of that data, using the official ReaScript API. It is included in complete
DAW bundles, not a second recorder or a live audio bridge. Add supported changes
there; do not write REAPER's internal project format or add an extension framework.
Keep text Lua-escaped, file references relative, reference mixes muted, and import
into an empty project with one undo step. The exporter does not save user projects.

`tests/fixtures/seams/reaper-export.json` covers meter, Unicode/quoted section names,
stem roles and actual MIDI. Run `cargo test -p jam-audio reaper_bundle` for packaging
and `lua tests/reaper-import.lua` for script behavior against the API boundary.
The Lua check is a standalone test, not an application runtime dependency. Both
checks complement the real Mac/REAPER owner acceptance session in the guide.

## Current text-provider extension recipe (2026-09-04)

This implemented slice supersedes the planned LLM recipe above. Add a request
builder/response reader to `src/lib/jo/providers.ts`'s `BRAINS` registry, plus the
fixed HTTPS origin/auth row in `src-tauri/src/net.rs`'s `PROVIDERS` allowlist for a
new service. Reuse `JO_TOOLS` and `validateToolCall`; never dispatch raw responses.
Settings and Song Lab consume the registry directly. A different model on an
existing service needs only a model ID change in Settings, not a package or code.

Add a documented synthetic response to `tests/fixtures/providers/brains.json`
and extend `tests/invariants/providers.test.ts` to prove the same tool call and
malformed/truncated-response refusal. Do not label synthetic fixtures as recorded
calls. Run the frontend tests and Rust `net::tests`; leave the core snapshot
unchanged. No additional SDK is needed for these non-streaming text requests.
Settings persist versioned `ai` preferences through existing settings IPC,
retaining unknown fields. See [setup, limits and audio API options](guide/api-options.md).

## Installed agent and studio-tool extension recipe

`src/lib/jo/providers.ts` defines local-agent entries alongside API connections.
`src-tauri/src/agents.rs` owns the CLI argument/envelope registry, bounded process
execution, cancellation and metadata logging. Native executable lookup and hidden
Windows processes live under `src-tauri/src/platform/`. Adding an agent requires
its official non-interactive contract, a registry entry and a synthetic envelope;
never implement subscription token extraction. See ADR 0007 for the narrow
exception allowing installed agents to own their provider connections.

For an original-song edit, add a declaration and pure-on-clone edit to
`STUDIO_TOOLS` in `src/lib/jo/studioTools.ts`. Existing consumers collect declarations
and dispatch them without another provider-specific implementation. The shared
`applyStudioEdits` checks state/limits, validates the whole group and keeps one
version. Add a case to `tests/invariants/agents.test.ts`; malformed later actions
must leave the original and version count intact. Schemas and catalogs are in
`tests/fixtures/providers/agents.json`. Core seam snapshots remain unchanged.
The model catalog URL/parser belongs to its provider registry entry. Reuse the
Rust proxy and native datalist; do not ship a model-list package or stale price table.

## Music/video model recipe

Add the model descriptor to `src/lib/media-catalog.json`. Both TypeScript and Rust
consume this file. A model using an existing protocol needs no new UI or storage
code. A new wire protocol belongs in `src-tauri/src/net/media.rs`: validate request
parameters, perform bounded Rust-only downloads, normalize pending/inline/download
results and enforce the provider's output hosts. Add cloud origin/auth in
`net.rs` only when needed; local ComfyUI uses the fixed loopback seam in ADR 0008.

Record the official contract and a synthetic example under
`tests/fixtures/providers/media.json`; extend the Rust `media_contracts_and_host_boundaries`
check and `tests/invariants/media.test.ts`. Never claim fixture results establish
paid API access. No SDK, plugin loader, bundled model or binary is required.
`media_generate` submits once; `media_refresh` may only poll/recover existing work.
Generation returns metadata/asset IDs, never binary media over IPC. Every receipt
is durable before a paid request; unknown outcomes must never auto-retry.

`edit_video_shot` uses the shared Jo declaration/dispatcher and the Film draft's
Undo store. A new agent media action must validate state/IDs and stay separate from
paid generation. See [the workflow and acceptance guide](guide/music-video.md).

## Write composition tools

`src/lib/writingTools.ts` owns the local theory choices and phrase edits;
`WritingDesk.tsx` renders them through the existing song store and chart syntax.
Apply edits to a clone through `useWriting.edit`; the shared form check rejects
invalid structure before adding Undo. No new playback clock is introduced.
`SongBody.lyrics` is an optional section-ID-to-text map in version 1 documents;
missing means empty, Rust validates IDs and 12,000-character limits, and JSON
rewrites preserve unknown fields. No schema migration is required for this additive
annotation. AI `write_notes` accepts an optional `sectionId`; omission keeps its
original song-notebook behavior. Extend `writing-desk.test.ts` for transforms,
lyrics, limits and Undo, and the Rust round-trip test for stored fields.


## Studio navigation and view state

Use `WorkspaceHeader` and `WorkspaceViews` for the established room pattern. Keep
live performance controls first and use native disclosures for setup. Shared
icons are existing Phosphor components. `tests/invariants/studio-workspaces.test.ts`
checks unique icon assignments and arranged rehearsal boundaries. Do not change
core snapshot fixtures to add a navigation label.

Library and Jo keep session state in their exported Zustand stores; they do not
write drafts or conversation to browser storage. Durable files still use the
existing Rust save commands. `openAiSettings` selects the AI category before
navigation. Imported audio and generated audio share `useMedia` assets; native
playback must pass `media::playable_file` and its canonical-library boundary.

## Extend the manual or finishing recipes

Edit `docs/guide/manual.json` in both `en` and `nb`, retain stable chapter IDs and set `room` to an existing screen ID for contextual opening. Run `node scripts/export-manual.mjs`; the invariant test verifies translation coverage and export freshness. Shortcut English text is checked against the live command registry; update the Bokmål description with any shortcut change. Main UI labels remain English.

Finishing helpers live in `src/lib/finishing.ts`, with examples in `tests/invariants/finishing.test.ts`. Keep transformations pure and timing-preserving, respect part locks, and route audio through the existing native clip/transport commands. A managed comp uses `compSlot` for its absolute bar interval; do not interpret it as automatic arrangement-following audio. New ideas must remain reversible through the existing Versions/Undo flow.
# Current room capability extension (2026-09-05)

The recipe below describes implemented paths; older planning recipes later in this document may name target architecture.

1. `src/components/RoomTools.tsx` has one `ROOM_TOOLS` registry keyed by the existing `ScreenId`. Each entry supplies a title, description and a lazily imported component from `src/components/tools/<Name>Tool.tsx` (shared fields, selects and the `useTool` runner live in `tools/shared.tsx`). A tool's chunk loads the first time its room is shown; afterwards it stays mounted (hidden) so scratch drafts survive navigation. Tools perform no native work on mount. Subscribe only to needed store fields with selectors or `useShallow`, never to whole stores or high-frequency telemetry.
2. Put pure musical/timeline calculations and bounded input schemas in `src/lib/roomTools.ts`, reusing `originals`, `writingTools`, Tonal and `media`. Preserve unknown document fields and locked parts. Keep source recordings untouched.
3. Use `applySongIdea` in `roomActions.ts` for previewed song edits (fingerprint, version and Undo). Existing `useMedia.edit` owns media Undo. `useRoomOperation` serialises foreground room actions and participates in the app close guard. Native failures must be shown; never treat a swallowed engine-store error as success in a multi-command sequence.
4. `takes_melody(takeId, startSeconds, lengthSeconds)` is additive IPC registered in `src-tauri/src/lib.rs`. Rust reads saved take manifests, bounds the file/excerpt and runs `jam_audio::melody::extract` off the audio/UI thread. Output notes have MIDI pitch, excerpt-relative start/duration in seconds and confidence. Desktop-only controls say so in preview. No Web Audio is introduced.
5. For agent-accessible song edits, add a declaration and validator to existing `STUDIO_TOOLS`; `keep_harmony_variation` accepts `sectionId` and space-separated `chords`, and `apply_reference_blueprint` accepts `sectionId`, `reference`, and newline-separated `Name | bars | energy` rows. All existing Jo review/fingerprint/version gates apply. The coach sends no executable tools and never sends its draft automatically.
6. Add a meaningful invariant in `tests/invariants/room-tools.test.ts`, update both languages in `docs/guide/manual.json`, then regenerate with `node scripts/export-manual.mjs`. Test native I/O separately from browser simulation and report live-account/hardware limits.

## Startup settings recovery

`settings_recovery_notice()` is additive IPC registered beside `settings_get` in `src-tauri/src/lib.rs`. It takes the pending startup notice once; `loadSettings` displays it after initialization. Browser preview returns null. Keep recovery in the native settings module, before engine and rig initialization. Never replace malformed input until its bytes have been archived successfully. Normal settings saves stay strict. `tests/invariants/desktop-startup.test.ts` checks the UI handoff; native settings tests exercise valid/invalid backups and subsequent saves.
## Contextual manual topics

The existing `docs/guide/manual.json` is the English/Bokmål help source. Each section has a unique stable `id` such as `write.song-map-and-linked-sections`; preserve it when editing or translating its title. The help pane uses it for keyboard-focusable topic links. Add both translations and run `node scripts/export-manual.mjs` after changing text, then `pnpm test` to validate IDs and exported manuals.

Help opens beside the current room, or beneath it at compact widths. It is nonmodal: room controls and the global transport stay available. Escape with focus inside help closes it and returns focus to the opener. Music shortcuts are suppressed inside help; room-focused shortcuts and transport buttons remain usable. Write’s Compose, Lyrics, Record, Finish and Versions views launch their topic through `WRITING_HELP` in `src/lib/help.ts`. Each launch resets the pane to that topic, including repeated requests. Extend this map with an existing manual section ID; the invariant test checks every target. Chapter selection retains native select focus so keyboard users can continue choosing; topic links move focus to their heading.
