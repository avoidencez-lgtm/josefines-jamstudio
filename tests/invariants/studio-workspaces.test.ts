import { describe, expect, it } from "vitest";
import chart from "../../charts/blues-12-bar.json";
import type { Chart } from "../../src/ipc/contract";
import { handleShortcut } from "../../src/lib/shortcuts";
import { joNeedsReview } from "../../src/screens/Jo";
import { sectionPassages } from "../../src/screens/Stage";
import { SCREENS, SCREEN_ICONS } from "../../src/screens/registry";
import type { EngineState } from "../../src/store/engine";

describe("Studio workspaces", () => {
  it("gives every destination a distinct, registered icon and a readable purpose", () => {
    expect(new Set(SCREENS.map((s) => s.iconName)).size).toBe(SCREENS.length);
    for (const s of SCREENS) {
      expect(SCREEN_ICONS[s.iconName]).toBeDefined();
      expect(s.description.length).toBeGreaterThan(5);
    }
  });
  it("reviews composition, film and legacy song mutations without delaying live commands", () => {
    for (const call of [
      { name: "write_section", arguments: {} },
      { name: "edit_video_shot", arguments: {} },
      ...["lock", "groove", "restore"].map((action) => ({
        name: "songwriting",
        arguments: { action },
      })),
    ])
      expect(joNeedsReview(call)).toBe(true);
    expect(joNeedsReview({ name: "set_tempo", arguments: { bpm: 100 } })).toBe(
      false,
    );
    expect(
      joNeedsReview({ name: "songwriting", arguments: { action: "save" } }),
    ).toBe(false);
  });
  it("leaves Jo push-to-talk and focused controls to their own handlers", () => {
    const ctx = { toggleHelp: () => {} };
    const store = { currentScreen: "jo" } as EngineState;
    expect(handleShortcut({ code: "KeyT" } as KeyboardEvent, store, ctx)).toBe(
      false,
    );
    expect(
      handleShortcut({ defaultPrevented: true } as KeyboardEvent, store, ctx),
    ).toBe(false);
    for (const code of ["Space", "Enter"]) {
      expect(
        handleShortcut(
          { code, target: { closest: () => ({}) } } as unknown as KeyboardEvent,
          store,
          ctx,
        ),
      ).toBe(false);
    }
  });
  it("places rehearsal loops in arranged order, including repeats", () => {
    const section = chart.sections[0];
    const passages = sectionPassages({
      ...chart,
      arrangement: [
        { sectionId: section.id, repeats: 2 },
        { sectionId: section.id, repeats: 1 },
      ],
    } as Chart);
    expect(passages.map((p) => [p.start, p.end])).toEqual([
      [1, section.bars.length * 2 + 1],
      [section.bars.length * 2 + 1, section.bars.length * 3 + 1],
    ]);
  });
});
