# Song finishing: evidence and implementation choices

Reviewed 2026-09-05. This pass supports finishing original songs within the existing studio. It does not add a DAW, a new provider dependency or an audio model.

| Primary source | Useful precedent | Implemented here | Boundary |
|---|---|---|---|
| [Logic Pro project alternatives](https://support.apple.com/en-euro/guide/logicpro/lgcpa158ef77/mac) | Named alternative project states sharing media | Each accepted finishing experiment preserves a named song version | Twenty song-data versions; audio files remain external |
| [Ableton Live comping](https://www.ableton.com/en/live-manual/12/comping/) | Assemble a preferred performance from recorded takes | Choose a compatible full-song take per arranged section, then reuse native guitar clips | Section intervals only, no waveform take lanes, stretching or crossfade editor |
| [Helio source and documentation](https://github.com/helio-fm/helio-sequencer/blob/develop/Docs/getting-started.md) | Versioned composition and focused editing | Compare an isolated arrangement variation and retain the previous state | Inspiration only; no Helio code or assets copied |
| [Codex authentication](https://learn.chatgpt.com/docs/auth) | Subscription login and API-key billing are separate supported paths | Manual explains the existing installed-agent connection and its limits | A ChatGPT subscription is not a general API key; no authentication bypass |

The distinctive combination is a structural review, a section-boundary loop, a lock-respecting contrast experiment and a recording comp in the same original-song workspace. No evidence establishes world-first novelty, and none is claimed.

## Decisions

- Review concrete document conditions, never invent a song-quality score. Identical band settings can be artistically intentional. Lyrics are optional.
- Contrast changes intensity only. Muted and locked parts stay unchanged. Create an independent section at one arrangement entry and retain its duration, repeats, lyrics, rig scene and chord sequence.
- A comp needs proof of the original's timing from its recording snapshot. Compare tempo, key, meter and the resolved chord sequence. Reject captures and insufficient/older snapshots with instructions to record again.
- Keep native playback, clip fades, recording and DAW export. The feature adds no audio code, dependencies, model fees or network requests.
- Preserve a named version before applying, reject stale previews and respect the existing limits. Absolute guitar positions remain explicit when the arrangement changes.
- Author one bilingual manual source; render it in the app and export Markdown using Node's standard library. A test detects missing rooms, translations, shortcuts and stale exports.
