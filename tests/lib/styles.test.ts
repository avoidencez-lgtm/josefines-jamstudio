import { expect, it } from "vitest";
import { meterLabel, stylesInMeter } from "../../src/lib/styles";

const blues = { id: "blues-shuffle", feel: { timeSig: [4, 4] as const } };
const ballad = { id: "ballad-68", feel: { timeSig: [6, 8] as const } };
const waltz = { id: "waltz-34", feel: { timeSig: [3, 4] as const } };

it("keeps only grooves in the playing meter", () => {
  expect(meterLabel([6, 8])).toBe("6/8");
  expect(stylesInMeter([blues, ballad], [4, 4]).map((s) => s.id)).toEqual([
    "blues-shuffle",
  ]);
  expect(stylesInMeter([blues, ballad], [6, 8]).map((s) => s.id)).toEqual([
    "ballad-68",
  ]);
});

it("filters a 3/4 chart picker to waltz grooves", () => {
  expect(
    stylesInMeter([blues, ballad, waltz], [3, 4]).map((s) => s.id),
  ).toEqual(["waltz-34"]);
  expect(
    stylesInMeter([blues, ballad, waltz], [4, 4]).map((s) => s.id),
  ).not.toContain("waltz-34");
});

it("keeps the current style so a mismatched select does not go blank", () => {
  expect(
    stylesInMeter([blues, ballad], [4, 4], "ballad-68").map((s) => s.id),
  ).toEqual(["blues-shuffle", "ballad-68"]);
});
