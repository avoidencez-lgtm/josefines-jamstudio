# Architecture

This document is the contract between the milestones. Names here (crates, modules, commands, events, types) are the names the code uses. A change to a contract is a change to this file in the same PR.

The music-video extension is governed by [ADR 0008](adr/0008-music-video-workspace.md).
`media_list`, `media_save`, `media_import`, `media_from_take`, `media_generate`,
`media_refresh`, `media_tools`, `media_render`, `media_cancel` and `media_open` are
additive IPC commands. They exchange JSON project/job/asset metadata and paths,
never binary audio/video. Projects use schemaVersion 1 and revision conflict checks.
The shared media catalog defines cloud and fixed-loopback ComfyUI protocols;
all HTTP remains under `net/media.rs`. Tauri asset access is limited to media
assets and exports, excluding generation receipts. Native preview is silent;
FFmpeg and the user's external media player own exported audiovisual playback.
See [music-video setup and acceptance](guide/music-video.md).

## 1. The governing rule

> **JS owns text and UI. Rust owns bytes and time. The WebView never produces sound and never holds a key.**

Corollaries that resolve most design questions:

- All audio devices, capture, mixing, playback, recording and MIDI live in Rust. The WebView has no `<audio>` element and no Web Audio output.
- All realtime network streams that carry audio or need a key (Lyria, ElevenLabs TTS and STT, Music.ai jobs, stem jobs, asset downloads) live in Rust.
- The LLM conversation (text in, tool calls out) lives in the TypeScript provider registry, but its HTTP goes through the Rust `provider_fetch` proxy that injects the key.
- Music theory (chord parsing, transposition, scales) lives in TypeScript (`tonal`); Rust receives fully resolved numeric charts and owns only voicing templates.
- 48 kHz internally, always. Devices that run at another rate are resampled at the edge.
- One clock: the output audio callback's frame counter. Everything musical derives from it.

## 2. Process and thread model

One Tauri process. Threads on the Rust side:

| Thread | Owns | Rules |
|---|---|---|
| Output audio callback (`cpal`) | Copies the next block from the master ring buffer to the device; advances the frame counter | No allocation, no locks, no logging, no IPC. Bounds-checked copy and an xrun counter, nothing else |
| Input audio callbacks (`cpal`, one per input device) | Push captured frames into per-input ring buffers with the output frame counter stamped on each chunk | Same rules as the output callback |
| Render worker | Renders ahead into the master ring (200 ms lookahead, 256-frame blocks): band sequencer and instruments, song player, AI-music jitter buffer, voice buffer, click, bus gains, ducking, meters, recorder taps | Real-time priority where the OS allows; commands are drained from a lock-free queue at block boundaries; musical changes land at the next bar when requested |
| Disk writer | Receives recorder chunks over bounded channels and writes WAV files with `hound` | Never blocks the render worker (drops with an error event if the channel is full for more than 2 seconds) |
| MIDI thread (`jam-rig`) | Sends scheduled MIDI bytes at their timestamps, receives MIDI input | Timing from the transport timeline; 50 ms lookahead for scene commands |
| Tokio runtime | All network clients (`net/`), analysis jobs, asset downloads, the `provider_fetch` proxy | Never touches audio buffers directly; hands PCM to the render worker through ring buffers |
| Tauri main thread | IPC commands and the 30 Hz state emitter | Commands are cheap: they enqueue to the render worker or read a snapshot (`arc-swap`) |

State snapshots for the UI are published by the render worker into `arc-swap` cells; the emitter thread reads them at 30 Hz and emits `<domain>.state` events only when the snapshot changed.

## 3. Repository layout

```
josefines-jamstudio/
  AGENTS.md  README.md  LICENSE  deny.toml  Cargo.toml (workspace)  package.json  biome.json  tsconfig.json  vite.config.ts
  crates/
    jam-core/    types, timeline, chart, style, kit, rig profile, control map, schema versions, registries (pure, serde)
    jam-dsp/     pure DSP: level, pitch, onset, chroma/chords, energy, tap tempo, offline analysis, key profiles
    jam-audio/   cpal devices and streams, io traits, engine (ring buffers, callback, render worker), transport, mixer, click, recorder, song player, stretch
    jam-band/    sequencer, instruments (Sampler, Sf2Synth), voicing, bass, comp, cues, offline render
    jam-rig/     MidiSink/MidirSink/MemorySink, profiles, scenes, scheduler, clock, input
  src-tauri/
    src/main.rs, lib.rs
    src/ipc/      one file per domain (audio, transport, mixer, band, recorder, tuner, song, analysis, voice, lyria, rig, keys, settings, assets, export, app) + mod.rs (domain list, IPC_VERSION)
    src/net/      registry.rs (provider table), gemini.rs, elevenlabs.rs, lyria.rs, gemini_music.rs, musicai.rs, fetch_proxy.rs
    src/keys/     SecretStore trait, KeyringStore, MemoryStore
    src/store/    rusqlite index, rebuild from files
    src/settings/ settings.json load/save/migrate
    src/analysis/ pipeline: AnalysisKind steps, local fallback wiring
    src/assets/   manifest, downloader, checksum
    src/export/   logic.rs (stems + SMF)
    src/platform/ anything OS-specific (paths, priorities)
    tauri.conf.json, capabilities/
  src/
    app/          App shell, router, theme, global shortcuts
    screens/      registry.ts + one folder per screen (stage, library, sessions, rig, settings)
    components/   design primitives (Button, Dial, BigReadout, Meter, Panel, ...)
    design/       tokens.css, motion.ts
    ipc/          contract.ts + one file per domain wrapping invoke/listen; engine store (zustand)
    ai/           llm/ (AI SDK + fetch shim), tools/*.tool.ts + index.ts, jo/ (persona.md, session.ts, transcript.ts)
    lib/          chart/ (parse, transpose, resolve), controls/ (control-map dispatcher), format/
  styles/  charts/  rigs/  controls/     bundled data files (seams)
  assets/  manifest.json, LICENSES.md, README.md
  tests/
    fixtures/     audio/, providers/<provider>/, seams/, jo/
    invariants/   seams.test.ts, core-files.snapshot.json
  scripts/        check-js-licences.mjs, gen-fixtures.mjs, spikes/
  docs/           plan/, adr/, hardware/, spikes/, ARCHITECTURE.md, EXTENDING.md, DESIGN.md, guide/
  .github/workflows/ ci.yml, release.yml
```

