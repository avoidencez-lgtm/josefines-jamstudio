/**
 * Soloing helper: for the chord that is playing right now, what can I play over it?
 *
 * Gives chord tones, the guide tones (3rd and 7th, the notes that make a line sound
 * "inside"), a ranked list of scales, and a key-centre scale for the whole tune so a
 * beginner can stay on one shape while an advanced player follows the changes.
 */

import { Chord, Note, Scale } from "tonal";
import { keyPrefersFlats, pitchClassName, splitChord } from "../chart/notes";

export interface ScaleSuggestion {
  /** e.g. "A mixolydian" */
  name: string;
  notes: string[];
  /** 0..11 pitch classes, for fretboard rendering. */
  chromas: number[];
  /** Why this scale fits, in one line. */
  why: string;
  /** Lower is safer / more obvious; used for ordering. */
  rank: number;
}

export interface SoloSuggestion {
  chord: string;
  chordTones: string[];
  guideTones: string[];
  avoidNotes: string[];
  scales: ScaleSuggestion[];
  /** Scale that covers the whole tune (key centre). */
  keyScale: ScaleSuggestion | null;
}

export type Family =
  | "dom7"
  | "dom7alt"
  | "maj"
  | "maj7"
  | "min"
  | "min7"
  | "min6"
  | "minmaj7"
  | "halfdim"
  | "dim"
  | "sus"
  | "sus2"
  | "power"
  | "aug"
  | "unknown";

