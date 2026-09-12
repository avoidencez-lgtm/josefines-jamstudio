import { describe, expect, it } from "vitest";
import {
  drillFor,
  formatJamTime,
  practiceStreakDays,
  sessionProgress,
  takeMeasurements,
  totalRecordedSecs,
} from "../../src/lib/sessions/stats";

const day = (offset: number, now: Date) => {
  const d = new Date(now);
  d.setDate(d.getDate() - offset);
  d.setHours(12, 0, 0, 0);
  return d;
};

describe("practice streak", () => {
  const now = new Date(2026, 8, 4, 18, 0, 0);

  it("is zero with no takes", () => {
    expect(practiceStreakDays([], now)).toBe(0);
  });

  it("counts consecutive days ending today, accepting both timestamp forms", () => {
    const takes = [
      { timestamp: day(0, now).toISOString() },
      { timestamp: `${Math.floor(day(1, now).getTime() / 1000)}.123` },
      { timestamp: day(2, now).toISOString() },
      { timestamp: day(5, now).toISOString() },
    ];
    expect(practiceStreakDays(takes, now)).toBe(3);
  });

  it("keeps yesterday's streak alive until the day is over", () => {
    const takes = [
      { timestamp: day(1, now).toISOString() },
      { timestamp: day(2, now).toISOString() },
    ];
    expect(practiceStreakDays(takes, now)).toBe(2);
  });

  it("breaks on a gap", () => {
    const takes = [
      { timestamp: day(0, now).toISOString() },
      { timestamp: day(2, now).toISOString() },
    ];
    expect(practiceStreakDays(takes, now)).toBe(1);
  });

  it("ignores unparseable timestamps", () => {
    expect(practiceStreakDays([{ timestamp: "garbage" }], now)).toBe(0);
  });
});

describe("session progress", () => {
  const now = new Date(2026, 8, 11, 18, 0, 0);
  const take = (
    id: string,
    offset: number,
    extras: Partial<{
      sessionId: string;
      durationSecs: number;
      chartId: string;
      tempo: number;
    }> = {},
  ) => ({
    id,
    sessionId: extras.sessionId ?? `session-${id}`,
    timestamp: day(offset, now).toISOString(),
    durationSecs: extras.durationSecs ?? 60,
    chartId: extras.chartId ?? "blues-12-bar",
    tempo: extras.tempo ?? 120,
  });

  it("is empty with no takes", () => {
    const p = sessionProgress([], {}, now);
    expect(p.sessionsThisWeek).toBe(0);
    expect(p.minutesThisWeek).toBe(0);
    expect(p.minutesAll).toBe(0);
    expect(p.tempoRecords).toEqual([]);
    expect(p.trendTakes).toBe(0);
    expect(p.meanTimingMs).toBeNull();
    expect(p.meanCents).toBeNull();
  });

  it("counts unique sessions and minutes in the last seven local days", () => {
    const p = sessionProgress(
      [
        take("a", 0, { sessionId: "s1", durationSecs: 120 }),
        take("b", 0, { sessionId: "s1", durationSecs: 60 }),
        take("c", 3, { sessionId: "s2", durationSecs: 180 }),
        take("old", 8, { sessionId: "s3", durationSecs: 600 }),
      ],
      {},
      now,
    );
    expect(p.sessionsThisWeek).toBe(2);
    expect(p.minutesThisWeek).toBe(6);
    expect(p.minutesAll).toBe(16);
  });

  it("keeps the highest tempo per chart from every take file", () => {
    const p = sessionProgress(
      [
        take("fast", 0, { chartId: "blues-12-bar", tempo: 140 }),
        take("slow", 1, { chartId: "blues-12-bar", tempo: 90 }),
        take("other", 1, { chartId: "ballad", tempo: 70 }),
      ],
      {},
      now,
    );
    expect(p.tempoRecords).toEqual([
      { chartId: "blues-12-bar", tempo: 140 },
      { chartId: "ballad", tempo: 70 },
    ]);
  });

  it("averages timing and pitch on analyzed takes among the last 20", () => {
    const older = Array.from({ length: 20 }, (_, i) =>
      take(`pad-${i}`, i + 1, { chartId: "pad", tempo: 100 }),
    );
    const takes = [
      take("fast", 0, { chartId: "blues-12-bar", tempo: 140 }),
      ...older,
      take("stale", 30, { chartId: "blues-12-bar", tempo: 200 }),
    ];
    const analysis = {
      fast: {
        timingAccuracyPct: 80,
        dynamicConsistencyPct: 80,
        intonationAccuracyPct: 80,
        detectedTransients: 20,
        summary: "",
        meanGridDistanceMs: 10,
        meanAbsCents: 8,
      },
      "pad-0": {
        timingAccuracyPct: 80,
        dynamicConsistencyPct: 80,
        intonationAccuracyPct: 80,
        detectedTransients: 20,
        summary: "",
        meanGridDistanceMs: 20,
        meanAbsCents: 4,
      },
      stale: {
        timingAccuracyPct: 80,
        dynamicConsistencyPct: 80,
        intonationAccuracyPct: 80,
        detectedTransients: 20,
        summary: "",
        meanGridDistanceMs: 99,
        meanAbsCents: 40,
      },
    };
    const p = sessionProgress(takes, analysis, now);
    expect(p.trendTakes).toBe(2);
    expect(p.meanTimingMs).toBe(15);
    expect(p.meanCents).toBe(6);
  });
});

