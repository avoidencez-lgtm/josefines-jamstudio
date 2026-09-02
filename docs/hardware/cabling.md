# Cabling

Two proven setups plus the MIDI chain and the microphone. Setup A is the default; it needs one USB cable. Numbers refer to the HeadRush USB channel map in [headrush-pedalboard.md](headrush-pedalboard.md).

## Setup A: HeadRush only (default)

```
Guitar ──► HeadRush IN
HeadRush MAIN OUT (TRS, amp level) ──► Black Spirit 200 (front input or FX return, his choice) ──► Vox 4x12
HeadRush USB ◄──► Mac
   Mac receives   ch1/2 = processed guitar, ch3 = dry DI
   Mac sends      ch1/2 = band, song, Lyria, Jo, click  → HeadRush master outs + headphones
```

- Headphone jam: HeadRush PHONES carries the guitar (zero latency, processed) plus everything the app sends. This is the premium experience.
- Room jam: the band comes out of the HeadRush master outs together with the guitar; if the guitar should only go to the amp, use the HeadRush's output routing to keep the return on the XLR outs to monitors and the TRS out to the amp (configure once in the HeadRush global settings; verify at owner gate 3).
- App settings: input device HeadRush, `guitarChannel` = 2 (channel 3 in HeadRush terms), output device HeadRush, output channels 1/2. HeadRush USB Mode = default (not Reamp).

## Setup B: real amp recording through the Scarlett

```
Guitar ──► HeadRush ──► Black Spirit 200 ──► Vox 4x12
Black Spirit RED BOX AE+ (XLR) ──► Scarlett input 1        (amp track with cabinet emulation)
HeadRush USB ch3 ──► Mac                                   (DI for analysis)   OR   a DI box split ──► Scarlett input 2
Mac ──► Scarlett outputs ──► monitors / headphones          (band)
```

On macOS use the HeadRush as the input device for the DI and the Scarlett as the output device (two devices on separate clocks are fine for the app; the recorder stamps both against the output clock). Setup B is for keeper recordings of the real amp; setup A is for daily jamming.

## Silent practice

Black Spirit headphone out mutes the speaker. Feed the band into the Black Spirit **Aux In** (3.5 mm from the Mac headphone jack or the Scarlett) or jam in the HeadRush headphones per setup A.

## MIDI chain (rig control, M5)

```
Mac USB ──► USB-MIDI interface ──► Black Spirit MIDI IN (7-pin jack, 5-pin cable fits)
                                    Black Spirit MIDI OUT/THRU ──► HeadRush MIDI IN
Optional feedback: HeadRush MIDI OUT ──► USB-MIDI interface IN   (Program Change only)
```

- Black Spirit: MIDI channel 2, **Omni Off** (otherwise it acts on the HeadRush's messages). HeadRush: channel 1.
- Set each HeadRush rig's "MIDI Prog" number so the app can address it; name the rigs in the app's Rig screen.
- Send MIDI clock to the HeadRush only if its delays and looper should follow the app's tempo.

## Microphone for Jo

- MacBook built-in mic works for push-to-talk at moderate volume. Next to the Vox, use a headset mic or a dynamic mic on the Scarlett (input 2). Select it as `micDeviceId` in Settings; it is a separate device on its own clock.
- Push-to-talk: a dedicated pedal (Bluetooth page-turner sending a key) or the on-screen button or a keyboard key. Do not repurpose HeadRush rig footswitches for PTT unless the rig change is intended.

## Latency calibration loopback

Once per device: connect a cable from a HeadRush TRS output to the guitar input (or use the Scarlett's Loopback on 4th gen), run Settings → Audio → Calibrate, then remove the cable. The app stores the offset per device.

## Checklist before a session

- HeadRush on firmware 2.7, USB Mode default, sample rate 48 kHz.
- Mac: HeadRush selected in and out in the app, buffer 256.
- Black Spirit: Omni Off, channel 2, presets saved to the numbers used in scenes.
- USB-MIDI interface plugged in before the app starts (the Rig screen lists ports at startup and on refresh).
