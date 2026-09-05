/** Groove meter as `4/4`. The engine refuses any other pairing. */
export function meterLabel(meter: readonly [number, number]): string {
  return `${meter[0]}/${meter[1]}`;
}

/** Styles the current meter can play, plus `keepId` so a stale select stays valid. */
export function stylesInMeter<
  T extends { id: string; feel: { timeSig: readonly [number, number] } },
>(styles: T[], meter: readonly [number, number], keepId?: string | null): T[] {
  const want = meterLabel(meter);
  return styles.filter(
    (s) => meterLabel(s.feel.timeSig) === want || s.id === keepId,
  );
}
