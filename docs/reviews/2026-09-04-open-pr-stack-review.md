# Review of the open PR stack (#26, #27, #28, #29)

Date: 2026-09-04. Reviewer: Claude Fable 5.1 (architect). Read-only review of the
whole repository at the tip of the stack, plus every open pull request on
https://github.com/avoidencez-lgtm/josefines-jamstudio/pulls.

| Item | Commit reviewed |
|---|---|
| `main` | `d0041d9` |
| #26 `chore/ponytail-and-stage` | `e28b5d2` |
| #27 `feat/fable-rebuild` | `1638ca0` |
| #28 `feat/real-band-engine` | `33b0fe8` |
| #29 `feat/songwriting-workflow` (stacked on #28) | `8af35ac` |

Everything below was read at `8af35ac` (which contains all of #28) unless a file
is named as living only on `main`. Line numbers refer to that commit.

## Verdict

1. **#28 and #29 are a large, honest improvement over `main`.** The engine, the
   sequencer, the rig layer, the recorder and the export are real code with real
   tests, and the status board finally tells the truth. Local gates are green
   (see "What was run").
2. **One blocking defect, present since M0, makes the desktop app unusable as a
   UI: there is no Tauri capability file, so every `listen()` from the WebView is
   rejected by the ACL.** Audio plays, but the screen never receives telemetry,
   the chart list, the settings or rig events. Nobody has ever seen the real
   Tauri app work end to end; every "screen integration" claim came from the
   browser preview. Fix is five lines (F1).
3. Two further P1 items: compound meters (6/8, 12/8) are mis-exported and
   `ballad-68` drifts against 4/4 bars (F3), and Jo's voice and push-to-talk run
   in the WebView against invariant 1 and do not work on the Mac target (F4).
4. #26 and #27 are superseded by #28 and should be closed.

Recommended order: fix F1 (and F5, the `T` key collision) on
`feat/real-band-engine`, merge #28, retarget #29 to `main`, merge #29, then
open follow-ups for F3 and F4 before owner gates 6, 7 and 10.

## What was run

On this Windows machine, in a clean worktree at `8af35ac`:

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck` | clean |
| `pnpm test` | 11 files, 64 tests, all pass |
| `pnpm licenses:check`, `pnpm build` | pass; one 510 kB chunk warning |
| `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings` | clean |
| `JAM_HEADLESS=1 cargo test --workspace` | 112 tests pass, 1 ignored (live Codex) |
| `cargo deny check` | advisories, bans, licenses, sources ok |
| `lua tests/reaper-import.lua` | not run here (no Lua); CI runs it |

GitHub CI on #26, #27 and #28 is green. On #29 the two Rust jobs were still
running when this review was written; the TypeScript, gitleaks and link jobs
had passed.

Not run: the real Tauri app (`pnpm tauri dev`). F1 was established from the
Tauri 2.11.5 source and the ACL artefact the build generates, not by launching
the app.

## Findings

Severity: P0 blocks merging as "working"; P1 must be fixed before the owner
gate it affects; P2 should be fixed in the next PR; P3 is hygiene and
documentation honesty.

### F1 (P0) No Tauri capability: every `listen()` is denied in the desktop app

**What.** There is no `src-tauri/capabilities/` directory on any branch
(`git log --all -- 'src-tauri/capabilities/*'` is empty, and `main` never had
one). Building `src-tauri` writes `src-tauri/gen/schemas/capabilities.json`
with the content `{}`: no window has any permission.

**Why it breaks the UI.** Tauri 2 enforces its ACL on every `plugin:*` command
(`~/.cargo/registry/src/*/tauri-2.11.5/src/webview/mod.rs:1819-1852`): when
the command is a plugin or core command and no capability resolves it, the
invoke is rejected with "Command plugin:event|listen not allowed by ACL".
`@tauri-apps/api/event.js:76` implements `listen()` as
`invoke('plugin:event|listen', ...)`. Application commands such as
`transport_play` are still allowed because the app defines no ACL manifest of
its own, so the engine starts and sound comes out, but:

- `src/store/engine.ts:809-866` (`initListeners`) awaits eight `listen()` calls
  in one `Promise.all`; the first rejection aborts the whole thing, so lines
  868-872 (`refreshEngineStatus`, `reloadLibrary`, `loadSettings`) never run.
  No charts, no styles, no settings, no engine status, no telemetry.
- `src/App.tsx:81-89` calls `initListeners()` without a `catch`, so the failure
  is an unhandled rejection, not a notice.
- `src/lib/controller.ts:166-171` and `src/screens/Settings.tsx:319-328` fail
  the same way (pedal presses, usage log updates).
- The 30 Hz emitter in `src-tauri/src/lib.rs:1004-1047` keeps emitting into a
  WebView with no registered listeners.

Result on the Mac: the Stage shows bar 1:1, meters at -180 dB, an empty chart
picker, and section-bound rig changes never reach the screen. Owner gates 1,
3, 4, 5, 6 and 7 cannot be attempted on this build.

**Fix.** Add `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main window: core IPC only (events, window, app, path). No fs, shell or http from JS.",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

`tauri-build` picks up `capabilities/*.json` automatically. Then run
`pnpm tauri dev` once and confirm the bar counter moves. Add a Rust test that
reads `src-tauri/gen/schemas/capabilities.json` after the build and asserts
that a capability for window `main` grants `core:default`, so this cannot
silently regress. Also give `initListeners` a `catch` that surfaces the error
as a notice and still loads the library and settings.

**History.** Every milestone PR from #2 to #25 claimed screen integration and
CI green; CI is headless and never launches the WebView, and the browser
preview (`src/ipc/preview.ts`) implements `listen()` itself. #28's test plan
lists "Browser preview" checks only. This is the single most important reason
the owner has never been able to tick a gate.

### F2 (P1) `csp: null` and no app ACL

`src-tauri/tauri.conf.json` sets `app.security.csp` to `null` (on `main` and
on the stack). Combined with the absence of an app ACL manifest, any script
that ever runs in the WebView can call `provider_fetch` (spend API credit on
every stored key), `agent_request` (run the installed Codex or Claude CLI),
`charts_import_file` (read any readable file) and `takes_export_daw` with an
arbitrary `outputDir`. Today nothing loads remote content and React escapes
text, so the practical exposure is low, but `docs/ARCHITECTURE.md` §10
promises "Tauri capabilities are minimal" and invariant 1 rests on the WebView
being a poor attacker. Set a CSP (Tauri's default `default-src 'self';
connect-src ipc: http://ipc.localhost` plus `style-src 'self' 'unsafe-inline'`
for the inline `style` props in `src/screens/Stage.tsx:277`), keep the
capability at `core:default`, and consider an app ACL manifest that restricts
`agent_request` and `charts_import_file` to the main window explicitly.

### F3 (P1) Compound meters: export, REAPER markers and `ballad-68` disagree with the engine

The engine defines a beat as `60 / bpm` seconds regardless of the denominator
and a bar as `numerator` beats (`crates/jam-core/src/timeline.rs:191-199`).
The exporters define a bar as `numerator * 4 / denominator` quarter notes:

- SMF tempo map: `ticks_per_bar = num * 480 * 4 / den`
  (`crates/jam-audio/src/export.rs:68`).
- REAPER markers: `seconds = (bar - 1) * num * 4 / den * 60 / tempo`
  (`export.rs:224-227`).
- `band-notes.mid` uses the engine's beat (`export.rs:287`) and is therefore
  the odd one out that is right.

For 6/8 at 60 bpm an engine bar lasts 6 s and a DAW bar 3 s; the section
marker for bar 9 lands at 24 s in Logic while the band reached bar 9 at 48 s.
The header offers 3/4, 6/8 and 12/8 (`src/App.tsx:296-299`), so a guitarist
can produce such a take from the Stage today. Owner gate 10 would fail on it.

Separately, `styles/ballad-68.json` patterns are 6 beats long, but selecting a
style never changes the transport meter (`crates/jam-audio/src/engine.rs:363`
calls `sequencer.set_style` only) and every bundled chart is 4/4. Pattern
occurrences are keyed by pattern length
(`crates/jam-band/src/sequencer.rs:657-675`) while chords are looked up per
`beats_per_bar` (`sequencer.rs:677-691`), so the 6-beat groove drifts against
4-beat bars and chord changes. Only the golden test uses the style's own
meter (`crates/jam-band/tests/golden.rs:10-13`), which is why it passes.

**Fix.** Decide one definition of "beat" and apply it everywhere. The cheapest
consistent choice: keep the engine's "bpm counts the numerator's unit" and
write the SMF with `ticks_per_bar = num * 480` and a tempo that means
"per engine beat" (document it in the sidecar), or convert bpm to
quarter-note tempo in the exporter (`tempo_q = bpm * den / 4`). Then either
make `band_set_style` adopt `style.feel.timeSig` when the transport is stopped,
or refuse a style whose meter differs from the transport with a notice. Add a
6/8 case to `markers_follow_the_meter` that compares marker time against
`Timeline::samples_per_bar`.

### F4 (P1) Jo's voice and push-to-talk run in the WebView; not functional on the Mac

`src/lib/jo/dispatcher.ts:215-223` speaks replies with
`window.speechSynthesis`; `src/screens/Jo.tsx:139-172` captures speech with
`webkitSpeechRecognition`. AGENTS.md invariant 1 says the WebView never
produces sound, and `docs/ARCHITECTURE.md` §6.3 routes STT and TTS through
Rust so Jo's voice sits on the voice bus with ducking and reaches the HeadRush
return like the band. Consequences:

- Jo's voice goes to the OS default output, not the engine's output device.
  With the HeadRush selected as output, the reply comes out of the laptop
  speaker while the band is in the headphones. Owner gate 7 ("Jo audible with
  ducking") cannot pass.
- The microphone is the browser's default input, not the Scarlett chosen in
  Settings.
- WKWebView on macOS does not expose `SpeechRecognition` (it is Safari-only), so
  on the primary platform push-to-talk does nothing. Worse, `Jo.tsx:208-229`
  sets `joState` to "listening" on key down and only resets it in
  `rec.onend`, which never fires without a recogniser, so the orb stays purple.
  Whether WebView2 on Windows exposes it was not verified.

The status board marks M2 as open, which is honest, but the README's "Working
with caveats" and the Jo screen's "Natural rhythm section director with full
engine control" oversell it. Either record an ADR exception that names the Mac
limitation and the output-device problem, or finish M2 as planned (Scribe STT
and ElevenLabs TTS through `net.rs` and the voice bus). At minimum, guard the
UI: if no recogniser exists, say so and disable the PTT button.

### F5 (P2) `T` is both tap tempo and push-to-talk; typing "t" in the assistant starts listening

`src/lib/shortcuts.ts:73-79` maps `KeyT` to tap tempo for the whole app and
`src/App.tsx:92-105` installs that handler on `window`. `src/screens/Jo.tsx:174-206`
installs a second `window` handler that starts push-to-talk on `t`. On the Jo
screen every press does both: the tempo changes while the guitarist talks to
Jo. The Jo handler ignores `HTMLInputElement` and `HTMLSelectElement` but not
`HTMLTextAreaElement`, and the studio assistant panel (mounted on every
screen, `src/App.tsx:350`) uses a `textarea`, so typing the letter "t" in the
assistant while on the Jo screen opens the microphone and eats the keystroke.
Put PTT in the shared shortcut table with its own key, and make the
input-guard include textareas and contenteditable like `handleShortcut` does.

### F6 (P2) One corrupt take manifest hides every take; SQLite rows are lossy

`src-tauri/src/lib.rs:750-764` (`all_takes`) merges SQLite rows with
`originals::file_takes()`. `file_takes` (`src-tauri/src/originals.rs:199-218`)
propagates the first JSON error with `?`, so a single unreadable `take.json`
makes `takes_list` fail for the whole library, and `takes_delete`,
`takes_favourite`, `takes_export_daw` with it. The SQLite side
(`src-tauri/src/store.rs:104-143`) rebuilds `TakeMetadata` with
`..Default::default()`, dropping `stems`, `snapshot`, `midi`, `sample_rate`
and `extra` (the `favourite` and `hidden` flags), so a take that lost its
manifest silently exports the three legacy stems and forgets its MIDI. Skip
and report bad manifests per file, the way `SeamRegistry::load_from_fs_dir`
does, and either drop the takes table (ADR 0005 says the cache is disposable)
or store the whole manifest JSON in it.

### F7 (P2) Settings are reset silently and written non-atomically

`src-tauri/src/settings.rs:101-108` returns defaults on any parse error and
`settings.rs:110-118` writes with a plain `fs::write`. A crash during a write,
or a stray edit, silently resets audio devices, rig mappings, the manual
latency offset and the `ai` preferences. Invariant 7 asks for loud failure.
`originals.rs` and `controller.rs` already do temp-file plus rename; settings
should too, and a parse failure should surface as a notice and keep a `.bak`.

### F8 (P3) Device config is persisted before it is tried

`src-tauri/src/lib.rs:112-124` saves the new `AudioConfig` and then calls
`apply_config`. If the device fails to open, the bad choice is saved and the
app starts degraded on every launch until the user changes it back. Persist on
success, or persist the resulting status alongside so the UI can explain it.

### F9 (P3) The audio callbacks allocate once and lock on every call

Invariant 2 says the callback allocates nothing and locks nothing.
`crates/jam-audio/src/io.rs:470-479` resizes `tmp` inside the output callback
(first call, and again if the driver grows the buffer); `io.rs:525-533` wraps
the real callback in an `Arc<parking_lot::Mutex>` forwarder that is locked on
every callback. The input side does the same (`io.rs:630-642`, `685-693`).
Uncontended, so it works, but it is the kind of drift the invariant exists to
stop. Pre-size `tmp` to the negotiated `buffer_frames` (or a generous maximum)
and pass the callback through an `Option` taken on the successful attempt
instead of a mutex.

### F10 (P3) Dead code and unused dependencies contradict "dead code removed"

Compiled but unreferenced by product code: `crates/jam-audio/src/ai_music.rs`,
`stems.rs`, `calibration.rs` and `crates/jam-dsp/src/stretch.rs`,
`chord_detect.rs` (all still `pub use`d from their `lib.rs`). `AiMusicEngine`
is still constructed into `AppState` (`src-tauri/src/lib.rs:31`, `978`) and
four `ai_music_*` commands (`lib.rs:568-591`) manipulate a generator that is
never mixed. `symphonia` and `rubato` are declared in
`crates/jam-audio/Cargo.toml` and compiled with zero `use` sites; `schemars`,
`midly`, `cxx` and `tokio-tungstenite` sit unused in the workspace table.
`package.json` still depends on `@ai-sdk/google`, `ai` and
`@tauri-apps/plugin-shell` with no import anywhere, while README, AGENTS.md
and `docs/ARCHITECTURE.md` §6.2 still describe the Vercel AI SDK as the LLM
client; the real client is the hand-rolled registry in
`src/lib/jo/providers.ts`. Remove or document each; every unused dependency is
licence surface and build time.

### F11 (P3) Black Spirit "Mute" scene has no way back

`rigs/black-spirit-200.json` ships a `Mute` scene (CC 9 = 127) and no other
scene sends CC 9 = 0. Once a section is mapped to `Mute`, every later section
change leaves the amp muted unless the amp clears mute on a Program Change,
which is unverified. Add CC 9 = 0 to the other scenes, or drop `Mute` until
owner gate 5 has confirmed the amp's behaviour.

### F12 (P3) Documents reference proofs that do not exist

- `tests/invariants/core-files.snapshot.json` (AGENTS.md invariant 12,
  `docs/ARCHITECTURE.md:69` and `:357`, `docs/EXTENDING.md:3`) does not
  exist, so invariant 12's "no core file changes when a fixture is added" is
  not enforced. `tests/invariants/seams.test.ts` only checks that every
  bundled JSON has `schemaVersion`, `id` and `name`.
- `tests/fixtures/jo/script.json` (Definition of Done item 3,
  `docs/plan/03-build-plan.md:192`, `docs/EXTENDING.md:56`) does not exist.
- `tests/fixtures/golden/<id>.json` (`docs/EXTENDING.md:12`) does not exist;
  `crates/jam-band/tests/golden.rs` asserts determinism and level, not a
  pinned render. README's "Golden-render tests pin the output" is therefore
  too strong.
- `docs/guide/setup.md` (`docs/plan/06-owner-verification.md:5`,
  `docs/plan/03-build-plan.md:276`) does not exist; the offline link checker
  does not see it because it is in backticks, not a link.

Either add the files or change the sentences. The board is now honest; the
supporting documents should be as well.

### F13 (P3) Stack-lock and licence-policy mismatches

- AGENTS.md says Rust edition 2024, MSRV 1.85; `Cargo.toml` uses edition 2021
  and sets no `rust-version`, so nothing enforces an MSRV.
- `deny.toml` allows `MPL-2.0` and `Unlicense` unconditionally; invariant 9
  says MPL-2.0 only as a recorded exception, and no exception is recorded.
- `src-tauri/src/lib.rs:766` carries a `#[tauri::command]` attribute on
  `find_take`, a plain helper taking `&AppState`; it compiles but is
  misleading.

### F14 (P3) Installed-agent bridge: unverified Claude path, Windows path rule

`src-tauri/src/agents.rs:52-111` builds the Claude Code command line with
`-p`, `--output-format json`, `--tools ""`, `--disallowedTools mcp__*`,
`--strict-mcp-config`, `--mcp-config`, `--setting-sources ""`, `--settings`,
`--no-session-persistence`, `--permission-mode dontAsk`, `--max-turns 2` and
`--json-schema`, and `parse_reply` expects `structured_output`. These match the
current CLI reference as far as this reviewer knows, but #29 states the path
was never executed on any machine. `platform/mod.rs:12-23` rejects anything
but a `.exe` on Windows, so the npm shims (`codex.cmd`, `claude.cmd`) are
refused and the user must find the platform binary under `node_modules`; the
guide says "select the native .exe" but not where npm puts it. Keep the live
check ignored in CI, but run it once on a machine with Claude Code before
telling the owner it works.

### F15 (P3) `originals_load` decodes every guitar clip into memory on every Play

`src-tauri/src/originals.rs:265-269` decodes all referenced clips (up to 16,
up to 100 MB each) on every `originals_load`, and `src/lib/originals.ts`
calls `originals_load` from `play` (292-299), `rehearse` (300-328) and
`record` (329-349). Pressing Loop section three times decodes the same WAVs
three times. Cache decoded clips by take id and file mtime, or keep them in
the engine until the song changes.

## Notes (non-blocking)

- Provider defaults are one generation old: `claude-sonnet-4-6`
  (`src/lib/jo/providers.ts:225`; current is `claude-sonnet-5`),
  `gemini-2.5-flash` (`:169`; the plan names Gemini 3.8 Flash),
  `gpt-4.1-mini` (`:194`). They are editable, and the guide says so; just do
  not describe them as current.
- `provider_fetch` buffers the whole response (`src-tauri/src/net.rs:352-364`,
  2 MB cap) and has no streaming path. The Definition of Done asks for a
  2.5 s median from PTT release to first spoken word (owner gate 7); without
  streaming STT, LLM and TTS that budget is tight. Design risk, not a bug.
- `recorder_start` (`src-tauri/src/lib.rs:333-340`) silently becomes
  `record_song` whenever a Write song was the last thing loaded: the Stage
  record button and Jo's `record_take` then stop the transport, drop the
  count-in and restart from bar 1. Documented for Write, surprising from
  Stage.
- `useAi.save` and `persist_rig` both do read-modify-write on `settings.json`
  from different threads; a lost update is possible but unlikely.
- `CostLog::totals()` re-reads the whole JSONL on every provider call
  (`src-tauri/src/lib.rs:65`, `net.rs:240-257`); fine for now, bounded by
  nothing.
- `IndexStore::rebuild_index` scans `songs/`, `recordings/`, `backups/`;
  nothing writes those folders (`originals/` and `takes/` are the real ones).
- The Gemini path lost `temperature: 0.6` when `joRequest` was flattened into
  the generic `BrainRequest` (`src/lib/jo/gemini.ts:102` versus
  `providers.ts:171-182`).
- `docs/QUICKSTART.md` (from #24) still describes one-click latency
  calibration, 4-stem separation and USB-MIDI modelers as if they exist. It
  should be rewritten or deleted alongside the README update in #28.
- Good things worth keeping: `net.rs` (allow-list, reserved headers, no
  redirects, 2 MB cap, log without bodies) is solid; `originals.rs` revision
  check plus `.bak` is exactly right; the REAPER script and its API-boundary
  test are a model for how to test an integration without the product
  installed; the sequencer's span-based scheduling and the timeline's
  half-open beat detection are correct and well tested.

## PR stack recommendation

| PR | Action |
|---|---|
| #26 | Close as superseded by #28 (same clean-up, smaller scope). |
| #27 | Close as superseded by #28 (#28 body says so; the registry and `provider_fetch` design survived). |
| #28 | Fix F1 and F5 on `feat/real-band-engine` (both are small), run `pnpm tauri dev` once and paste what the Stage shows into the PR, then squash-merge. Open issues for F3, F4, F6, F7 and F10 rather than growing the PR. |
| #29 | After #28 merges, retarget to `main`, confirm the Rust CI jobs finished green, squash-merge. Its own code did not raise a P0 or P1 in this review. |

The status board in `docs/plan/00-README.md` should keep M1e, M2, M5, M6 and
M7 at ⏳ until the corresponding owner gates are ticked; F1 means none of them
could have been attempted yet, which is worth saying in the "History" line.

## Tests to add

1. A Rust test that parses `src-tauri/gen/schemas/capabilities.json` after
   build and asserts window `main` has `core:default` (pins F1).
2. A `vitest` test that `initListeners` still loads library and settings when
   one `listen` rejects (pins the F1 aggravator).
3. A 6/8 case in `markers_follow_the_meter` comparing marker ticks against
   `Timeline::samples_per_bar` at the same bpm (pins F3), and a sequencer test
   that a 6-beat pattern on a 4/4 transport is refused or realigned.
4. A `takes_list` test with one corrupt `take.json` beside a valid one
   (pins F6).
5. A shortcut test that `KeyT` does not fire two actions and that textareas are
   ignored by every global key handler (pins F5).
6. The 30-utterance Jo script the Definition of Done already promises
   (F12), even if it only runs the offline parser today.

## Evidence commands

```
git log --all --oneline --name-status -- 'src-tauri/capabilities/*'   # empty
cargo build -p src-tauri && cat src-tauri/gen/schemas/capabilities.json # {}
grep -n "plugin:event|listen" node_modules/@tauri-apps/api/event.js      # :76
sed -n '1819,1852p' ~/.cargo/registry/src/*/tauri-2.11.5/src/webview/mod.rs
grep -n lengthBeats styles/ballad-68.json                               # all 6.0
```
