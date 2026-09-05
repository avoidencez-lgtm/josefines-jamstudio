# ADR 0010: Remove the compiled-but-unbuilt M3/M4 code and its placeholder commands

Date: 2026-09-05. Status: accepted.

## Context

Milestones M3 (real songs: stems, analysis, stretch) and M4 (generative AI music)
are open on the status board. The tree still carried code from their first
attempts that no product path referenced: `jam-audio::ai_music` (a generator that
was never mixed into the output), `jam-audio::stems`, `jam-audio::calibration`,
`jam-dsp::stretch` and `jam-dsp::chord_detect`, plus `AiMusicEngine` in
`AppState`, five `ai_music_*` commands that could only flip that dead generator,
and four `song_*` commands that returned "not built" to a UI that never called
them (review finding F10 on #28, issue #42). `rustfft` was a dependency with no
user. Dead code that compiles is maintenance and licence surface, and it
contradicted the "dead code removed" line on the board.

## Decision

Delete the modules, the engine, the nine placeholder commands, their TypeScript
store slice, preview-engine stubs and contract types, and the unused `rustfft`
dependency. Bump `IPC_VERSION` from 1 to 2, because commands were removed
(ARCHITECTURE §5.1: a removal is a version bump and an ADR). The last `main`
commit that still contains the code is `aa2d4ce` (2026-09-05); M3 and M4 are
built from the plan in `docs/plan/03-build-plan.md`, and anything worth keeping
from the old attempts (the SOLA stretcher, the chromagram chord detector, the
Dirac loopback calibration) is recovered from that commit when its milestone
starts, behind the tests ARCHITECTURE §9.1 already specifies for it.

## Consequences

- No user-visible change: nothing in the UI reached these commands, and the
  Songs and AI Music rooms already run on the media workflows from #28.
- ARCHITECTURE §4.5, §5.2 (`song_*`, `lyria_*`, `analysis_*`) and §6 keep
  describing the target design; the "Preview build boundary" section says so.
- The verification table in §9.1 still lists the chroma, time-stretch and
  pitch-shift tests; they return with the modules, as tests of new code.
- The frontend contract test locks `IPC_VERSION = 2`.
