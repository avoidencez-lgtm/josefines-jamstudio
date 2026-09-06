# Build plan: spikes S1 to S5 and milestones M0 to M7

Sizes are in **sessions**: one Antigravity working block that ends in a PR with CI green on both operating systems (one to five commits). Total estimate 40 to 60 sessions. Every milestone ends with something the guitarist can use; the demo checklist at the end of each milestone defines "usable".

Common to every milestone: the gates in [02-working-method.md](02-working-method.md) are green before each commit, docs are updated in the same commit, the status board in [00-README.md](00-README.md) is updated at milestone end, and every new seam ships with a recipe in [EXTENDING.md](../EXTENDING.md) plus a fixture in `tests/invariants/`. Names of commands, events and types are the ones in [ARCHITECTURE.md](../ARCHITECTURE.md); do not invent parallel names.

## Dependency graph

```
M0 (S1 S2 S3) ─► M1a ─► M1b ─► M1c ─► M1d ─► M1e ─► M2 (S5) ─► M3 ─► M6 ─► M7
                                                       │
                                                       ├──────────► M4 (S4)
                                                       └──────────► M5
```

M4 and M5 depend only on M2 and can be built in either order. M6 needs M3 (song analysis) and M1e (takes). M7 is last.

---

## Spikes

A spike answers one question inside a timebox on a throwaway branch and leaves a findings file in `docs/spikes/` (template in [docs/spikes/README.md](../spikes/README.md)). S1 to S3 run at the start of M0 because a bad result changes the architecture; S4 and S5 run right before the milestone they unblock.

| Id | Question | Timebox | Deliverable | Fallback if it fails |
|---|---|---|---|---|
| S1 | Can Tauri IPC carry 48 kHz stereo 16-bit PCM (188 KB/s) for 10 minutes in both directions without dropouts, including while the window is minimised? Measure `invoke` with a raw `Uint8Array` body (JS to Rust) and `Channel<InvokeResponseBody::Raw>` (Rust to JS) | 1 session | `docs/spikes/S1-binary-ipc.md` with throughput, dropouts, CPU, minimised behaviour | The happy path never sends PCM over IPC (audio stays in Rust), so a failure only removes "Fallback A" for Lyria (see S4) |
| S2 | Can `cpal` enumerate and open a 4-channel input and let us pick channel 3? What does `cpal` do on a CI runner with no audio device, on Windows and macOS? | 1 session | `docs/spikes/S2-cpal-multichannel.md`: device list dumps from the Windows PC and from both CI runners, chosen buffer sizes, the headless behaviour | Analyse channels 1/2 (amp signal) instead of DI; on Windows accept stereo; `NullOutput`/`FileInput` handle CI regardless |
| S3 | Does the `signalsmith-stretch` Rust binding (cxx) build on MSVC and on macOS CI clang, and does a 1 kHz sine stretched 1.25x keep length ±1 ms and frequency ±1 Hz? | 1 session | `docs/spikes/S3-stretch-build.md` with build logs from both CI runners and the test numbers | Offline stretch to a rendered file instead of realtime; then `soundtouch` bindings; then resample varispeed with the key change shown in the UI |
| S4 | Can Rust (`tokio-tungstenite`) hold a Lyria RealTime session: setup, weighted prompts, bpm/scale config, `reset_context`, and decode `audioChunks` to 48 kHz PCM? What are the exact endpoint, auth and message shapes, and the real session cap? | 1 to 2 sessions | `docs/spikes/S4-lyria-ws.md` and a scrubbed wire transcript at `tests/fixtures/providers/lyria/session.jsonl` used by the client's unit test | Fallback B: Rust WebSocket relay on 127.0.0.1 that injects the key and sniffs audio while JS speaks the protocol via `@google/genai`. Only if that also fails: Fallback A (JS socket, PCM over IPC, requires S1 green) |
| S5 | Exact ElevenLabs request and response shapes for Scribe (batch), Flash v2.5 TTS with PCM output, and the voices list; end-to-end latency of a 3-second utterance | 1 session | `docs/spikes/S5-elevenlabs.md` and scrubbed HTTP fixtures under `tests/fixtures/providers/elevenlabs/` | Gemini Live API for STT+TTS behind the same `VoiceSession` interface |

---

## M0: Foundation (4 to 6 sessions)

**Goal:** a Tauri app that boots on Windows and macOS with CI green, lists audio devices, shows a working tuner and input meter from the file-backed input, plays a 440 Hz test tone and a metronome at a set tempo, stores API keys in the keychain, and already has every seam registry with an invariant test. Spikes S1 to S3 answered.

