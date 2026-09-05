/** Commit a typed number on blur/Enter. Empty or garbage keeps the last value. */
export function committedNumber(
  draft: string,
  fallback: number,
  min: number,
  max: number,
  step = 1,
): number {
  const v = Number(draft);
  return draft.trim() && Number.isFinite(v)
    ? Math.max(min, Math.min(max, Math.round(v / step) * step))
    : fallback;
}
