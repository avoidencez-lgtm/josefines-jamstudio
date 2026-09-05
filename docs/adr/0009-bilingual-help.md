# ADR 0009: English and Norwegian Bokmål help

Status: accepted.
Date: 2026-09-05.

## Decision

The owner explicitly requested full documentation in English and Norwegian and
accepted English/Bokmål help inside the app. This supersedes invariant 10's
English-only scope for the manual and in-app help only. Code, commits, main UI
labels and other project documentation remain English.

`docs/guide/manual.json` is the shared source for both languages. Changes to help
content update both translations; `scripts/export-manual.mjs` produces the two
Markdown manuals. Translation coverage and export freshness remain tested.

This records the existing owner-authorized exception; it does not authorize
translating the entire interface or introducing a second documentation system.