### 0.1 Toolchain and scaffold
- Install per [05-kickoff.md](05-kickoff.md) (rustup stable-msvc, corepack pnpm, `cargo-deny`).
- `corepack pnpm create tauri-app@latest .` with React + TypeScript + pnpm. Product name `Josefines Jamstudio`, identifier `com.josefinesjamstudio.desktop`, default window 1440x900, minimum 1100x700.
- Convert to a Cargo workspace: root `Cargo.toml` with members `crates/jam-core`, `crates/jam-dsp`, `crates/jam-audio`, `crates/jam-band`, `crates/jam-rig`, `src-tauri`. Shared `[workspace.dependencies]` with pinned versions (see [04-research.md](04-research.md) for the crate list). Rust edition 2024, MSRV 1.85.
- `package.json` scripts: `lint` (biome check), `format` (biome format --write), `typecheck` (tsc --noEmit), `test` (vitest run), `licenses:check` (`node scripts/check-js-licences.mjs`), `tauri`. `packageManager` pinned to the corepack pnpm version present on the PC.
- Biome config (`biome.json`), strict `tsconfig.json`, `vitest.config.ts`, Tailwind v4 via the Vite plugin, path alias `@/` to `src/`.
- `deny.toml`: licence allowlist Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Zlib, Unicode-3.0, Unicode-DFS-2016, CC0-1.0, MPL-2.0 only if a crate has no alternative (record the exception with a comment); deny GPL, LGPL, AGPL. `scripts/check-js-licences.mjs` reads `pnpm licenses list --json` and applies the same allowlist.
- `.editorconfig`, `rust-toolchain.toml` (stable), `.gitattributes` (LF; `*.wav binary`).

### 0.2 CI (`.github/workflows/ci.yml`, replacing the docs-only version)
```yaml
jobs:
  secrets:  ubuntu-latest  -> gitleaks/gitleaks-action@v2 (fetch-depth 0)
  links:    ubuntu-latest  -> lycheeverse/lychee-action@v2 --offline on **/*.md
  ts:       ubuntu-latest  -> corepack pnpm install --frozen-lockfile; pnpm lint; pnpm typecheck; pnpm test; pnpm licenses:check; pnpm build (vite build only)
  rust:     matrix [windows-latest, macos-latest] -> dtolnay/rust-toolchain@stable; Swatinem/rust-cache@v2;
            cargo fmt --all -- --check; cargo clippy --workspace --all-targets -- -D warnings;
            JAM_HEADLESS=1 cargo test --workspace; EmbarkStudios/cargo-deny-action@v2
  bundle:   needs [ts, rust]; if: startsWith(github.ref, 'refs/tags/v') || contains(github.event.pull_request.labels.*.name, 'bundle')
            matrix [windows-latest, macos-latest]; tauri-apps/tauri-action@v0 (args: --target aarch64-apple-darwin on macOS); upload artifacts
```
`rust` on macOS must pass with no audio device: S2 proves `JAM_HEADLESS=1` makes the engine use `NullOutput`.

