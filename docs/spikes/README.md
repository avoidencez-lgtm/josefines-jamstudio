# Spikes

A spike is a time-boxed experiment on a throwaway branch (`spike/<id>-<slug>`, never merged) that answers one architectural question. Its only lasting output is a findings file in this folder, merged through a normal docs PR, plus any scrubbed fixtures it captured under `tests/fixtures/`.

The questions, timeboxes and fallbacks for S1 to S5 are in [../plan/03-build-plan.md](../plan/03-build-plan.md#spikes).

## Template (`S<n>-<slug>.md`)

```markdown
# S<n>: <question in one sentence>

**Date:** YYYY-MM-DD · **Timebox:** <n> session(s) · **Branch:** spike/S<n>-<slug> (deleted) · **Author:** DeepMind Antigravity

## Question
<the exact question from the build plan>

## Method
<what was built or measured, on which machine and CI runners, with which versions>

## Numbers
| Measurement | Windows PC | windows-latest | macos-latest |
|---|---|---|---|
| ... | ... | ... | ... |

## Findings
<bullet facts, each verifiable from the numbers or a linked CI run>

## Decision
<the option chosen and the fallback rejected, in one paragraph; the build-plan task it unblocks>

## Fixtures captured
<paths under tests/fixtures/, what was scrubbed>

## Open questions
<anything still unknown, and who settles it>
```

## Rules

- Never extend a timebox without Vegar's say; record what was learned and the fallback chosen.
- Numbers, not adjectives. "Fast enough" is not a finding; "0 dropouts in 600 s at 188 KB/s, 2.1 % CPU" is.
- Link the CI run URLs for anything measured on a runner.
- A spike may leave a helper under `scripts/spikes/` if a later task reuses it; everything else stays on the deleted branch.
