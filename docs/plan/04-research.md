# Research fact sheet (verified 2026-09-02)

Compiled by Claude from three web-research passes on 2026-09-02. Legend: ✅ primary vendor source, ⚠️ secondary source or figure that moves (verify before relying on it), ❓ unknown or unverified (a spike or task must settle it). Prices change; treat every price as ⚠️ and keep the price table in the app's settings editable.

Hardware facts live in [../hardware/](../hardware/). Competitor findings are summarised in [00-README.md](00-README.md).

## A. Music generation

### Suno and Udio: out
- Suno has **no official public API** as of mid-2026; a partner-program intake was announced 2026-07-01 with no docs or timeline. Third-party "Suno APIs" reverse-engineer private endpoints (ban risk, outages, no licence chain). ✅ https://www.musicbusinessworldwide.com/suno-explores-developer-api-seeking-apps-that-unlock-experiences-generative-music-makes-possible-for-the-first-time/ · https://suno.com/terms-of-service
- Udio relaunched in 2026 as a licensed walled garden with no developer API. ✅ https://www.musicbusinessworldwide.com/universal-music-settles-udio-lawsuit-strikes-deal-for-licensed-ai-music-platform/

### Google Lyria RealTime (the live jam engine)
- Model `models/lyria-realtime-exp`, WebSocket, requires API version `v1alpha`. SDKs: `@google/genai` (JS), `google-genai` (Python). ✅ https://ai.google.dev/gemini-api/docs/realtime-music-generation · WebSocket reference https://ai.google.dev/api/live_music
- Controls: `WeightedPrompt[]`, `bpm` 60 to 200, `scale` enum, `density` 0 to 1, `brightness` 0 to 1, `guidance` 0 to 6 (default 4), `mute_bass`, `mute_drums`, `only_bass_and_drums`, `temperature`, `top_k`, `seed`. Changing `bpm` or `scale` requires `reset_context()`; density, brightness and prompt weights apply live. ✅/⚠️
- Output: raw 16-bit PCM, 48 kHz, stereo. Instrumental only. SynthID watermark. Session cap around 10 minutes. Paid tier only; **pricing not published** in the pricing table. ⚠️ Rate limits ❓. Exact endpoint URL, auth scheme and message field names: **S4 settles them** and checks in a scrubbed transcript.
- Lyria 3 for full tracks: `lyria-3-pro-preview` (about 3 min, $0.08/song), `lyria-3-clip-preview` (30 s, $0.04/song), preview status. ✅ https://ai.google.dev/gemini-api/docs/music-generation · https://ai.google.dev/gemini-api/docs/pricing

### ElevenLabs Music
- `POST https://api.elevenlabs.io/v1/music` with `prompt` or `composition_plan`, `model_id` `music_v1` or `music_v2`, `music_length_ms` 3 000 to 600 000, **`force_instrumental: true`**, `seed`, `output_format` (mp3, pcm, opus). No bpm or key parameters, no streaming. ✅ https://elevenlabs.io/docs/api-reference/music/compose
- Stems: `POST /v1/music/stem-separation` (multipart upload, returns a ZIP, default `six_stems_v1`, slow). Plan entitlements apply. ✅ https://elevenlabs.io/docs/api-reference/music/separate-stems
- Commercial rights on paid plans from Starter; credits about 900 per minute of music ⚠️. https://elevenlabs.io/pricing

### Others (not used in v1)
- Stability AI Stable Audio 3 API, about $0.20 per generation ⚠️ https://platform.stability.ai/pricing
- Local models on a Mac: ACE-Step 1.5 is the only credible interactive option (Mac supported); none stream in realtime. https://github.com/ace-step/ACE-Step-1.5

## B. Stem separation and analysis

