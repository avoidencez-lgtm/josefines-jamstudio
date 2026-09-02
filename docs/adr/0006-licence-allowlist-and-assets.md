# ADR 0006: Apache-2.0, a permissive dependency allowlist, and assets outside git

**Status:** Accepted, 2026-09-02 · **Decider:** Vegar

## Context

The repository is public. Vegar chose Apache-2.0 (as for his other projects). Some attractive audio libraries are GPL (aubio, Rubber Band) and many sample packs have unclear licences.

## Decision

- Repository licence: Apache-2.0.
- Dependency allowlist enforced by `cargo deny` and `scripts/check-js-licences.mjs`: Apache-2.0, MIT, BSD-2/3-Clause, ISC, 0BSD, Zlib, Unicode, CC0. MPL-2.0 only for a crate with no alternative (currently `symphonia`), recorded with a comment in `deny.toml`. GPL, LGPL and AGPL never enter the tree.
- Consequences for library choice: `pitch-detection` instead of aubio, Signalsmith Stretch (MIT) instead of Rubber Band, own chroma and onset code.
- Audio assets are never committed. They are published as GitHub Release assets with SHA-256 checksums, fetched on first run, and every pack has a licence section in `assets/LICENSES.md`. Only CC0, CC-BY (with attribution shown in the app) or an explicitly redistributable permissive licence.

## Consequences

- The repository stays small and clonable; the app downloads about tens of megabytes on first run with progress and verification.
- Every new dependency is checked in CI; an exception is a visible diff in `deny.toml`.
- Test fixtures under `tests/fixtures/audio/` are seconds long, synthesised or self-recorded, with a README stating their origin.
