# Spike S4: Generative AI Music Streaming & Live Prompt Steering

## Summary
Josefine's JamStudio allows guitarists to jam over live generative AI music streams (Google Lyria RealTime, ElevenLabs Music) alongside the built-in band engine.

## Provider Abstraction & Seams
1. **Zero-Drop Ring Buffer Handoff**:
   - The streaming client runs on a separate worker thread or async runtime.
   - Decoded 48 kHz stereo PCM frames are fed into a lock-free `rtrb` ring buffer.
   - Audio render thread consumes from the buffer or outputs silence if the buffer underflows, avoiding audio device stalling or xruns.
2. **Offline Synthetic Fallback**:
   - `MockAiMusicProvider` synthesizes procedural ambient/groove audio deterministically from the prompt text seed.
   - Guarantees 100% test passing in headless CI and offline environments without network or API keys.
3. **Keychain Security**:
   - Provider API keys (`gemini` / `lyria`, `elevenlabs`) are stored exclusively in the OS Keychain via `SecretStore`.