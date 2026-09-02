# HeadRush Pedalboard (original)

Facts verified 2026-09-02 from the product page, user guide and HeadRush support articles. Legend: ✅ vendor source, ⚠️ secondary or inferred, ❓ unverified (owner gate).

## Identity

7-inch touchscreen floor modeller running the Eleven HD Expanded DSP engine. Latest firmware **2.7 (August 2024)**; no later release found. There is **no desktop editor** for this model (the editor shipped with firmware 4.0 is for Prime, Core and Flex Prime only). ✅ https://www.headrushfx.com/products/pedalboard/index.html · https://support.headrushfx.com/en/support/solutions/articles/69000844140-is-revalver-5-a-software-editor-for-the-headrush-prime-hardware-

## USB audio (the app's main input and output)

- **4 in / 4 out, 24-bit, up to 96 kHz.** ✅
- To the computer: **ch 1 = master L (full rig), ch 2 = master R, ch 3 = mono guitar input with no effects (dry DI), ch 4 = duplicate of ch 3.** ✅ (user guide, USB section)
- From the computer: **ch 1/2 are routed straight to the master outputs and the phones output** without passing through the rig (the band's return path); **ch 3 = reamp input** into the rig; ch 4 unused. ✅
- Reamp requires Global Settings → USB Mode → Reamp; the computer's sample rate must match the unit (48 or 96 kHz). ✅
- USB audio record and reamp were enabled in firmware 2.7; make sure the unit is on 2.7. ⚠️ https://support.headrushfx.com/en/support/solutions/articles/69000858121-headrush-pedalboard-gigboard-and-mx5-what-s-new-in-firmware-v2-7-
- macOS: class-compliant, no driver. Windows: the HeadRush ASIO driver is required; WASAPI likely exposes stereo only. ⚠️ https://support.headrushfx.com/en/support/solutions/articles/69000801171-headrush-pedalboard-frequently-asked-questions
- USB round-trip latency: not published. ❓

Implication: analyse channel 3 (clean DI) for the tuner, energy and offline pitch/timing; record channels 1/2 as the keeper "amp" track; send the band to return channels 1/2. Owner gate 1 confirms the channel map on the Mac.

## MIDI

- 5-pin **MIDI In and MIDI Out** (no dedicated Thru). ✅
- **Receives Program Change** (each rig has a "MIDI Prog" number 0 to 127) and **Control Change**; incoming CC can toggle blocks and simulate footswitch presses, assigned per rig on the Hardware Assign page. There is no fixed factory CC chart: the mapping is user-defined per rig. ✅/⚠️
- **Accepts incoming MIDI Clock** to sync time-based effects and the looper. ✅ https://support.headrushfx.com/en/support/solutions/articles/69000823523-headrush-fx-setting-internal-and-external-midi-clocks
- **MIDI Out sends Program Change only** (on rig change), not CC. ⚠️ https://support.headrushfx.com/en/support/solutions/articles/69000822866-headrush-the-5-pin-midi-out-port-explained
- **No USB-MIDI.** USB is audio and mass storage only. ⚠️ (inferred from support articles and the spec; owner gate 5 confirms by checking the OS MIDI device list)

Implication for the rig profile (`rigs/headrush-pedalboard.json`): programs 0 to 127 with user-entered rig names; CC numbers learned per rig in the Rig screen ("learn" mode); send MIDI clock when `sendClock` is on; the HeadRush MIDI Out can drive PTT or scene feedback by Program Change numbers (a rig footswitch would also change his tone, so a dedicated pedal is better for PTT).

## Other I/O

1/4-inch instrument in; **3.5 mm stereo Aux In**; 1/4-inch headphone out; 2 × balanced XLR out with ground lift; 2 × 1/4-inch TRS out switchable amp/line; **stereo FX loop send/return** with a Rack/Stomp switch; expression pedal input; external footswitch support. ✅

## Looper

20 minutes, record/overdub/peel, **imports and exports WAV and MP3** (a file-based integration path for backing loops). ✅

## What users complain about

The missing desktop editor is the long-standing top complaint. ⚠️ https://www.musicradar.com/reviews/headrush-pedalboard

## Owner checks

- Firmware is 2.7 (Global Settings → About).
- USB Mode is the default (not Reamp) for normal sessions; Reamp only when re-amping a DI take through the rig (backlog feature).
- Whether "HeadRush Pedalboard" appears in Audio MIDI Setup as a MIDI device (expected: no).
