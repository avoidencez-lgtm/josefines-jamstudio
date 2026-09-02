# Focusrite Scarlett 2i2

The generation is unconfirmed (Vegar to check the front panel: 4th gen has a "Auto" gain button and a USB-C port; 3rd gen has a USB-C port but no Auto button). Facts verified 2026-09-02.

## 4th generation (2023 onward)

- 24-bit up to 192 kHz; 2 mic/line/instrument inputs (69 dB gain range), 2 balanced line outs, headphone out, USB-C (USB 2.0). ✅ https://focusrite.com/products/scarlett-2i2
- **Loopback** (stereo): captures playback 1/2 by default; "Send Direct Monitor Mix to Loopback" in Focusrite Control 2 also captures the analogue inputs. ✅ https://support.focusrite.com/hc/en-gb/articles/13229216604562-Scarlett-4th-Gen-using-Loopback
- **Direct Monitor** with a software-adjustable mix in Focusrite Control 2. ✅
- Air: Presence and Harmonic Drive. Dynamic range about 120 dB. ⚠️
- Windows: ASIO through the Focusrite Control 2 driver; macOS: Core Audio (class compliance for 4th gen assumed, not explicitly confirmed ⚠️).
- Latency: vendor claim 2.74 ms round trip at 96 kHz; realistic 3 to 5 ms at small buffers. ⚠️

## 3rd generation

No loopback, hardware Direct Monitor switch only, Air = Presence only, dynamic range about 104 to 108 dB. ✅ https://support.focusrite.com/hc/en-gb/articles/207546775-Does-the-Scarlett-range-have-loopback

## Role in Josefines Jamstudio

The HeadRush is the primary interface (it carries the DI and the processed signal in one cable). The Scarlett is useful for:

1. **Recording the real amp**: Black Spirit Red Box AE+ XLR → Scarlett input 1 (the `guitar_amp` track), optionally a clean DI split → input 2 (setup B in [cabling.md](cabling.md)).
2. **A microphone preamp for Jo** (any XLR mic) if the Mac has no usable built-in mic.
3. **Latency calibration loopback** (output → input cable, or 4th-gen Loopback) if the HeadRush loopback is inconvenient.

Do not run both interfaces at once on Windows (one ASIO driver at a time). On macOS an Aggregate Device is possible but adds jitter; the app does not require it because the mic can be a separate input device on its own clock ([ARCHITECTURE §4.6](../ARCHITECTURE.md)).
