import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { recordingReadout } from "../../src/lib/recordingReadout";

it("formats bar, beat and elapsed clock from the live transport snapshot", () => {
  expect(
    recordingReadout({ bar: 3, beat: 2, positionBeats: 10, bpm: 120 }),
  ).toBe("Recording bar 3 beat 2 · 0:05.");
  expect(
    recordingReadout({ bar: 1, beat: 1, positionBeats: 240, bpm: 120 }),
  ).toBe("Recording bar 1 beat 1 · 2:00.");
  expect(
    recordingReadout({
      bar: 5,
      beat: 1,
      positionBeats: 0,
      bpm: 120,
      seconds: 12,
    }),
  ).toBe("Recording bar 5 beat 1 · 0:12.");
});

it("is the TransportBar recording label", () => {
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    "recordingReadout({",
  );
});

it("refuses non-finite tempo and position instead of inventing a clock", () => {
  expect(
    recordingReadout({
      bar: Number.NaN,
      beat: Number.NaN,
      positionBeats: Number.NaN,
      bpm: Number.NaN,
    }),
  ).toBe("Recording bar 1 beat 1 · 0:00.");
});
