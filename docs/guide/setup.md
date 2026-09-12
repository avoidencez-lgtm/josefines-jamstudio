# First-run setup

This is the guitarist's install and cabling guide. It does not claim a signed
release, a live Lyria stream, or owner hardware gates.

## Install

1. Download the Windows NSIS installer or the macOS `.dmg` from the GitHub
   Release. Bundles are **unsigned**.
2. Windows: run the installer. SmartScreen may warn because there is no signing
   certificate yet.
3. macOS: drag the app to Applications. Then right-click → Open, or run:

   `xattr -dr com.apple.quarantine "/Applications/Josefines Jamstudio.app"`

   Signing and notarisation are not configured until an Apple Developer account
   exists.

## Cabling

Follow [hardware/cabling.md](../hardware/cabling.md). Setup A (HeadRush USB
only) is the default. Guitar tone stays in the hardware. The app is never in
the monitoring path.

## First run in the app

Open **Settings → First run** and walk the list:

1. Audio devices: same interface for input and output. HeadRush dry DI is
   channel 3 in the UI (stored as channel 2).
2. Measure loopback with a cable, or enter the guitar offset. Five hardware runs
   ±2 samples remain owner gate 2 (V2).
3. Store provider keys under AI & models. Keys live in the OS keychain.
   Test this key stays not configured. Check this key status looks only in the keychain.
4. Rig: create a loopMIDI port named Jam Virtual (Windows) or enable the IAC
   Driver (macOS), then Check this virtual MIDI. HeadRush and Black Spirit are not
   claimed here.
5. Sample packs: `assets-v1` / `standard-rock-kit.zip` is published with a
   recorded SHA-256. `assets_ensure` downloads it only with `JAM_LIVE=1`.
   After unpack, the band plays that kit and the FreePats bass/piano
   SoundFonts. A missing pack stays on the synthetic kit or sine voices
   and says so.
6. Settings → Diagnostics: Reduced motion (Match the OS / Always reduce /
   Never reduce) is saved as `ui.reducedMotion`. Meter and playhead fps are
   rAF reports, not a 60 fps pass. Sample this idle CPU. is not a DESIGN 3 % pass.
   The tuner starts off so Stage shows tempo and bar; turn it on when needed.

## Troubleshooting

- Status shows Headless: start the desktop app without `JAM_HEADLESS=1`.
- Tuner silent: pick the guitar input and channel, then check the input meter.
- MIDI monitor empty: no port is open; messages are logged only.
- Lyria / Music.ai / take review / live voice: each command names the next
  step (key, `JAM_LIVE=1`, recorded provider fixture). Do not treat a fixture
  as a live pass.
