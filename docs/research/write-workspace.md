# Write workspace: prior art and implementation choices

Reviewed 2026-09-04. This is a focused review of official project documentation,
repository READMEs and API documentation, not a benchmark of musical quality or
an exhaustive survey. Features described below were verified in those sources;
the Jamstudio adaptations are our design decisions.

| Prior art | Verified idea | Applied in Write | Reuse boundary |
|---|---|---|---|
| [Helio](https://github.com/helio-fm/helio-sequencer), [documentation](https://docs.helio.fm/) | A lightweight sequencer explicitly prioritizing uncluttered composition and experimentation | Put the song map and selected musical material first; progressively disclose setup | GPL-3.0. Workflow inspiration only; no code, assets or dependencies copied |
| [Signal](https://github.com/ryohey/signal) | MIT web MIDI editor focused on early composition and sketching, with deliberately limited sound/effects scope | Separate Compose, Lyrics, Record & layers and Versions; keep the existing native engine | No source copied. Its Web Audio playback architecture is unsuitable for Jamstudio's Rust-only sound invariant |
| [Tonal](https://github.com/tonaljs/tonal), [scale module](https://github.com/tonaljs/tonal/tree/main/packages/scale) | Music-theory functions for notes, scales and chords | Use the already installed library for scale spelling, chord tones and shared pitch classes | Existing MIT dependency; no new package |
| [Hookpad guide](https://www.hooktheory.com/support/hookpad) | Chord palette, borrowed chords, secondary chords, progressions and recommendations based on its TheoryTab corpus | Local diatonic/parallel-key/dominant palettes with a concrete resolution target and preserved chord duration | Original implementation. No access to or claim of reproducing its learned recommendations or dataset |
| [Ableton Live 12 MIDI tools](https://www.ableton.com/en/live-manual/12/midi-tools/) | Distinguishes transformations of existing musical material from generators; scale-aware exploration | Explicit Rotate bars, Reverse bars and Repeat phrase, plus independent section variations and Undo | Concept inspiration only. These are chord-bar operations, not note-level MIDI transformations |

## What was built

- A song map displays arranged bar ranges, repeated sections, duration at the
  current tempo, and average unmuted band intensity. Width follows duration, with
  a minimum readable width and horizontal scrolling for long forms.
- A chord grid displays each bar's four-beat ruler and its actual chord durations.
  Selecting a cell targets a palette replacement without changing its duration.
  The bar field accepts existing chord syntax, including `Dm:3 G:1`; invalid
  edits are refused visibly and valid edits enter the existing Undo history.
- Harmony uses major/natural-minor triads, parallel-key borrowing and dominant
  sevenths resolving to non-diminished scale chords. Shared-tone counts are
  pitch-class intersections with the preceding chord, not a probability,
  voice-leading optimizer, guitar fingering or quality score.
- Make variation copies the selected section's chords, band settings, rig-scene
  reference and lyrics into an independent section. Existing repeated sections
  remain linked. The original is untouched and the change can be undone.
- Section energy changes only unlocked part intensities. The existing sparse,
  medium and full style patterns are still the actual sound source.
- Lyrics belong to section IDs, persist in the song JSON, and follow versions.
  Song Lab and installed/API assistants receive that text context. Reviewed lyric
  seeds append to a section; `write_notes` accepts optional `sectionId` for the
  same destination. A previous version is kept before AI edits.

## Deliberate limits

4/4, 40–240 BPM, 256 arranged bars, 64 sections, 128 form entries, 16 guitar layers,
20 named versions, 50 Undo entries and 12,000 UTF-16 code units per section lyric.
Mode changes the palette, not existing chord qualities. Changing key transposes
the band. Imported/recorded guitar keeps absolute bar positions and original
pitch/speed; the form editor says this explicitly.

No audio transcription, melody piano roll, syllable alignment, phonetic rhyme
model or note-level generative MIDI is claimed. A melody editor needs a durable
note/clip contract and Rust playback/export support first. Automatic transcription
needs measured guitar-audio accuracy. Those are follow-up engine tasks rather than
decorative controls in this editor.

## Verification

Synthetic checks cover all 24 keys across all three harmony palettes, independent
variation data, unequal chord durations, locked energy, form-limit rollback,
Undo/Redo, old-version lyric restoration, both AI lyric application paths and
Rust file round trips. Preview interaction checks do not establish live guitar,
Mac audio, or paid model quality. Those remain owner acceptance checks.
