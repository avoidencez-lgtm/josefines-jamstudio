# Design

Design read: **a dark "stage" desktop instrument for one guitarist, read from two metres with a guitar in his hands, with a warm single accent and calm, motivated motion.** Not a landing page, not a dashboard: an instrument. Every screen answers "what is playing, where am I, what happens at the next bar".

Dials (the UI is a product surface, so variance is low and density moderate): layout variance 4, motion 4, density 5.

This document is binding for every UI commit. M7 runs the pre-flight list at the end.

## 1. Principles

1. **Two-metre readability.** The chord now, the chord next, bar:beat and tempo are readable from two metres: display sizes 96 to 160 px for the chord, 48 px for tempo and bar, tabular figures, high contrast. Secondary controls can be small; the stage cannot.
2. **Nothing surprising at the next bar.** Every pending change is shown where it will land ("at next bar" chip), and the count-in is visible as well as audible.
3. **Hands on the guitar.** Every Stage action has a keyboard shortcut, a control-map binding and a Jo tool. The mouse is optional.
4. **Calm surface, live signal.** The background is still; only signal moves (meters, playhead, the tuner needle, Jo's orb). No decorative animation.
5. **One accent.** Amber is the accent for action, focus and "live". Red exists only for recording and destructive actions. Green only for "ready" and "ok". Nothing else is coloured.
6. **States are part of the design.** Empty, loading, error and "not configured" states are designed for every screen from the first commit. Misconfiguration is loud and tells the next step.
7. **No AI tells.** No purple, no glows, no gradients on text, no decorative dots, no eyebrow labels above every heading, no em-dashes in copy, no emoji in the UI. One icon family (Phosphor, `weight="regular"`, 1.5 stroke feel).

## 2. Tokens (`src/design/tokens.css`)

```css
:root {
  /* surfaces, warm near-black, never pure black */
  --bg-0: #111010;  /* window */
  --bg-1: #171514;  /* panels */
  --bg-2: #1f1c1a;  /* raised, inputs */
  --bg-3: #29251f;  /* hover */
  --line: #332e29;  /* hairlines */
  /* text */
  --fg-0: #f3ede4;  /* primary */
  --fg-1: #b8afa3;  /* secondary */
  --fg-2: #7d7468;  /* muted */
  /* accent (amber, saturation under 80 %) */
  --accent: #e0a24a;
  --accent-strong: #f0b45c;
  --accent-soft: rgba(224, 162, 74, 0.16);
  /* semantic */
  --record: #e0534e;
  --ok: #58b585;
  /* typography */
  --font-ui: "Geist", "Segoe UI", system-ui, sans-serif;
  --font-mono: "Geist Mono", "Cascadia Mono", ui-monospace, monospace;
  /* radii: one scale */
  --radius-s: 6px;  --radius-m: 10px;  --radius-l: 16px;
  /* spacing: 4-point grid */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; --space-8: 32px; --space-12: 48px;
  /* motion */
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms; --dur: 220ms; --dur-slow: 400ms;
  --shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
```

Fonts are self-hosted from `src/design/fonts/` (Geist and Geist Mono, SIL OFL 1.1, licence file kept alongside). No web-font links. If Geist is not available, the system stack applies; the layout must not depend on exact metrics.

The theme is dark only in v1 (`ui.theme: 'dark'`); tokens make a light theme a token swap later, not a redesign. Contrast: `--fg-0` on `--bg-0` is above 15:1; `--fg-1` on `--bg-1` is above 7:1; accent text on `--bg-1` is above 4.5:1. Every new colour pair is checked.

## 3. Typography

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Chord now | Geist | 144 px (min 96 at small windows) | 600 | tabular, letter-spacing -0.02em; chord quality in `--fg-1` at 0.45× |
| Chord next | Geist | 56 px | 500 | `--fg-1` |
| Tempo, bar:beat, tuner cents | Geist Mono | 48 px | 500 | tabular figures always |
| Section titles | Geist | 20 px | 600 | |
| Body, labels | Geist | 14 px | 400/500 | line-height 1.5 |
| Meta, values | Geist Mono | 12 px | 400 | |

No headline exceeds one line. No italic-for-emphasis in readouts. Numbers never use proportional figures.

## 4. Layout

Window minimum 1100 × 700; default 1440 × 900. A 184 px left rail lists all ten rooms with distinct icons, labels and short task descriptions. At widths up to 1200 px it becomes a 92 px rail retaining icons and labels. A wrapping top bar contains the transport and Assistant; the screen body scrolls independently.

```
┌──────┬────────────────────────────────────────────────────────────────┐
│ rail │ ▶ ■  ● rec   bar 5 : 2   ♩ 112   4/4   [loop 9-12]  [count-in 1] │  top bar: transport
│      ├────────────────────────────────────────────────────────────────┤
│ Stage│  SOURCE  [Band] [Song] [Lyria]        style  blues-shuffle  ▾   │
│ Libr.│                                                                 │
│ Sess.│         A7                       next  D7                      │  chord now / next
│ Rig  │                                                                 │
│ Sett.│  intensity ◐   drums ● bass ● comp ●    fill  crash  stop  end  │  controls row
│      │  ▮▮▮▮▮▮▮▮▮▯▯ guitar   ▮▮▮▮▮▯ band    tuner  E2  +3 ¢            │  meters and tuner
│      │  chart  | A7 | D7 | A7 | A7 | D7 | D7 | A7 | A7 | E7 | D7 | A7 | E7 │  bar strip, playhead
│      │                                                     ╭────────╮  │
│      │                                                     │ ◉ Jo    │  │  presence: orb + last line
│      │                                                     ╰────────╯  │
└──────┴────────────────────────────────────────────────────────────────┘
```

Stage in Song mode swaps the chart strip for the chord timeline and adds speed, transpose and stem mutes; in Lyria mode the controls row becomes prompt chips, density, brightness and mutes. The chord now/next area never moves.

Grid: 12 columns, 24 px gutters, content max width 1400 px centred inside the body. Panels use `--bg-1` with a 1 px `--line` border and `--radius-l`; no nested panels (a panel never contains a panel).

## 5. Components (`src/components/`)

| Component | Purpose | States |
|---|---|---|
| `BigReadout` | chord, tempo, bar:beat, cents | value, pending (accent chip "at next bar"), muted |
| `Dial` | intensity, density, brightness, gain | idle, hover, dragging, keyboard-adjusting (±1, shift ±10), disabled |
| `Toggle` | parts, follow energy, clock | on (accent), off, disabled |
| `Meter` | input and bus levels (canvas, 60 fps) | signal, clip (record red hold 1 s), no device (dashed) |
| `Button` | primary (accent fill, dark text), secondary (outline), danger (record red) | hover, active (translate 1 px down), disabled, loading |
| `SourceSwitch` | Band / Song / Lyria | active, switching (shows what stops) |
| `ChartStrip` | bars with chords, playhead, loop range | playing, editing, loop selected |
| `ChordDiagram` / `ChordShapes` | one playable shape for a chord symbol: six strings, four frets, root in accent, interval labels in the dots; Stage shows the chord now and the chord next, Write the selected chord | now (primary ink), next (secondary ink), no shape, shape picker 1 to 3 |
| `ChordTimeline` | analysed chords over time (Song mode) | analysing (skeleton), low confidence (dashed), editing |
| `JoPresence` | orb + last transcript + reply + text input | idle, listening (accent pulse), transcribing, thinking, speaking (accent solid), error |
| `StatusPill` | key set, device open, provider enabled | ok (green dot is allowed here: real state), warning (accent), error (record red) |
| `EmptyState` | first-run and empty lists | icon, one sentence, one action |
| `ErrorState` | `app.error` rendering | code, message, next step, retry |
| `Wizard` | onboarding | steps, progress, skip |

Corner radii: buttons and inputs `--radius-m`, panels `--radius-l`, pills full. Nothing else.

## 6. Motion

Motivated only: state transitions (source switch cross-fade 220 ms), pending-at-next-bar chip enters 120 ms, count-in pulses with the click (opacity only), Jo's orb pulses while listening and scales 1.04 while speaking, meters and playhead move with the signal. Nothing loops without a reason. Only `transform` and `opacity` animate. `prefers-reduced-motion` and the `ui.reducedMotion` setting collapse everything to instant except meters and the playhead.

## 7. Screens

| Screen | Job | Empty state | Error state |
|---|---|---|---|
| Stage | play | "Pick a chart or a song. Or hold PTT and tell Jo." | device lost, provider off, assets missing |
| Library | songs, charts, styles | "Drop an audio file here" | analysis failed with provider message and retry |
| Sessions | takes, review, export, progress | "Your first take will appear here" | disk full, export failed |
| Rig | ports, profiles, scenes, monitor | "No MIDI output found. Plug in the interface." | port disappeared |
| Settings | audio, keys, providers, controls, assets, budget, diagnostics, about | never empty | key rejected by provider ("test key" result) |

The Studio assistant opens from the top bar on every screen. Jo is text-only in the current preview and T taps tempo outside editors; see the close of this document.

## 8. Copy

Plain, short, musician's vocabulary. Sentences, not labels with colons. No exclamation marks in the UI. Jo's confirmations are at most twelve words. Errors say what happened and what to do next ("HeadRush disconnected. Reconnect the USB cable or pick another device in Settings.").

## 9. Accessibility

Full keyboard navigation with visible focus rings (accent, 2 px, offset 2 px); every control has an accessible name; the Stage readouts have live regions at polite priority (chord next) and off for meters; contrast per §2; reduced motion per §6; minimum hit target 32 px; the shortcuts panel lists everything.

## 10. Pre-flight list (run in M7 and on every screen PR)

- [ ] Chord now readable from two metres at the default window size (visually checked at 1440 × 900 and at 1100 × 700)
- [ ] Only amber, record red, ok green and the neutral scale are used (grep the CSS for other colours)
- [ ] One radius scale; no nested panels; no shadows on flat elements
- [ ] Every screen shows designed empty, loading and error states (screen recording attached)
- [ ] No em-dashes, no emoji, no decorative dots, no eyebrow labels, no purple, no glows, no gradient text
- [ ] Every Stage action has a shortcut, a control-map action and a Jo tool
- [ ] Reduced motion honoured; nothing animates except transform and opacity
- [ ] Contrast pairs checked; focus rings visible; hit targets ≥ 32 px
- [ ] Meters and playhead at 60 fps on the PC with the fixture running
- [ ] Copy self-audit: every visible string re-read for sense and length

## Write workspace (Operate)

Write uses the existing warm dark tokens and standard controls. Its composition
is a song map followed by a selected-section chord grid and a 300 px harmony
inspector. Song title, explicit Save and Undo sit above the Compose / Lyrics /
Record & layers / Versions navigation. Capture and pedal setup live with recording;
band details use native disclosure. First-screen priority is the editable music.

Chord widths represent beat duration. Song-map widths represent arranged bars,
subject to a readable minimum; long maps scroll horizontally. Amber marks selection
and actions. Intensity bars reflect actual section settings, never invented audio
waveforms. Section lyrics are a plain readable text sheet with a chord reference.
At narrow widths the inspector stacks below the grid. Desktop target remains
1100 x 700 minimum; controls remain keyboard reachable. Only data changes animate,
and reduced motion disables that transition. No new fonts, icons or raster assets.


## Studio rooms (2026-09-04)

`WorkspaceHeader` pairs a room's registered pictogram with its task and title.
`WorkspaceViews` uses native, keyboard-reachable buttons with pressed state;
its hidden content stays mounted so in-progress fields survive view changes.
Room descriptions are functional wayfinding, not decorative marketing labels.
Stage readouts/cues and Rig scenes precede setup. Library uses a collection/editor
split; Songs uses a collection/detail split; Jo uses a bounded conversation with
an always-reachable composer. Film and AI Music separate creation from results.
Native disclosures keep project/MIDI/advanced controls close without dominating
the first screen. Icons alone are never the sole name of an action.

The screen registry is the only navigation icon mapping. Use the same symbol in
its page header. Active-page and pressed semantics accompany colour, while text
names disconnected MIDI, pending AI proposals and missing media. The assistant
launcher occupies real toolbar space so it cannot hide Stage cues.
See [research](research/studio-workspaces.md) and [room guide](guide/studio-rooms.md).

### Current preview voice and close behaviour

Jo is text-only in the current preview; browser speech and push-to-talk are not
implemented product controls. Native voice is a pending M2 task. T taps tempo
outside editors. Native window close prompts for unsaved song/chart/film work
and refuses to close during recording or an active save/render.