### 0.3 Engine skeleton (`crates/jam-audio`, `crates/jam-dsp`, `src-tauri/src/ipc/audio.rs`)
- `jam-audio::io`: traits `AudioInput` and `AudioOutput` (ARCHITECTURE §4); `CpalInput`, `CpalOutput`, `FileInput` (looping WAV via `symphonia`, resampled to 48 kHz with `rubato`), `NullOutput` (advances exactly `bufferFrames` per tick on a timer thread).
- `jam-audio::devices`: enumeration with channel counts and supported sample rates; `AudioConfig` selection; open/close; a resampler at the device edge when the device is not 48 kHz.
- `jam-audio::engine`: the master ring buffer (`rtrb`), the output callback that only copies, the input callbacks that only push into per-input ring buffers, an xrun counter, and the first **render worker** thread that fills the ring from a `Renderer` trait. In M0 the renderer sums a test tone generator and a metronome.
- `jam-dsp`: `level` (peak/RMS), `pitch` (McLeod pitch method via the `pitch-estimate` crate, 2048-frame window, hop 512, confidence threshold). Each with the synthetic-signal tests in ARCHITECTURE §9. Tap tempo is handled by the UI store; the unused Rust tap helper was removed.
- IPC: `audio_list_devices`, `audio_get_config`, `audio_set_config`, `tone_set({ on, hz })`, `metronome_set({ on, bpm })`, `tuner_set({ on })`, events `audio.state`, `meters` (30 Hz), `tuner.state` (20 Hz: note, cents, hz, confidence).
- Env: `JAM_HEADLESS=1` selects `NullOutput`; `JAM_FAKE_INPUT=<wav>` selects `FileInput` for the guitar input. `tests/fixtures/audio/` gets two CC0 or self-generated fixtures: `sine-440.wav` and `guitar-e-blues-120.wav` (a real DI recording is best; if none is available, synthesise a plucked-string signal with Karplus-Strong in a script `scripts/gen-fixtures.mjs` and say so in the file's README).

### 0.4 App shell (`src/`)
- Design tokens and primitives from [DESIGN.md](../DESIGN.md): `src/design/tokens.css`, `Button`, `Toggle`, `Dial`, `BigReadout`, `Meter`, `Panel`, `StatusPill`. Empty/error states use the existing room UI; unused standalone wrappers were removed.
- Navigation registry `src/screens/registry.ts` with Stage, Library, Sessions, Rig, Settings (later screens are one line each). Stage shows: tuner readout, input meter, tempo readout with tap, test tone and metronome toggles. Settings shows: audio devices and channels, API keys (set/clear only, never displayed), diagnostics (xruns, sample rate, buffer).
- `src/ipc/`: `contract.ts` (types and `IPC_VERSION`), one file per domain wrapping `invoke` and `listen`, a `useEngineState` store (zustand) fed by `<domain>.state` events.

### 0.5 Keys, settings, store, logging (`src-tauri/src/{keys,store,settings}`)
- `SecretStore` trait with `KeyringStore` (`keyring` crate, service `josefines-jamstudio`) and `MemoryStore` (tests). Commands `keys_set(provider, value)`, `keys_has(provider)`, `keys_delete(provider)`. There is no command that returns a key.
- Settings: `~/JosefinesJamstudio/settings.json` (`schemaVersion: 1`, shape in ARCHITECTURE §7), commands `settings_get`, `settings_set`, event `settings.state`. Unknown fields preserved on write.
- Store: `rusqlite` (bundled) take cache at `~/JosefinesJamstudio/index.sqlite`; take manifests remain authoritative. The unused library index and its rebuild helper were removed; library discovery reads files directly.
- Logging: `tauri-plugin-log` to `~/JosefinesJamstudio/logs/`, rotating, never request bodies.

### 0.6 Seam registries and the invariant tests
- Rust: `jam-core::registry` loaders for `styles/`, `charts/`, `rigs/`, `controls/` (bundled via `include_dir` plus the user folders under `~/JosefinesJamstudio/`), `src-tauri/src/net/registry.rs` for providers (empty list in M0 but the `Provider` trait and the table exist), IPC domain list in `src-tauri/src/ipc/mod.rs`.
- TS: tool registry `src/ai/tools/index.ts` via `import.meta.glob('./*.tool.ts', { eager: true })`, screen registry, provider id union.
- `tests/invariants/seams.test.ts` checks bundled style, chart, rig and control manifests for `schemaVersion`, `id` and `name`. `crates/jam-core/tests/seams.rs` loads those bundled registries and asserts representative IDs. Neither auto-discovers `tests/fixtures/seams/` nor proves core files were untouched; an extension PR must show its fixture in the relevant registry.

### 0.7 Spikes S1 to S3
Run S2 first (it can change 0.3), then S3, then S1. Findings merged as docs before 0.3 is finished.

**Acceptance criteria M0:** CI green on both operating systems with the `rust` job running the engine tests headless; `pnpm tauri dev` on the PC with `JAM_FAKE_INPUT` shows a tuner reading E2 (82.4 Hz) within ±3 cents from `guitar-e-blues-120.wav` and a moving input meter; the test tone and metronome are audible on the PC's speakers through the selected output; a key set in Settings survives an app restart and never appears in logs or in any IPC event (assert with a test that greps the event stream); `tests/invariants` green with all six fixtures; `docs/spikes/S1..S3` exist with numbers; `deny.toml` and the JS licence check pass.

**Demo checklist M0:** open the app, pick devices, see the tuner react to the fixture, toggle the metronome at 120 bpm and hear it, set and clear an ElevenLabs key.

---

## M1a: Transport, timeline, click, count-in (3 to 4 sessions)

**Goal:** a rock-solid click and count-in driven by a single clock, with position, loop and tempo changes at the next bar.

- `jam-core::timeline`: `TempoPoint`, `Timeline` with `beats_to_samples`, `samples_to_beats`, `bar_beat_at`, `next_bar_boundary`; pure, exhaustively tested (round-trip under 1e-9 beats over 10 000 random points with three tempo changes).
- `jam-audio::transport`: state machine (stopped, counting_in, playing) owning position in samples; commands applied by the render worker at block boundaries (block 256 frames) with `when: 'now' | 'next_bar'`; loop with sample-accurate wrap; count-in of N bars that emits click only.
- `jam-band::click`: two-sample click (accent on beat 1) rendered into the `click` bus.
- IPC: `transport_play`, `transport_stop`, `transport_locate`, `transport_set_loop`, `transport_set_tempo`, `transport_set_time_sig`, `transport_tap_tempo`, event `transport.state` at 30 Hz; `mixer_set_bus`, event `mixer.state`.
- Stage: transport bar (play/stop, bar:beat, tempo with tap, time signature, loop toggle, count-in bars), keyboard: space = play/stop, T = tap.

**Acceptance criteria M1a:** timeline tests green; a 4-bar loop at 120 bpm wraps within ±1 sample (test with `NullOutput` and a click-onset detector); tempo change scheduled at next bar lands exactly on the bar boundary; count-in of 1 bar produces exactly `beats × 48000 × 60 / bpm` frames before position 0.

**Demo checklist:** set 96 bpm in 4/4, count in one bar, hear the click, loop bars 1 to 4, tap a new tempo, see it apply at the next bar.

---

## M1b: Drums (3 to 4 sessions)

**Goal:** a drummer that plays a groove at his tempo with fills on command, rendered ahead of the audio callback.

- `assets/manifest.json` (in repo) lists packs: `id`, `version`, `url` (GitHub Release asset), `sha256`, `bytes`, `licence`, `attribution`. `src-tauri/src/assets/`: downloader with resume, checksum, unpack to `~/JosefinesJamstudio/assets/<id>/`, event `assets.state`, command `assets_ensure(ids)`. UI: an Assets panel in Settings and a first-run prompt on Stage.
- Kit selection task: audit candidates ([04-research.md](04-research.md) §F) and pick one multisampled drum kit with velocity layers under CC0 or CC-BY; write the licence line in `assets/LICENSES.md`; publish the pack as a GitHub Release `assets-v1` (`gh release create assets-v1 --notes "Sample packs for Josefines Jamstudio"`); convert it to the kit format `kit.json` (instrument, layers by velocity range, round-robin files, choke groups).
- `jam-band::instruments::Sampler`: polyphonic, velocity layers, round-robin, choke groups (open/closed hi-hat), release fade; implements `Instrument`.
- `jam-core::style` schema v1 (ARCHITECTURE §7) with `serde` and a JSON Schema exported for the TS side (`zod` mirrors it); loader in the registry; `styles/blues-shuffle.json` and `styles/rock-straight.json` first (drums part).
- `jam-band::sequencer`: bar and beat scheduler on the transport timeline, humanize with a seeded RNG (`rand_pcg`), intensity band selection, cues (`fill` at next bar, `crash` on the next downbeat, `stop` at next bar with a choke, `ending` pattern then stop). Renders into `drums` bus through the render worker with 200 ms lookahead; commands land at the next bar.
- IPC: `band_set`, `band_cue`, `band_render_offline` (headless render to WAV), event `band.state`. Stage: style picker, intensity dial, cue buttons.
- Tests: golden renders of 8 bars per style at 100 bpm with seed 42 (onset positions ±1 sample, per-bus RMS ±0.05 dB, exact frame count; SHA logged only), a 10 000-block render-worker benchmark against a wall-clock budget (must stay under 25 % of real time on the CI runner).

**Acceptance criteria M1b:** assets download with a verified checksum on both operating systems; both styles play at 60 to 200 bpm without xruns on the PC (`audio.state.xruns` stays 0 over 5 minutes at buffer 512); fill and ending cues land at the intended bar; golden tests green on both CI runners.

**Demo checklist:** pick blues-shuffle, 110 bpm, count in, hear the groove, press fill, press ending.

---

## M1c: Bass, comp, chart, six styles (3 to 4 sessions)

**Goal:** a full band over a 12-bar blues in any key.

- `jam-band::instruments::Sf2Synth` using `oxisynth`, loading a permissive SoundFont from the asset manifest (bass and an electric piano or organ program; audit licence as in M1b). Voicing templates per `ChordQuality` (shell, triad, drop2, power) in `jam-band::voicing`.
- `jam-band::bass`: pattern notes by degree relative to the chord root with octave and approach-note rules per style; `jam-band::comp`: strum events from `CompPattern` with the voicing template.
- Chart: `jam-core::chart` types and `resolve(chart) -> ResolvedChart` (arrangement expansion). TS: `src/lib/chart/parse.ts` parses text charts (`[Verse] | A7 | D7 | A7 | A7 |`, `x2` repeats, slash chords, `%` repeat) using `tonal`, transposes, and produces the numeric `ResolvedChart` the engine receives (no music theory in Rust beyond voicings).
- `charts/*.json` presets: 12-bar blues (standard and quick change), 8-bar blues, minor blues, I-V-vi-IV, ii-V-I, 16-bar rock, one-chord vamp. Each with a default style and tempo.
- Styles: `blues-shuffle`, `rock-straight`, `funk-16`, `jazz-swing`, `ballad-68`, `metal-gallop`, each with three intensity bands, two fills, one ending. Style JSON authored by the builder and validated by the schema test.
- IPC: `band_load_chart(ResolvedChart)`; `band.state` carries `chartId`, current bar and the next chord. Stage: chart picker, key picker (transpose in TS, reload chart at next bar), chord now/next readout.
- Tests: chart parser (round-trip of all presets, transposition by every interval), golden render for all six styles, voicing tests (no voice crossing, range limits).

**Acceptance criteria M1c:** all six styles render golden on both CI runners; every preset chart parses and plays in all twelve keys; the bass never leaves E1 to G3 and comp voicings stay within C3 to C6 (tests); `band.state.nextChord` is correct at every bar of the 12-bar blues (test with `NullOutput`).

**Demo checklist:** choose "12-bar blues", key A, jazz-swing at 140, hear drums, walking bass and comp, switch to key E at the next bar.

---

## M1d: Live steering and the Stage screen (2 to 3 sessions)

**Goal:** everything a guitarist needs to change mid-song from the Stage screen without stopping.

- `band_set` patches (tempo via transport, intensity, swing, density, parts, style) applied at next bar with an on-screen "at next bar" indicator.
- Energy following: `jam-dsp::energy` (RMS envelope on the DI with 300 ms attack, 1.5 s release) mapped to intensity with hysteresis; toggle `band_set({ followEnergy })`; the current energy shown on the Stage.
- Section loop: choose a section on the chart to loop (transport loop from the resolved bar range).
- Stage layout per [DESIGN.md](../DESIGN.md): the big chord now/next, bar:beat, tempo, key, style, intensity dial, parts toggles, cue buttons, count-in, loop, energy meter. Keyboard shortcuts for all of it.
- Control maps: planned as `controls/default.json` plus a TS dispatcher. **Not built.** The live map is `controller.json` + `PEDAL_ACTIONS`; `controls/` is a registry fixture only.

**Acceptance criteria M1d:** every Stage control has a keyboard shortcut listed in the shortcuts panel; changing intensity, parts or style never causes an xrun; energy following raises intensity within 2 seconds when the fixture's loud section starts (test with the fixture's known dynamics); a section loop wraps at the bar boundary.

