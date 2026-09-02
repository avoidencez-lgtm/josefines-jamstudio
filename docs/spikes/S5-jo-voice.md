# Spike S5: Jo Voice Architecture & Tool Calling Dispatcher

## Summary
Jo is the AI bandmate in Josefine's JamStudio. She must understand guitarist jargon, execute audio engine commands with sample-accurate safety, and respond promptly with a musical, supportive bandmate persona.

## Invariants & Seams
1. **Audio Independence**:
   - Voice STT and LLM generation NEVER run inside the high-priority audio callback or render thread.
   - Rust engine provides audio telemetry and executes atomic IPC commands; TypeScript handles STT transcription, LLM tool resolution, and TTS rendering.
2. **Tool Seams**:
   - `transport_play`, `transport_pause`, `transport_stop`, `transport_set_tempo`
   - `band_set` (style, intensity, parts muting, follow_energy)
   - `band_cue` (fill, crash, stop, ending)
   - `band_load_chart` (chart presets)
   - `recorder_start`, `recorder_stop`
3. **Offline & Test Fallback**:
   - If no cloud API key (Google Gemini / OpenAI / ElevenLabs) is present in the secure keychain, Jo uses an offline semantic intent matcher (`jam-intent`) and Web Speech synthesis for zero-network determinism in unit tests and offline jams.