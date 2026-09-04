/**
 * Chord-symbol root handling shared by the chart parser, transposer and soloing
 * helper. Mirrors the root/quality/bass split done in `jam-band/src/voicing.rs` so
 * both sides agree on what a symbol means.
 */

export const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

const LETTER_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export interface SplitChord {
  /** Pitch class 0..11 of the root. */
  root: number;
  /** Root as written, e.g. "Bb" or "F#". */
  rootName: string;
  /** Everything between the root and the slash: "m7b5", "maj9", "" ... */
  quality: string;
  /** Slash bass pitch class, if any. */
  bass: number | null;
  bassName: string | null;
}

/** Parses "Bbm7b5/Db" into its parts. Returns null when there is no valid root. */
export function splitChord(symbol: string): SplitChord | null {
  const s = symbol.trim();
  const m = /^([A-Ga-g])(#{1,2}|b{1,2}|x)?(.*)$/.exec(s);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2] ?? "";
  let root = LETTER_PC[letter];
  root = (root + accidentalOffset(acc) + 12) % 12;
  let rest = m[3] ?? "";
  let bass: number | null = null;
  let bassName: string | null = null;
  const slash = rest.indexOf("/");
  if (slash >= 0) {
    const bassPart = rest.slice(slash + 1).trim();
    rest = rest.slice(0, slash);
    const bm = /^([A-Ga-g])(#{1,2}|b{1,2})?$/.exec(bassPart);
    if (bm) {
      bass =
        (LETTER_PC[bm[1].toUpperCase()] + accidentalOffset(bm[2] ?? "") + 12) %
        12;
      bassName = bm[1].toUpperCase() + (bm[2] ?? "");
    }
  }
  return {
    root,
    rootName: letter + acc,
    quality: rest.trim(),
    bass,
    bassName,
  };
}

function accidentalOffset(acc: string): number {
  if (acc === "x") return 2;
  let n = 0;
  for (const c of acc) n += c === "#" ? 1 : c === "b" ? -1 : 0;
  return n;
}

/** True when a key is conventionally spelled with flats (F, Bb, Eb, Ab, Db, Gb). */
export function keyPrefersFlats(
  keyTonic: number,
  mode: "major" | "minor",
): boolean {
  const pc = ((keyTonic % 12) + 12) % 12;
  // Relative major of a minor key decides the spelling.
  const majorPc = mode === "minor" ? (pc + 3) % 12 : pc;
  return [5, 10, 3, 8, 1, 6].includes(majorPc);
}

export function pitchClassName(pc: number, flats: boolean): string {
  const i = ((pc % 12) + 12) % 12;
  return flats ? FLAT_NAMES[i] : SHARP_NAMES[i];
}

/** Transposes one chord symbol; unknown tokens (e.g. "N.C.") pass through untouched. */
export function transposeChord(
  symbol: string,
  semitones: number,
  flats: boolean,
): string {
  const parts = splitChord(symbol);
  if (!parts) return symbol;
  const root = pitchClassName(parts.root + semitones, flats);
  const bass =
    parts.bass === null
      ? ""
      : `/${pitchClassName(parts.bass + semitones, flats)}`;
  return `${root}${parts.quality}${bass}`;
}

/** "A major", "F# minor", ... */
export function keyName(keyTonic: number, mode: "major" | "minor"): string {
  return `${pitchClassName(keyTonic, keyPrefersFlats(keyTonic, mode))} ${mode}`;
}

/** Parses "Bb", "F# minor", "Am", "G maj" into (tonic, mode). */
export function parseKey(
  text: string,
): { keyTonic: number; mode: "major" | "minor" } | null {
  const m =
    /^\s*([A-Ga-g])(#|b)?\s*(m(?:in(?:or)?)?|maj(?:or)?|major|minor)?\s*$/i.exec(
      text,
    );
  if (!m) return null;
  const tonic =
    (LETTER_PC[m[1].toUpperCase()] + accidentalOffset(m[2] ?? "") + 12) % 12;
  const modeText = (m[3] ?? "major").toLowerCase();
  const mode =
    modeText.startsWith("m") && !modeText.startsWith("maj") ? "minor" : "major";
  return { keyTonic: tonic, mode };
}
