# Kickoff: prerequisites and prompts for Antigravity

## What the builder needs on the Windows PC

Already present (checked 2026-09-02): Node 24, Visual Studio 2022 Build Tools with the MSVC C++ toolchain, WebView2 runtime, git, `gh` logged in as `avoidencez-lgtm`, corepack (pnpm 11.x), the Ponytail plugin for Antigravity.

To install once (PowerShell, then open a new shell):

```powershell
winget install --id Rustlang.Rustup -e
rustup default stable-msvc
rustup component add clippy rustfmt
cargo install cargo-deny
corepack enable
corepack pnpm --version
```

Optional for M5 testing without hardware: loopMIDI (Tobias Erichsen) to create a virtual MIDI port on Windows. On macOS the IAC Driver in Audio MIDI Setup does the same.

Antigravity: open `C:\Users\Vegar\Claude\josefines-jamstudio` as the workspace. Antigravity reads `AGENTS.md` at the repository root automatically and the Ponytail plugin is active machine-wide. Network access is required (crates, npm, GitHub, provider docs). Git identity is set repo-locally.

## Prompt at the start of every session (paste as the first message)

```
You are building Josefines Jamstudio in this repository. Work in English. Be thorough and honest.

1. Read AGENTS.md, docs/plan/00-README.md and docs/plan/02-working-method.md in full.
2. Find the first milestone in the status board of docs/plan/00-README.md that is not ✅, read its section in docs/plan/03-build-plan.md, and read the parts of docs/ARCHITECTURE.md, docs/EXTENDING.md and docs/DESIGN.md that the milestone touches.
3. Set the milestone to ⏳ and work through its tasks in order: read the files first, write the test first, one task = one commit with every gate green (pnpm lint, typecheck, test, licenses:check; cargo fmt, clippy -D warnings, test with JAM_HEADLESS=1, cargo deny), run ponytail-review on each diff, push on a short-lived branch, open a PR, wait for CI on Windows and macOS, squash-merge your own PR when green.
4. Never guess a provider protocol, an audio format or a device behaviour: verify against the sources in docs/plan/04-research.md or the spike that owns the question, and record fixtures under tests/fixtures/ before code depends on them.
5. Every new seam ships with a recipe in docs/EXTENDING.md and a fixture in tests/invariants/ in the same PR.
6. When the milestone's acceptance criteria are met and the demo checklist passes on this PC with the file-backed input, set ✅ with the PR number in the status board, list any owner gates as pending, and commit.
7. End the session with a short report: what is on main now, what was done, what failed or was skipped and why, what is pending owner, next step.

Rules that are never broken: no secrets in repo, logs, chat or the WebView; audio never plays from the WebView; the audio callback allocates, locks and logs nothing; 48 kHz internally; no GPL or LGPL dependencies; no --force, no --no-verify; no parallel agents; report honestly.
```

## Short prompts per milestone (if Vegar wants to steer)

- **M0:** "Do M0 in docs/plan/03-build-plan.md. Run spikes S2, S3, S1 first and merge their findings as docs. Finish with CI green on both operating systems, the tuner reading E2 from the fixture, and the six seam fixtures passing tests/invariants."
- **M1a to M1e:** "Do the next M1 sub-milestone. The Timeline is pure and tested before the transport uses it. Golden renders are onset ±1 sample and RMS ±0.05 dB, never bit-exact."
- **M2:** "Run S5 first and check in scrubbed fixtures. Then build the push-to-talk pipeline exactly as ARCHITECTURE §6 describes. Measure the latency and write the number in the PR."
- **M3:** "Record Music.ai and ElevenLabs fixtures before writing the pipeline. The local fallback must pass its numbers on the synthetic chord fixture."
- **M4:** "Run S4 first; the wire transcript is the client's unit-test fixture. Band and Lyria are mutually exclusive."
- **M5:** "Everything through MidiSink; MemorySink in tests. Verify the Black Spirit CC map against the official manual before encoding it. Owner gate 5 stays pending."
- **M6:** "The SMF must round-trip through midly. Analysis numbers from synthetic takes within tolerance."
- **M7:** "Run the DESIGN.md pre-flight list and attach the screen recording. Tag v0.1.0 and check both installers."

## When the builder is stuck

- A spike runs out of its timebox: write what was learned and the fallback chosen; do not extend it without asking Vegar.
- A provider behaves differently from the docs: capture the real response as a fixture, adjust the client, and note the difference in the fixture's README.
- A device or platform behaviour cannot be tested here (macOS audio, the real rig): implement per the documented behaviour, add it to the pending owner list, and move on.
- The plan is ambiguous: pick the simplest choice that satisfies the acceptance criterion, write the choice in the commit message, continue. Do not wait.
- CI is red on macOS only: read the log carefully; most cases are a missing `JAM_HEADLESS` guard or a path-separator assumption. Fix on the same branch.
- An API key is missing: say clearly in the report which provider Vegar must configure; do not stop the milestone if other tasks remain.

## What Vegar does himself

- Buys the USB-MIDI interface (and optionally the pedal and a microphone) from [../hardware/shopping-list.md](../hardware/shopping-list.md).
- Enters API keys in the app on the Mac (Gemini paid tier for Lyria RealTime; ElevenLabs plan with Music and Stems; Music.ai) and on the PC for live tests.
- Runs the owner gates in [06-owner-verification.md](06-owner-verification.md) with the guitarist and ticks them.
- Creates the `assets-v1` GitHub Release when the builder has prepared the packs, or approves the builder doing it with `gh`.
- Decides on signing (Apple Developer account) when v0.1.0 is close.