- **Music.ai** (the Moises developer platform; `developers.moises.ai` no longer resolves): async modules → workflows → jobs, API-key auth, signed-URL upload. Pricing per minute of audio ⚠️: stems about $0.10, chords $0.04, beats $0.03. Key and section detection pricing ❓, latency ❓. ✅ https://music.ai/docs/ · https://music.ai/pricing/ . Exact module names and result JSON: **M3 task records fixtures** before code depends on them.
- LALAL.ai API v1 (Feb 2026): multi-stem incl. electric and acoustic guitar, billed per stem ⚠️. Alternative to ElevenLabs stems.
- Local: Demucs/htdemucs (MIT) with an ONNX port https://huggingface.co/StemSplitio/htdemucs-onnx usable from Rust via `ort`. Deferred (size and build cost).
- Analysis libraries: madmom (best beat/downbeat, maintenance ❓), Essentia, librosa, aubio (**GPL, banned here**). Rust: `pitch-detection` (MIT), `chord_detector` (v0.1, early; check licence before use ❓), no mature Rust downbeat or key crate → cloud first, own chroma/onset code as fallback.
- YouTube downloading (yt-dlp) is against YouTube's terms; not bundled, not supported. Local files only.

## C. Voice

### ElevenLabs
- TTS: **Flash v2.5** (about 75 ms model latency, 32 languages, recommended over Turbo); v3 is not realtime. Streaming WebSocket TTS exists; v1 uses the HTTP endpoint with a PCM `output_format` (exact enum values such as `pcm_24000` / `pcm_44100` and their plan gating: **S5**). ✅ https://elevenlabs.io/docs/overview/models
- STT: **Scribe v2** batch and realtime (about 150 ms, 90+ languages); about $0.39 per audio hour ⚠️. Batch endpoint `POST /v1/speech-to-text`, model id and response JSON: **S5**. https://elevenlabs.io/realtime-speech-to-text-api
- Agents platform: React SDK `@elevenlabs/react` uses browser `getUserMedia` and WebRTC (unsuitable inside our WebView); a raw WebSocket protocol with base64 PCM in and out and **client tools** exists; $0.08 to $0.12 per minute ⚠️. Backlog ("Jo Live"). https://elevenlabs.io/docs/agents-platform/libraries/react · https://elevenlabs.io/pricing/agents

### Alternatives
- Gemini Live API (`gemini-live-2.5-flash-native-audio` GA; 3.x preview): native audio in and out, function calling; $3.00 per 1M audio input tokens, $12.00 per 1M audio output ⚠️. The fallback behind `VoiceSession`. https://ai.google.dev/gemini-api/docs/live-api
- OpenAI Realtime `gpt-realtime-2.1` about $0.05 per minute ⚠️.
- Local STT: whisper.cpp; for Norwegian use NB-Whisper (WER 2.2 on NST vs 6.8 for Whisper large-v3). Backlog. https://huggingface.co/NbAiLab/nb-whisper-large-distil-turbo-beta

## D. LLM providers

| Model | Id | Input $/1M | Output $/1M | Note |
|---|---|---|---|---|
| Gemini 3.8 Flash (default) | `gemini-3.8-flash` ⚠️ | 0.75 | 3.75 | free tier exists; prices double 2027-01-01 ✅ |
| Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | 0.30 | 2.50 | cheap fallback |
| Claude Sonnet 5 | `claude-sonnet-5` | 3 | 15 | backlog provider |
| Claude Opus 5 | `claude-opus-5` | 5 | 25 | backlog provider |
| GPT-5.2 | `gpt-5.2` | 0.875 | 7.00 | backlog; GPT-5.6 is current flagship |
| Kimi K3 | `kimi-k3` at `api.moonshot.ai/v1` | 3.00 | 15.00 | backlog, OpenAI-compatible |

Sources: https://ai.google.dev/gemini-api/docs/pricing ✅ · https://developers.openai.com/api/docs/pricing ✅ · Anthropic and Moonshot figures via aggregators ⚠️.

- Gemini REST: base `https://generativelanguage.googleapis.com`, header `x-goog-api-key`. Vercel AI SDK `@ai-sdk/google` accepts a custom `fetch`, which is how the `provider_fetch` proxy is attached. Direct browser CORS for Gemini and OpenAI through the AI SDK is not relied on; Anthropic supports it with `anthropic-dangerous-direct-browser-access` (not needed with the proxy). https://github.com/vercel/ai/issues/3041
- Rust alternatives if the TS LLM layer ever moves: `rig-core` (20+ providers, tools, streaming, MIT) https://rig.rs/ ; `genai` https://docs.rs/genai

