# Studio verification and original-song finishing

Verification date: 2026-09-05. Scope: the implemented preview, all ten studio rooms, bilingual documentation and the new Finish workflow. This is not proof that the full product roadmap or real hardware integrations are complete.

## Delivered

- Eighteen bilingual chapters, searchable in Help & guides, exported as [English](../guide/manual-en.md) and [Bokmål](../guide/manual-nb.md). Topics cover workflows, controls, shortcuts, data, backup, API/installed-agent setup, limits, troubleshooting and developer extension points.
- Write → Finish: document review, boundary rehearsal, isolated lock-respecting contrast variants and section comps from compatible original recordings. Apply preserves a version; Undo and stale-preview protection remain available.
- No extra dependency, provider call or cloud deployment. [Primary-source research](../research/song-finishing.md) records inspiration and limits.

## Defects found and fixed

| Finding | Root fix | Evidence |
|---|---|---|
| Async save completion could overwrite intervening song/Film edits | Preserve newer draft bodies and advance only their disk revision | Deferred IPC regression tests fail before the fix and pass after |
| Film Undo restored an old disk revision | Keep the current revision while restoring document content | Save/edit/Undo regression |
| One unreadable original hid the whole song list | Scan documents individually, warn and keep damaged files intact | Healthy + corrupt file regression |
| Invalid user charts could replace healthy bundled charts; huge repeats expanded before validation | Validate overrides and bound arrangement length before expansion; require finite positive timing | Reload and extreme-repeat regression |
| Chart writes lacked previous-file protection | Sync a temporary file, retain a .json.bak, then rename | Existing save/import tests and full Rust suite |
| Tempo trainer stalled at short loop wraps | Count completed bar transitions, including one-bar loops; suppress stepping during recording | Repeated-loop telemetry regression |
| Help allowed musical shortcuts while reading | Inline reader suppresses global musical shortcuts and restores opener focus | Browser key, Escape and focus checks |

## Validation matrix

| Surface | Automated / exercised evidence | Still needs real acceptance |
|---|---|---|
| Write | Arrangement, lyrics, locks, limits, proposal/Undo invariants; Finish apply/revert/stale preview; native save/reload and comp | Creative judgement, real guitar recording |
| Stage | Timeline, cue, band-render and trainer tests; browser controls; native loop telemetry | HeadRush latency and sustained playback |
| Library | Parser, transpose, import/save/reload and invalid override tests; room navigation | Personal chart collections |
| Jo AI | Typed tool validation, reviewed edits and provider/agent fixtures; room navigation | Live accounts, installed CLI authentication; native voice remains unbuilt |
| Songs | Media fixture tests and local library UI | Real reference files; automatic stems/stretch remain unbuilt |
| AI Music | Model registry and job/provider fixture tests; room navigation | Paid model generation and account entitlements |
| Film | Storyboard, persistence and export tests; real FFmpeg clean-mix and audio/video timing tests; room navigation | Real footage and paid video jobs |
| Sessions | Take recovery, export and timing tests; native recording and seven-stem comp export with MIDI | Five-minute DAW alignment with the owner's rig |
| Rig | Profile/controller fixture tests and room navigation | Physical MIDI routing and scene changes |
| Settings | Configuration/provider fixtures and room navigation | Real audio devices and owner accounts |
| Help | All room/shortcut translation coverage and exact export parity; search, EN/Bokmål, focus and shortcut isolation | Owner readability feedback |

Browser checks visit all ten rooms at 1100 and 1440 pixels with no horizontal overflow or uncaught errors. A separate isolated profile exercises a synthetic original, preserves/restores a version, rejects a stale preview, replaces a section comp, switches languages and verifies that help cannot accidentally alter tempo or start recording. Screenshots are inspected at desktop size.

Native Windows debug build uses JAM_HEADLESS with isolated data and WebView directories. A real native recording runs for 21.029 seconds. The UI selects its chorus interval (9.6–19.2 seconds), saves/reloads the compSlot, accepts native clip audition and produces a loop from bar 3 to exclusive bar 7. Recording the assembled document then exports seven WAV stems, including its separate guitar layer, plus MIDI. No uncaught UI errors. Headless input does not demonstrate real guitar sound quality.

## Gates

Local frontend: 85 tests in 18 files, lint, types, JavaScript licence allowlist and production build pass. Full workspace Rust tests: 124 passed, 3 opt-in tests ignored in the default run. The two local FFmpeg tests were then run explicitly and passed (clean soundtrack excludes the click; rendered audio/video retains timing). Only the live Codex-account test remains unrun. Rustfmt, all-target Clippy and cargo-deny pass. Native Windows debug build passes. Unlike an earlier run, the current full Rust suite was not blocked by Windows Application Control.

The production bundle still produces Vite's non-fatal large-chunk advisory. No dependency was added. The design check's new preview-border warning was resolved; existing tokens, spacing and room layout remain in use. Ponytail review removed a redundant engine-state write; no new abstraction was needed.

Cross-platform GitHub CI must pass on the submitted head before merge. Installer signing/notarisation, Apple hardware acceptance, real MIDI, live paid providers and installed-agent login are not claimed as verified by this pass. The intentionally unbuilt voice, stem/stretch and realtime-generation milestones remain open in the status board.

