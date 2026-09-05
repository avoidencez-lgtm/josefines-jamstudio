/**
 * Playable guitar shapes for a chord symbol: which fret on which string, with the
 * root marked, so the guitarist sees where the chord now and the chord next live
 * on the neck. Pure music theory over the same chord spelling as the soloing
 * helper; no audio, no tablature library, standard tuning.
 */

import { Chord, Note } from "tonal";
import { splitChord } from "../chart/notes";
import { STANDARD_TUNING_MIDI } from "./solo";

export interface Voicing {
  /** Per string, low E first: fret number, 0 for open, -1 for muted. */
  frets: number[];
  /** First fret a diagram shows; 1 means the nut is visible. */
  position: number;
  /** Pitch class per string, or null when muted. */
  chromas: (number | null)[];
  /** Interval label per string relative to the root (R, 3, b7 ...), or null when muted. */
  labels: (string | null)[];
  /** One finger across these strings at the lowest fret, as [from, to] string indexes. */
  barre: [number, number] | null;
  /** Lower is easier to play; the sort key. */
  score: number;
  /** Diagram-style shape, "x32010". */
  shape: string;
}

const STRINGS = STANDARD_TUNING_MIDI.length;
/** Frets a hand covers from its position, plus open strings near the nut. */
const REACH = 3;
const OPEN_POSITION_LIMIT = 3;
const MAX_FINGERS = 4;
const HIGHEST_POSITION = 12;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

function intervalLabel(rel: number, tones: Set<number>): string {
  const seventh = tones.has(10) || tones.has(11);
  switch (rel) {
    case 0:
      return "R";
    case 1:
      return "b9";
    case 2:
      return seventh ? "9" : "2";
    case 3:
      return "b3";
    case 4:
      return "3";
    case 5:
      return seventh && (tones.has(3) || tones.has(4)) ? "11" : "4";
    case 6:
      return tones.has(7) ? "#11" : "b5";
    case 7:
      return "5";
    case 8:
      return tones.has(4) ? "#5" : "b6";
    case 9:
      return seventh ? "13" : "6";
    case 10:
      return "b7";
    default:
      return "7";
  }
}

/** The tones a shape must contain: root, the third (or its sus substitute), the seventh or sixth, the highest extension. */
function requiredTones(
  root: number,
  chromas: number[],
  ordered: number[],
): Set<number> {
  const rel = chromas.map((c) => mod12(c - root));
  if (rel.length <= 3) return new Set(rel);
  const wanted = new Set<number>([0]);
  const third =
    rel.find((r) => r === 3 || r === 4) ?? rel.find((r) => r === 5 || r === 2);
  if (third !== undefined) wanted.add(third);
  const seventh = rel.find((r) => r === 10 || r === 11 || r === 9);
  if (seventh !== undefined) wanted.add(seventh);
  if (rel.length >= 5) wanted.add(mod12(ordered[ordered.length - 1] - root));
  else for (const r of rel) if (r !== 7) wanted.add(r);
  return wanted;
}

/** Fingers a shape needs: one index barre at the lowest fret, then one finger per run of equal frets. */
function fingering(frets: number[]): {
  fingers: number;
  barre: [number, number] | null;
} {
  const fretted = frets
    .map((f, string) => ({ f, string }))
    .filter((x) => x.f > 0);
  if (!fretted.length) return { fingers: 0, barre: null };
  const lowest = Math.min(...fretted.map((x) => x.f));
  const atLowest = fretted.filter((x) => x.f === lowest).map((x) => x.string);
  let barre: [number, number] | null = null;
  if (atLowest.length >= 2) {
    const from = atLowest[0];
    const to = atLowest[atLowest.length - 1];
    // An index barre needs every string under it fretted at or above its fret.
    if (frets.slice(from, to + 1).every((f) => f >= lowest)) barre = [from, to];
  }
  let fingers = 0;
  let previous: { f: number; string: number } | null = null;
  for (const x of fretted) {
    const underBarre =
      barre !== null &&
      x.f === lowest &&
      x.string >= barre[0] &&
      x.string <= barre[1];
    const continuesRun =
      previous !== null &&
      previous.f === x.f &&
      previous.string === x.string - 1 &&
      !underBarre;
    if (!underBarre && !continuesRun) fingers += 1;
    previous = x;
  }
  if (barre) fingers += 1;
  return { fingers, barre };
}

