import { z } from "zod";
import type { TakeAnalysis } from "../../ipc/contract";

const measurement = z.number().finite().nonnegative().nullable();
const count = z.number().int().nonnegative().safe();
const score = z.number().finite().min(0).max(100);
const measurements = z.object({
  meanGridDistanceMs: measurement,
  gridBiasMs: z.number().finite().nullable(),
  gridSpreadMs: measurement,
  attackLevelCvPct: measurement,
  meanAbsCents: z.number().finite().min(0).max(50).nullable(),
  pitchedFrames: count,
  detectedTransients: count,
  timingAccuracyPct: score,
  dynamicConsistencyPct: score,
  intonationAccuracyPct: score,
  summary: z.string().max(10_000),
});
const saved = measurements.extend({
  schemaVersion: z.literal(1),
  analyzerVersion: z.literal(2),
  analyzedAtMs: count,
  sourceSampleRate: z.number().int().positive(),
  sourceSampleCount: count,
  sourceTempo: z.number().finite().positive(),
});

/** A malformed or newer analysis must never hide the recording that owns it. */
export function savedTakeAnalysis(value: unknown): TakeAnalysis | null {
  const parsed = saved.safeParse(value);
  return parsed.success ? measurements.parse(parsed.data) : null;
}
