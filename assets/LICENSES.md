# Sample Pack Licenses

## Bundled native audio import

Symphonia 0.6.1 (Project Symphonia Developers, MPL-2.0), Rubato 5.0.0
(HEnquist, MIT/Apache-2.0) and Tauri Dialog 2.7.3 (Tauri Apps Contributors,
MIT/Apache-2.0) are compiled into the desktop app. Symphonia is unmodified;
the application-owned M4A timing reader is separate code. Per-crate MPL
exceptions are recorded in `deny.toml`; no GPL decoder or FFmpeg binary is bundled.
Full notices and exact source locations are in [licenses](licenses/README.txt),
copied into the desktop bundle's `licenses/` directory. Cargo.lock pins all
transitive versions and registry source checksums. Test codec audio is generated
locally from synthetic tones and is never committed or bundled.

## Bundled native time-stretch code

- Signalsmith Stretch 1.3.2, commit `57b93f4e9206a089a45387eaa39bdc9f310d3308`: MIT,
  copyright 2022 Geraint Luff / Signalsmith Audio Ltd.
- Signalsmith Linear 0.3.1, commit `5668673560146a9cfe38c25315071e3fd68c8317`: MIT,
  copyright 2025 Signalsmith Audio.
- Headers and full licence notices are in `crates/jam-dsp/cxx/vendor/`. Sources
  and SHA-256 hashes are pinned in its `sources.json`, checked by
  `pnpm licenses:check`. No optional Accelerate/IPP/PFFFT backend is included.
- FFmpeg remains a separately installed user tool; it is not bundled.

## standard-rock-kit
- **License**: CC0-1.0 (Creative Commons Zero v1.0 Universal)
- **Attribution**: Public Domain multisampled acoustic drum kit
- **Included**: kick, snare, closed hi-hat, open hi-hat, crash, ride, toms

## Runtime music-video media (not bundled)

Film imports and generated outputs are stored in the user's media library, never
committed or distributed as application assets. Generation receipts record the
provider/model, prompt and resulting asset ID. Rights depend on the source media,
provider account terms and selected model licence; the application does not label
these files CC0 or grant additional rights. FFmpeg, ComfyUI and open-model weights
are separately installed by the user and are not bundled. See
[ADR 0008](../docs/adr/0008-music-video-workspace.md).
