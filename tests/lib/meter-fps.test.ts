import { describe, expect, it } from "vitest";
import {
  afterCanvasPaint,
  canvasRafShouldRun,
  transportClockLive,
} from "../../src/lib/meterFps";

describe("canvas rAF idle rules", () => {
  it("runs only while the clock is live and the document is visible", () => {
    expect(transportClockLive("stopped")).toBe(false);
    expect(transportClockLive("paused")).toBe(false);
    expect(transportClockLive("playing")).toBe(true);
    expect(transportClockLive("counting_in")).toBe(true);
    expect(canvasRafShouldRun(true, false)).toBe(true);
    expect(canvasRafShouldRun(true, true)).toBe(false);
    expect(canvasRafShouldRun(false, false)).toBe(false);
    expect(canvasRafShouldRun(false, true)).toBe(false);
  });

  it("paints once and does not schedule when stopped or hidden", () => {
    let paints = 0;
    let scheduled = 0;
    const raf = () => {
      scheduled += 1;
      return scheduled;
    };
    const paint = () => {
      paints += 1;
    };
    expect(afterCanvasPaint(false, false, paint, raf)).toBe(0);
    expect(afterCanvasPaint(true, true, paint, raf)).toBe(0);
    expect(paints).toBe(2);
    expect(scheduled).toBe(0);
    expect(afterCanvasPaint(true, false, paint, raf)).toBe(1);
    expect(paints).toBe(3);
    expect(scheduled).toBe(1);
  });
});
