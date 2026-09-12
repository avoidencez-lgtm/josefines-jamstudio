/** Transport states that move the playhead and meters. */
export function transportClockLive(state: string): boolean {
  return state === "playing" || state === "counting_in";
}

/** rAF runs only while the clock is live and the document is visible. */
export function canvasRafShouldRun(live: boolean, hidden: boolean): boolean {
  return live && !hidden;
}

/**
 * Paint once, then schedule the next frame only when live and visible.
 * Tests drive `raf` so a stopped or hidden document does not loop.
 */
export function afterCanvasPaint(
  live: boolean,
  hidden: boolean,
  paint: () => void,
  raf: (cb: FrameRequestCallback) => number,
): number {
  paint();
  return canvasRafShouldRun(live, hidden) ? raf(() => {}) : 0;
}

/** Separate rAF counters so meter and playhead do not double-count. */
function ticker() {
  let frames = 0;
  let fps = 0;
  let last = 0;
  return {
    tick() {
      const now = performance.now();
      if (last === 0) last = now;
      frames += 1;
      if (now - last >= 1000) {
        fps = (frames * 1000) / (now - last);
        frames = 0;
        last = now;
      }
    },
    last() {
      return fps;
    },
  };
}

const meter = ticker();
const playhead = ticker();

export function tickMeterFrame(): void {
  meter.tick();
}

export function lastMeterFps(): number {
  return meter.last();
}

export function tickPlayheadFrame(): void {
  playhead.tick();
}

export function lastPlayheadFps(): number {
  return playhead.last();
}
