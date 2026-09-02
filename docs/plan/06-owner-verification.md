# Owner verification gates

These can only be proven on the guitarist's Mac with the real rig. The builder lists them as **pending owner** in the PR and the status board; Vegar and the guitarist tick them here (with the date and the build tag) after running the procedure. A milestone that names a gate is not ✅ until the gate is ticked or Vegar explicitly accepts it as pending.

Before starting: install the build from the GitHub Release (see `docs/guide/setup.md` from M7, or run a CI bundle artifact before that), cable the rig per [../hardware/cabling.md](../hardware/cabling.md), and open Settings → Diagnostics to note the version.

| # | Gate | Procedure | Expected | Blocks | Ticked |
|---|---|---|---|---|---|
| 1 | HeadRush enumerates with 4 inputs and 4 outputs on macOS | Settings → Audio: select "HeadRush Pedalboard" as input and output | Channel picker shows 4 inputs; channel 3 meter moves with the dry guitar while channel 1/2 meters show the amp'd tone; playing the test tone is heard in the HeadRush headphone jack | M0 | ☐ |
| 2 | Latency calibration is stable | Connect a cable from a HeadRush output to the guitar input (or use the Scarlett loopback), run calibration 5 times | `roundTripFrames` differs by at most ±2 samples across runs, confidence high | M1e | ☐ |
| 3 | Band in headphones without doubling | Play the 12-bar blues at working volume with the guitar through the amp | Band is heard on the HeadRush return path, guitar is heard only once (no software monitoring), no lag between pick and tone | M1c | ☐ |
| 4 | Feel: lock to the click | Play with the click at 120 bpm for 60 seconds | No perceptible drift; recorded DI onsets in the take analysis show a stable mean offset | M1e / M6 | ☐ |
| 5 | Rig control by MIDI | USB-MIDI interface → Black Spirit MIDI In (Omni off, channel 2) → Out/Thru → HeadRush MIDI In (channel 1); send scenes from the Rig screen | HeadRush changes rig on Program Change; Black Spirit changes preset on Program Change and gain on the CC; no feedback loop; the app's monitor shows what was sent. Also note whether the HeadRush appears as a USB-MIDI device in Audio MIDI Setup (expected: no) | M5 | ☐ |
| 6 | Push-to-talk with the amp loud | Hold the PTT pedal or key while the Vox is at rehearsal volume, say "blues in A, ninety, shuffle" | Transcript is correct at least 8 times out of 10; chart, key and tempo change; Jo confirms | M2 | ☐ |
| 7 | Jo audible with ducking | Ask Jo to explain the turnaround while the band plays | Band ducks, Jo's voice is clear in headphones, band recovers; round trip under 2.5 s median over 10 turns (the Stage shows the figure) | M2 | ☐ |
| 8 | Lyria continuous | Lyria mode, 10 minutes, one bpm change halfway | No gap over 300 ms except the count-in at the bpm change; reconnect at the session cap is inaudible or a short crossfade | M4 | ☐ |
| 9 | Stems open in Logic aligned | Export a 5-minute take, drag the WAVs into Logic Pro 12 at bar 1 | All stems start together, DI and band aligned, drift under 1 ms at the end | M6 | ☐ |
| 10 | Tempo map and markers in Logic | File → Open the exported `tempo.mid` in Logic, then drag the stems | Logic shows the tempo changes and the section markers at the right bars | M6 | ☐ |
| 11 | Minus-guitar on a real song | Import one of his songs, mute the guitar stem | Residual guitar is at least 6 dB down and the mix is usable to jam over; chords on screen match what he hears | M3 | ☐ |

Record here what was measured (build tag, date, numbers, surprises):

- 
