import { describe, expect, it } from "vitest";
import { STANDARD_TUNING_MIDI } from "../../src/lib/theory/solo";
import { chordChromas, chordVoicings } from "../../src/lib/theory/voicings";

const shapes = (symbol: string, max = 3) =>
  chordVoicings(symbol, max).map((v) => v.shape);

describe("chord shapes", () => {
  it("finds the open shapes every guitarist knows among the easiest three", () => {
    const expected: Record<string, string> = {
      C: "x32010",
      G: "320003",
      D: "xx0232",
      A: "x02220",
      E: "022100",
      Am: "x02210",
      Em: "022000",
      Dm: "xx0231",
      C7: "x32310",
      G7: "320001",
      B7: "x21202",
      E7: "020100",
      A7: "x02020",
      D7: "xx0212",
      Cmaj7: "x32000",
      Am7: "x02010",
      Dsus4: "xx0233",
      E5: "022xxx",
    };
    for (const [symbol, shape] of Object.entries(expected))
      expect(shapes(symbol), symbol).toContain(shape);
  });

  it("reaches for barre and extended shapes when open strings cannot spell the chord", () => {
    expect(shapes("F")).toContain("133211");
    expect(shapes("Bb")).toContain("x13331");
    // Open-string voicings of these are real and rank first; the book shapes follow.
    expect(shapes("C9", 5)).toContain("x32333");
    expect(shapes("Fmaj7", 6)).toContain("xx3210");
    expect(shapes("Bm", 5)).toContain("x24432");
  });

  it("puts the slash bass, and otherwise the root, on the lowest string", () => {
    for (const symbol of ["C/G", "D/F#", "Am/E", "G/B"]) {
      const parsed = chordChromas(symbol);
      if (!parsed) throw new Error(symbol);
      const voicings = chordVoicings(symbol, 5);
      expect(voicings.length, symbol).toBeGreaterThan(0);
      for (const v of voicings) {
        const lowest = v.frets.findIndex((f) => f >= 0);
        expect((STANDARD_TUNING_MIDI[lowest] + v.frets[lowest]) % 12).toBe(
          parsed.bass,
        );
      }
    }
    expect(shapes("C/G")).toContain("332010");
  });

  it("only offers shapes a hand can play, spelled from chord tones, in one strum", () => {
    for (const symbol of [
      "C",
      "F#m7",
      "Ebmaj7",
      "G13",
      "Bdim7",
      "Aaug",
      "Dm7b5",
      "E7#9",
      "Csus2",
      "Ab",
    ]) {
      const parsed = chordChromas(symbol);
      if (!parsed) throw new Error(symbol);
      const tones = new Set(parsed.chromas);
      const voicings = chordVoicings(symbol, 6);
      expect(voicings.length, symbol).toBeGreaterThan(0);
      for (const v of voicings) {
        const sounding = v.frets.filter((f) => f >= 0);
        expect(sounding.length, v.shape).toBeGreaterThanOrEqual(4);
        const first = v.frets.findIndex((f) => f >= 0);
        const last =
          v.frets.length - 1 - [...v.frets].reverse().findIndex((f) => f >= 0);
        for (let s = first; s <= last; s++)
          expect(v.frets[s], v.shape).toBeGreaterThanOrEqual(0);
        for (const c of v.chromas)
          if (c !== null)
            expect(tones.has(c), `${symbol} ${v.shape}`).toBe(true);
        const fretted = v.frets.filter((f) => f > 0);
        if (fretted.length)
          expect(
            Math.max(...fretted) - Math.min(...fretted),
          ).toBeLessThanOrEqual(3);
        expect(v.labels[first], v.shape).toBe("R");
      }
    }
  });

  it("labels intervals from the root and marks the diagram position", () => {
    const c9 = chordVoicings("C9", 6).find((v) => v.shape === "x32333");
    expect(c9?.labels).toEqual([null, "R", "3", "b7", "9", "5"]);
    expect(chordVoicings("G13", 1)[0].labels).toContain("13");
    expect(chordVoicings("Csus2", 1)[0].labels).toContain("2");
    const [bm] = chordVoicings("Bm", 1);
    expect(bm.position).toBeGreaterThanOrEqual(1);
    const ab = chordVoicings("Ab", 3).find((v) => v.shape === "4665xx");
    expect(ab?.position).toBe(4);
    expect(chordVoicings("C", 1)[0].position).toBe(1);
  });

  it("returns nothing for text that is not a chord", () => {
    expect(chordVoicings("N.C.")).toEqual([]);
    expect(chordVoicings("")).toEqual([]);
    expect(chordVoicings("%")).toEqual([]);
  });
});
