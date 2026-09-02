# ADR 0005: Files are truth, SQLite is a cache

**Status:** Accepted, 2026-09-02

## Context

Songs, stems, takes and exports are large audio files with metadata. A database as the source of truth makes corruption catastrophic, makes tests fixture-hostile, and hides the guitarist's data from him and from the builder.

## Decision

Everything the guitarist owns lives as folders under `~/JosefinesJamstudio/` with a JSON manifest per entity (`song.json`, `session.json`, `take.json`) next to its WAVs. SQLite (`index.sqlite`) is an index rebuilt from the files at any time; deleting it is harmless. Every manifest carries `schemaVersion`, unknown fields are preserved on rewrite, and each version bump has one migration function.

## Consequences

- Tests are fixture folders; the builder can inspect its own output with a file browser.
- Exports and backups are copying folders.
- The index must be rebuilt on startup when its version differs from the app's, and lazily when a manifest's mtime changed.
- Manifests are written atomically (write to a temp file, rename) and takes write their manifest on stop and every 10 seconds while recording, so a crash loses at most 10 seconds of metadata and no audio.
