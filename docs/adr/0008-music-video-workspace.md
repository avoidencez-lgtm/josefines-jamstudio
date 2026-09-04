# ADR 0008: file-backed music video workspace and external render tools

Status: accepted for the requested music-video, Chinese-model and open-model slice.
Date: 2026-09-04.

## Decision

Add one shared media catalog (`src/lib/media-catalog.json`) consumed by the UI and
Rust. Protocol adapters live under `src-tauri/src/net/media.rs`, alongside the
existing network seam. Provider credentials remain in the OS keychain. Generation
is explicit, one request at a time, with no paid retry or fallback. Account access,
model quality and prices are not inferred from a catalog entry.

`src-tauri/src/media.rs` owns projects, assets, generation receipts, import and
rendering under `~/JosefinesJamstudio/music-videos/`. Projects and receipts carry
schemaVersion 1; saves preserve unknown JSON fields, check revisions and retain a
backup. The UI retains drafts across screens and offers 50 undo steps. Completed
render paths are saved in their project. Source clips and recordings are retained.

This narrowly extends invariants 1, 5 and 9:

- The WebView may decode **muted video previews only**, with our own play/scrub
  controls and no volume/unmute control. It still never plays audio. The explicit
  Play film / Listen action opens the user's native media player. Interactive
  guitar/band recording and playback remain in the existing 48 kHz Rust engine.
- Offline film assembly uses **separately installed FFmpeg and ffprobe executables**,
  discovered on PATH/common Mac install locations. No FFmpeg libraries, binaries,
  model weights, ComfyUI code or generated assets enter this repository. Existing
  dependency/asset licence gates remain intact. External tool/model licences are
  the user's installation responsibility. The application does not download them.
- Local open-model workflows may use **http://127.0.0.1:8188**, exclusively through
  the Rust media seam. This fixed loopback ComfyUI endpoint uses no app credential,
  no redirects and no proxy. It is not an arbitrary URL proxy. It submits only a
  user-configured API graph, never installs nodes or models. Nodes run in the
  user's existing ComfyUI environment and may have their own network behavior.

Cloud response bodies are bounded to 192 MiB, downloaded media to 128 MiB and
imports to 512 MiB. Google downloads are restricted to its Files API; Runway signed
downloads are restricted to its domain and CloudFront. Signed URLs remain in Rust
receipts, not UI IPC or usage logs. Credentials never accompany Runway CDN requests.
Unsupported hosts produce an explicit dashboard-download/import path.

Jobs persist a receipt before submitting. Runway/ComfyUI IDs support poll/resume;
Google download receipts can retry a download. Inline outputs are saved before
decoding. An interrupted synchronous request without a receipt is **unknown**, not
automatically retried. The user checks provider history/imports the result. This
does not guarantee recovery if the app exits before receiving a paid result.

FFmpeg runs with argument arrays, no shell, local-file protocols, bounded process
output and per-stage timeouts. Rendering is cancelable. A new export directory
holds each render attempt, its project and intermediate clips; no previous export
is overwritten. Each shot is independently scaled/cropped to 720p, looped/trimmed
to a cumulative 30 fps frame boundary, then concatenated against the original
soundtrack. Its pitch and speed are unchanged; audio is encoded to 48 kHz AAC.
The timeline must match the soundtrack within 0.1 s. Limits: 120 shots, 10 minutes.

## Validation and limits

Synthetic fixtures cover all protocol families, task receipts, ComfyUI outputs,
MiniMax hex decoding and download boundaries. The external-tool test creates a
440 Hz reference song and video, renders two fractional-duration shots, verifies
duration within 50 ms and decoded AAC audio RMSE below 0.015. No paid media API or
GPU-model generation was performed. Mac native preview/player, external FFmpeg
installation and actual provider/model access remain owner checks.

No NLE, plugin framework, automatic GPU provisioning, model training or timeline
audio engine is added. Section cuts derive from chart text and recording length;
this is not acoustic beat detection or lip synchronization. Text direction can
use the existing API brains or signed-in Codex/Claude CLIs. Agent shot edits never
start a paid generation.
