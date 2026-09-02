# Quickstart Guide: Josefine's JamStudio

Welcome to **Josefine's JamStudio** — your AI-powered desktop jam companion, bandmate, and guitar practice station.

---

## 1. Hardware Connections

### Audio Interface
- Connect your USB / Thunderbolt audio interface (Focusrite Scarlett, Universal Audio Volt / Apollo, MOTU M2/M4, SSL2+).
- Plug your electric guitar directly into the **High-Z / Instrument (Inst)** input on Channel 1 or 2.
- Connect your studio monitors or headphones to the interface outputs.

### Hardware Rig Modelers (Optional)
- Connect your modeler (Neural DSP Quad Cortex, Line 6 Helix, Kemper Profiler, Fractal Axe-Fx III, Hughes & Kettner Black Spirit 200) via standard USB-MIDI.
- Navigate to the **Rig** screen in JamStudio, choose your hardware modeler profile, and JamStudio will automatically switch scenes/presets at song section boundaries!

### MIDI Foot Controller (Optional)
- Connect any MIDI pedalboard (FCB1010, Morningstar MC6/MC8, Blackstar Live Logic) to trigger Jo Push-to-Talk or cues hands-free while playing.

---

## 2. One-Click Latency Calibration
To ensure your guitar recording never flams against the rhythm section:
1. Plug a short 1/4" guitar cable from your interface output to the guitar input.
2. In the **Sessions** screen, click **Calibrate Latency**.
3. JamStudio fires a single Dirac impulse and cross-correlates the round-trip signal within $\pm 2$ samples, automatically aligning all future takes.

---

## 3. Meet Jo: Your AI Bandmate
- **Push to Talk**: Press `T` or hold the on-screen button to speak.
- **Hands-Free Control**: Ask Jo to:
  - *"Play a fast blues shuffle in E"*
  - *"Speed it up to 130 BPM"*
  - *"Mute drums and give me a crash on one"*
  - *"Switch my rig to lead crunch"*
  - *"Start recording a take"*
  - *"Follow my guitar volume and dynamics"*

---

## 4. Real Songs & Stem Separation
- In the **Songs** screen, import any MP3, WAV, FLAC, or AIFF song.
- JamStudio separates the track into 4 discrete stems: **Vocals, Drums, Bass, and Other**.
- Solo or mute any stem (e.g. mute original guitar or drums to play along).
- Adjust playback tempo from 0.5x to 1.5x with pitch-preservation to learn difficult solos.

---

## 5. Exporting Takes to Your DAW
- Finish your jam session in the **Sessions** screen.
- Click **Analyze Take** to see your timing accuracy, dynamics consistency, and intonation metrics.
- Click **Export DAW** to generate a package with:
  - 24-bit 48 kHz multi-track stems (`guitar_di.wav`, `band_mix.wav`, `master.wav`).
  - Standard MIDI File (SMF Type 1) containing tempo map, time signatures, and song section markers ready to drop into **Logic Pro, Reaper, Ableton Live, or Cubase**.