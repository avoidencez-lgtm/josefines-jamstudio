# ADR 0003: Rust owns bytes and time, JS owns text and UI

**Status:** Accepted, 2026-09-02

## Context

Provider SDKs are richest in TypeScript, but the app is a public, BYO-key desktop product whose audio must be routed to a chosen device and recorded. Audio produced in a WebView goes to the system default device, cannot be recorded by the engine, and would require the key to be present in JavaScript.

## Decision

- Every network stream that carries audio, needs a key, must survive window minimise, or must align with the transport clock lives in Rust: Lyria RealTime, ElevenLabs TTS and STT, Music.ai jobs, stem jobs, asset downloads.
- Text-shaped, request/response, retryable work lives in TypeScript: the LLM conversation and tool calls, through a Rust `provider_fetch` proxy that injects the key from the keychain.
- The WebView never produces sound and never holds a secret. PCM crosses IPC only for waveform peaks and exports, and for the Lyria Fallback A if spike S4 fails twice.
- 48 kHz internally, one clock (the output callback), render-ahead into a lock-free ring buffer; the audio callback only copies.

## Consequences

- Rust clients for Lyria and ElevenLabs are written from the vendor docs and verified by spikes S4 and S5 whose transcripts become unit-test fixtures.
- The LLM layer keeps the Vercel AI SDK ergonomics (tools, providers) with a 30-line fetch shim.
- Recording and routing are complete: everything the guitarist hears passes through the engine's buses.
- Fallback for Lyria if the Rust client cannot be finished: a Rust WebSocket relay on 127.0.0.1 that injects the key and sniffs audio while JS speaks the protocol with `@google/genai` (Fallback B); PCM over IPC (Fallback A) only after S1 has proven throughput.
- Five crates plus app modules, not seven crates: crates are for pure, testable code; glue is a module.
