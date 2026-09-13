/** Elapsed take clock from the transport snapshot the UI already reads. */
export function recordingReadout(input: {
  bar: number;
  beat: number;
  positionBeats: number;
  bpm: number;
}): string {
  const bpm = Number.isFinite(input.bpm) && input.bpm > 0 ? input.bpm : 120;
  const beats = Number.isFinite(input.positionBeats)
    ? Math.max(0, input.positionBeats)
    : 0;
  const total = Math.floor((beats * 60) / bpm);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const clock = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const bar = Number.isFinite(input.bar)
    ? Math.max(1, Math.trunc(input.bar))
    : 1;
  const beat = Number.isFinite(input.beat)
    ? Math.max(1, Math.trunc(input.beat))
    : 1;
  return `Recording bar ${bar} beat ${beat} · ${clock}.`;
}
