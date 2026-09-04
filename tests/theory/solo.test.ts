import { describe, expect, it } from "vitest";
import {
  classify,
  fretMarks,
  suggestForChord,
} from "../../src/lib/theory/solo";

describe("chord family classification", () => {
  it("tells major from minor sevenths and reads jazz spellings", () => {
    expect(classify("")).toBe("maj");
    expect(classify("maj7")).toBe("maj7");
    expect(classify("M7")).toBe("maj7");
    expect(classify("Δ7")).toBe("maj7");
    expect(classify("m7")).toBe("min7");
    expect(classify("-7")).toBe("min7");
    expect(classify("m")).toBe("min");
    expect(classify("7")).toBe("dom7");
    expect(classify("13")).toBe("dom7");
    expect(classify("7b9")).toBe("dom7alt");
    expect(classify("7alt")).toBe("dom7alt");
    expect(classify("m7b5")).toBe("halfdim");
    expect(classify("ø7")).toBe("halfdim");
    expect(classify("dim7")).toBe("dim");
    expect(classify("sus4")).toBe("sus");
    expect(classify("7sus4")).toBe("sus");
    expect(classify("5")).toBe("power");
    expect(classify("mMaj7")).toBe("minmaj7");
  });
});

describe("soloing suggestions", () => {
  it("gives mixolydian and blues over a dominant chord with the right guide tones", () => {
    const s = suggestForChord("A7", { keyTonic: 9, mode: "major" });
    expect(s).not.toBeNull();
    expect(s?.chordTones).toEqual(["A", "C#", "E", "G"]);
    expect(s?.guideTones).toEqual(["C#", "G"]);
    expect(s?.scales[0].name).toBe("A mixolydian");
    expect(s?.scales[0].notes).toEqual(["A", "B", "C#", "D", "E", "F#", "G"]);
    expect(s?.scales.some((x) => x.name === "A minor blues")).toBe(true);
    expect(s?.keyScale?.name).toBe("A minor blues");
  });

  it("spells with flats in flat keys", () => {
    const s = suggestForChord("Bb7", { keyTonic: 5, mode: "major" });
    expect(s?.chordTones).toEqual(["Bb", "D", "F", "Ab"]);
    expect(s?.scales[0].notes).toEqual(["Bb", "C", "D", "Eb", "F", "G", "Ab"]);
  });

  it("uses dorian for minor sevenths and locrian for half-diminished", () => {
    expect(suggestForChord("Dm7")?.scales[0].name).toBe("D dorian");
    const hd = suggestForChord("Bm7b5");
    expect(hd?.scales[0].name).toBe("B locrian");
    expect(hd?.chordTones).toEqual(["B", "D", "F", "A"]);
  });

  it("handles slash chords by the chord above the slash", () => {
    const s = suggestForChord("C/E");
    expect(s?.chordTones).toEqual(["C", "E", "G"]);
    expect(s?.scales[0].name).toBe("C major pentatonic");
  });

  it("falls back for unreadable symbols", () => {
    expect(suggestForChord("N.C.")).toBeNull();
    expect(suggestForChord("")).toBeNull();
  });
});

describe("fretboard", () => {
  it("places pitch classes on every string", () => {
    const marks = fretMarks([9], 12); // A
    // Low E string: fret 5; A string: 0 and 12; D: 7; G: 2; B: 10; high e: 5.
    expect(marks.filter((m) => m.string === 0).map((m) => m.fret)).toEqual([5]);
    expect(marks.filter((m) => m.string === 1).map((m) => m.fret)).toEqual([
      0, 12,
    ]);
    expect(marks.filter((m) => m.string === 2).map((m) => m.fret)).toEqual([7]);
    expect(marks.filter((m) => m.string === 3).map((m) => m.fret)).toEqual([2]);
    expect(marks.filter((m) => m.string === 4).map((m) => m.fret)).toEqual([
      10,
    ]);
    expect(marks.filter((m) => m.string === 5).map((m) => m.fret)).toEqual([5]);
  });
});
