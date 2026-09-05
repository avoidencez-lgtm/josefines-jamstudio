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

/** Picks one drill from the weakest of the three measured scores. */
export function drillFor(a: TakeAnalysis, tempo: number): string {
  if (a.detectedTransients < 8) {
    return "Too few pick attacks were detected to judge this take. Record at least a full chorus with the DI channel selected.";
  }
  const slow = Math.max(40, tempo - 20);
  const weakest = Math.min(
    a.timingAccuracyPct,
    a.dynamicConsistencyPct,
    a.intonationAccuracyPct,
  );
  if (weakest === a.timingAccuracyPct) {
    return `Five minutes with only the click at ${slow} BPM, muting the band, landing every downbeat before bringing the tempo back to ${tempo}.`;
  }
  if (weakest === a.dynamicConsistencyPct) {
    return `Play the form once at ${tempo} BPM at a single, even pick attack, then once accenting only beats 2 and 4, listening back to the DI stem for evenness.`;
  }
  return `Loop the section with the most bends at ${slow} BPM and check every bend against the tuner before releasing it.`;
}
