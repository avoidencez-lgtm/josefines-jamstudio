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
    n == null ? "Not enough evidence" : `${n.toFixed(1)} ${unit}`;
  return [
    ["Detected attacks", String(a.detectedTransients)],
    ["Quarter-note grid distance", value(a.meanGridDistanceMs, "ms")],
    ["Grid bias (+ late / − early)", value(a.gridBiasMs, "ms")],
    ["Grid spread", value(a.gridSpreadMs, "ms")],
    ["Attack-level variation", value(a.attackLevelCvPct, "% CV")],
    ["Pitch distance to nearest note", value(a.meanAbsCents, "cents")],
    ["Pitched frames", String(a.pitchedFrames ?? 0)],
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
