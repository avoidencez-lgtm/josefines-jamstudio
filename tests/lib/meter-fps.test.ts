import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { paintMeter } from "../../src/components/Meter";
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

describe("Meter canvas painter", () => {
  it("binds canvasRef so RMS and peak bars can paint", () => {
    const source = readFileSync("src/components/Meter.tsx", "utf8");
    expect(source).toMatch(/<canvas[\s\S]*?ref=\{canvasRef\}/);
  });

  it("fills RMS, ticks peak and lights the clip LED", () => {
    const calls: Array<[string, number, number, number, number]> = [];
    const ctx = {
      fillStyle: "",
      clearRect: () => undefined,
      fillRect: (x: number, y: number, w: number, h: number) => {
        calls.push([String(ctx.fillStyle), x, y, w, h]);
      },
    };
    paintMeter(ctx, 100, 8, {
      peakDb: -12,
      rmsDb: -30,
      clip: true,
      colors: { bg: "bg", accent: "accent", ink: "ink", record: "record" },
    });
    expect(calls).toEqual([
      ["bg", 0, 0, 100, 8],
      ["accent", 0, 0, 50, 8],
      ["ink", 80, 0, 2, 8],
      ["record", 96, 0, 4, 8],
    ]);
  });
});
