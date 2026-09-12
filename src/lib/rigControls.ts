/** MIDI program numbers are 0–127 even when a profile only names a few presets. */
export function clampProgramNumber(raw: string): number {
  return Math.min(127, Math.max(0, Number.parseInt(raw || "0", 10) || 0));
}

/** Read a range input from the event target so pointer-up is not a stale closure. */
export function committedSliderValue(value: string): number {
  return Number.parseInt(value, 10);
}
