# AGENTS.md: rules for everyone who changes Josefines Jamstudio (humans and agents)

Josefines Jamstudio is a desktop AI jam studio for one guitarist: a Tauri 2 app with a Rust audio and MIDI engine and a React UI. It listens to the guitar (HeadRush USB), plays a virtual band, a real song with the guitar removed, or Google Lyria's live stream, talks through the voice bandleader "Jo", drives the rig over MIDI, and records every jam for review and export to Logic Pro. The guitar's tone is always made by hardware.

## Invariants (enforced by tests and CI; never weakened without a superseding ADR)

1. **JS owns text and UI. Rust owns bytes and time.** The WebView never produces sound (no `<audio>`, no Web Audio playback) and never holds a secret. All audio devices, capture, mixing, playback, recording and MIDI live in Rust.
2. **48 kHz internally, always. One clock:** the output callback's frame counter. The audio callback allocates nothing, locks nothing, logs nothing and does no IPC; it copies from a ring buffer filled by a render-ahead worker.
3. **Guitar tone is hardware.** The app is never in the monitoring path: no software monitoring on by default, no amp simulation, no plugin hosting in v1 (ADR 0001, 0002).
4. **Every DSP and timeline function is pure and ships with a synthetic-signal test stating its tolerance.** No hardware in any automated test: `FileInput`, `NullOutput`, `MemorySink` and `MemoryStore` exist from M0 and `JAM_HEADLESS=1` selects them.
5. **Secrets only in the OS keychain** through the `SecretStore` seam. Config, logs and IPC carry provider *names* only. Every outbound call goes through `src-tauri/src/net/` (Rust) or the `provider_fetch` proxy (TS), with provider, model and estimated cost logged locally. Request bodies are never logged.
6. **Files are truth** under `~/JosefinesJamstudio/`; SQLite is a cache that can be deleted. Every manifest has `schemaVersion`, unknown fields survive rewrites, each bump has one migration. Audio assets are fetched from GitHub Releases with SHA-256 and a licence line; never committed.
7. **No placeholders in shipped paths.** A feature works end-to-end or shows an explicit "not configured" state with the next step. Misconfiguration (missing key, vanished device, failed download) fails loud in the UI, never silently.
8. **Every PR builds and tests on Windows and macOS** in CI. Platform-specific code lives only under `platform/` modules. Windows stereo-only input is a documented non-goal.
9. **Licence allowlist** (Apache-2.0, MIT, BSD, ISC, 0BSD, Zlib, Unicode, CC0) enforced by `cargo deny` and `scripts/check-js-licences.mjs`. Recorded exceptions only: MPL-2.0 (file-level copyleft), CC-BY-3.0/4.0 (data tables), Unlicense (Rust crates that are also MIT). GPL, LGPL and AGPL never enter the tree. Every bundled or downloaded asset has a section in `assets/LICENSES.md`.
10. **English for code, commits and the main UI.** The user-authorized manual and in-app help are maintained in English and Norwegian Bokmål ([ADR 0009](docs/adr/0009-bilingual-help.md)); keep both translations complete. Commit prefixes `feat:`, `fix:`, `docs:`, `ci:`, `engine:`, `band:`, `ui:`, `ai:`, `rig:`, `test:`; trailer `Co-authored-by: DeepMind Antigravity <antigravity@google.com>` for code written by the Antigravity builder. Ponytail review before every commit. One task = one commit with all gates green. Never `--force`, never `--no-verify`, never rewrite history. Report honestly: failures first.
11. **Band mode and Lyria mode are mutually exclusive.** Nothing tries to synchronise Lyria to a chart; Lyria's bpm is a request, not a clock.
12. **Every capability is a seam:** a definition, one registry, consumers. Styles, charts, rig profiles and control maps are data files with `schemaVersion`. Providers, Jo tools, instruments, analysis kinds and screens are one module implementing one interface plus one registry line. No `match` over provider or style ids outside its registry. IPC changes are additive under `IPC_VERSION`. A new seam ships with a recipe in `docs/EXTENDING.md` and a fixture in `tests/invariants/` in the same PR.

## For agents that build (Antigravity, Codex, Claude)

The build plan lives in `docs/plan/`: start with `docs/plan/00-README.md` (goal, Definition of Done, status board), follow `docs/plan/02-working-method.md` (gates, git flow, spikes, reporting) and work through `docs/plan/03-build-plan.md`. Contracts are in `docs/ARCHITECTURE.md`, extension recipes in `docs/EXTENDING.md`, the design system in `docs/DESIGN.md`, decisions in `docs/adr/`, device facts in `docs/hardware/`. Prerequisites and the session prompt are in `docs/plan/05-kickoff.md`.

## Commands (from M0)

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm lint; corepack pnpm typecheck; corepack pnpm test; corepack pnpm licenses:check
cargo fmt --all -- --check; cargo clippy --workspace --all-targets -- -D warnings
$env:JAM_HEADLESS = "1"; cargo test --workspace; cargo deny check
$env:JAM_HEADLESS = "1"; $env:JAM_FAKE_INPUT = "tests/fixtures/audio/guitar-e-blues-120.wav"; corepack pnpm tauri dev
corepack pnpm tauri build --debug --no-bundle; $env:JAM_HEADLESS = "1"; $env:JAM_SMOKE_SECONDS = "25"; .\target\debug\src-tauri.exe   # smoke: exit 0 = frontend handshake completed
```

End-to-end scenarios (ARCHITECTURE §9.7): `cargo test --workspace` includes the IPC scenarios on Tauri's mock runtime (`src-tauri/tests/ipc_*.rs`), `pnpm test` includes the store scenarios on the preview engine (`tests/e2e/`), and CI smoke-runs the built app on both runners. Run the smoke binary straight after `tauri build`: `cargo test` rebuilds it without the embedded frontend.

## Stack locks (v1)

Tauri 2.11.x; Rust stable (MSRV 1.88 pinned as `rust-version`, edition 2021) with `cpal`, `rtrb`, `hound`, `pitch-estimate`, `midir`, `keyring`, `rusqlite`, `tokio`, `reqwest` (rustls), `serde`; React 19, Vite, TypeScript, Tailwind v4, zustand, `tonal`, zod, `@phosphor-icons/react`, Biome, vitest; corepack pnpm. Text providers are reached through the registry in `src/lib/jo/providers.ts` and the Rust `provider_fetch` proxy. Resampling, time-stretch, stem separation and realtime provider streams are unbuilt roadmap items, not locked crates. No Python, no Node sidecar, no plugin framework, no dynamic loading in v1.
