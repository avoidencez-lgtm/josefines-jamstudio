# Working method: how the builder works in this repository

This is the standard every piece of work is measured against. It is short because it must be followed every time.

## Ground rules

1. **Read before you write.** Open the files you are about to change, the tests that cover them, and the part of [ARCHITECTURE.md](../ARCHITECTURE.md) that owns them. Do not rewrite a module you have not finished reading.
2. **Never guess a protocol or an API.** Provider endpoints, message shapes and audio formats are confirmed against the vendor documentation linked in [04-research.md](04-research.md) and recorded as fixtures under `tests/fixtures/` before code depends on them. Facts flagged ❓ in 04 are verified in the spike that owns them.
3. **One task, one commit, all gates green.** No "fix later". Commit messages in English with a prefix (`feat:`, `fix:`, `docs:`, `ci:`, `engine:`, `band:`, `ui:`, `ai:`, `rig:`, `test:`), ending with the trailer `Co-authored-by: DeepMind Antigravity <antigravity@google.com>`.
4. **Simplest thing that meets the acceptance criterion.** The Ponytail plugin is active in every Antigravity session on this machine. Run `ponytail-review` on the diff before each commit and act on it. Seams (see [EXTENDING.md](../EXTENDING.md)) are the only abstraction allowed; everything else stays concrete.
5. **Verify on both operating systems.** A change is not done until CI is green on `windows-latest` and `macos-latest`. macOS is only reachable through CI; keep macOS-affecting changes small and push often.
6. **Report honestly.** If something failed, say it first. If something was skipped, say so. Never write "should work". Owner gates are not ticked by the builder; they are recorded as pending owner.
7. **Work sequentially.** No parallel agents, no fan-out. One task at a time. Breadth comes from many small, correct steps.
8. **Do not touch what is not yours.** `docs/adr/` records decisions; changing one requires a new ADR that supersedes it, never an edit in place. Secrets never enter chat, logs or the repository.

## Toolchain on Windows

Everything runs from `C:\Users\Vegar\Claude\josefines-jamstudio`. PowerShell is the default shell. One-time setup is in [05-kickoff.md](05-kickoff.md).

```powershell
# Install dependencies (first time, and after a lockfile change)
corepack pnpm install --frozen-lockfile

# The gates: all must be green before every commit
corepack pnpm lint            # biome check .
corepack pnpm typecheck       # tsc --noEmit
corepack pnpm test            # vitest run
corepack pnpm licenses:check  # JS licence allowlist
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
$env:JAM_HEADLESS = "1"; cargo test --workspace
cargo deny check

# Run the app (headless engine with the file-backed guitar input)
$env:JAM_HEADLESS = "1"; $env:JAM_FAKE_INPUT = "tests/fixtures/audio/guitar-e-blues-120.wav"; corepack pnpm tauri dev

# Smoke-run the built app the way CI does (exit 0 = the frontend completed its handshake; run it right after the build, cargo test rebuilds the binary without the embedded frontend)
corepack pnpm tauri build --debug --no-bundle; $env:JAM_HEADLESS = "1"; $env:JAM_SMOKE_SECONDS = "25"; .\target\debug\src-tauri.exe

# One end-to-end scenario file (ARCHITECTURE §9.7); cargo test --workspace and pnpm test run them all
$env:JAM_HEADLESS = "1"; cargo test -p src-tauri --test ipc_library
corepack pnpm vitest run tests/e2e/startup.test.ts

# Build a bundle locally (Windows only; macOS bundles come from CI)
corepack pnpm tauri build
```

`pnpm` runs through corepack (pinned in `package.json` `packageManager`). Rust is the stable MSVC toolchain from rustup. If `cargo` is not on PATH in a new shell, add `%USERPROFILE%\.cargo\bin`.

## Git flow

- Default branch `main`, protected by CI. Work on short-lived branches named `<milestone>/<slug>`, for example `m1b/drum-sampler`.
- Open a PR with `gh pr create --fill`; the PR description lists what changed, what was verified (paste the gate output summary), and what is pending owner.
- Wait for CI: `gh pr checks --watch`. Red CI is fixed on the same branch before anything else.
- Merge your own PR when green: `gh pr merge --squash --delete-branch`. The squash commit keeps the prefix and the trailer.
- Never `--force`, never `--no-verify`, never rewrite history, never commit directly to `main` after M0 lands.
- Identity is set repo-locally (Vegar). The trailer says who wrote the code.

## Spikes

A spike is a time-boxed experiment that decides an architectural question ([03-build-plan.md](03-build-plan.md) lists S1 to S5). Rules: throwaway branch `spike/<id>-<slug>`, never merged; the findings are a file `docs/spikes/<id>-<slug>.md` written from the template in [docs/spikes/README.md](../spikes/README.md), merged through a normal docs PR; the decision the spike produces is written into the milestone task it unblocks. A spike that runs out of its timebox records what was learned and the fallback chosen; it does not get a second timebox without Vegar's say.

## Secrets and provider calls

- Keys are entered in the app's Settings screen and stored in the OS keychain through the `SecretStore` seam. There is no `.env` for keys. `.env.example` lists provider *names* only.
- Automated tests never call a provider. Provider clients are tested against recorded fixtures in `tests/fixtures/providers/<provider>/`. A recorded fixture is captured once with `JAM_RECORD_FIXTURES=1` while a key is present, then scrubbed (the recorder strips headers and any key-like string) and committed.
- Manual live checks are opt-in: `JAM_LIVE=1 cargo test -p josefines-jamstudio --test live -- --ignored`.
- Nothing leaves the app from a headless run: under `cfg(test)` or `JAM_HEADLESS=1` (CI, the smoke harness, `tauri dev` as documented above) `provider_fetch`, the media adapters and the installed-agent bridge refuse every request unless `JAM_LIVE=1` is also set. A smoke harness that starts the real binary must set `JAM_HEADLESS=1` itself; `cfg(test)` only covers unit tests inside the crate.
- Never log a request body that could contain audio or a key. Log provider, model, duration, bytes and estimated cost.

## Definition of "usable"

Every milestone ends with a **demo checklist** in 03 that the builder runs on Windows with the file-backed input (and in CI headless). "Usable" means a guitarist could sit down and do the thing the milestone promises without reading docs. If the demo needs the real rig, the step is an owner gate and is listed as such.

## Reporting (end of every session)

In English, in the PR description and as the last message of the session, in this order: (1) what is on `main` now (PR numbers, what a user can do), (2) what was done this session, (3) what failed or was skipped and why, (4) what is pending owner, (5) next step. Update the status board in [00-README.md](00-README.md).

## Per-task checklist

- [ ] Read the relevant files, tests and the ARCHITECTURE section that owns them
- [ ] Wrote or updated the test first (synthetic signal, fixture, golden render, or vitest)
- [ ] Verified provider shapes against documentation or fixtures, never from memory
- [ ] `lint`, `typecheck`, `test`, `licenses:check`, `fmt`, `clippy`, `cargo test`, `cargo deny` green
- [ ] `ponytail-review` run on the diff and acted on
- [ ] Docs updated in the same commit (ARCHITECTURE, EXTENDING, or the hardware sheet) when a contract, seam or device fact changed
- [ ] Commit with prefix and trailer; PR opened; CI green on both operating systems; squash-merged
- [ ] (milestone) demo checklist run, status board updated, owner gates listed as pending