## 4. Audio engine

### 4.1 Buses

`guitar` (capture only, never routed to the master by default), `drums`, `bass`, `comp`, `ai` (Lyria), `song`, `voice` (Jo), `click`, `master`. Each bus has gain, mute and solo. Ducking: while the voice bus is active, `drums`, `bass`, `comp`, `ai` and `song` are attenuated by `duckBandDb` with 150 ms linear ramps.

### 4.2 I/O traits (in `jam-audio::io`)

```rust
pub trait AudioInput: Send {
    /// Pull up to out.len()/channels frames of interleaved f32 at 48 kHz. Returns frames written.
    fn read(&mut self, out: &mut [f32], channels: usize) -> usize;
    fn channels(&self) -> usize;
}
pub trait AudioOutput: Send {
    /// Push interleaved f32 at 48 kHz. Returns frames accepted. Advances the clock.
    fn write(&mut self, frames: &[f32]) -> usize;
    fn frame_counter(&self) -> u64;
}
```

Implementations: `CpalInput`, `CpalOutput` (real devices, resampled to and from 48 kHz with `rubato` when needed), `FileInput` (looping WAV decoded by `symphonia`, deterministic), `NullOutput` (a timer thread that advances exactly `bufferFrames` per tick). Selection: `AudioConfig.fakeInputWavPath` or env `JAM_FAKE_INPUT` for the guitar input; env `JAM_HEADLESS=1` for `NullOutput`. Every automated test runs with these two.

### 4.3 Clock, timeline, render-ahead

- The transport position is a `u64` frame counter owned by the render worker and derived from the output callback's counter plus the lookahead the worker has already rendered.
- `jam-core::timeline::Timeline` is a pure piecewise map between samples and beats built from `TempoPoint`s (`atBeats`, `bpm`, `timeSig`). It provides `beats_to_samples`, `samples_to_beats`, `bar_beat_at(samples)`, `next_bar_boundary(samples)`. Tested to a round-trip error below 1e-9 beats.
- The render worker renders 256-frame blocks until the master ring holds 200 ms. Commands with `when: 'next_bar'` are applied at the first block whose start is at or after the next bar boundary (block-quantised; documented precision 5.3 ms at 48 kHz). `stop` has a fast path: clear the ring and apply a 10 ms fade.
- Nothing renders in the callback. This makes the band renderable offline (`band_render_offline`) with the same code.

### 4.4 Latency calibration and recorder alignment

