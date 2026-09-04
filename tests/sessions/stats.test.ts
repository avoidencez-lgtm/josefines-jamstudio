import { describe, expect, it } from "vitest";
import {
  drillFor,
  formatJamTime,
  practiceStreakDays,
} from "../../src/screens/Sessions";

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

describe("jam time", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatJamTime(42)).toBe("42 s");
    expect(formatJamTime(15 * 60)).toBe("15 min");
    expect(formatJamTime(2 * 3600 + 5 * 60)).toBe("2 h 5 min");
  });
});

describe("drill suggestion", () => {
  const base = {
    timingAccuracyPct: 90,
    dynamicConsistencyPct: 90,
    intonationAccuracyPct: 90,
    detectedTransients: 40,
    summary: "",
  };

  it("asks for more material when too few attacks were detected", () => {
    expect(drillFor({ ...base, detectedTransients: 3 }, 120)).toMatch(
      /Too few pick attacks/,
    );
  });

  it("targets the weakest metric", () => {
    expect(drillFor({ ...base, timingAccuracyPct: 70 }, 120)).toMatch(
      /only the click at 100 BPM/,
    );
    expect(drillFor({ ...base, dynamicConsistencyPct: 70 }, 120)).toMatch(
      /even pick attack/,
    );
    expect(drillFor({ ...base, intonationAccuracyPct: 70 }, 120)).toMatch(
      /tuner/,
    );
  });
});
