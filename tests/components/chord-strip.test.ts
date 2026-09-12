import { describe, expect, it, vi } from "vitest";
import {
  loopRangeFromShiftClick,
  paintPlayhead,
  scrollBarInStrip,
} from "../../src/components/ChordStrip";

const viewport = { innerWidth: 1100, innerHeight: 700 };

describe("scrollBarInStrip", () => {
  it("scrolls only the strip and leaves the room scrollTop alone", () => {
    const room = { scrollTop: 240 };
    const strip = {
      clientWidth: 200,
      getBoundingClientRect: () => ({
        top: 20,
        bottom: 80,
        left: 0,
        right: 200,
      }),
      scrollTo: vi.fn(),
    };
    scrollBarInStrip(strip, { offsetLeft: 500, offsetWidth: 88 }, viewport);
    expect(strip.scrollTo).toHaveBeenCalledWith({
      left: 444,
      behavior: "smooth",
    });
    expect(room.scrollTop).toBe(240);
  });

  it("does nothing when the strip is below the fold", () => {
    const strip = {
      clientWidth: 200,
      getBoundingClientRect: () => ({
        top: 800,
        bottom: 860,
        left: 0,
        right: 200,
      }),
      scrollTo: vi.fn(),
    };
    scrollBarInStrip(strip, { offsetLeft: 500, offsetWidth: 88 }, viewport);
    expect(strip.scrollTo).not.toHaveBeenCalled();
  });
});

describe("loopRangeFromShiftClick", () => {
  it("does not send a 0-based loop start when transport is stopped or counting in", () => {
    expect(loopRangeFromShiftClick(null, 0, 4)).toEqual([4, 5]);
    expect(loopRangeFromShiftClick(null, 2, 4)).toEqual([2, 5]);
    expect(loopRangeFromShiftClick(1, 0, 4)).toEqual([1, 5]);
  });
});

describe("paintPlayhead", () => {
  it("fills the bar by progress and clamps", () => {
    const calls: Array<[string, number, number, number, number]> = [];
    const ctx = {
      fillStyle: "",
      clearRect: vi.fn(),
      fillRect: (x: number, y: number, w: number, h: number) => {
        calls.push([ctx.fillStyle, x, y, w, h]);
      },
    };
    paintPlayhead(ctx, 100, 2, 0.25, { bg: "bg", accent: "accent" });
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 100, 2);
    expect(calls).toEqual([
      ["bg", 0, 0, 100, 2],
      ["accent", 0, 0, 25, 2],
    ]);
    calls.length = 0;
    paintPlayhead(ctx, 100, 2, 2, { bg: "bg", accent: "accent" });
    expect(calls[1][3]).toBe(100);
    calls.length = 0;
    paintPlayhead(ctx, 100, 2, -1, { bg: "bg", accent: "accent" });
    expect(calls[1][3]).toBe(0);
  });
});