export function classify(quality: string): Family {
  // "M7" means major seventh while "m7" means minor seventh. A bare "M"
  // (as in "CM") must become major before toLowerCase or it reads as minor.
  const q = quality
    .replace(/\s+/g, "")
    .replace(/^M(?=\d|$)/, "maj")
    .replace(/Δ/g, "maj")
    .toLowerCase();
  if (q === "" || /^(maj|6|add9|add2|69|6\/9)$/.test(q)) return "maj";
  if (/^(maj|ma)(7|9|11|13)/.test(q)) return "maj7";
  if (/^ø|^(m|min|-)7b5|^h7/.test(q)) return "halfdim";
  if (/^(dim|°|o)/.test(q)) return "dim";
  if (/^(7|9)?sus2/.test(q)) return "sus2";
  if (/^(7|9)?sus/.test(q)) return "sus";
  if (q === "5") return "power";
  if (/^(aug|\+)/.test(q)) return "aug";
  if (/^(m|min|-)(maj7|ma7)/.test(q)) return "minmaj7";
  if (/^(m|min|-)6/.test(q)) return "min6";
  if (/^(m|min|-)(7|9|11|13)/.test(q)) return "min7";
  if (/^(m|min|-)/.test(q)) return "min";
  if (/^(7|9|13)?alt|^(7|9|13).*(b9|#9|b13|#11|b5|#5)/.test(q))
    return "dom7alt";
  if (/^(7|9|11|13|dom)/.test(q)) return "dom7";
  return "unknown";
}

interface Recipe {
  scale: string;
  why: string;
}

const RECIPES: Record<Family, Recipe[]> = {
  dom7: [
    {
      scale: "mixolydian",
      why: "The home scale for a dominant 7th: major scale with a b7.",
    },
    {
      scale: "minor blues",
      why: "Blues scale on the root. Bend the b3 up towards the 3rd.",
    },
    {
      scale: "major pentatonic",
      why: "Sweet and safe; leaves out the b7 tension.",
    },
    {
      scale: "lydian dominant",
      why: "Adds a #11 for a brighter, more modern colour.",
    },
    {
      scale: "half-whole diminished",
      why: "Tension scale (b9, #9, #11) for when the chord resolves down a fifth.",
    },
  ],
  dom7alt: [
    {
      scale: "altered",
      why: "Melodic minor a half step up: hits every altered extension.",
    },
    {
      scale: "half-whole diminished",
      why: "b9/#9 with a natural 13; classic bebop dominant tension.",
    },
    {
      scale: "minor blues",
      why: "Blues scale still works; the b3 reads as the #9.",
    },
  ],
  maj: [
    {
      scale: "major pentatonic",
      why: "Five safe notes, no wrong ones. Start here.",
    },
    {
      scale: "major",
      why: "Full major scale; treat the 4th as a passing note.",
    },
    { scale: "lydian", why: "Raise the 4th for an open, floating sound." },
    {
      scale: "major blues",
      why: "Adds the b3 for a country / blues lick flavour.",
    },
  ],
  maj7: [
    {
      scale: "major",
      why: "Ionian: the chord's own scale. Rest on the 3rd or 7th.",
    },
    {
      scale: "lydian",
      why: "#4 avoids the clash of the natural 4th against the maj7.",
    },
    { scale: "major pentatonic", why: "Simple and always right." },
  ],
  min: [
    {
      scale: "minor pentatonic",
      why: "The rock and blues default; no wrong notes.",
    },
    { scale: "aeolian", why: "Natural minor: the darker full-scale option." },
    { scale: "dorian", why: "Natural 6th for a funkier, brighter minor." },
    { scale: "minor blues", why: "Minor pentatonic plus the blue note (b5)." },
  ],
  min7: [
    { scale: "dorian", why: "The standard scale for a minor 7th chord." },
    { scale: "minor pentatonic", why: "Safe subset of dorian and aeolian." },
    {
      scale: "aeolian",
      why: "Use when the chord is the vi or the key's own minor.",
    },
    { scale: "minor blues", why: "For a bluesier line over the m7." },
  ],
  min6: [
    {
      scale: "dorian",
      why: "Dorian owns the natural 6th this chord is built on.",
    },
    { scale: "melodic minor", why: "Adds the major 7th for a jazzier colour." },
    { scale: "minor pentatonic", why: "Still safe; just skips the 6th." },
  ],
  minmaj7: [
    {
      scale: "melodic minor",
      why: "Minor with a raised 7th: the chord's own scale.",
    },
    {
      scale: "harmonic minor",
      why: "b6 and natural 7 for a dramatic, classical feel.",
    },
  ],
  halfdim: [
    {
      scale: "locrian",
      why: "Minor scale with b2 and b5; matches every chord tone.",
    },
    {
      scale: "locrian #2",
      why: "Natural 9 sounds smoother than the locrian b2.",
    },
    {
      scale: "minor pentatonic",
      why: "Works if you avoid the natural 5th (play b5 instead).",
    },
  ],
  dim: [
    {
      scale: "diminished",
      why: "Whole-half diminished: symmetric, every note is a chord tone or a 9th.",
    },
    {
      scale: "harmonic minor",
      why: "From a half step above the root, for a classical sound.",
    },
  ],
  sus: [
    {
      scale: "mixolydian",
      why: "Sus chords like mixolydian; lean on the 4th, avoid the 3rd.",
    },
    {
      scale: "major pentatonic",
      why: "Open-sounding and safe (a 4th down: e.g. D major pent over Asus4).",
    },
  ],
  sus2: [
    {
      scale: "major pentatonic",
      why: "Sus2 is the root, 2nd and 5th; lean on those, leave the 3rd out.",
    },
    {
      scale: "major",
      why: "Full major; treat the 3rd as a passing note over sus2.",
    },
  ],
  power: [
    {
      scale: "minor pentatonic",
      why: "Power chords are ambiguous: minor pentatonic is the rock default.",
    },
    { scale: "minor blues", why: "Add the blue note for riffs." },
    {
      scale: "major pentatonic",
      why: "If the riff sounds major, use this instead.",
    },
    { scale: "mixolydian", why: "Full scale with b7 for rock and roll lines." },
  ],
  aug: [
    {
      scale: "whole tone",
      why: "Six notes, all a whole step apart: matches the #5.",
    },
    { scale: "lydian augmented", why: "Melodic minor mode with #4 and #5." },
  ],
  unknown: [
    {
      scale: "minor pentatonic",
      why: "Could not read the chord; minor pentatonic on the root is the safest guess.",
    },
  ],
};

function guideToneIntervals(family: Family): string[] {
  switch (family) {
    case "dom7":
    case "dom7alt":
      return ["3M", "7m"];
    case "maj7":
      return ["3M", "7M"];
    case "maj":
      return ["3M", "5P"];
    case "min7":
    case "min6":
      return ["3m", "7m"];
    case "minmaj7":
      return ["3m", "7M"];
    case "min":
      return ["3m", "5P"];
    case "halfdim":
      return ["3m", "5d"];
    case "dim":
      return ["3m", "5d"];
    case "sus":
      return ["4P", "7m"];
    case "sus2":
      return ["2M", "5P"];
    case "power":
      return ["5P"];
    case "aug":
      return ["3M", "5A"];
    default:
      return [];
  }
}

function avoidIntervals(family: Family): string[] {
  switch (family) {
    case "maj7":
    case "maj":
      return ["4P"];
    case "dom7":
      return ["4P", "7M"];
    case "min7":
    case "min":
      return ["6m", "7M"];
    case "sus":
    case "sus2":
      return ["3M"];
    default:
      return [];
  }
}

function spell(pcs: number[], flats: boolean): string[] {
  return pcs.map((pc) => pitchClassName(pc, flats));
}

function scaleSuggestion(
  rootName: string,
  recipe: Recipe,
  rank: number,
  flats: boolean,
): ScaleSuggestion | null {
  const s = Scale.get(`${rootName} ${recipe.scale}`);
  if (s.empty) return null;
  const chromas = s.notes.map((n) => Note.chroma(n) ?? 0);
  return {
    name: `${rootName} ${recipe.scale}`,
    notes: spell(chromas, flats),
    chromas,
    why: recipe.why,
    rank,
  };
}

export function suggestForChord(
  symbol: string,
  key?: { keyTonic: number; mode: "major" | "minor" },
): SoloSuggestion | null {
  const parts = splitChord(symbol);
  if (!parts) return null;
  const flats = key
    ? keyPrefersFlats(key.keyTonic, key.mode)
    : parts.rootName.includes("b");
  const rootName = pitchClassName(parts.root, flats);
  const family = classify(parts.quality);

  const chord = Chord.get(`${rootName}${parts.quality}`);
  const chordChromas = chord.empty
    ? [
        parts.root,
        (parts.root +
          (family.startsWith("min") || family === "halfdim" || family === "dim"
            ? 3
            : 4)) %
          12,
        (parts.root + 7) % 12,
      ]
    : chord.notes.map((n) => Note.chroma(n) ?? 0);
  const chordTones = spell(chordChromas, flats);

  const guide = guideToneIntervals(family)
    .map((iv) => Note.chroma(Note.transpose(rootName, iv)) ?? -1)
    .filter((pc) => pc >= 0);
  const avoid = avoidIntervals(family)
    .map((iv) => Note.chroma(Note.transpose(rootName, iv)) ?? -1)
    .filter((pc) => pc >= 0);

  const scales = RECIPES[family]
    .map((r, i) => scaleSuggestion(rootName, r, i, flats))
    .filter((s): s is ScaleSuggestion => s !== null);

  let keyScale: ScaleSuggestion | null = null;
  if (key) {
    const keyRoot = pitchClassName(key.keyTonic, flats);
    const recipe: Recipe =
      key.mode === "minor"
        ? {
            scale: "minor pentatonic",
            why: "Key-centre scale: works over the whole tune.",
          }
        : {
            scale: "major pentatonic",
            why: "Key-centre scale: works over the whole tune.",
          };
    keyScale = scaleSuggestion(keyRoot, recipe, 99, flats);
    // Blues tunes are the exception: minor pentatonic on the tonic is the sound.
    if (key.mode === "major" && (family === "dom7" || family === "power")) {
      const blues = scaleSuggestion(
        keyRoot,
        {
          scale: "minor blues",
          why: "Key-centre blues scale: the classic sound over dominant chords.",
        },
        99,
        flats,
      );
      if (blues) keyScale = blues;
    }
  }

  return {
    chord: symbol,
    chordTones,
    guideTones: spell(guide, flats),
    avoidNotes: spell(avoid, flats),
    scales,
    keyScale,
  };
}

/** Standard-tuned six-string fretboard: which frets on which string hold these pitch classes. */
export const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64]; // E A D G B e

export interface FretMark {
  string: number; // 0 = low E
  fret: number;
  chroma: number;
}

export function fretMarks(chromas: number[], frets = 15): FretMark[] {
  const want = new Set(chromas.map((c) => ((c % 12) + 12) % 12));
  const marks: FretMark[] = [];
  STANDARD_TUNING_MIDI.forEach((open, string) => {
    for (let fret = 0; fret <= frets; fret++) {
      const chroma = (open + fret) % 12;
      if (want.has(chroma)) marks.push({ string, fret, chroma });
    }
  });
  return marks;
}