**Demo checklist:** play the blues, turn on energy following, play softer and louder (use the fixture), loop the last four bars, switch styles without stopping.

---

## M1e: Recorder, latency calibration, take browser (2 to 3 sessions)

**Goal:** press record, jam, and get sample-aligned WAVs on disk that Logic will accept at bar 1.

- `jam-audio::recorder`: arm with a track list (`guitar_di`, `guitar_amp`, `mic`, `drums`, `bass`, `comp`, `ai`, `song`, `mix`), start at a bar boundary, stop, 24-bit or float WAV via `hound` written by a disk thread fed from bounded channels; input chunks stamped with the output frame counter plus the calibrated offset.
- Latency calibration: `audio_calibrate_latency()` plays three clicks, listens on the guitar input for a loopback (cable from an output to the input, wizard text explains), returns `roundTripFrames` and `confidence`; without a loopback it returns the computed estimate (2 × buffer + device nominal) flagged `estimated`. Stored per device in settings.
- Session folders: `~/JosefinesJamstudio/sessions/<date>-<slug>/session.json` and `takes/<n>/take.json` with the WAVs; `store` indexes them.
- IPC: `recorder_arm`, `recorder_start`, `recorder_stop`, event `recorder.state`; `take_list`, `take_peaks(takeId, kind, bins)`, `take_play(takeId)`, `take_delete`.
- Sessions screen: list of sessions and takes, peaks waveform per track, play a take through the `song` bus, rating and notes.
- Alignment test: `FileInput` fed with an impulse at sample 24000 while the band renders a click; after applying the offset the recorded impulse and the click transient are within ±1 sample.

