import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { referenceLoopDraft } from "../../src/components/ReferencePlayer";

describe("referenceLoopDraft", () => {
  it("refreshes start and end when telemetry loop bounds change", () => {
    expect(referenceLoopDraft({ loop_start: 0, loop_end: 180 })).toEqual({
      start: "0",
      end: "180",
    });
    expect(referenceLoopDraft({ loop_start: 12.4, loop_end: 28.1 })).toEqual({
      start: "12.4",
      end: "28.1",
    });
    const source = readFileSync("src/components/ReferencePlayer.tsx", "utf8");
    expect(source).toContain("referenceLoopDraft");
    expect(source).toContain("song.loop_start, song.loop_end");
  });
});