## E. Desktop stack facts

### Tauri 2
- Latest `tauri` crate 2.11.5 (2026-07-01). ✅ https://tauri.app/release/core/
- Rust to JS streaming: `Channel<T>`; events "evaluate JavaScript" and are not for bulk data. Binary: `invoke` accepts an `ArrayBuffer`/`Uint8Array` request body (Rust `tauri::ipc::Request` raw body); `tauri::ipc::Response` returns bytes; `Channel<InvokeResponseBody>` can carry `Raw`. **S1 measures it.** https://v2.tauri.app/develop/calling-frontend/ · https://v2.tauri.app/develop/calling-rust/ · https://github.com/tauri-apps/tauri/issues/7127
- Microphone through WKWebView `getUserMedia` on macOS is flaky (double prompts, missing prompts): tauri#11951, tauri#10898, wry#1195. Hence all capture in Rust. ⚠️
- `plugin-http` bypasses CORS for its own `fetch`; `plugin-global-shortcut` for PTT; `plugin-log`; `plugin-dialog`; `plugin-updater` (needs signing keys). Secrets: `keyring` crate 3.x (macOS Keychain, Windows Credential Manager) rather than `plugin-stronghold`. https://crates.io/crates/keyring
- CI: `tauri-apps/tauri-action` builds on `windows-latest` and `macos-latest` (Apple Silicon runner; pass `--target aarch64-apple-darwin`). https://v2.tauri.app/distribute/pipelines/github/
- macOS: notarization is effectively mandatory for signed distribution; Apple Developer Program $99/year. Unsigned builds open after `xattr -dr com.apple.quarantine` or right-click → Open. Windows: SmartScreen warnings are expected for an unsigned private app; EV certificates no longer bypass reputation (2024). https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation

### Rust crates (pin exact versions in `[workspace.dependencies]` at M0; check `cargo deny` output)
| Crate | Use | Licence | Note |
|---|---|---|---|
| `cpal` 0.15.x | audio I/O (WASAPI, CoreAudio) | Apache-2.0 | ASIO feature not used (SDK licensing, CI hassle) |
| `rtrb` | lock-free ring buffers | MIT/Apache | audio thread ↔ render worker |
| `symphonia` 0.6.x | decode wav/mp3/flac/aac/aiff | MPL-2.0 | record the MPL exception in `deny.toml` with a comment; alternative `hound` (wav only) + `minimp3`-class crates if MPL is refused |
| `hound` | WAV write | Apache-2.0 | recorder |
| `rubato` | resampling | MIT | device edge, 16 kHz STT feed |
| `oxisynth` | SF2 synth | MIT | bass and comp; alternative `rustysynth` (MIT) |
| `signalsmith-stretch` / `ssstretch` | time-stretch and pitch-shift (Signalsmith Stretch, MIT, cxx) | MIT | **S3** decides which binding builds on both |
| `midir` | MIDI I/O | MIT | `jam-rig` |
| `midly` | Standard MIDI File write/read | MIT ❓ verify | Logic export |
| `pitch-estimate` 0.1.0 | McLeod | MIT | tuner, offline pitch; replaces pitch-detection per [ADR 0011](../adr/0011-pitch-measurement-precision.md) |
| `rustfft` | FFT for chroma and onset | MIT/Apache | own DSP |
| `rusqlite` (bundled) | index cache | MIT | `store` |
| `keyring` 3.x | OS keychain | MIT/Apache | `keys` |
| `tokio`, `tokio-tungstenite`, `reqwest` (rustls) | async, WebSocket, HTTP | MIT/Apache | `net/` |
| `serde`, `serde_json`, `schemars` | data files and JSON Schema export | MIT/Apache | seams |
| `rand_pcg` | seeded RNG | MIT/Apache | humanize |
| `include_dir` | bundle `styles/`, `charts/`, `rigs/`, `controls/` | MIT | registries |
| `tracing` + `tauri-plugin-log` | logging | MIT | never bodies |

