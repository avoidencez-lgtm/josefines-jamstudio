# Security

## Report a vulnerability

Use GitHub's private vulnerability reporting on this repository, or email avoidencez@gmail.com. Do not open a public issue for a secret or an exploitable defect.

## What data leaves the machine

Facts from [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §10:

- Keys only in the OS keychain via `SecretStore`; the WebView never sees a key; `provider_fetch` is the only TS path to a provider; request bodies are never logged; a bundle-scan test guards `dist/`; gitleaks guards the repository.
- No telemetry, no analytics, no accounts. Every outbound call is listed in Settings → Diagnostics with provider, model, time and estimated cost.
- Audio leaves the machine only when the guitarist starts an analysis, a generation, or holds push-to-talk.
- Tauri capabilities are minimal: `fs` scoped to `~/JosefinesJamstudio`, `dialog`, `global-shortcut`, `log`, `http` (only from Rust).
