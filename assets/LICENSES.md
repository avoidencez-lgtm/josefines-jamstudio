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
- **Source**: [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums)
  by Versilian Studios and Karoryfer Samples, pinned at commit
  `9f04cf9a734527edfbb0a4eee1f674e45bbf71bc`.
- **Published**: GitHub Release `assets-v1` /
  `standard-rock-kit-acoustic.zip`, SHA-256
  `e1754fe4d54e84b106469eb645d1b1ad2e5555b7396cee31112424b4a408ee94`.
- **Conversion**: selected overhead, kick-mic and snare-mic recordings converted
  to 48 kHz mono PCM. Kick and snare combine close and overhead microphones;
  the middle tom is a three-semitone derivative of the high tom. The archive
  retains the upstream CC0 licence and exact source commit.
- **Included**: 11 instruments with three velocity bands and two variations per
  band: kick, snare, closed/open/pedal hi-hat, crash, ride, high/mid/low tom and
  sidestick; plus `kit.json`, `LICENSE.txt` and `README.txt`.
- **Rebuild**: `pwsh scripts/build-acoustic-kit.ps1 -OutputZip <path>`.

## freepats-bass-comp
- **License**: CC0-1.0
- **Source**: FreePats, redistributed on GitHub Release `assets-v1` /
  `freepats-bass-comp.zip`.
  SHA-256 `73cd2192f8f6422602e77c150e127c556214677a31e9c1440e28c9b96892465f`.
- **Attribution**:
  - `bass.sf2` — Finger Bass YR 2019-09-30, samples by Andrea Biasior
    (`reusenoise@gmail.com`) from a Yamaha RBX, FreePats edits by Roberto
    (`roberto@zenvoid.org`). https://freepats.zenvoid.org/ElectricGuitar/clean-electric-bass.html
  - `comp.sf2` — FM Synthesized Piano #2 2016-11-12 by Roberto / FreePats,
    recorded from Hexter (DX7-style). https://freepats.zenvoid.org/ElectricPiano/synthesized-piano.html
- **Included**: `bass.sf2`, `comp.sf2`, `LICENSE.txt` (CC0), `README.txt`

## Runtime music-video media (not bundled)

Film imports and generated outputs are stored in the user's media library, never
committed or distributed as application assets. Generation receipts record the
provider/model, prompt and resulting asset ID. Rights depend on the source media,
provider account terms and selected model licence; the application does not label
these files CC0 or grant additional rights. FFmpeg, ComfyUI and open-model weights
are separately installed by the user and are not bundled. See
[ADR 0008](../docs/adr/0008-music-video-workspace.md).
