# ADR 0001: Tauri 2 + Rust engine + React, not JUCE

**Status:** Accepted, 2026-09-02 · **Deciders:** Claude (architect), Vegar (owner)

## Context

The app needs low-risk cross-platform audio I/O, MIDI, a premium UI, and heavy AI/network integration, and it will be written almost entirely by an AI coding agent (Gemini 3.8 Flash in Antigravity) on Windows with macOS reachable only through CI. Two stacks were credible: JUCE 8 (C++, mature audio graph, VST3/AU hosting, WebView UI) and Tauri 2 (Rust engine with `cpal`, React UI).

## Decision

Tauri 2 with a Rust workspace engine and a React/TypeScript UI. VST3/AU hosting is deferred.

## Reasons

1. The guitar is never monitored through the app ([ADR 0002](0002-listen-dont-process.md)), so the usual reason for JUCE (sub-5 ms monitoring latency, plugin hosting) is absent.
2. An AI coding agent is measurably more reliable in TypeScript and Rust than in modern C++/CMake, where mistakes surface as crashes rather than type errors and the build system is fiddlier across two operating systems.
3. Microphone capture must live in native code either way (WKWebView `getUserMedia` is flaky); Rust `cpal` handles that cleanly.
4. Licensing: JUCE 8 is GPL or commercial (free tier with limits); a public Apache-2.0 repository fits Tauri and the Rust crates without exceptions.
5. Tauri's IPC, plugins (global shortcut, dialog, log, http, updater) and `tauri-action` CI cover everything else the app needs.

## Consequences

- The render worker, mixer, transport and recorder are written in Rust (a few thousand lines) instead of reusing JUCE's graph. They are simpler than JUCE's generality and fully testable headless.
- Realtime provider WebSockets are Rust clients (`tokio-tungstenite`), verified by spikes with checked-in transcripts.
- No plugin hosting in v1. A software amp-sim path is a backlog item.

## Switch to JUCE only if

1. VST3/AU hosting is promoted from deferred to must-have (Rust plugin hosting is immature; this is JUCE's one genuine win), or
2. two or more of spikes S2, S3, S4 fail with no workaround (device cannot be opened, cannot stretch, cannot stream), or
3. audible glitching persists on the Mac after render-ahead is correctly implemented and the buffer is at 512 or more.

Do not switch for latency, UI polish, or a single failed spike. Cheaper escape hatches first: raise the buffer, replace `cpal` with `coreaudio-rs` or miniaudio bindings, move one hot path to C over FFI. A switch would also force a licence change and is therefore Vegar's decision.
