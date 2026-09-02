# Assets

No audio is committed to this repository. Sample packs (the drum kit, the SoundFont for bass and comp, test fixtures larger than a few hundred kilobytes) are published as assets on a GitHub Release (`assets-v1`, `assets-v2`, ...) and fetched by the app on first run into `~/JosefinesJamstudio/assets/<id>/` with a SHA-256 check.

## Files that live here

- `manifest.json` (from M1b): the list of packs the app knows about. One entry per pack:

```json
{
  "schemaVersion": 1,
  "packs": [
    {
      "id": "drums-basic-kit",
      "version": "1.0.0",
      "url": "https://github.com/avoidencez-lgtm/josefines-jamstudio/releases/download/assets-v1/drums-basic-kit-1.0.0.zip",
      "sha256": "<hex>",
      "bytes": 0,
      "licence": "CC0-1.0",
      "attribution": "<pack name> by <author>, <source URL>",
      "contents": "kit.json + wav"
    }
  ]
}
```

- `LICENSES.md` (from M1b): one section per pack with the licence name, the licence text or a link to it, the author and the source URL. A pack without a section here does not ship.

## Rules

1. Only CC0, CC-BY (with attribution shown in Settings → About), or a permissive licence explicitly allowing redistribution. No CC-BY-NC, no CC-BY-SA, no "free for personal use", no GPL-with-exception until a human has read the exception.
2. Audit every pack individually. Aggregator lists are hints, not licences. Keep a copy of the licence file inside the zip.
3. The kit format (`kit.json`) and the SoundFont program mapping are documented in `docs/ARCHITECTURE.md` §7 when M1b lands.
4. Test fixtures under `tests/fixtures/audio/` are small (seconds), synthesised or self-recorded, and carry a README with their origin.
