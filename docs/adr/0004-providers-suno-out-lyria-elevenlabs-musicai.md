# ADR 0004: Providers, and why Suno is out

**Status:** Accepted, 2026-09-02

## Context

Vegar asked for Suno, ElevenLabs and an LLM by API. Research on 2026-09-02 ([docs/plan/04-research.md](../plan/04-research.md)) found: Suno has no official developer API (a partner-program intake only); third-party Suno APIs reverse-engineer private endpoints and carry ban and outage risk; Udio has no API; Google Lyria RealTime is the only realtime, steerable music API; ElevenLabs offers Music (with `force_instrumental`), stem separation, Scribe STT and Flash TTS; Music.ai (the Moises developer platform) offers beats, chords, key, sections and stems by the minute.

## Decision

| Need | Provider in v1 | Alternative behind the same trait |
|---|---|---|
| Live steerable band | Google Lyria RealTime | none (unique) |
| Full generated tracks | Google Lyria 3, ElevenLabs Music | Stable Audio (backlog) |
| Stems | ElevenLabs stem separation | Music.ai, LALAL.ai, local htdemucs (backlog) |
| Beats, chords, key, sections | Music.ai | local `jam-dsp::offline` fallback (low confidence) |
| STT | ElevenLabs Scribe | Gemini Live (backlog) |
| TTS | ElevenLabs Flash v2.5 | Gemini Live (backlog) |
| LLM | Gemini 3.8 Flash | Claude, OpenAI, Kimi (one provider_fetch target each, backlog) |

Suno and Udio are not integrated. Band mode (chart-following sequencer) and Lyria mode (generative stream) are separate, mutually exclusive music sources: Lyria's bpm is a request, not a clock, and nothing attempts to synchronise Lyria to a chart.

## Consequences

- Two keys cover v1: Google Gemini (LLM, Lyria RealTime, Lyria 3) and ElevenLabs (STT, TTS, Music, stems), plus Music.ai for analysis.
- Lyria RealTime is paid-tier only with unpublished pricing: the app has a spend meter, per-session and monthly caps, and a confirm dialog.
- If Suno ever ships an official API, it is one `TrackGenerator` implementation away ([EXTENDING.md](../EXTENDING.md)).
- Every provider is optional: the product survives with any provider disabled (Band mode and the local analysis fallback need no network).