/** Chord tones of a symbol as pitch classes, in chord order (root first), or null. */
export function chordChromas(
  symbol: string,
): { root: number; bass: number; chromas: number[] } | null {
  const parts = splitChord(symbol);
  if (!parts) return null;
  const chord = Chord.get(`${parts.rootName}${parts.quality}`);
  const chromas = chord.empty
    ? [
        parts.root,
        mod12(parts.root + (/^(m|min|-|dim|°|ø)/.test(parts.quality) ? 3 : 4)),
        mod12(parts.root + 7),
      ]
    : chord.notes.map((n) => Note.chroma(n) ?? 0);
  return { root: parts.root, bass: parts.bass ?? parts.root, chromas };
}

/**
 * Playable shapes for a chord, easiest first. Every sounding string is a chord
 * tone, the bass is the root (or the slash bass), muted strings sit only at the
 * edges, and no shape needs more than four fingers.
 */
export function chordVoicings(symbol: string, max = 3): Voicing[] {
  const parsed = chordChromas(symbol);
  if (!parsed) return [];
  const { root, bass } = parsed;
  const tones = new Set(parsed.chromas);
  const required = requiredTones(root, parsed.chromas, parsed.chromas);
  const relTones = new Set(parsed.chromas.map((c) => mod12(c - root)));
  const minSounding = tones.size <= 2 ? 3 : 4;
  const found = new Map<string, Voicing>();

  for (let position = 1; position <= HIGHEST_POSITION; position++) {
    const openAllowed = position <= OPEN_POSITION_LIMIT;
    const options = STANDARD_TUNING_MIDI.map((open) => {
      const choices = [-1];
      if (openAllowed && tones.has(open % 12)) choices.push(0);
      for (let f = position; f <= position + REACH; f++)
        if (tones.has((open + f) % 12)) choices.push(f);
      return choices;
    });
    const frets = new Array<number>(STRINGS).fill(-1);
    const walk = (string: number) => {
      if (string === STRINGS) {
        consider(frets);
        return;
      }
      for (const f of options[string]) {
        frets[string] = f;
        walk(string + 1);
      }
    };
    const consider = (candidate: number[]) => {
      const sounding = candidate
        .map((f, s) => (f >= 0 ? s : -1))
        .filter((s) => s >= 0);
      if (sounding.length < minSounding) return;
      // Muted strings only at the edges: a shape is one strum.
      for (let s = sounding[0]; s <= sounding[sounding.length - 1]; s++)
        if (candidate[s] < 0) return;
      const chromas = candidate.map((f, s) =>
        f >= 0 ? (STANDARD_TUNING_MIDI[s] + f) % 12 : null,
      );
      const present = new Set(
        chromas
          .filter((c): c is number => c !== null)
          .map((c) => mod12(c - root)),
      );
      for (const r of required) if (!present.has(r)) return;
      // The bass is the root, or the slash bass: that is what a chord box means.
      if (chromas[sounding[0]] !== bass) return;
      const fretted = candidate.filter((f) => f > 0);
      if (!fretted.length && !openAllowed) return;
      const { fingers, barre } = fingering(candidate);
      if (fingers > MAX_FINGERS) return;
      const lowest = fretted.length ? Math.min(...fretted) : 0;
      const highest = fretted.length ? Math.max(...fretted) : 0;
      const span = fretted.length ? highest - lowest : 0;
      const opens = candidate.filter((f) => f === 0).length;
      // An open string between two strings held at the lowest fret has to ring
      // under the hand; possible, but never the shape anyone reaches for.
      const atLowest = candidate
        .map((f, s) => (f > 0 && f === lowest ? s : -1))
        .filter((s) => s >= 0);
      const openUnderHand =
        atLowest.length >= 2 &&
        candidate
          .slice(atLowest[0], atLowest[atLowest.length - 1] + 1)
          .some((f) => f === 0);
      const score =
        span * 1.5 +
        fingers +
        (lowest > 1 ? (lowest - 1) * 0.35 : 0) -
        opens * 0.6 -
        sounding.length * 0.25 +
        (barre ? 0.8 : 0) +
        (openUnderHand ? 1.5 : 0);
      const shape = candidate
        .map((f) => (f < 0 ? "x" : String(f)))
        .join(fretted.some((f) => f > 9) ? " " : "");
      const known = found.get(shape);
      if (known && known.score <= score) return;
      found.set(shape, {
        frets: [...candidate],
        position: highest <= 4 ? 1 : lowest,
        chromas,
        labels: chromas.map((c) =>
          c === null ? null : intervalLabel(mod12(c - root), relTones),
        ),
        barre,
        score,
        shape,
      });
    };
    walk(0);
  }
  return [...found.values()]
    .sort((a, b) => a.score - b.score || a.shape.localeCompare(b.shape))
    .slice(0, max);
}
