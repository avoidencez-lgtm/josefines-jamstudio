# Hughes & Kettner Black Spirit 200 (head)

Facts verified 2026-09-02 from the manual (via ManualsLib), the H&K product pages and retailer specs. The CC map below **must be re-checked against the official H&K manual PDF before it is encoded** in `rigs/black-spirit-200.json` (M5 task) and again at owner gate 5. Legend: ✅ vendor source, ⚠️ secondary source.

## Identity and I/O

- 200 W head with the analogue **Spirit Tone Generator** (component reconfiguration, not DSP), **Sagging** control, power soak **200 / 20 / 2 / 0 W**. ✅ https://hughes-and-kettner.com/product/black-spirit-200-floor/ (the floor page shares the platform facts)
- I/O: 1/4-inch instrument in, **3.5 mm Aux In**, **headphone out (mutes the speaker output for silent practice)**, **Red Box AE+ balanced XLR DI** with 8 cabinet emulations, 1/4-inch speaker out (8 to 16 Ω), serial **FX loop** send/return, **MIDI In / Out / Thru**, two TRS "Control 1 & 2" jacks for footswitches and expression pedals. **No USB.** ⚠️ https://www.bhphotovideo.com/c/product/1471355-REG/hughes_kettner_hk_black_spirit_200.html

## MIDI

- **MIDI In is a 7-pin jack** (standard 5-pin cables fit; the extra pins power the FSM-432 footboard). **MIDI Out/Thru forwards what arrives at MIDI In.** ✅ manual p. 9
- **Default channel 1 with Omni On.** Channel selectable on the unit. **Set Omni Off** when daisy-chaining, or the amp will act on messages meant for the HeadRush. ✅ manual p. 10
- **128 presets recalled by Program Change.** ✅
- Nearly every front-panel parameter is controllable in real time by **Control Change** (verify the table):

| CC | Function | CC | Function |
|---|---|---|---|
| 1 | Mod intensity | 28 | Delay volume |
| 4 | Delay time (128 steps, 51 to 1360 ms) | 29 | Reverb volume |
| 7 | Volume (soft) | 31 | Channel switch (4 sectors) |
| 9 | Mute | 52 | Mod FX on/off |
| 12 | Mod FX type | 53 | Delay on/off |
| 20 | Gain (soft) | 54 | Reverb on/off |
| 21 | Bass | 55 | FX loop on/off |
| 22 | Mid | 56 | Gain (hard) |
| 23 | Treble | 57 | Volume (hard) |
| 24 | Resonance | 58 | Cabinet type |
| 25 | Presence | 59 | Sagging |
| 26 | Mod speed | 62 | Gate sensitivity |
| 27 | Delay feedback | 63 | Gate on/off |
| | | 64 | Boost on/off |

Source ⚠️ https://www.manualslib.com/manual/1700182/Hughes-And-Kettner-Black-Spirit-200.html?page=10 . "Soft" versus "hard" gain and volume: soft interpolates, hard jumps; treat both as 0 to 127 with clamps in the profile.

## Bluetooth

- App **"Black Spirit 200 Remote"** for iOS/iPadOS and Android: create, edit, save and share presets, unlimited libraries, real-time parameter control. ✅ https://apps.apple.com/us/app/black-spirit-200-remote/id1411337258
- **One Bluetooth connection at a time** (audio streaming or the app, from one device); pair by holding Boost for 3 s. ✅ manual p. 9
- H&K notes that Apple Silicon Macs need a Bluetooth-to-MIDI module for the app path. ⚠️
- The protocol is undocumented and no reverse-engineering project was found. Whether it is plain BLE-MIDI carrying the CC table above is unknown; a 30-minute sniff test is a backlog item. If true, wireless amp control from the Mac needs no interface.

## Implications for the app

- `rigs/black-spirit-200.json`: `midiChannel` 2 (HeadRush on 1), `programs` 0 to 127 with user names, `controls` from the verified table with min 0, max 127, sensible defaults, `supports.midiClock: false`.
- Scenes typically send a Program Change plus a few CCs (gain, volume, boost). Send the PC first, then CCs 20 ms later (the profile can declare a per-command delay if the amp needs it: verify at owner gate 5).
- Recording the real amp: Red Box AE+ XLR → Scarlett input 1 gives the cleanest amp track; the app treats it as the `guitar_amp` input when the Scarlett is the interface ([cabling.md](cabling.md) setup B).
- Silent practice: headphone out mutes the speaker; the band can be fed to the amp's Aux In from the computer, or heard in the HeadRush headphones ([cabling.md](cabling.md)).
