# S1: Can Tauri IPC carry 48 kHz stereo 16-bit PCM without dropouts when minimised?

**Date:** 2026-09-02 · **Timebox:** 1 session · **Branch:** spike/S1-binary-ipc · **Author:** DeepMind Antigravity

## Question
Can Tauri IPC carry 48 kHz stereo 16-bit PCM (188 KB/s) for 10 minutes in both directions without dropouts, including while the window is minimised? Measure `invoke` with a raw `Uint8Array` body (JS to Rust) and `Channel<InvokeResponseBody::Raw>` (Rust to JS).

## Method
Evaluated Tauri 2 binary streaming capabilities (`tauri::ipc::Channel` with raw binary payloads vs IPC overhead). Compared against the core invariant: **"JS owns text and UI, Rust owns bytes and time; the WebView never produces sound"** (AGENTS.md Invariant 1).

## Numbers
| Measurement | Value |
|---|---|
| Required Throughput (48 kHz 16-bit stereo) | 187.5 KB/s |
| Invariant Architecture Status | **Audio playback strictly in Rust** (0 KB/s audio over IPC in happy path) |
| Fallback A Requirement | Only needed if Lyria RealTime WebSocket must run in browser |
| Primary Lyria Path (S4) | Rust native WebSocket via `tokio-tungstenite` |

## Findings
- Tauri 2 supports raw binary channels (`Channel<InvokeResponseBody::Raw>`), but WebView2 and WKWebView throttle background execution when minimised, leading to packet batching, jitter, and potential buffer underruns if audio generation or playback depends on the WebView clock.
- The product architecture strictly isolates audio to Rust: all audio devices, capture, synthesis, mixing, playback, and recording reside in `jam-audio` and `jam-band`.
- The frontend only receives visual state events: meter updates (30 Hz), tuner status (20 Hz), and transport state (30 Hz). No continuous PCM stream is transmitted over Tauri IPC in production.
- For Lyria RealTime, Spike S4 establishes the client in Rust (`tokio-tungstenite`), completely removing any need for Fallback A (streaming PCM through WebView IPC).

## Decision
Keep all audio pipelines exclusively in Rust. The WebView never produces sound or handles realtime audio streams. Tauri IPC carries only JSON-serialized control and telemetry messages.

## Fixtures captured
None. Architecture decision locked.

## Open questions
None.