Playback latency is a constant the player adapts to. Alignment between the recorded DI and the rendered band is what matters for export. `audio_calibrate_latency()` plays three clicks and detects them on the guitar input through a cable loopback, returning `roundTripFrames` and `confidence`; without a loopback it returns an estimate (2 × buffer plus the device's nominal latency) flagged `estimated`. The recorder subtracts the per-device offset when stamping input chunks. The ±1-sample alignment test in §9 protects this.

### 4.5 Song player and stretch

`jam-audio::song`: one decoded 48 kHz file per stem, per-stem gain and mute, Signalsmith Stretch for time ratio (0.5 to 1.5) and pitch shift (±12 semitones), driven by the transport so the song's analysed tempo map becomes the transport timeline while in Song mode. Minus-guitar is the guitar stem muted.

### 4.6 Microphone

A second `AudioInput` stream on its own clock (drift is irrelevant for STT). While push-to-talk is held, mono 16 kHz PCM accumulates in a bounded buffer (20 s maximum).

### 4.7 Windows

WASAPI shared mode; the HeadRush most likely exposes stereo only, so channel 3 (DI) is a macOS feature. ASIO is not used. Windows is the development and CI target, not the stage.

## 5. IPC

### 5.1 Conventions

1. Commands set **absolute state**, never deltas. `when: 'now' | 'next_bar'` where musically relevant.
2. Every domain has exactly one `<domain>.state` event carrying its whole (small) state, emitted on any change from any source (UI or Jo). No diffs, no desync.
3. High-rate telemetry (`meters`, `transport.state`, `tuner.state`) is emitted at a fixed rate (30 Hz, 30 Hz, 20 Hz).
4. No PCM crosses IPC on the happy path. `Channel<InvokeResponseBody::Raw>` and raw request bodies exist only for waveform peaks, exports and the Lyria Fallback A.
5. `IPC_VERSION` in `src/ipc/contract.ts` and `src-tauri/src/ipc/mod.rs`; changes are additive; a removed field is a version bump and an ADR.
6. Every command returns the domain state after the change or an `AppError { code, message, detail?, fatal }`. Errors are also emitted as `app.error`.

### 5.2 Contract (TypeScript is the source of truth; Rust mirrors with serde and a round-trip test)

```ts
export const IPC_VERSION = 1;
export const SAMPLE_RATE = 48000 as const;
export type Uuid = string;
export type Samples = number;  // u64 as JS number (safe below 2^53)
export type Beats = number;    // f64 from timeline zero
export type Db = number;
export type When = 'now' | 'next_bar';
export type BusId = 'guitar'|'drums'|'bass'|'comp'|'ai'|'song'|'voice'|'click'|'master';
export type InputId = 'guitar'|'mic';

// audio
export type AudioDevice = { id: string; name: string; kind: 'input'|'output'; channels: number; sampleRates: number[]; isDefault: boolean };
export type AudioConfig = {
  outputDeviceId: string|null; outputChannels: [number, number];
  inputDeviceId: string|null;  guitarChannel: number;          // 0-based; 2 = HeadRush DI
  micDeviceId: string|null;
  bufferFrames: 128|256|512|1024;
  fakeInputWavPath: string|null;
};
export type AudioState = AudioConfig & { open: boolean; sampleRate: 48000; xruns: number; inputLatencyFrames: number; outputLatencyFrames: number; headless: boolean };
// audio_list_devices() -> AudioDevice[] · audio_get_config() -> AudioState · audio_set_config(cfg) -> AudioState
// audio_calibrate_latency() -> { roundTripFrames: number; confidence: number; estimated: boolean } · event 'audio.state' -> AudioState

// transport
export type TransportState = {
  playing: boolean; countingIn: boolean; recording: boolean;
  positionSamples: Samples; positionBeats: Beats; bar: number; beat: number;
  tempoBpm: number; timeSig: [number, number];
  loop: { startBeats: Beats; endBeats: Beats } | null; countInBars: number;
  source: 'none'|'band'|'song'|'lyria';
};
// transport_play({ fromBeats?, countInBars? }) · transport_stop() · transport_locate(beats) · transport_set_loop(loop|null)
// transport_set_tempo(bpm, when) · transport_set_time_sig(num, den, when) · transport_tap_tempo() -> { tempoBpm, taps }
// event 'transport.state' @30 Hz

// mixer and meters
export type BusState = { id: BusId; gainDb: Db; muted: boolean; soloed: boolean };
// mixer_set_bus(id, patch) · event 'mixer.state' -> BusState[]
export type Meters = { atSamples: Samples; buses: Record<BusId, { peakDb: Db; rmsDb: Db }>; inputs: Record<InputId, { peakDb: Db; rmsDb: Db; clipped: boolean }> };
// event 'meters' @30 Hz
export type TunerState = { on: boolean; hz: number|null; note: string|null; cents: number|null; confidence: number };
// tuner_set({ on }) · event 'tuner.state' @20 Hz
// tone_set({ on, hz }) · metronome_set({ on, bpm })   (M0 only; superseded by the transport click in M1a)

// band
export type ChordQuality = 'maj'|'min'|'dom7'|'maj7'|'min7'|'m7b5'|'dim'|'aug'|'sus4'|'sus2'|'5';
export type ChordSym = { root: number; quality: ChordQuality; bassRoot?: number; extensions?: string[] }; // root 0..11 = C..B
export type ChartBar = { chords: { chord: ChordSym; beats: number }[]; sectionId?: Uuid };
export type ResolvedChart = { id: Uuid; name: string; keyTonic: number; mode: 'major'|'minor'; timeSig: [number, number];
  bars: ChartBar[]; sections: { id: Uuid; name: string; startBar: number; lengthBars: number; rigSceneId?: Uuid }[] };
export type BandState = { chartId: Uuid|null; styleId: string|null; intensity: number; swing: number; density: number;
  parts: { drums: boolean; bass: boolean; comp: boolean }; followEnergy: boolean; energy: number; seed: number;
  bar: number; chordNow: ChordSym|null; chordNext: ChordSym|null; pendingAtNextBar: string[] };
// band_load_chart(chart: ResolvedChart, when) · band_set(patch: Partial<BandState>, when) · band_cue(kind: 'fill'|'crash'|'stop'|'ending')
// band_render_offline({ chart, styleId, seed, bars, tempoBpm, outPath }) -> { path, frames } · event 'band.state'

// recorder and takes
export type TrackKind = 'guitar_di'|'guitar_amp'|'mic'|'drums'|'bass'|'comp'|'ai'|'song'|'mix';
export type TakeSummary = { takeId: Uuid; sessionId: Uuid; startedAtSamples: Samples; frames: number; xruns: number;
  files: { kind: TrackKind; path: string; peakDb: Db }[] };
// recorder_arm({ sessionId, tracks, format: 'wav_f32'|'wav_i24' }) · recorder_start() -> { takeId, startedAtSamples } · recorder_stop() -> TakeSummary
// event 'recorder.state' -> { armed, recording, takeId, frames, diskFreeMb, xruns }
// take_list(sessionId?) · take_peaks(takeId, kind, bins) -> Float32Array (raw response) · take_play(takeId) · take_delete(takeId)

// songs and analysis
export type AnalysisKind = 'stems'|'beats'|'chords'|'key'|'sections';
// song_import(path) -> Song · song_list() -> Song[] · song_load(songId) · song_set({ speedPercent, transposeSemitones, stemMutes })
// analysis_start({ songId, kinds, provider }) -> { jobId } · analysis_cancel(jobId)
export type AnalysisProgress = { jobId: Uuid; songId: Uuid; kind: AnalysisKind; phase: 'upload'|'queued'|'running'|'download'|'done'|'error'; percent: number; message?: string };
// event 'analysis.progress' · event 'analysis.result' -> { jobId, songId, kind, songPath }

// voice (Jo)
export type VoiceState = { phase: 'idle'|'listening'|'transcribing'|'thinking'|'speaking'; pttSource: 'key'|'screen'|'midi'|null; lastTranscript: string|null; lastReply: string|null; lastLatencyMs: number|null };
// voice_ptt(down: boolean) · voice_speak(text) · voice_stop() · event 'voice.state' · event 'voice.transcript' -> { text, confidence }

// lyria
export type LyriaState = { active: boolean; buffering: boolean; bufferMs: number; prompts: { text: string; weight: number }[]; bpm: number; scale: string; density: number; brightness: number; muteBass: boolean; muteDrums: boolean; sessionSeconds: number; spentUsd: number };
// lyria_start(config) · lyria_set(patch) · lyria_stop() · event 'lyria.state'
// generate_track({ prompt, provider: 'lyria3'|'elevenlabs', lengthMs }) -> { jobId } · progress via 'analysis.progress' with kind 'generate'

// rig
// rig_list_ports() · rig_set_ports({ profileId, portName }[]) · rig_send_scene(sceneId) · rig_send({ profileId, kind, value, cc? }) · rig_panic() · rig_set_clock(on) · rig_dry_run(on)
// event 'rig.state' -> { ports, profiles, activeSceneId, dryRun, clock, lastSent: { atSamples, bytes }[] } · event 'rig.midi_in' -> { bytes, atSamples }

// keys, settings, assets, export, app
// keys_set(provider, value) · keys_has(provider) -> boolean · keys_delete(provider)   (no command returns a key)
// settings_get() -> Settings · settings_set(settings) -> Settings · event 'settings.state'
// assets_ensure(ids) · event 'assets.state' -> { packs: { id, state: 'missing'|'downloading'|'verifying'|'ready'|'error', percent }[] }
// export_logic(takeId) -> { folder } · event 'export.state'
// provider_fetch({ provider, path, method, headers, body }) -> { status, headers, body }   (the only way TS reaches a provider)
// event 'app.error' -> { code: string; message: string; detail?: string; fatal: boolean } · event 'cost.state' -> CostState
```

## 6. AI layer

### 6.1 Providers (Rust, `src-tauri/src/net/`)

```rust
pub struct ProviderEntry { pub id: &'static str, pub base_url: &'static str, pub auth: AuthScheme, pub kinds: &'static [ProviderKind] }
pub enum AuthScheme { HeaderKey(&'static str), Bearer, QueryKey(&'static str) }
pub enum ProviderKind { LlmTarget, Stt, Tts, MusicStream, TrackGenerator, Stems, Analysis }
pub trait Stt { async fn transcribe(&self, pcm16k_mono: &[i16]) -> Result<Transcript> }
pub trait Tts { async fn synthesize(&self, text: &str, voice: &str) -> Result<Pcm48kStereo> }
pub trait MusicStream { async fn start(&self, cfg: MusicConfig, sink: PcmSink) -> Result<SessionHandle>; async fn update(&self, h: &SessionHandle, patch: MusicPatch) -> Result<()>; async fn stop(&self, h: SessionHandle) -> Result<()> }
pub trait TrackGenerator { async fn generate(&self, req: GenerateRequest, progress: ProgressSink) -> Result<PathBuf> }
pub trait Stems { async fn separate(&self, wav: &Path, progress: ProgressSink) -> Result<Vec<StemFile>> }
pub trait Analysis { async fn analyse(&self, wav: &Path, kinds: &[AnalysisKind], progress: ProgressSink) -> Result<AnalysisResult> }
```

`registry.rs` holds the table; the settings hold `providers.<id>.enabled`. Keys come from `SecretStore` by provider id at call time and are never stored in the struct. Every call logs `provider, kind, model, ms, bytes_in, bytes_out, est_usd` to `cost.state`.

### 6.2 LLM (TypeScript, `src/ai/llm/`)

Vercel AI SDK `generateText` with `@ai-sdk/google` (`gemini-3.8-flash` by default), `maxSteps` from settings, tools from the registry, and a `fetch` shim that turns a request into `provider_fetch` and rebuilds a `Response`. Streaming is not used in v1 (tool loops with `generateText` are simpler and debuggable). Adding a provider is one `provider_fetch` target and one AI SDK provider package ([EXTENDING.md](EXTENDING.md)).

### 6.3 Voice pipeline (`VoiceSession` interface, v1 = push-to-talk)

```
PTT down ─► Rust buffers mic (16 kHz mono) ─► PTT up ─► Stt::transcribe ─► 'voice.transcript'
   ─► TS: generateText(persona + state summary + transcript, tools) ─► tool run() → IPC commands
   ─► TS: voice_speak(reply) ─► Tts::synthesize ─► voice bus (duck band) ─► 'voice.state' speaking → idle
```

Barge-in: a new PTT press during `speaking` stops the voice bus. Latency budget: STT ≤ 1.0 s, LLM ≤ 1.0 s, TTS first byte ≤ 0.5 s; median ≤ 2.5 s is the acceptance number. The persona lives in `src/ai/jo/persona.md`; the state summary given to the LLM is built from the `<domain>.state` snapshots (chart, key, tempo, style, source, last take analysis when present). Full-duplex (ElevenLabs Agents, Gemini Live) is a second `VoiceSession` implementation, backlog.

### 6.4 Lyria RealTime (`net/lyria.rs`)

WebSocket session per S4; audio chunks decoded to 48 kHz stereo into a jitter buffer feeding the `ai` bus (prefill 1 s, target 500 ms; underrun → 250 ms fade and `buffering: true`). Reconnect before the session cap with a 250 ms crossfade. `bpm` or `scale` change: the transport plays a one-bar count-in click, then `reset_context`. Band and Lyria are mutually exclusive: starting one stops the other. Cost guard: per-session minute cap and monthly cap from settings, a confirm dialog before start, spend meter from elapsed minutes at the configured estimate.

### 6.5 Track generation and analysis

`generate_track` runs a `TrackGenerator` (Lyria 3 or ElevenLabs Music), writes the result into `songs/<slug>/`, then runs the analysis pipeline (§6.6) so the track opens in Song mode analysed.

### 6.6 Analysis pipeline (`src-tauri/src/analysis/`)

One step per `AnalysisKind`; each step picks the enabled provider (Music.ai for beats, chords, key, sections; ElevenLabs or Music.ai for stems) and falls back to `jam-dsp::offline` (onset autocorrelation tempo, chroma-template chords per beat, Krumhansl key) flagged `confidence: 'low'`. Results are written into `song.json`; SQLite is re-indexed from the file.

## 7. Data model and files on disk

Files are truth; SQLite is a cache ([ADR 0005](adr/0005-files-are-truth-sqlite-is-cache.md)). Every manifest has `schemaVersion`; unknown fields are preserved on rewrite; each bump has one migration function in `jam-core::schema`.

```
~/JosefinesJamstudio/
  settings.json  index.sqlite  logs/
  assets/<packId>/            downloaded packs (kit.json + wav, or .sf2)
  styles/  charts/  rigs/  controls/     user-added seam files (same schemas as the bundled ones)
  songs/<slug>/               song.json, source.wav (48 kHz), stems/<name>.wav, analysis/<kind>-<provider>.json
  sessions/<date>-<slug>/     session.json, takes/<n>/take.json + <kind>.wav
  exports/<session>/<take>/   stems + tempo.mid + README.txt
```

```ts
type TempoPoint = { atBeats: Beats; bpm: number; timeSig: [number, number] };

type Chart = { schemaVersion: 1; id: Uuid; name: string; keyTonic: number; mode: 'major'|'minor'; timeSig: [number, number]; defaultBpm: number;
  defaultStyleId?: string; sections: Section[]; arrangement: { sectionId: Uuid; repeats: number }[] };   // resolve() -> ResolvedChart
type Section = { id: Uuid; name: string; bars: { chords: { chord: ChordSym; beats: number }[] }[]; styleOverrideId?: string; intensity?: number; rigSceneId?: Uuid };

type Style = { schemaVersion: 1; id: string; name: string; genre: string;
  feel: { swing: number; timeSig: [number, number]; bpmRange: [number, number] };
  kitId: string; bassProgram: string; compProgram: string;
  patterns: { intensity: [number, number]; drums: DrumPattern; bass: BassPattern; comp: CompPattern }[];
  fills: DrumPattern[]; endings: DrumPattern[]; humanize: { timingMs: number; velocity: number } };
type DrumPattern = { lengthBeats: number; hits: { instrument: string; atBeats: Beats; velocity: number; prob?: number }[] };
type BassPattern = { lengthBeats: number; notes: { degree: number; octave: number; atBeats: Beats; durBeats: number; velocity: number }[] };  // degree relative to chord root
type CompPattern = { lengthBeats: number; voicing: 'shell'|'triad'|'drop2'|'power'; strums: { atBeats: Beats; durBeats: number; velocity: number; direction: 'up'|'down' }[] };

type Kit = { schemaVersion: 1; id: string; name: string; instruments: { name: string; chokeGroup?: string;
  layers: { velocity: [number, number]; files: string[] }[] }[] };   // files are round-robin alternatives

type Song = { schemaVersion: 1; id: Uuid; title: string; artist?: string; sourcePath: string; sourceHash: string; durationMs: number;
  key?: { tonic: number; mode: 'major'|'minor'; confidence: number }; tempoMap: TempoPoint[]; beats: { timeMs: number; beatInBar: number }[];
  stems: { name: 'vocals'|'drums'|'bass'|'guitar'|'piano'|'other'; path: string; provider: string }[]; chart?: Chart;
  sections?: { name: string; startBeat: Beats; endBeat: Beats; rigSceneId?: Uuid }[];
  analysis: { kind: AnalysisKind|'generate'; provider: string; at: string; confidence: 'high'|'low'; costUsd?: number }[] };

type Session = { schemaVersion: 1; id: Uuid; name: string; startedAt: string; endedAt?: string; chartId?: Uuid; songId?: Uuid; styleId?: string; takes: Uuid[]; review?: SessionReview };
type Take = TakeSummary & { schemaVersion: 1; tempoMap: TempoPoint[]; markers: { atBeats: Beats; label: string }[]; rating?: 1|2|3|4|5; notes?: string;
  analysis?: { pitchCentsMean: number; pitchCentsStd: number; timingMsMean: number; timingMsStd: number; chordAgreement: number; dynamics: number[] } };
type SessionReview = { model: string; at: string; summary: string; strengths: string[]; drills: string[]; focusBars: number[]; takeIds: Uuid[] };

type RigProfile = { schemaVersion: 1; id: string; name: string; midiChannel: number;   // 1..16, never omni
  supports: { programChange: boolean; controlChange: boolean; midiClock: boolean };
  programs?: { number: number; name: string }[];
  controls: { cc: number; name: string; min: number; max: number; default: number; unit?: string }[] };
type RigScene = { id: Uuid; name: string; commands: { profileId: string; kind: 'program_change'|'control_change'; value: number; cc?: number }[] };

type ControlMap = { schemaVersion: 1; id: string; name: string;
  bindings: { source: { kind: 'key'; combo: string } | { kind: 'midi_pc'; program: number } | { kind: 'midi_cc'; cc: number; min?: number; max?: number };
              action: string; args?: Record<string, unknown> }[] };   // action ids are the Jo tool names plus 'ptt'

type Settings = { schemaVersion: 1; audio: AudioConfig;
  midi: { outPorts: { profileId: string; portName: string }[]; inPort: string|null; sendClock: boolean };
  voice: { enabled: boolean; provider: 'elevenlabs'; voiceId: string; pttHotkey: string; language: 'en'; duckBandDb: Db; personaName: string };
  llm: { provider: 'gemini'; model: string; maxToolCallsPerTurn: number };
  providers: Record<string, { enabled: boolean }>;
  prices: Record<string, number>;   // editable estimates used by the spend meter
  budget: { monthlyUsdCap: number; lyriaSessionMinuteCap: number; spentThisMonthUsd: number; monthKey: string };
  paths: { library: string; exports: string };
  ui: { theme: 'dark'; showAdvanced: boolean; reducedMotion: 'system'|'on'|'off' } };
// Secrets are never in Settings: keychain only, referenced by provider id.
```

## 8. Seams and registries

A seam is a definition (trait or schema), one registry, and consumers. There is no plugin framework and no dynamic loading in v1.

| Seam | Definition | Registry | Consumers |
|---|---|---|---|
| Styles | `Style` schema (`jam-core`, zod mirror) | `jam-core::registry::styles` (bundled `styles/` via `include_dir` + `~/JosefinesJamstudio/styles/`) | band sequencer, Stage picker, Jo `set_style` |
| Charts | `Chart` schema | `jam-core::registry::charts` + TS parser for text charts | band, Stage, Jo `load_chart` |
| Rig profiles | `RigProfile` schema | `jam-core::registry::rigs` | `jam-rig`, Rig screen |
| Control maps | `ControlMap` schema | `jam-core::registry::controls` | `src/lib/controls/` dispatcher, `jam-rig::input` |
| Jo tools | `{ name, description, schema, run }` | `src/ai/tools/index.ts` (`import.meta.glob('./*.tool.ts')`) | LLM tool list, control-map actions, later Agents export |
| Providers | traits in §6.1 | `src-tauri/src/net/registry.rs` | analysis pipeline, voice, music, `provider_fetch` |
| Instruments | `Instrument` trait (`note_on`, `note_off`, `render(&mut [f32])`) | `jam-band::instruments::factory` | sequencer |
| Audio I/O | `AudioInput` / `AudioOutput` | `jam-audio::io::select(config, env)` | engine |
| MIDI sinks | `MidiSink` | `jam-rig::sink::select` | scheduler |
| Analysis kinds | `AnalysisKind` + `AnalysisStep` | `src-tauri/src/analysis/steps.rs` | pipeline |
| Screens | React component + nav entry | `src/screens/registry.ts` | router, nav |
| IPC domains | one Rust file + one TS file | `src-tauri/src/ipc/mod.rs`, `src/ipc/index.ts` | everything |

Proof: `tests/invariants/seams.test.ts` and `crates/jam-core/tests/seams.rs` load `tests/fixtures/seams/*` and assert each fixture is visible in its registry; `tests/invariants/core-files.snapshot.json` is the list of files that must be untouched by adding a fixture. Recipes in [EXTENDING.md](EXTENDING.md).

## 9. Verification strategy

### 9.1 Deterministic DSP and engine tests (synthetic signals, 48 kHz, exact tolerances)

| Test | Signal | Assertion |
|---|---|---|
| Level meter | -20.0 dBFS 1 kHz sine, 1 s | RMS = -20.00 ±0.10 dB; peak within ±0.01 dB |
| Pitch | sine sweep 55 to 1319 Hz with +40 dB SNR noise, 2048-frame window | median error ≤ 10 cents, max ≤ 25 cents, no octave errors |
| Onset | click track 120 bpm, 30 s, hop 256 | every onset within ±12 ms, zero false positives, zero misses |
| Chroma and chords | 24 major and 24 minor triads as 3-partial stacks | 100 % root and quality; 7ths ≥ 90 % |
| Resampler | 1 kHz sine 48k → 44.1k → 48k | Pearson r ≥ 0.999 after alignment; noise floor ≤ -80 dBFS |
| Time-stretch | 1 kHz sine × 1.25 | length ±1 ms; dominant bin ±1 Hz |
| Pitch-shift | 1 kHz sine +2 semitones | f0 = 1122.5 ±5 Hz |
| Timeline | tempo map with 3 changes, 10 000 random beats | round-trip error < 1e-9 beats |
| Transport loop | 4 bars at 120 bpm with `NullOutput` | wrap within ±1 sample |
| MIDI scheduling | PC at bar 5 beat 1 through `MemorySink` | emitted within ±1 ms of the timeline timestamp minus lookahead |
| Alignment | `FileInput` impulse at sample 24000 while the band renders a click | recorded impulse and click transient within ±1 sample after the offset |
| Render budget | 10 000 blocks of the busiest style | under 25 % of real time on the CI runner |

### 9.2 Golden renders (band)

`band_render_offline` with `NullOutput`; assert onset positions within ±1 sample, per-bus RMS within ±0.05 dB, exact frame count `bars × beats × 48000 × 60 / bpm` (rounded as documented in `jam-core::timeline`); the SHA-256 of the render is logged as a tripwire only, never asserted (float and SF2 paths differ across OS).

### 9.3 TypeScript tests

Chart parsing and transposition for every preset, section expansion, style schema validation, tool argument validation, control-map dispatch, the fetch shim, the Jo script against recorded LLM fixtures, the bundle-scan test (no key-like strings in `dist/`).

### 9.4 Provider tests

Recorded, scrubbed fixtures under `tests/fixtures/providers/<provider>/` captured with `JAM_RECORD_FIXTURES=1`; live tests are opt-in with `JAM_LIVE=1` and `#[ignore]`.

### 9.5 CI

`secrets` (gitleaks), `links` (lychee offline), `ts` (ubuntu), `rust` (windows-latest + macos-latest, headless), `bundle` (tags and labelled PRs). Bundle builds only where needed to keep iteration fast.

### 9.6 Owner gates

[docs/plan/06-owner-verification.md](plan/06-owner-verification.md): what only the real rig on the Mac can prove.

## 10. Security and privacy

- Keys only in the OS keychain via `SecretStore`; the WebView never sees one; `provider_fetch` is the only TS path to a provider; logs never contain request bodies; a bundle-scan test guards `dist/`; gitleaks guards the repository.
- No telemetry, no analytics, no accounts. Every outbound call is listed in Settings → Diagnostics with provider, model, time and estimated cost.
- Audio leaves the machine only when the guitarist starts an analysis, a generation, or holds push-to-talk.
- Tauri capabilities are minimal: `fs` scoped to `~/JosefinesJamstudio`, `dialog`, `global-shortcut`, `log`, `http` (only from Rust).

## 11. Performance budgets

- Audio: buffer 256 on macOS, 512 on Windows by default; xruns must stay 0 over 5 minutes at those sizes on the PC and the Mac.
- Render worker: under 25 % of real time for the busiest style plus the song player.
- UI: meters and waveforms on canvas at 60 fps; IPC events at 30 Hz or below; idle CPU under 3 %.
- Startup under 2 s to an interactive Stage on the PC (assets already present).

## 12. Errors and logging

`AppError { code, message, detail?, fatal }` with codes in `src-tauri/src/ipc/errors.rs` mirrored in `src/ipc/errors.ts`; every code has a user-facing message and a next step in the UI. Logs via `tauri-plugin-log` to `~/JosefinesJamstudio/logs/` with rotation; levels info by default, debug with `JAM_LOG=debug`; never bodies, never keys, never raw audio.
# Implemented songwriting workflow

The Write screen adds a file-backed original-song document (`schemaVersion: 1`),
reusing `Chart` for chords/arrangement and the existing style registry for each
section's three independent parts. `src/lib/originals.ts` holds editable state,
50 body-level undo steps and named versions. Changes reach audio on Play or Record.
Locks preserve a part's settings when trying another groove; direct edits remain available.

`originals_save/list/load/record`, `capture_arm/keep` and `takes_favourite` are
additive commands. `src-tauri/src/originals.rs` bounds and validates documents,
preserves unknown JSON fields, checks revisions and retains a backup when saving.
Playback resolves the same document into the Rust sequencer and guitar clips.
Supported scope is 4/4, 40–240 BPM, 256 arranged bars, 16 clips and 20 UI versions.

Rust owns the rolling buffer (opt-in, at most 60 seconds), selected mono input,
clip playback, per-part buses and MIDI note collection. Guitar clips keep their
recorded pitch/speed; fitting tempo changes the band. Recording starts atomically
at bar 1, without a count-in. Timing and chart changes are refused until the take
is saved. A bounded disk queue writes WAVs and checkpoints headers every second.
Every completed take has a JSON manifest containing its song snapshot and actual
scheduled notes. File manifests override the legacy SQLite cache on discovery.

DAW export includes the take snapshot, separate stems, rendered guitar layers,
tempo/section map and scheduled band MIDI when available. Band/master WAVs are
reference mixes, not additional instrument layers. Capture-only ideas have no
musical grid or reconstructed MIDI. The current single input and synthetic
instruments are unchanged; real rig alignment and Logic import remain owner gates.
See [the user workflow](guide/songwriting.md) and [extension recipe](EXTENDING.md).

The second songwriting slice adds Rust guitar auditioning and explicitly opened
MIDI input. `ControllerInput` filters PC/CC/note presses into a bounded queue; the
existing telemetry worker emits them to the shared frontend controller registry.
Learning persists a validated, versioned `controller.json`; pedal actions use the
same writing commands as buttons and Jo. Releases/held CCs do not trigger commands,
and recent echoed rig messages are filtered before dispatch. No MIDI input is opened
or armed automatically. Rehearsal ranges are computed from the existing arrangement.

Optional song tones reference the active rig profile's scenes. They use temporary
`song_mappings` in the existing orchestrator, leaving persisted global mappings
unchanged. A missing port, mismatched profile, invalid scene or ambiguous section
name is rejected before playback. Selecting another hardware profile clears this
override. Guitar audition reuses the clip renderer and ends at the trim boundary;
it never passes PCM through IPC and is stopped before a new recording.

Complete DAW exports also carry an optional REAPER session builder. Rust generates
escaped session data from validated WAV headers, tempo/meter, markers and recorded
MIDI; a bundled Lua consumer calls REAPER's documented API in an empty project.
Audio has explicit time-based placement; separate MIDI channels remain editable.
Reference mixes and MIDI alternatives start muted. Relative file references allow
moving the export folder between Windows and Mac. Import never opens a network,
modifies the original audio, or saves over a project. Logic-compatible WAV/MIDI
exports remain available. This is a one-way performance handoff, not a hosted DAW.

## Implemented text providers and Song Lab (2026-09-04)

This supersedes the planned LLM mechanism in section 6.2 for current Jo requests.
`src/lib/jo/providers.ts` is the shared registry for Gemini, OpenAI Responses,
Claude Messages and OpenRouter Chat Completions. It reuses Jo declarations and
context, normalizes replies and validates every action before dispatch. One user
request makes one proxy call; there is no automatic paid retry or fallback.
`settings.ai` stores schemaVersion 1, selected provider and per-provider model,
output limit and optional prices. It contains no credentials and preserves unknown
fields through the existing settings commands.

Rust's existing `net.rs` allowlist and keychain inject authentication. Requests
are bounded to 128 KiB, responses to 2 MiB and time to 90 seconds. Redirects are
refused so credentials cannot be forwarded to another endpoint. Usage entries
add optional model/estimatedCostUsd while retaining compatibility with old logs.
Estimates are approximate metadata, not provider invoices or spending caps.

Song Lab sends text context only, without take/clip audio. It parses bounded
proposals, validates chords and checks song identity plus the original body before
applying. The existing version/edit operations preserve the original; recording
and version/bar limits prevent unsafe application. Generated chords and notes
remain editable. This does not implement audio generation, analysis uploads,
cloud speech or DAW hosting. [Current API guide](guide/api-options.md).

## Installed agents and persistent assistant panel

ADR 0007 adds an explicit installed-CLI path to the shared brain registry.
`agent_status({provider, executable})` only detects the local executable;
`agent_request({request: {provider, model, executable, prompt}})` returns a bounded
structured envelope; `agent_cancel()` stops the current local request. Rust owns
process pipes, timeouts and cancellation. CLI credentials never traverse IPC.
The CLI owns its network/auth lifecycle, while the existing cost log receives
provider/model/duration/byte metadata with unknown monetary cost.

The assistant remains mounted across screen changes. It supplies the current song
chart/settings/notes, rig name, available grooves and cached take metrics, but no
audio, credential or local asset path. It reviews proposed actions. Studio edits
run against a clone as one transaction and keep a version; stage/analysis actions
are deliberately single-action requests. New tools reuse the same declarations
for Jo, API models and installed agents. Dynamic API model catalogs are explicit
GET requests through the existing proxy. User-entered model IDs remain available.
See [ADR 0007](adr/0007-installed-studio-agents.md) and [setup guide](guide/api-options.md).

## Preview build boundary (2026-09-05)

The sections above retain the target design, including unbuilt voice, analysis,
resampling and extension-proof work. Current support is recorded in
[build closeout](reviews/build-closeout.md), the README and the milestone board.

Logical UI event names use `domain.state`; `src/ipc/client.ts` translates dots to
colons for Tauri (`transport:state`, `input:meters`, etc.). Rust emits these colon
names because Tauri rejects dots. The local `main` capability grants event
listen/unlisten and window destruction after the close guard. Production CSP permits local IPC, bundled assets and scoped
silent video; external scripts, frames and browser networking are blocked.

A transport beat is the denominator unit: 6/8 at 60 means six seconds per bar.
Exports use quarter-note BPM = engine BPM × 4 / denominator, for both MIDI files
and REAPER. Recordings snapshot the meter; timing edits are refused during a take.
Charts and styles with different meters are refused before playback changes.

Settings writes flush a temporary file, retain the previous valid `.bak`, then
rename. On startup, malformed settings are archived as `settings.json.broken-<timestamp>` before restoring a valid backup or defaults. A one-time UI notice names the archive. Read/permission failures are reported without replacing the source. Ordinary saves still refuse corrupt input; restart to recover. Unknown fields in a valid backup survive recovery. Song saves and scans enforce the same 2 MB compact JSON limit, with a shared 8 MB formatted-file bound.
Take scanning reports damaged manifests individually and once per session; a cache
row the current code cannot read falls back to its plain columns or is skipped with a
warning, never hiding the takes on disk. Complete cached manifests
retain stems, MIDI, snapshots and flags. New code uses the native Mac Keychain
and Windows credential store. Browser speech APIs are not part of this build.

CPAL conversion uses bounded stack blocks and one callback owner, with no resize,
mutex or logging in the callback. A rejected requested buffer is reported to the
user; the engine's headless fallback still keeps the editor usable.

Native close requests are guarded for unsaved documents and active work. Film's
Use take sums band, guitar DI and unmuted guitar layers through FFmpeg at unity
gain with a -1 dBFS limiter for headroom (the band never gets quieter as layers
are added); master/monitor click and test tone are excluded.

## Bilingual help and finishing tools (2026-09-05)

`docs/guide/manual.json` owns English/Bokmål help content. `ShortcutsHelp` renders an inline, searchable reader while the active room stays mounted. Help suppresses global musical shortcuts; Escape closes it and focus returns to the opener. Markdown exports are generated by `scripts/export-manual.mjs` and checked in tests.

`lib/finishing.ts` transforms song documents without producing audio. Transition rehearsal reuses `useWriting.loopRange` and native transport IPC. Contrast variants preserve timing and locked/muted parts. Section comps require compatible original recording snapshots and reuse `GuitarClip`; optional `compSlot` identifies a managed bar interval, survives JSON saves and is ignored by native playback. Same-slot replacement preserves unrelated layers. Versions and Undo precede/recover accepted edits. No new IPC command or provider seam is introduced.

Original and Film save completions preserve newer in-memory edits while advancing the disk revision. Film Undo retains that revision. Original listing isolates malformed documents; chart loading validates user overrides before registration and chart saves keep a previous-file backup. Structural chart limits are checked before arrangement expansion.
# Implemented room capability layer (2026-09-05)

`RoomTools` supplies one registered expandable tool for each of the ten existing rooms. It composes existing writing/media/engine stores; it does not introduce a second document database or a provider framework. Pure operations live in `roomTools.ts`; foreground actions and the close-guard flags live in `roomActions.ts` (`busy` serialises tools; `blocking` marks work the window must not close during, so a pending coach answer never traps the window). Each tool is its own chunk, loaded the first time its room is shown; from then on hidden room drafts remain mounted and subscribe to selected stable fields rather than whole stores or transport telemetry. Screens and the manual reader are lazily imported by `App` for the same reason, and screen modules export only components; shared helpers and stores live under `src/lib/`.

Song documents gain optional `body.referenceBlueprint` (reference name, optional media asset ID, mapped form) and `body.rigSnapshot` (profile ID, scene index, known controller values). Existing schema version 1 and unknown-field preservation carry these additive values. Settings gain `rehearsalSetlist` and `audioProfiles`; other settings survive updates and profiles never include API credentials. Imported malformed presets are shown as errors rather than silently replaced.

Offline melody extraction is a Rust worker: saved take ID → bounded WAV decode → existing DSP pitch tracker → sustained note events → editable UI sketch. Harmony ranking and film grid calculations are pure TypeScript; actual audio, playback, capture, MIDI, keys and disk writes remain native. The new Jo actions enter the same reviewed song-edit boundary as existing tools. See `docs/research/room-capabilities.md` and the current recipe in `docs/EXTENDING.md` for scope and limits. Older target architecture below is not a claim that all roadmap seams are implemented.
