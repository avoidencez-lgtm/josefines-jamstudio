# Runpod: build acceleration or AI processing?

Reviewed 2026-09-05 for this repository. No cloud resources were provisioned and no speedup has been measured.

The current pipeline runs TypeScript checks/builds on Ubuntu and Rust/native Tauri checks on Windows and macOS. Rust dependency caching is already enabled through Swatinem/rust-cache. Compilation and native packaging are the relevant build workloads; adding a GPU does not accelerate the existing compiler commands.

[Runpod Pods](https://docs.runpod.io/pods/overview) provide container-based GPU/CPU resources but explicitly do not support Windows. They are not a replacement for this project's Windows and Mac packaging/acceptance jobs. Keep those native runners; use measured per-step timings to improve cache reuse or choose larger CPU runners only if compilation justifies the cost.

[Runpod Serverless](https://docs.runpod.io/serverless/overview) is a plausible fit for queued music/video model inference and documented ComfyUI worker deployments. The existing local ComfyUI integration is not automatically compatible with Runpod's authenticated serverless job API. A future adapter should reuse the studio's native secrets, provider registry and durable job receipts, and implement submit/status/cancel/download against a pinned worker contract.

Benchmark one representative permitted model/workflow first: output quality, warm runtime, cold-start time, queue delay, upload/download overhead and total per-job cost. [Network volumes](https://docs.runpod.io/storage/network-volumes) can retain model weights but have continuing storage costs and placement constraints. Generation stays opt-in; do not provision a permanently running GPU for an unmeasured workload.

Recommendation: retain the current native build platform; evaluate Runpod separately as an optional generation backend after the documented preview is merged. No claim of a faster build, completed adapter, specific GPU requirement or current model compatibility is made.
