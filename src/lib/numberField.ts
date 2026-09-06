/** Decimal places implied by a step like 0.1 or 0.25, so snap stays exact. */
function stepPlaces(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = step.toString().toLowerCase();
  if (s.includes("e")) {
    const exp = Number(s.split("e")[1]);
    return Number.isFinite(exp) ? Math.max(0, -exp) : 0;
  }
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Commit a typed number on blur/Enter. Empty or garbage keeps the last value. */
export function committedNumber(
  draft: string,
  fallback: number,
  min: number,
  max: number,
  step = 1,
): number {
  const v = Number(draft);
  if (!draft.trim() || !Number.isFinite(v)) return fallback;
  const snapped = Math.round(v / step) * step;
  const clean = Number(snapped.toFixed(stepPlaces(step)));
  return Math.max(min, Math.min(max, clean));
}
