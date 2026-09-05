import type { Chart } from "../../ipc/contract";
import { keyPrefersFlats, transposeChord } from "./notes";

/**
 * Returns a copy of the chart moved by `semitones`. Spelling follows the new key
 * (Bb, not A#, when the tune lands in F), and slash basses move with the chord.
 */
export function transposeChart(chart: Chart, semitones: number): Chart {
  const shift = ((semitones % 12) + 12) % 12;
  if (shift === 0) return chart;
  const keyTonic = (chart.keyTonic + shift) % 12;
  const flats = keyPrefersFlats(keyTonic, chart.mode);
  return {
    ...chart,
    keyTonic,
    sections: chart.sections.map((s) => ({
      ...s,
      bars: s.bars.map((bar) =>
        bar.map((c) => ({
          ...c,
          chord: transposeChord(c.chord, shift, flats),
        })),
      ),
    })),
  };
}
