# Extending Josefines Jamstudio

The product is built to be extended without limit. The rule that makes this possible: **every capability is a seam** (a definition, one registry, consumers), and adding to a seam never touches core files. The invariant test in `tests/invariants/` proves it: every fixture under `tests/fixtures/seams/` must appear in its registry while `tests/invariants/core-files.snapshot.json` stays untouched.

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
2. Add one line to `src/screens/registry.ts` (id, label, icon from the one icon family, component, shortcut).
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