**Acceptance criteria M1e:** alignment test green on both CI runners; a 60-second take produces files whose lengths match to the sample; disk-full and permission errors show in the UI as `app.error` with the path; a take survives an app crash (manifest written on stop and on every 10 seconds of recording).

**Demo checklist:** record a 30-second blues over the fixture, open the take, see the waveforms, play it back, rate it.

---

## M2: Jo v1, push-to-talk (6 to 9 sessions, includes S5)

**Goal:** hold a button, say "blues in A, ninety, shuffle", release, and the band does it while Jo confirms in her voice.

- S5 first.
- PTT sources: global hotkey (`tauri-plugin-global-shortcut`, default a configurable key), on-screen hold button, MIDI Program Change (a minimal `jam-rig::input` listener; full rig work is M5). All three dispatch through the control map.
- Mic input: a second `AudioInput` stream (`micDeviceId`), downmixed to mono and resampled to 16 kHz into a bounded buffer while PTT is held (max 20 s). Command `voice_ptt(down: bool)`.
- `src-tauri/src/net/elevenlabs.rs`: `stt_transcribe(wav16k) -> Transcript`, `tts_synthesize(text, voice) -> Pcm48k`, `voices_list()`. `src-tauri/src/net/gemini.rs`: `provider_fetch` target with `x-goog-api-key` from the keychain. `net/registry.rs`: the providers table with `id`, `base_url`, `auth`, `enabled`.
- Voice bus and ducking in the mixer: when the voice bus is active, band buses duck by `duckBandDb` (default -9 dB) with 150 ms ramps.
- TS `src/ai/`: `llm/` (Vercel AI SDK `generateText` with `@ai-sdk/google`, model from settings, custom `fetch` shim over `provider_fetch`, `maxSteps` from settings), `tools/*.tool.ts` (each exports `name`, `description`, `schema` (zod), `run`), `jo/persona.md` (system prompt), `jo/session.ts` (state machine idle → listening → transcribing → thinking → speaking, with barge-in: a new PTT press stops TTS), `jo/transcript.ts` (conversation log per session).
- Tools in v1: `set_tempo`, `set_key`, `set_style`, `load_chart` (preset id or chart text), `transport` (play, stop, count_in), `set_loop` (section name, bar range, or off), `set_intensity`, `set_parts`, `cue`, `tuner`, `explain` (returns text only), `coach_tip` (uses the last take's analysis when M6 exists; before that, generic per style).
- Jo presence on Stage: a small orb with state colour, the last transcript and reply, a text input as fallback, and a "latency" figure per turn (logged too).
- `cost.state` event and a spend meter in Settings (STT seconds, TTS characters, LLM tokens, estimated USD from the price table in settings).
- Tests: `tests/fixtures/jo/script.json` (30 utterances with expected tool calls) run against recorded LLM fixtures (`tests/fixtures/providers/gemini/`), tool argument validation, ducking ramp test, PTT buffer limits.

**Acceptance criteria M2:** ≥ 27 of 30 script utterances produce the expected tool calls with the recorded fixtures; live opt-in test (`JAM_LIVE=1`) on the PC with a headset shows a median ≤ 2.5 s from PTT release to first audio over 10 turns and the number is written in the PR; band ducks while Jo speaks and recovers within 300 ms; no key ever appears in the TS bundle (bundle-scan test).

**Demo checklist:** hold the key, say "twelve-bar blues in G, one hundred, rock", release; the chart loads, Jo says "Blues in G, one hundred, rock. Counting in." and the band starts.

---

## M3: Real songs (8 to 12 sessions)

**Goal:** import one of his songs, get the guitar removed and the chords on screen, and jam over it at any speed and in any key.

- Import: file dialog and drag-and-drop for wav, mp3, flac, m4a, aiff; decode with `symphonia`, resample to 48 kHz, write `~/JosefinesJamstudio/songs/<slug>/source.wav` and `song.json` with `sourceHash`; command `song_import(path)`, `song_list`, `song_load(songId)`.
- Analysis pipeline `src-tauri/src/analysis/`: `AnalysisKind` enum (`stems`, `beats`, `chords`, `key`, `sections`); providers `net/musicai.rs` (signed-URL upload, workflow run, poll, download; modules for beats and downbeats, chords, key, sections) and ElevenLabs stems (`POST /v1/music/stem-separation` → ZIP → WAV per stem); local fallback in `jam-dsp::offline` (onset autocorrelation tempo, chroma-template chords per beat, Krumhansl key profiles) used when a provider is disabled or fails, flagged `confidence: low`. Commands `analysis_start`, `analysis_cancel`; events `analysis.progress`, `analysis.result`. Results written into `song.json` (`tempoMap`, `beats`, `chart`, `key`, `stems[]`, `analysis[]` with provider and cost).
- Song player `jam-audio::song`: multi-stem player (one file per stem, per-stem gain and mute; minus-guitar = guitar stem muted, other stems as mixed), Signalsmith stretch (time ratio 0.5 to 1.5) and pitch shift (±12 semitones) per S3, locked to the transport so bars, beats and sections display and loop; the song's tempo map becomes the transport timeline while in Song mode.
- Stage in Song mode: chord timeline (now, next, the bar grid), section list with loop, speed slider with practice ramp (start %, step %, target %, bars per step), transpose, stem mutes. Library screen: songs with analysis status, re-run analysis, delete.
- Jo tools: `load_song(query)`, `set_speed(percent)`, `transpose(semitones)`, `loop_section(name)`, `ramp(start, step, target)`.
- Tests: decode and resample fixtures; analysis pipeline with recorded Music.ai and ElevenLabs fixtures; local fallback on a synthesised chord loop fixture (`tests/fixtures/audio/chords-c-f-g-90.wav`, known ground truth: ≥ 90 % beat-aligned chords correct, tempo within ±1 bpm); stretch length ±1 ms and pitch ±5 cents on sines; a bundled CC-licensed real song fixture (audit licence) for a manual end-to-end.

**Acceptance criteria M3:** importing the fixture song yields stems and a chord chart in `song.json` from recorded fixtures without network; the local fallback meets the numbers above; 50 % speed and +2 semitones play without dropouts on the PC; the chord readout is within ±100 ms of the analysed beat grid (test with `NullOutput` and the fixture's ground truth); a section loop wraps on the analysed downbeat.

**Demo checklist:** drop an mp3, watch progress, mute the guitar stem, slow to 75 %, loop the solo section, transpose down a semitone, ask Jo to "ramp from 70 to 100".

---

## M4: AI music (5 to 8 sessions, includes S4)

**Goal:** an endless, steerable AI band to play over, and full generated tracks that land in the library ready to jam.

- S4 first.
- `net/lyria.rs`: session lifecycle (connect, setup with model `models/lyria-realtime-exp`, weighted prompts, config with bpm from the transport and scale from the current key, density, brightness, guidance, mutes; `play`, `pause`, `stop`, `reset_context`), audio chunks decoded into the `ai` bus through a jitter buffer (prefill 1 s, target 500 ms, underrun → 250 ms fade and `lyria.state.buffering`), reconnect before the session cap with a 250 ms crossfade, bpm or scale change = one-bar count-in click then `reset_context`, per-minute cap and monthly cap from settings with a confirm dialog before start. Commands `lyria_start`, `lyria_set`, `lyria_stop`; event `lyria.state`.
- Lyria mode on Stage: prompt chips with weights (presets: "blues shuffle band", "funk rhythm section", "ambient pad", user text), density and brightness dials, mute bass and drums, the spend meter. Band and Lyria are mutually exclusive in the UI (switching stops the other).
- Track generation: `net/gemini_music.rs` (Lyria 3 `lyria-3-pro-preview` / `lyria-3-clip-preview`) and ElevenLabs Music (`POST /v1/music`, `music_v2`, `force_instrumental: true`, `music_length_ms`); `generate_track(prompt, provider, lengthMs)` runs async with progress, saves into `songs/`, and triggers the M3 analysis automatically; the result opens in Song mode.
- Jo tools: `lyria_vibe(prompts)`, `lyria_set(density, brightness, mutes)`, `generate_track(prompt, provider)`.
- Tests: Lyria client against the S4 transcript fixture (message ordering, decode, reconnect timing), jitter buffer under simulated late chunks, generation flow with recorded fixtures.

**Acceptance criteria M4:** Lyria plays 10 minutes on the PC with one reconnect and at most one audible gap under 300 ms (log the buffer statistics in the PR); a bpm change produces a count-in and a reset without a click artefact; a generated track appears analysed in the Library within one flow; spend meter matches the logged calls.

**Demo checklist:** switch to Lyria, "funk rhythm section" at 100 bpm in E minor, mute drums, unmute, change to 110 bpm (count-in, reset), then generate a 60-second ElevenLabs instrumental and jam over it.

---

## M5: Rig orchestration over MIDI (4 to 6 sessions)

**Goal:** the rig changes tones by itself when the chorus comes.

- `jam-rig`: `MidiSink` trait with `MidirSink` (real ports) and `MemorySink` (tests, records timestamped bytes); output port selection per profile; profiles from `rigs/*.json` (`headrush-pedalboard.json` with PC 0 to 127 and user-learned CC, `black-spirit-200.json` with PC presets and the CC map from [../hardware/black-spirit-200.md](../hardware/black-spirit-200.md) after verification against the official manual); clamps per control; `Scene` with commands; scheduler on the timeline that sends scene commands 50 ms before the section boundary from a dedicated MIDI thread; MIDI clock (24 ppqn, start/stop/continue) when `sendClock` is on; a dry-run mode that logs instead of sending; `rig_panic` (all notes off, reset all controllers).
- MIDI-in: `jam-rig::input` maps incoming PC and CC to control-map actions (PTT from M2 moves here).
- Charts get `Section.rigSceneId`; song sections get scene bindings in `song.json`.
- Rig screen: ports, profiles, scene editor (per section: HeadRush PC, Black Spirit PC and CC values with sliders), "send now" buttons, MIDI monitor (in and out), clock toggle, learn mode for HeadRush CC numbers.
- Jo tool: `rig_scene(name)`.
- Tests with `MemorySink`: scene bytes and timing ±1 ms of the section boundary minus lookahead, clamps, clock tick spacing at 60 to 240 bpm, panic message set.

**Acceptance criteria M5:** tests green; on the PC with a loopMIDI virtual port the monitor shows the expected bytes at the expected beats; friend-led owner gate 5 (real rig) is deferred to V2 and does not block V1.

**Demo checklist:** bind "verse" to HeadRush rig 3 and Black Spirit preset 12, "chorus" to rig 4 and preset 20 with gain 90, play the chart, watch the monitor flip at the boundaries.

---

## M6: Sessions, review, Logic export, progress (4 to 6 sessions)

**Goal:** every jam saved, reviewed with evidence, and importable into Logic Pro with a tempo map and markers.

- `jam-dsp::offline::take_analysis`: pitch track on the DI (cents deviation from equal temperament per note, bend detection excluded from "flat" statistics), onset timing versus the grid (mean and standard deviation in ms, early/late bias), chord chroma per bar versus the chart (agreement ratio), dynamics profile. Written into `take.json.analysis`.
- LLM review via `provider_fetch`: structured output (summary, strengths, drills, focus bars) from the analysis numbers and the chart, never from audio; stored in `session.json.review`; the Sessions screen shows it; Jo's `coach_tip` uses it.
- Logic export `src-tauri/src/export/logic.rs`: `exports/<session>/<take>/` with 24-bit 48 kHz WAVs trimmed to start at bar 1, `tempo.mid` (Standard MIDI File format 0 written with `midly`: tempo meta events at every `TempoPoint`, time signature, marker meta events for sections and user markers, optional chord names as text events), and `README.txt` with the Logic steps (File > Open the MIDI file, keep tempo, drag the WAVs to bar 1). Command `export_logic(takeId)`, event `export.state`.
- Progress dashboard on Sessions: sessions per week, minutes played, tempo records per chart, timing and pitch trends over the last 20 takes.
- Tests: SMF written for a three-change tempo map re-parsed with `midly` and compared; analysis on synthetic takes (a DI fixture with known timing offsets and known pitch errors); export folder layout.

**Acceptance criteria M6:** analysis numbers on the synthetic take are within stated tolerances (timing ±2 ms, pitch ±3 cents); the SMF round-trips; export of a 5-minute take completes under 10 seconds on the PC; friend-led owner gates 9 and 10 are deferred to V2, not marked passed.

**Demo checklist:** record a take, open the review, read Jo's drills, export to Logic, open the folder.

---

## M7: Polish and distribution (3 to 4 sessions)

**Goal:** a .dmg he installs and a guide he follows, and a UI that passes the DESIGN audit.

- Onboarding wizard: devices and channels → latency calibration → API keys (with "test key" buttons that call the cheapest endpoint) → rig ports → asset download. Re-runnable from Settings.
- Shortcuts panel, empty states for every screen, error states audit (every `app.error` code has a message and a next step), reduced-motion support, keyboard navigation and focus rings, the DESIGN.md pre-flight list executed and recorded in the PR.
- Performance: meters and waveforms on canvas at 60 fps; IPC event rates measured; app idle CPU under 3 % on the PC.
- `.github/workflows/release.yml`: on tags `v*`, `tauri-action` builds macOS aarch64 `.dmg` (unsigned) and Windows NSIS `.exe`, attaches them to a GitHub Release with generated notes. Updater plugin wired but disabled until signing keys exist (documented in `docs/adr/` when that changes).
- Diagnostics panel: devices, sample rate, buffer, xruns, log export button, version.
- `docs/guide/setup.md`: the guitarist's guide with cabling from [../hardware/cabling.md](../hardware/cabling.md), first-run steps, the macOS unsigned-app note (`xattr -dr com.apple.quarantine "/Applications/Josefines Jamstudio.app"` or right-click Open), and troubleshooting.

**Acceptance criteria M7:** a tagged release produces both installers; the Windows installer runs on the PC; developer verification confirms the macOS .dmg opens and the installed app starts, with personal-rig owner gate 1 deferred to V2; the DESIGN pre-flight list has no open items; every screen has empty, loading and error states demonstrated in a short screen recording attached to the PR.

**Demo checklist:** fresh install on the PC, onboarding, play the blues, talk to Jo, import a song, export a take.

---

## Backlog (documented, unscheduled)

Recorded here so nobody re-decides them. Each becomes a milestone only by a status-board change approved by Vegar.

- **Jo Live:** full-duplex conversation over the ElevenLabs Agents WebSocket with client tools, behind the existing `VoiceSession` interface; agent provisioned from `src/ai/jo/agent.json` through the ElevenLabs API.
- **Adaptive tempo following** (the band follows his tempo) behind an accuracy gate; **live chord detection** from the DI.
- **More LLM providers** (Anthropic, OpenAI, Moonshot Kimi): one `provider_fetch` target each plus one AI SDK provider package.
- **VST3/AU hosting** and a software monitoring path: only via the criteria in [ADR 0001](../adr/0001-tauri-rust-not-juce.md).
- **Local stems** (htdemucs ONNX through `ort`), **local STT** (whisper.cpp, NB-Whisper for Norwegian), **Norwegian voice**.
- **Black Spirit Bluetooth**: sniff whether the app protocol is BLE-MIDI; if so, wireless amp control without an interface.
- **Signing and notarization** when an Apple Developer account exists; Windows signing via Azure Artifact Signing.
- **User style packs** from a folder, a community styles repository, WASM instruments and tools.