Banned: `aubio-rs` (GPL), `rubberband` (GPL), anything LGPL.

### TypeScript packages
- React 19, Vite 6, TypeScript 5.x, Tailwind v4, zustand, `tonal` (chords, scales, transposition; MIT), zod, Vercel AI SDK (`ai` + `@ai-sdk/google`), `@tauri-apps/api` and plugins, Biome, vitest, `@phosphor-icons/react` (one icon family only).

### The JUCE alternative (recorded for ADR 0001)
JUCE 8 offers WebView UIs, a mature audio graph and VST3/AU hosting. Its licence is GPL or commercial (a free tier with limits), which conflicts with a public permissive repo, and an AI coding agent is measurably more reliable in TypeScript and Rust than in modern C++/CMake. JUCE wins only if plugin hosting becomes a must-have. https://juce.com/blog/juce-8-feature-overview-webview-uis/ · https://juce.com/legal/juce-8-licence/

## F. Prior art and assets

- Virtual-band engines to learn from: MMA (Musical MIDI Accompaniment, groove library), Impro-Visor (style extraction, accompaniment), Duke (realtime backing-track generator, maturity ❓). https://berteh.github.io/BandInMuseScore/ · https://github.com/Impro-Visor/Impro-Visor · https://github.com/jagrmusic/duke
- Chord and theory in TS: `tonal` (actively maintained, ESM). https://github.com/tonaljs/tonal
- Sample sources to audit for the drum kit and SoundFont (**licences vary per pack; nothing is CC0 until verified**): FreePats (https://freepats.zenvoid.org/), sfzinstruments.github.io, the list at https://github.com/IsaakCode/freeaudio/blob/master/best_free_samples.md. Record the chosen pack, its licence text and attribution in `assets/LICENSES.md`.

## Verify before coding (open questions and who settles them)

| Question | Settled by |
|---|---|
| Lyria RealTime endpoint URL, auth, message field names, real session cap, rate limits | S4 |
| Tauri binary IPC throughput and behaviour when minimised | S1 |
| cpal channel selection on the HeadRush; headless behaviour on CI | S2 |
| Which Signalsmith binding builds on MSVC and clang | S3 |
| ElevenLabs Scribe batch model id, TTS PCM output formats per plan, exact JSON | S5 |
| Music.ai module names, result JSON, key/section pricing, latency | M3 task 3.2 fixtures |
| ElevenLabs stems: which six stems, guitar included, plan gating | M3 task 3.2 fixtures |
| `midly` licence and SMF marker support | M6 task |
| Black Spirit CC map against the official H&K manual PDF | M5 task and owner gate 5 |
| Scarlett 2i2 generation on the Mac; Apple Silicon | Vegar |
| Whether the HeadRush enumerates any USB-MIDI endpoint (believed no) | Owner gate 5 |

### Music.ai format verification, 2026-09-06

The public [API reference](https://music.ai/docs/api/reference/) documents signed
upload URLs and asynchronous workflow jobs. The [Beats module](https://music.ai/modules/transcription/beats/)
describes `beatMap` annotations with a start time and beat number, whereas the
generic [file formats page](https://music.ai/docs/api/file-formats/) shows a beats
example with `start`, `end` and `bpm`. The [Sections module](https://music.ai/modules/transcription/sections/)
returns `sectionsMap` and takes a beat-map URL. These descriptions do not by
themselves establish an exact complete beat/downbeat response schema. The
official [Python SDK](https://github.com/weAreMusicAI/python-sdk) documents job
submission/download, not a verified downbeat fixture for this app.

No provider request or credential access was made. Recorded response fixtures,
workflow output contracts and real-song acceptance remain open before a provider
adapter can claim to drive the transport. The confirmed-local grid implementation
is explicitly user-authored beat grouping/sections over existing estimates, not
a replacement for automatic Music.ai analysis or proof of its quality.
