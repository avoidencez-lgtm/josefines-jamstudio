import { describe, expect, it, vi } from "vitest";
import { scrollBarInStrip } from "../../src/components/ChordStrip";

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
