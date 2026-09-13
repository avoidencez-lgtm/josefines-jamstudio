# Contributing

Read [AGENTS.md](AGENTS.md) first. It is the law: invariants, stack locks, commit rules, and the gates.

## Gates (green before every commit)

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm licenses:check
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
$env:JAM_HEADLESS = "1"; cargo test --workspace
cargo deny check
```

## Git

- One task = one commit, all gates green.
- Prefixes: `feat:`, `fix:`, `docs:`, `ci:`, `engine:`, `band:`, `ui:`, `ai:`, `rig:`, `test:`.
- Never `--force`, never `--no-verify`, never commit to `main`.
- Code written by the Antigravity builder gets the trailer `Co-authored-by: DeepMind Antigravity <antigravity@google.com>`.

Friend-led owner gates are deferred to V2. Do not tick them as passed and do not wait on them for V1.
