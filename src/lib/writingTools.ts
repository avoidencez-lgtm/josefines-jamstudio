import { Chord, Note, Scale } from "tonal";
import type { Chart } from "../ipc/contract";
import { keyName, keyPrefersFlats, pitchClassName } from "./chart/notes";
import type { SongBody } from "./originals";

export function arrangedBars(chart: Chart): number {
  return chart.arrangement.reduce(
    (sum, a) =>
      sum +
      a.repeats *
        (chart.sections.find((s) => s.id === a.sectionId)?.bars.length ?? 0),
    0,
  );
}

/** Same structural ceilings as the Rust songwriter, before an edit enters Undo. */
export function checkWritingForm(body: SongBody): void {
  const c = body.chart;
  if (
    body.lyrics !== undefined &&
    (!body.lyrics ||
      typeof body.lyrics !== "object" ||
      Array.isArray(body.lyrics) ||
      Object.entries(body.lyrics).some(
        ([id, text]) =>
          typeof text !== "string" ||
          text.length > 12000 ||
          !c.sections.some((s) => s.id === id),
      ))
  )
    throw new Error(
      "Lyrics must belong to a song section and stay within 12,000 characters.",
    );
  if (
    !c.sections.length ||
    c.sections.length > 64 ||
    !c.arrangement.length ||
    c.arrangement.length > 128 ||
    c.sections.some((s) => !s.bars.length || s.bars.length > 256) ||
    c.arrangement.some(
      (a) =>
        !Number.isInteger(a.repeats) ||
        a.repeats < 1 ||
        a.repeats > 64 ||
        !c.sections.some((s) => s.id === a.sectionId),
    ) ||
    arrangedBars(c) > 256
  )
    throw new Error(
      "Keep the song within 256 arranged bars, 64 sections and 128 form entries. Undo or shorten a section to make room.",
    );
}

export function duplicateSection(
  body: SongBody,
  sectionId: string,
  id: string,
): void {
  const source = body.chart.sections.find((s) => s.id === sectionId);
  if (
    !source ||
    !body.sections[sectionId] ||
    body.chart.sections.some((s) => s.id === id)
  )
    throw new Error("Choose an existing section and a new variation id.");
  body.chart.sections.push({
    ...structuredClone(source),
    id,
    name: `${source.name.slice(0, 60)} variation ${body.chart.sections.length + 1}`,
  });
  body.sections[id] = structuredClone(body.sections[sectionId]);
  if (body.lyrics?.[sectionId]) body.lyrics[id] = body.lyrics[sectionId];
  const at = body.chart.arrangement.findIndex((a) => a.sectionId === sectionId);
  body.chart.arrangement.splice(
    at < 0 ? body.chart.arrangement.length : at + 1,
    0,
    { sectionId: id, repeats: 1 },
  );
}

export const PHRASE_MOVES = {
  rotate: "Rotate bars",
  reverse: "Reverse bars",
  repeat: "Repeat phrase",
} as const;
export function transformPhrase(
  body: SongBody,
  sectionId: string,
  move: keyof typeof PHRASE_MOVES,
): void {
  const section = body.chart.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error("Select a section first.");
  const bars = structuredClone(section.bars);
  if (move === "rotate") section.bars = [...bars.slice(1), bars[0]];
  if (move === "reverse") section.bars = bars.reverse();
  if (move === "repeat") section.bars = [...bars, ...structuredClone(bars)];
}

export function setSectionEnergy(
  body: SongBody,
  id: string,
  amount: number,
): void {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1)
    throw new Error("Energy must be between 0 and 100%.");
  const section = body.sections[id];
  if (!section) throw new Error("Section no longer exists.");
  for (const part of section.parts) if (!part.locked) part.intensity = amount;
}

export interface HarmonyChoice {
  chord: string;
  degree: string;
  reason: string;
  shared: number;
}
export function chordNotes(symbol: string): string[] {
  const chord = Chord.get(symbol);
  return chord.empty ? [] : chord.notes;
}

/** Theory choices, not a model score. Shared pitch classes are a writing aid, not a voicing guarantee. */
export function harmonyChoices(
  chart: Chart,
  previous: string,
  family: "key" | "borrowed" | "dominant",
): HarmonyChoice[] {
  const tonic = keyName(chart.keyTonic, chart.mode).split(" ")[0];
  const mode =
    family === "borrowed"
      ? chart.mode === "major"
        ? "minor"
        : "major"
      : chart.mode;
  const notes = Scale.get(`${tonic} ${mode}`).notes;
  const qualities =
    mode === "major"
      ? ["", "m", "m", "", "", "m", "dim"]
      : ["m", "dim", "", "m", "m", "", ""];
  const degrees =
    mode === "major"
      ? ["I", "ii", "iii", "IV", "V", "vi", "vii°"]
      : ["i", "ii°", "III", "iv", "v", "VI", "VII"];
  const previousPcs = new Set(chordNotes(previous).map(Note.chroma));
  return notes
    .map((root, i) => {
      const target = `${root}${qualities[i]}`;
      const chord =
        family === "dominant"
          ? `${pitchClassName((Note.chroma(root) ?? 0) + 7, keyPrefersFlats(chart.keyTonic, chart.mode))}7`
          : target;
      return {
        chord,
        degree: family === "dominant" ? `V7/${degrees[i]}` : degrees[i],
        reason:
          family === "dominant"
            ? `Resolve to ${target}`
            : family === "borrowed"
              ? `From parallel ${mode}`
              : i === 0
                ? "Home"
                : i === 4
                  ? "Pull toward home"
                  : "In your key",
        shared: chordNotes(chord).filter((n) => previousPcs.has(Note.chroma(n)))
          .length,
      };
    })
    .filter((_, i) => family !== "dominant" || qualities[i] !== "dim");
}
