import type { TakeAnalysis } from "../../ipc/contract";

/** Take timestamps are either ISO strings or Rust's `secs.millis` epoch form. */
export function takeDate(timestamp: string): Date | null {
  const epoch = /^\d+(\.\d+)?$/.test(timestamp)
    ? new Date(Number.parseFloat(timestamp) * 1000)
    : new Date(timestamp);
  return Number.isNaN(epoch.getTime()) ? null : epoch;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Consecutive calendar days with at least one take, ending today or yesterday. */
export function practiceStreakDays(
  takes: { timestamp: string }[],
  now = new Date(),
): number {
  const days = new Set<string>();
  for (const t of takes) {
    const d = takeDate(t.timestamp);
    if (d) days.add(dayKey(d));
  }
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Rolling seven local days ending today. */
export function weekWindowStart(now = new Date()): Date {
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - 6);
  return start;
}

export type SessionProgress = {
  sessionsThisWeek: number;
  minutesThisWeek: number;
  minutesAll: number;
  tempoRecords: { chartId: string; tempo: number }[];
  trendTakes: number;
  meanTimingMs: number | null;
  meanCents: number | null;
};

/** Files-as-truth activity from take manifests. Not a quality score. */
export function sessionProgress(
  takes: {
    id: string;
    sessionId: string;
    timestamp: string;
    durationSecs: number;
    chartId: string;
    tempo: number;
  }[],
  analysis: Record<string, TakeAnalysis>,
  now = new Date(),
): SessionProgress {
  const weekStart = weekWindowStart(now);
  const weekSessions = new Set<string>();
  let weekSecs = 0;
  let allSecs = 0;
  const tempoByChart = new Map<string, number>();
  const dated = takes
    .map((t) => ({ take: t, date: takeDate(t.timestamp) }))
    .filter((row): row is { take: (typeof takes)[number]; date: Date } =>
      Boolean(row.date),
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const { take, date } of dated) {
    if (Number.isFinite(take.durationSecs) && take.durationSecs > 0) {
      allSecs += take.durationSecs;
    }
    if (date >= weekStart) {
      weekSessions.add(take.sessionId || take.id);
      if (Number.isFinite(take.durationSecs) && take.durationSecs > 0) {
        weekSecs += take.durationSecs;
      }
    }
    if (
      take.chartId &&
      Number.isFinite(take.tempo) &&
      take.tempo >= 20 &&
      take.tempo <= 300
    ) {
      const prev = tempoByChart.get(take.chartId);
      if (prev === undefined || take.tempo > prev) {
        tempoByChart.set(take.chartId, take.tempo);
      }
    }
  }
  const recent = dated.slice(0, 20);
  let timingSum = 0;
  let timingN = 0;
  let centsSum = 0;
  let centsN = 0;
  let trendTakes = 0;
  for (const { take } of recent) {
    const a = analysis[take.id];
    if (!a || a.meanGridDistanceMs === undefined) continue;
    trendTakes += 1;
    if (a.meanGridDistanceMs != null) {
      timingSum += a.meanGridDistanceMs;
      timingN += 1;
    }
    if (a.meanAbsCents != null) {
      centsSum += a.meanAbsCents;
      centsN += 1;
    }
  }
  return {
    sessionsThisWeek: weekSessions.size,
    minutesThisWeek: weekSecs / 60,
    minutesAll: allSecs / 60,
    tempoRecords: [...tempoByChart.entries()]
      .map(([chartId, tempo]) => ({ chartId, tempo }))
      .sort((a, b) => b.tempo - a.tempo || a.chartId.localeCompare(b.chartId)),
    trendTakes,
    meanTimingMs: timingN ? timingSum / timingN : null,
    meanCents: centsN ? centsSum / centsN : null,
  };
}

/** Sum take lengths, treating missing or non-finite durations as zero. */
export function totalRecordedSecs(takes: { durationSecs: number }[]): number {
  return takes.reduce(
    (acc, t) =>
      acc +
      (Number.isFinite(t.durationSecs) && t.durationSecs > 0
        ? t.durationSecs
        : 0),
    0,
  );
}

/** Sessions DAW-export notice: success uses ok tokens; failure is an alert. */
export function dawExportBanner(ok: boolean): {
  role?: "alert";
  className: string;
} {
  return ok
    ? {
        className:
          "p-3 bg-[var(--ok-soft)] border border-[var(--ok)] rounded-[var(--radius-m)] text-xs font-mono text-[var(--ok)]",
      }
    : {
        role: "alert",
        className:
          "p-3 bg-[var(--error-soft)] border border-[var(--error)] rounded-[var(--radius-m)] text-xs font-mono text-[var(--error)]",
      };
}

export function formatJamTime(totalSecs: number): string {
  if (totalSecs < 60) return `${Math.round(totalSecs)} s`;
  const h = Math.floor(totalSecs / 3600);
  const m = Math.round((totalSecs % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function takeMeasurements(a: TakeAnalysis): [string, string][] {
  if (a.meanGridDistanceMs === undefined)
    return [["Measurements", "Analyze again to get evidence and coverage."]];
  const value = (n: number | null | undefined, unit: string) =>
    n == null ? "not enough evidence" : `${n.toFixed(1)} ${unit}`;
  return [
    ["Attacks", `The take has ${a.detectedTransients} detected attacks.`],
    [
      "Distance",
      `Quarter-note grid distance is ${value(a.meanGridDistanceMs, "ms")}.`,
    ],
    [
      "Bias",
      a.gridBiasMs == null
        ? "Grid bias does not have enough evidence."
        : `Grid bias is ${a.gridBiasMs.toFixed(1)} ms (positive is late).`,
    ],
    ["Spread", `Grid spread is ${value(a.gridSpreadMs, "ms")}.`],
    [
      "Variation",
      `Attack-level variation is ${value(a.attackLevelCvPct, "% CV")}.`,
    ],
    [
      "Pitch",
      `Pitch distance to the nearest note is ${value(a.meanAbsCents, "cents")}.`,
    ],
    ["Frames", `Pitched frames are ${a.pitchedFrames ?? 0}.`],
  ];
}

/** Offer a controlled exercise, not a diagnosis of musical quality. */
export function drillFor(a: TakeAnalysis, tempo: number): string {
  if (a.meanGridDistanceMs === undefined)
    return "Analyze this take again before choosing an exercise from its measurements.";
  if (a.detectedTransients < 8) {
    return "Too few pick attacks were detected to judge this take. Record at least a full chorus with the DI channel selected.";
  }
  const slow = Math.max(40, tempo - 20);
  if (a.meanAbsCents != null && a.meanAbsCents > 15) {
    return `Try sustained, unbent notes at ${slow} BPM and compare them with the tuner. Bends and vibrato can intentionally move away from equal temperament.`;
  }
  if (a.meanGridDistanceMs != null && a.meanGridDistanceMs > 30) {
    return `Try eight straight quarter notes with the click at ${slow} BPM and compare another take. Syncopation and swing can intentionally sit away from this grid.`;
  }
  if (a.attackLevelCvPct != null && a.attackLevelCvPct > 25) {
    return `Try eight evenly picked notes at ${tempo} BPM, then repeat with deliberate accents and listen back. Variation is not automatically a problem.`;
  }
  return "Listen back and choose one phrase to keep or improve. These measurements do not judge phrasing, feel or songwriting quality.";
}