describe("jam time", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatJamTime(42)).toBe("42 s");
    expect(formatJamTime(15 * 60)).toBe("15 min");
    expect(formatJamTime(2 * 3600 + 5 * 60)).toBe("2 h 5 min");
  });

  it("skips non-finite take durations so the header is not NaN min", () => {
    expect(
      totalRecordedSecs([
        { durationSecs: 60 },
        { durationSecs: Number.NaN },
        { durationSecs: Number.POSITIVE_INFINITY },
        { durationSecs: 15 },
      ]),
    ).toBe(75);
    expect(
      formatJamTime(totalRecordedSecs([{ durationSecs: Number.NaN }])),
    ).toBe("0 s");
  });
});

describe("drill suggestion", () => {
  const base = {
    timingAccuracyPct: 90,
    dynamicConsistencyPct: 90,
    intonationAccuracyPct: 90,
    detectedTransients: 40,
    summary: "",
    meanGridDistanceMs: 10,
    meanAbsCents: 5,
    attackLevelCvPct: 10,
  };

  it("asks for more material when too few attacks were detected", () => {
    expect(drillFor({ ...base, detectedTransients: 3 }, 120)).toMatch(
      /Too few pick attacks/,
    );
  });

  it("offers controlled exercises without treating musical choices as errors", () => {
    expect(drillFor({ ...base, meanGridDistanceMs: 50 }, 120)).toMatch(
      /quarter notes with the click at 100 BPM/,
    );
    expect(drillFor({ ...base, attackLevelCvPct: 40 }, 120)).toMatch(
      /evenly picked notes/,
    );
    expect(drillFor({ ...base, meanAbsCents: 30 }, 120)).toMatch(/tuner/);
  });

  it("distinguishes missing evidence from a measured zero", () => {
    const rows = takeMeasurements({
      ...base,
      meanGridDistanceMs: 0,
      gridBiasMs: null,
      meanAbsCents: null,
      pitchedFrames: 0,
    });
    expect(rows).toContainEqual([
      "Distance",
      "Quarter-note grid distance is 0.0 ms.",
    ]);
    expect(rows).toContainEqual([
      "Bias",
      "Grid bias does not have enough evidence.",
    ]);
    expect(rows).toContainEqual(["Frames", "Pitched frames are 0."]);
    expect(drillFor({ ...base, meanGridDistanceMs: undefined }, 120)).toMatch(
      /again/,
    );
  });
});
