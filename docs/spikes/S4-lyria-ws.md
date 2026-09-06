# S4: Can the native Rust path sustain Lyria's WebSocket protocol?

**Date:** 2026-09-06 · **Timebox:** first of at most two sessions ·
**Experiment branch:** `spike/s4-lyria-ws` (deleted; reusable helper retained) · **Status:** transport prototype verified;
provider session and S4 acceptance remain unverified.

## Method

The previous S4 summary contained no live measurements or client implementation.
The reusable helper under `scripts/spikes/lyria-ws/` uses tokio-tungstenite 0.30.0,
rustls with native roots, and the application's actual SecretStore. Its dependency
graph is isolated from the app. It defaults to loopback and requires explicit
live/fixture flags for provider traffic. A fixed original instrumental prompt
avoids sending user music or private text during a future approved probe.

The local server checks setup acknowledgement and command ordering, then sends
stereo PCM in alternating text/binary WebSocket messages over two connections.
The client decodes and checks every sample. A separate specimen contains multiple
audio chunks. Malformed bytes, non-stereo frame lengths, unsupported MIME/rate
and credential-bearing HTTP error details are checked. This is an accelerated
protocol test, not an audio-device or network-jitter test.

## Numbers

| Measurement | Windows PC | Windows/macOS CI |
|---|---:|---|
| Synthetic audio duration | 600 seconds | Required before merge |
| Decoded stereo frames | 28,800,000 | Required before merge |
| Connections | 2 | Required before merge |
| PCM mismatches / dropped or duplicated frames | 0 / 0 | Required before merge |
| Default probe elapsed time | 4,757 ms | Reported by test output |
| Focused native tests | 3 passed | Required before merge |
| Real Google sessions | 0 | Never run in CI |

Local cargo-deny passes for the separate probe graph. Windows Application Control
blocked the local clippy-driver invocation (OS error 4551); CI must run the same
binary-target Clippy check. No execution-policy bypass was used. Application
tests and checks remain mandatory in addition to the probe.

## Protocol findings

The current [WebSocket reference](https://ai.google.dev/api/live_music) names
v1alpha `BidiGenerateMusic`, first-message setup, setupComplete before controls,
clientContent, musicGenerationConfig, playbackControl and audioChunks. The helper
uses these camelCase wire shapes; SDK function names are not wire fields.

There is a current documentation conflict. The [generation guide](https://ai.google.dev/gemini-api/docs/realtime-music-generation)
shows v1beta and an explicit 44.1 kHz example, while its technical section still
says 48 kHz. The raw reference remains v1alpha. The pinned [official JS music client](https://github.com/googleapis/js-genai/blob/987997719687049db02bc15629ff48087dbd3c1a/src/music.ts)
and [Python client](https://github.com/googleapis/python-genai/blob/c754ebf3973fde9894b24c2425cee67eb2d03b64/google/genai/live_music.py)
confirm the endpoint pattern, setup wrapper and playback-control strings. They
do not resolve the actual account endpoint, sample format or session lifetime.
The probe refuses format changes instead of silently interpreting 44.1 kHz or a
WAV container as raw 48 kHz PCM. The [pricing page](https://ai.google.dev/gemini-api/docs/pricing)
did not expose a Lyria RealTime price in this inspection; no free-use assumption
or spend estimate is made.

## Decision and remaining work

The standard Rust WebSocket path works against the local protocol server without
a JS relay or custom framing code. Retain that candidate and the helper for the
second S4 session. Do not claim a production Lyria adapter or choose a fallback
based on an untested Google connection. Actual setup/audio/config/reset responses,
session cap and rate limits still require an approved account test.

The application SecretStore reports `geminiKeyPresent: false` on this PC. The
user has been asked to provision it in Settings and approve one short probe;
no provider request or paid generation has run. Credentials must never enter
chat, source files or shell arguments. A future live probe records diagnostic
event metadata and a bounded WAV in a fresh external directory, with unknown
billing explicitly reported. It is not a monetary cap or a full wire recording.

After that evidence, M4 still needs the actual net adapter, bounded jitter/audio
bus, cancellation, reconnect/crossfade, config/reset count-in, spend enforcement,
Stage/Jo controls, mutual exclusion with band/reference playback and the full
ten-minute acceptance run. Those are V1 requirements. Friend-operated physical
rig acceptance remains V2; it does not replace these developer checks.

## Fixtures

`tests/fixtures/providers/lyria/protocol.json` is a **synthetic specimen** derived
from primary documentation. No provider transcript was captured. Never label it
as recorded Google output or use the loopback test to claim provider quality.
