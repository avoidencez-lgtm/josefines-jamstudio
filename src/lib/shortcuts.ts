/**
 * One list of keyboard shortcuts drives both the global key handler and the help
 * overlay, so the two can never disagree. Keys are matched on `event.code` for
 * letters (layout-independent) and on `event.key` for symbols.
 */

import type { EngineState } from "../store/engine";
import { useWriting } from "./originals";

export interface Shortcut {
  /** Human-readable key label for the help overlay. */
  keys: string;
  description: string;
  group: "Transport" | "Band" | "Practice" | "App";
  matches: (e: KeyboardEvent) => boolean;
  run: (store: EngineState) => unknown;
}

const code = (c: string) => (e: KeyboardEvent) =>
  e.code === c && !e.ctrlKey && !e.metaKey && !e.altKey;
const key = (k: string) => (e: KeyboardEvent) =>
  e.key === k && !e.ctrlKey && !e.metaKey;

export const SHORTCUTS: Shortcut[] = [
  {
    keys: "H",
    description: "Keep the recent guitar idea (capture must be armed)",
    group: "Transport",
    matches: code("KeyH"),
    run: () => useWriting.getState().action(useWriting.getState().keep),
  },
  {
    keys: "Space",
    description: "Play / pause",
    group: "Transport",
    matches: code("Space"),
    run: (s) => {
      const st = s.telemetry.transport.state;
      return st === "playing" || st === "counting_in"
        ? s.transportPause()
        : s.transportPlay();
    },
  },
  {
    keys: "Enter",
    description: "Stop and return to the top",
    group: "Transport",
    matches: code("Enter"),
    run: (s) => s.transportStop(),
  },
  {
    keys: "L",
    description: "Toggle loop",
    group: "Transport",
    matches: code("KeyL"),
    run: (s) => {
      const t = s.telemetry.transport;
      return s.transportSetLoop(
        t.loop_start_bar,
        t.loop_end_bar,
        !t.loop_enabled,
      );
    },
  },
  {
    keys: "C",
    description: "Count-in: off / 1 bar / 2 bars",
    group: "Transport",
    matches: code("KeyC"),
    run: (s) =>
      s.transportSetCountIn((s.telemetry.transport.count_in_bars + 1) % 3),
  },
  {
    keys: "T",
    description: "Tap tempo (tap on the beat, 2+ times)",
    group: "Transport",
    matches: code("KeyT"),
    run: (s) => s.tapTempo(),
  },
  {
    keys: "← / →",
    description: "Tempo −1 / +1 BPM (Shift: ±5)",
    group: "Transport",
    matches: (e) =>
      (e.code === "ArrowLeft" || e.code === "ArrowRight") &&
      !e.ctrlKey &&
      !e.metaKey,
    run: () => undefined, // handled specially below (needs the event)
  },
  {
    keys: "R",
    description: "Start / stop recording a take",
    group: "Transport",
    matches: code("KeyR"),
    run: (s) => (s.isRecording ? s.stopRecording() : s.startRecording()),
  },
  {
    keys: "F / K",
    description: "Cue a fill / a crash at the next bar",
    group: "Band",
    matches: (e) => code("KeyF")(e) || code("KeyK")(e),
    run: () => undefined,
  },
  {
    keys: "S / E",
    description: "Cue a stop / the ending",
    group: "Band",
    matches: (e) => code("KeyS")(e) || code("KeyE")(e),
    run: () => undefined,
  },
  {
    keys: "M / B / P",
    description: "Mute drums / bass / comp",
    group: "Band",
    matches: (e) => code("KeyM")(e) || code("KeyB")(e) || code("KeyP")(e),
    run: () => undefined,
  },
  {
    keys: "↑ / ↓",
    description: "Intensity +5% / −5%",
    group: "Band",
    matches: (e) =>
      (e.code === "ArrowUp" || e.code === "ArrowDown") &&
      !e.ctrlKey &&
      !e.metaKey,
    run: () => undefined,
  },
  {
    keys: "1 – 9",
    description: "Jump to bar 1–9 (start of the form)",
    group: "Practice",
    matches: (e) =>
      /^Digit[1-9]$/.test(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey,
    run: () => undefined,
  },
  {
    keys: "[ / ]",
    description: "Transpose the chart down / up a semitone",
    group: "Practice",
    matches: (e) => key("[")(e) || key("]")(e),
    run: () => undefined,
  },
  {
    keys: "U",
    description: "Toggle tuner",
    group: "Practice",
    matches: code("KeyU"),
    run: (s) => s.setTuner(!s.tunerOn),
  },
  {
    keys: "?",
    description: "Open Help & guides",
    group: "App",
    matches: key("?"),
    run: () => undefined,
  },
];

export interface ShortcutContext {
  toggleHelp: () => void;
}

/** Returns true when the event was consumed. */
export function handleShortcut(
  e: KeyboardEvent,
  store: EngineState,
  ctx: ShortcutContext,
): boolean {
  if (e.defaultPrevented) return false;
  const target = e.target as HTMLElement | null;
  if (
    target?.closest("button, summary, a[href]") &&
    (e.code === "Space" || e.code === "Enter")
  )
    return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  ) {
    return false;
  }
  // Leave Ctrl/Cmd chords to the browser. Alt is ignored except when it is
  // how the layout typed `[` / `]` (Option+8/9 on a Norwegian Mac).
  if (e.ctrlKey || e.metaKey) return false;
  if (e.altKey && e.key !== "[" && e.key !== "]") return false;
  if (
    e.repeat &&
    e.code !== "ArrowUp" &&
    e.code !== "ArrowDown" &&
    e.code !== "ArrowLeft" &&
    e.code !== "ArrowRight"
  ) {
    return false;
  }

  const t = store.telemetry.transport;
  const band = store.telemetry.band;
  const step = e.shiftKey ? 5 : 1;

  switch (e.code) {
    case "ArrowLeft":
      void store.transportSetTempo(t.bpm - step);
      return true;
    case "ArrowRight":
      void store.transportSetTempo(t.bpm + step);
      return true;
    case "ArrowUp":
      void store.bandSetIntensity(band.intensity + 0.05);
      return true;
    case "ArrowDown":
      void store.bandSetIntensity(band.intensity - 0.05);
      return true;
    case "KeyF":
      void store.bandCue("fill");
      return true;
    case "KeyK":
      void store.bandCue("crash");
      return true;
    case "KeyS":
      void store.bandCue("stop");
      return true;
    case "KeyE":
      void store.bandCue("ending");
      return true;
    case "KeyM":
      void store.togglePart("drums");
      return true;
    case "KeyB":
      void store.togglePart("bass");
      return true;
    case "KeyP":
      void store.togglePart("comp");
      return true;
    default:
      break;
  }
  if (e.key === "?") {
    ctx.toggleHelp();
    return true;
  }
  if (e.key === "[" || e.key === "]") {
    void store.transposeCurrentChart(e.key === "[" ? -1 : 1);
    return true;
  }
  const digit = /^Digit([1-9])$/.exec(e.code);
  if (digit && !e.ctrlKey && !e.metaKey && !e.altKey) {
    void store.transportSeekBar(Number.parseInt(digit[1], 10));
    return true;
  }

  for (const s of SHORTCUTS) {
    if (s.matches(e)) {
      void s.run(store);
      return true;
    }
  }
  return false;
}
