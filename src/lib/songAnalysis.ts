import { z } from "zod";

const time = z.number().finite().min(0).max(1200);
const schema = z.object({
  schemaVersion: z.literal(1),
  analyzer: z.literal("local-chroma-v1"),
  confidence: z.literal("low"),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  seconds: time.min(2),
  bpm: z.number().finite().min(40).max(250).nullable(),
  beats: z.array(time).max(5000),
  chords: z
    .array(
      z.object({
        start: time,
        end: time,
        chord: z
          .string()
          .regex(/^[A-G](?:#|b)?m?$/)
          .nullable(),
      }),
    )
    .max(5000),
  key: z
    .string()
    .regex(/^[A-G](?:#|b)? (major|minor)$/)
    .nullable(),
});
export type SongAnalysis = z.infer<typeof schema>;

export function readSongAnalysis(value: unknown): SongAnalysis | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return null;
  const result = parsed.data;
  if (
    result.beats.some(
      (b, i) => b >= result.seconds || (i > 0 && b <= result.beats[i - 1]),
    ) ||
    result.chords.some(
      (c, i) =>
        c.end > result.seconds ||
        c.end <= c.start ||
        (i > 0 && c.start < result.chords[i - 1].end),
    )
  )
    return null;
  return result;
}

/** Collapse equal estimates for reading; persisted measurements retain every beat. */
export function chordPassages(analysis: SongAnalysis) {
  const result: SongAnalysis["chords"] = [];
  for (const chord of analysis.chords) {
    const last = result.at(-1);
    if (last && last.chord === chord.chord && last.end === chord.start)
      last.end = chord.end;
    else result.push({ ...chord });
  }
  return result;
}
