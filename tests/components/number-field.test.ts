import { describe, expect, it } from "vitest";
import { committedNumber } from "../../src/lib/numberField";

describe("committedNumber", () => {
  it("keeps a mid-type 9 from becoming the stored start tempo", () => {
    expect(committedNumber("90", 120, 20, 300)).toBe(90);
    expect(committedNumber("", 120, 20, 300)).toBe(120);
    expect(committedNumber("fast", 120, 20, 300)).toBe(120);
  });

  it("clamps only when the draft is committed", () => {
    expect(committedNumber("9", 120, 20, 300)).toBe(20);
    expect(committedNumber("400", 120, 20, 300)).toBe(300);
  });
});
