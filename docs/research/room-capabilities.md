# Ten room capabilities — 2026-09-05

The next pass develops one usable workflow per room, focused on finishing original songs. It adds no packages, cloud GPU deployment or new paid model dependency. These are scoped songwriting aids, not a claim to replace a DAW or to have invented techniques no other software uses.

## Prior art and implementation decisions

- [Ableton Live: converting audio to MIDI](https://www.ableton.com/en/live-manual/12/converting-audio-to-midi/) describes monophonic melody conversion and the value of isolated source audio. Write borrows the workflow idea, using the existing local McLeod pitch tracker and Tonal harmony helpers. It sketches sustained notes; repeated attacks on one pitch can merge. It does not implement Live's transcription engine or polyphonic conversion.
- [Ableton Live: Session View](https://www.ableton.com/en/live-manual/12/session-view/) provides the reference for preparing musical material for performance. Stage's implementation is deliberately a chart setlist with explicit cueing, using native transport and count-in. It is not an audio clip launcher or an automatically advancing concert system.
- [Tonal's source and documentation](https://github.com/tonaljs/tonal) support the existing pitch and chord vocabulary. Harmonic discovery compares consecutive roots and chord qualities across keys. Results show exact shared movements, not a subjective song-quality score. No source code was copied into the repository.
- [DaVinci Resolve's editing overview](https://www.blackmagicdesign.com/products/davinciresolve/edit) supplies general editing-workflow context. Film's tempo-grid calculation is local project logic: internal cut positions round to a user-defined steady grid while the last cut stays fixed. This is not a claim that Resolve provides this exact algorithm or that audio onsets have been detected.

The three-perspective coach, reference form, arrangement brief, blind comparison, song tone snapshot and audio profiles combine existing Jamstudio operations into smaller workflows. Their value is integration with this artist's original, recordings and hardware. They are not marketed as unique inventions.

## Shipped scope

| Room | Capability | Deliberate boundary |
|---|---|---|
| Write | Extract/edit a monophonic note sketch; review chords; keep a separate section variation | 0.1–60 second excerpt from a ≤120 second, ≤64 MB WAV; 1–32 bars; 4/4; no automatic arrangement replacement |
| Stage | Persist, reorder, edit and cue a chart setlist | 32 entries; no automatic playback or advancement |
| Library | Find transposition-independent shared chord moves | Same meter; literal root/quality transitions; no acoustic similarity claim |
| Jo AI | One request returns composition, arrangement and performance experiments | Selected provider/installed agent; no audio; draft or keep only after review |
| Songs | Reference-labelled form from the artist's own chord phrase | Hand-mapped bars/energy; no guitar layers during timeline replacement; old sections retained |
| AI Music | Editable generation brief from current arrangement | No generation triggered; selected model/duration retained; 4,000-character brief ceiling, provider limits still apply |
| Film | Preview and apply cuts aligned to a tempo grid | Fixed total duration/trim starts; collapse rejected; renderer still validates footage |
| Sessions | Random A/B labels, identical guitar excerpts, reveal and favourite | Same chart/tempo; unity gain without loudness normalisation; no deletion |
| Rig | Song-bound profile/scene/controller snapshot and explicit recall | Known profile controls only; current port; section following disabled; partial MIDI failures reported |
| Settings | Named device/channel/rate/buffer profiles | 12 profiles; no keys; missing devices rejected before recall |

The room controls start collapsed and retain scratch input across room changes. Scratch inputs are session state; only kept song/media edits and saved preferences persist. Song mutations use named versions, Undo, recording/busy guards and preview fingerprints. Film uses its existing Undo and fingerprint. In-app help and generated manuals cover every addition in English and Norwegian Bokmål.

## Verification boundaries

Automated evidence is recorded in the release validation report. Native tests use an isolated headless Windows app, synthetic WAVs and a MIDI memory sink. The attempted coach-response interception failed because Tauri exposes a read-only invoke function. One real request through the signed-in Codex CLI succeeded and may have consumed subscription quota. This was disclosed, further live calls were stopped, and AgentRunner now requires JAM_LIVE=1 for headless/test execution. The returned response was used to verify drafting and saving notes without another request. Actual guitar/humming recognition quality, physical MIDI/latency, real audio-profile device switching, live provider output, and on-device Mac acceptance still need the musician's hardware/account. Unsigned preview installers are not a signed public release.
