# S5: native Jo voice, implementation evidence

Updated 2026-09-05. This replaces the obsolete description of Web Speech and
TypeScript-owned audio. No live provider or headset acceptance is claimed.

## Decision and primary evidence

Use the existing Rust HTTP boundary and audio render worker. No speech SDK,
browser audio, Python process or new DSP implementation is needed.

- [ElevenLabs batch transcription](https://elevenlabs.io/docs/api-reference/speech-to-text/convert):
  multipart WAV, `model_id=scribe_v2`, response `text`; recordings must be at least
  100 ms. The second native input requests 16 kHz and preserves its negotiated
  WAV rate (8–192 kHz) instead of silently mislabelling device samples.
- [Speech conversion](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
  and the [official format table](https://github.com/elevenlabs/skills/blob/main/text-to-speech/SKILL.md):
  `eleven_flash_v2_5`, `output_format=pcm_24000`, signed 16-bit little-endian mono.
  Existing clip interpolation converts this at the engine's 48 kHz edge.
- [Voice search](https://elevenlabs.io/docs/api-reference/voices/search):
  `GET /v2/voices?page_size=100`. The UI permits a pasted voice ID beyond this page.

## Implemented flow

Jo AI hold button → native microphone capture → Rust Scribe request → transcript
through the existing text/tool dispatcher → actual outcome text → Rust Flash
request → speech bus. Review-required song edits still wait for Apply.
Only text and status cross IPC. Captured WAV and returned PCM stay in memory.

Capture has both a 20-second sample ceiling and a native stream-close timer.
Cancellation invalidates late results; device startup drains before another turn.
The network timeout is 30 seconds, response limits are 64 KiB for transcripts and
60 seconds for speech, and requests are not retried. Usage records model, status,
time and bytes without bodies or secrets; monetary estimates remain unknown.

Speech ducks the generated band by a configurable amount (default -9 dB), with
150 ms attenuation and recovery ramps. Guitar monitor and recorded dry/stem
signals remain unchanged. Speech uses the existing render-ahead output queue:
interrupting speech does not erase samples already queued for the device.

## Reproducible checks and remaining acceptance

- `cargo test -p jam-audio voice::tests --lib`: capture, PCM decoding, stream
  release and duck/recovery tolerance 0.0002 linear gain after 150 ms.
- `cargo test -p src-tauri net::voice --lib`: synthetic transcript fixture,
  loopback HTTP response limits/content type, body-free usage records.
- `cargo test -p src-tauri --test ipc_voice`: registered commands, missing capture,
  headless refusal and generation-bound cancellation through the real IPC table.
- `pnpm test tests/invariants/voice.test.ts`: release during startup, automatic
  stop, cancelled transcription/LLM, startup cancellation and actual-result speech.

The JSON fixture is authored from the documented response shape, not a recorded
provider response. The planned recorded
30-utterance script, provider-reported LLM tokens and first-audio latency measurement remain
M2 work. A live headset run must record ten release-to-first-audio measurements,
their median and duck recovery; the target is median ≤2.5 s. Full-response TTS
buffering is the present ceiling; stream PCM if live evidence misses that target.

## Stage, global key and MIDI controls (2026-09-06)

The [official Tauri shortcut guide](https://v2.tauri.app/plugin/global-shortcut/)
and [Rust shortcut API](https://docs.rs/tauri-plugin-global-shortcut/latest/tauri_plugin_global_shortcut/struct.Shortcut.html)
confirm native Pressed/Released events and portable modifier parsing. The plugin
is a Rust-only dependency here; its generic JS commands are not exposed. No OS
shortcut registers until the user enables one. Headless registration is refused.
Global key repeats are coalesced through the same tested voice lifecycle. MIDI
uses existing learned presses because Program Change has no release edge. Stage
and Jo AI now share the conversation implementation and review boundary.

Automated checks prove command registration/validation, state transitions and
shared dispatcher outcomes. They do not prove physical keyboard interception,
MIDI wiring, microphone permissions or paid-provider latency on the user's rig.

## Submitted speech usage (2026-09-06)

The [official API pricing page](https://elevenlabs.io/pricing/api) and
[billing documentation](https://elevenlabs.io/docs/overview/administration/billing)
were checked on 2026-09-06. Speech recognition is priced by duration and Flash/Turbo
by characters; account plans and offers affect rates. The app assumes no rate:
the user supplies nullable USD/hour and USD/1000-character estimates in voice setup.
Submitted seconds and Unicode scalar character counts are measured locally and
logged without text/audio. Failed attempts remain in totals; charges may have
occurred. The estimate is fixed per request and excludes allowances, taxes and
voice-specific charges. This is not a provider invoice or a live billing check.
