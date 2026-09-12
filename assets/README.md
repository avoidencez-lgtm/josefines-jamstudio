# Assets

No audio is committed to this repository. Sample packs (the drum kit, the SoundFont for bass and comp, test fixtures larger than a few hundred kilobytes) are published as assets on a GitHub Release (`assets-v1`, `assets-v2`, ...) and fetched by the app on first run into `~/JosefinesJamstudio/assets/<id>/` with a SHA-256 check.

## Files that live here

- `manifest.json` (from M1b): the list of packs the app knows about. One entry per pack:

```json
{
  "schemaVersion": 1,
  "packs": [
    {
      "id": "standard-rock-kit",
      "version": "2.0.0",
      "url": "https://github.com/avoidencez-lgtm/josefines-jamstudio/releases/download/assets-v1/standard-rock-kit-acoustic.zip",
      "sha256": "e1754fe4d54e84b106469eb645d1b1ad2e5555b7396cee31112424b4a408ee94",
      "bytes": 5196335,
      "licence": "CC0-1.0",
      "attribution": "Compact CC0 acoustic kit derived from Virtuosity Drums",
      "contents": "kit.json + wav"
    },
    {
      "id": "freepats-bass-comp",
      "version": "1.0.0",
      "url": "https://github.com/avoidencez-lgtm/josefines-jamstudio/releases/download/assets-v1/freepats-bass-comp.zip",
      "sha256": "73cd2192f8f6422602e77c150e127c556214677a31e9c1440e28c9b96892465f",
      "bytes": 11286874,
      "licence": "CC0-1.0",
      "attribution": "FreePats Finger Bass YR and FM Piano 2",
      "contents": "bass.sf2 + comp.sf2"
    }
  ]
}
```

- `LICENSES.md` (from M1b): one section per pack with the licence name, the licence text or a link to it, the author and the source URL. A pack without a section here does not ship.

## Rules

1. Only CC0, CC-BY (with attribution shown in Settings → About), or a permissive licence explicitly allowing redistribution. No CC-BY-NC, no CC-BY-SA, no "free for personal use", no GPL-with-exception until a human has read the exception.
2. Audit every pack individually. Aggregator lists are hints, not licences. Keep a copy of the licence file inside the zip.
3. The kit format is `kit.json`. SoundFonts unpack as `bass.sf2` and `comp.sf2` under `assets/freepats-bass-comp/`.
4. Test fixtures under `tests/fixtures/audio/` are small (seconds), synthesised or self-recorded, and carry a README with their origin.
