import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import manual from "../../docs/guide/manual.json";
import { SHORTCUTS } from "../../src/lib/shortcuts";
import { SCREENS } from "../../src/screens/registry";

it("documents every studio room and shortcut in both languages with current exports", () => {
  expect(new Set(manual.chapters.map((c) => c.id)).size).toBe(
    manual.chapters.length,
  );
  for (const room of SCREENS)
    expect(manual.chapters.some((c) => c.room === room.id)).toBe(true);
  for (const chapter of manual.chapters)
    for (const lang of ["en", "nb"] as const) {
      expect(chapter.title[lang].trim()).not.toBe("");
      expect(chapter.sections.length).toBeGreaterThan(0);
      for (const section of chapter.sections) {
        expect(section.title[lang].trim()).not.toBe("");
        expect(section.text[lang].trim()).not.toBe("");
      }
    }
  expect(Object.keys(manual.shortcutsNb).sort()).toEqual(
    SHORTCUTS.map((s) => s.keys).sort(),
  );
  expect(manual.shortcutsEn).toEqual(
    Object.fromEntries(SHORTCUTS.map((s) => [s.keys, s.description])),
  );
  execFileSync(process.execPath, ["scripts/export-manual.mjs", "--check"]);
});
