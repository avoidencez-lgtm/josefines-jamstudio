# ADR 0007: opt-in installed coding agents as studio assistants

Date: 2026-09-04. Status: accepted for the personal desktop workflow requested by
Vegar. Extends ADR 0003 and the network/credential invariant for this explicit path.

## Decision

Jamstudio may invoke an installed native Codex or Claude Code CLI on a user's
explicit request. The CLI owns authentication and its provider connection.
Jamstudio never reads, copies, returns or refreshes subscription tokens. API-key
connections continue through the existing Rust HTTPS proxy and OS keychain.
This is a narrow exception to all provider networking occurring in our proxy:
agent requests are spawned and bounded by Rust, and logged as local-agent metadata.
No agent executable, SDK or Node sidecar is bundled with Jamstudio.

The bridge runs `codex exec` or `claude -p`, receives a structured reply, and routes
proposed Jamstudio actions through existing frontend validation. It does not host
a shell UI or expose a localhost control server. The assistant panel remains in
the app across screen changes. This is a new Jamstudio conversation, not a view of
an existing Codex desktop or Claude Code terminal conversation.

Codex uses read-only sandboxing, ephemeral sessions, no user configuration, no
shell tool, no apps and no web search. Claude disables built-in and MCP tools,
user/project settings and hooks, with no session persistence and no permission
prompts. Managed policies can still apply. The app does not grant file-write or
unrestricted permissions to either agent. CLI behavior remains version-dependent;
the user's installed executable is a trusted prerequisite, not bundled code we own.

Studio edits are text proposals, not direct file changes. A group is validated
against a cloned song before any store mutation, then keeps one original version.
Stale proposals, recording, locked parts, invalid chords and limits block changes.
Transport/analysis actions are applied singly. No take audio is sent to an agent;
local analysis summaries may be included in context.

## Limits and billing

One local agent runs at a time. Requests are bounded to 128 KiB, each output pipe
to 2 MiB, and execution to three minutes. Cancel kills the launched process; an
already incurred usage charge or subscription allocation cannot be refunded.
The agent's own saved authentication determines billing. Jamstudio strips inherited
API-key/token environment variables and never silently substitutes its stored API
keys. Saved CLI API authentication can still be metered; subscription use is not
an unlimited or general-purpose API entitlement.

Official documentation checked 2026-09-04:
[Codex authentication](https://developers.openai.com/codex/auth),
[Codex non-interactive mode](https://developers.openai.com/codex/noninteractive),
[Claude headless mode](https://code.claude.com/docs/en/headless),
[Claude CLI flags](https://code.claude.com/docs/en/cli-reference),
[Claude subscription update](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).
Anthropic's June 15 update currently pauses the announced billing change and says
SDK/headless/third-party usage continues to draw from plan limits. Earlier docs
with different restrictions must not be treated as a promise about this account.
Recheck policy and account access before wider distribution.

## Evidence

Synthetic CLI envelopes and model catalogs are checked in fixtures. Normal CI is
offline and never invokes a live model. The ignored Rust acceptance check requires
`JAM_LIVE=1` and an explicit `--ignored` invocation. It passed on this Windows host
using the installed Codex CLI signed in with ChatGPT. Claude Code is not installed
here, so its live acceptance, along with the Mac owner's complete session, remains
pending. A future App Server or MCP integration needs a concrete capability that
this bounded proposal path cannot provide; it is not scaffolded now.
