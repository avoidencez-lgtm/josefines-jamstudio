import { describe, expect, it } from "vitest";
import { formatCents } from "../../src/components/BigReadout";

describe("formatCents", () => {
  it("does not render negative zero for a slightly flat in-tune note", () => {
    expect((-0.2).toFixed(0)).toBe("-0");
    expect(formatCents(-0.2)).toBe("0");
    expect(formatCents(0.2)).toBe("0");
    expect(formatCents(0)).toBe("0");
    expect(formatCents(12.4)).toBe("+12");
    expect(formatCents(-12.4)).toBe("-12");
  });
});
