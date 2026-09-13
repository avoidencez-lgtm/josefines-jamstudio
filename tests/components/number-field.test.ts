import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NumberField } from "../../src/components/NumberField";
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

describe("NumberField", () => {
  it("renders the shared trainer field and commits through committedNumber", () => {
    const html = renderToStaticMarkup(
      createElement(NumberField, {
        label: "Choose the start tempo.",
        value: 120,
        min: 20,
        max: 300,
        suffix: "BPM",
        onChange: vi.fn(),
      }),
    );
    expect(html).toContain("Choose the start tempo.");
    expect(html).toContain('value="120"');
    expect(html).toContain("BPM");
    expect(committedNumber("90", 120, 20, 300)).toBe(90);
  });
});
