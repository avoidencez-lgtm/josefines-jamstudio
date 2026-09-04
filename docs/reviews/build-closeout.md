# Build closeout — 2026-09-05

Scope: integrate and stabilise the existing engine and studio build. No new
product features are included. Full-product roadmap and owner acceptance remain
in the milestone board; this is an unsigned preview build.

## Audit disposition

The historical stack review is PR #30. Its evidence was captured before the
latest Write/room changes. This table records what the integration actually fixes.

| Finding | Disposition |
|---|---|
| F1 desktop events | Fixed: local main event ACL; partial subscription failure no longer prevents startup; late subscriptions are cleaned up. Native smoke also found invalid dotted Tauri event names, now translated to colon names at the boundary. |
| F2 WebView boundary | Fixed CSP and least-privilege event capability. No remote capabilities, browser network API or shell permission. |
| F3 meter/export drift | Fixed quarter-note conversion in tempo map, band MIDI and REAPER; recorded meter is retained; incompatible chart/style combinations and timing edits during recording are refused. |
| F4 browser speech | Removed. Typed Jo/assistant remain. Native STT/TTS and voice-bus routing are explicitly unbuilt. |
| F5 shortcuts | One T handler for tap tempo; text fields retain native input. |
| F6 damaged takes/cache | Damaged manifests are reported per file without hiding healthy takes. New cache rows retain the full manifest; legacy cache rows cannot reconstruct data that was never stored. |
| F7 settings | Atomic replacement with prior valid backup; corrupt source stays intact and produces an error. |
| F8 audio settings | Persist only after successful device application. |
| F9 callback discipline | Stack blocks and direct callback ownership; no callback resize, mutex or logging. Oversized buffers have a synthetic conversion check. |
| F10 unused code/deps | Removed unused JS AI/shell dependencies and unused Rust codec/resampler dependencies. Unwired DSP/research modules remain outside supported product paths; no new rewrite is included. |
| F11 amp mute | Non-Mute scenes explicitly send mute-off using the profile's existing CC mapping. Real amp acceptance remains owner gate 5. |
| F12 proof/docs drift | Quickstart and current support descriptions corrected. Planned Jo/extension/golden fixtures are not claimed as existing validation. Full extension-proof work remains on the roadmap. |
| F13 toolchain/licensing | Current lockfile is validated on stable Rust/edition 2021; the older edition-2024/MSRV-1.85 target is not an achieved compatibility claim. Existing licence checks remain mandatory. |
| F14 Claude agent | Codex live check was previously verified. Claude remains unverified without the installed native binary/account. |
| F15 clip decoding | Existing bounded in-memory decoding retained; caching is a performance follow-up, not a claim of this build. |

Additional build fix: enable the keyring crate's Apple native backend, so Mac
builds use Keychain rather than the default mock store. Remove a Cargo manifest
BOM that prevented CI cache parsing.

## Native verification

Windows debug build with embedded production frontend, isolated `JAM_USER_DIR`
and `JAM_DATA_DIR`, headless audio, real WebView2/Tauri IPC:

- Nine bundled charts and six styles loaded.
- 51 native transport events in 1.7 seconds, with advancing beat position.
- Settings round-trip and song save/load succeeded.
- A synthetic input take recorded 53,760 frames; six stems, tempo map and REAPER
  script exported with no missing stems.
- All nine redesigned rooms opened; no uncaught JavaScript errors.
- Unneeded WebView event emission was rejected by the ACL.

The headless screenshot deliberately says **No audio device**. It proves the
native UI and IPC flow, not guitar quality, device latency or MIDI hardware.

CI now compiles the embedded desktop frontend on Windows and macOS, in addition
to the existing lint/types/tests/licence checks. The release workflow can build
Windows, Apple Silicon and Intel Mac installers on demand as workflow artifacts,
without creating an accidental tag or release for a branch name.

Signing/notarisation, real Mac/HeadRush/Black Spirit checks, Logic drift, Claude
Code, and paid provider/local GPU acceptance remain pending owner. FFmpeg,
ComfyUI, model weights and DAWs are installed separately.

Local checks: 77 Vitest tests, Biome, TypeScript, JS licences, production Vite
build, Rust format, all non-Tauri crate Clippy checks and cargo-deny passed.
Full Rust test execution and the Tauri Clippy build script were blocked by
Windows Application Control (OS error 4551), not counted as passes. The merge
requires the full Windows/macOS CI checks, including embedded native builds.
Ponytail review retained existing patterns and removed unused dependencies;
no new library or service was introduced.

## Follow-up review on #29

V1/V2 are fixed: Film builds a clean soundtrack from the band, guitar DI and
unmuted guitar layers, excluding the click/test-tone master; unreadable media
files produce per-file warnings while healthy documents remain available.
The clean mix averages its inputs to retain headroom; it is a starting mix,
not a mastered release. V4 double accidentals now preserve pitch and quality.
V8 director inputs trim existing prompts; V9 hardcoded media backgrounds use
the theme token. S1 stale voice copy is removed. S2 adds a native close-request
listener and a discard/keep-editing dialog; recording/active operations block close.

V7 slider Undo grouping, S3 fast-refresh module separation, S4 chunk splitting
and S5 proposal conversation flow remain non-blocking refinements. No work on
these is implied by completing the preview build.

Follow-up local verification: full Clippy passed; 25 Tauri unit tests and the
opt-in FFmpeg clean-soundtrack test passed (constant stems 0.2 + 0.4 produced 0.3;
the 0.9 master was excluded). A real Windows WM_CLOSE request showed the native
unsaved-work dialog, and Keep editing preserved the chart draft. Native take-to-
media import also passed. The full workspace test run still encounters Windows
Application Control on the unchanged jam-dsp test executable; CI verifies it.
