import { expect, it } from "vitest";
import { savedTakeAnalysis } from "../../src/lib/sessions/analysis";

const saved = {
  schemaVersion: 1,
  analyzerVersion: 2,
  analyzedAtMs: 1_700_000_000_000,
  sourceSampleRate: 48_000,
  sourceSampleCount: 96_000,
  sourceTempo: 120,
  meanGridDistanceMs: 0,
  gridBiasMs: -10,
  gridSpreadMs: 10,
  attackLevelCvPct: 140,
  meanAbsCents: null,
  pitchedFrames: 0,
  detectedTransients: 4,
  timingAccuracyPct: 100,
  dynamicConsistencyPct: 0,
  intonationAccuracyPct: 0,
  summary: "No confident pitch.",
};

it("restores measured zero, negative bias, unbounded CV and unavailable pitch", () => {
  expect(savedTakeAnalysis({ ...saved, futureField: true })).toMatchObject({
    meanGridDistanceMs: 0,
    gridBiasMs: -10,
    attackLevelCvPct: 140,
    meanAbsCents: null,
  });
});

it("rejects damaged, stale-version and nonfinite evidence without throwing", () => {
  for (const value of [
    null,
    "broken",
    {},
    { ...saved, analyzerVersion: 1 },
    { ...saved, analyzerVersion: 3 },
    { ...saved, meanGridDistanceMs: "0" },
    { ...saved, meanAbsCents: Number.NaN },
    { ...saved, detectedTransients: -1 },
    { ...saved, sourceSampleRate: 0 },
  ]) {
    expect(savedTakeAnalysis(value)).toBeNull();
  }
});
