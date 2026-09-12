import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import {
  clampProgramNumber,
  committedSliderValue,
} from "../../src/lib/rigControls";
import { ProgramChangeControls } from "../../src/screens/Rig";

it("keeps a freeform 0-127 program input when named presets exist", () => {
  const html = renderToStaticMarkup(
    createElement(ProgramChangeControls, {
      programs: [
        { number: 0, name: "Clean" },
        { number: 1, name: "Crunch" },
        { number: 2, name: "Lead" },
        { number: 3, name: "Ultra" },
      ],
      value: 12,
      onChange: () => {},
      onSend: () => {},
    }),
  );
  expect(html).toContain('type="number"');
  expect(html).toContain('min="0"');
  expect(html).toContain('max="127"');
  expect(html).toContain('aria-label="This is the program number."');
  expect(html).toContain('value="12"');
  expect(html).toContain("Program 0 is Clean.");
  expect(clampProgramNumber("12")).toBe(12);
  expect(clampProgramNumber("200")).toBe(127);
});

it("commits a slider from the event target, not a stale closure value", () => {
  expect(committedSliderValue("100")).toBe(100);
  expect(committedSliderValue("20")).toBe(20);
});
