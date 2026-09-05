import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import chart from "../../charts/blues-12-bar.json";
import type { Chart } from "../../src/ipc/contract";
import { sectionPassages } from "../../src/lib/chart/passages";
import { joNeedsReview } from "../../src/lib/jo/conversation";
import { SHORTCUTS, handleShortcut } from "../../src/lib/shortcuts";
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
  it("uses one tap-tempo handler on Jo and preserves focused controls", () => {
    const ctx = { toggleHelp: () => {} };
    const tapTempo = vi.fn();
    const store = { currentScreen: "jo", tapTempo } as unknown as EngineState;
    const handlers = SHORTCUTS.filter((s) =>
      s.matches({ code: "KeyT" } as KeyboardEvent),
    );
    expect(handlers).toHaveLength(1);
    handlers[0].run(store);
    expect(tapTempo).toHaveBeenCalledTimes(1);
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
  it("keeps screen modules to components so fast refresh and tests stay simple", () => {
    const dir = path.resolve(process.cwd(), "src/screens");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      const names = [
        ...source.matchAll(/^export (?:const|function) (\w+)/gm),
      ].map((m) => m[1]);
      expect(names.length, file).toBeGreaterThan(0);
      for (const name of names)
        expect(name, `${file} exports ${name}`).toMatch(/^[A-Z]/);
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
