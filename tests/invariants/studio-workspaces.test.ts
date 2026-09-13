import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import chart from "../../charts/blues-12-bar.json";
import type { Chart } from "../../src/ipc/contract";
import { sectionCue, sectionPassages } from "../../src/lib/chart/passages";
import {
  discardPendingProposal,
  joNeedsReview,
  useJoConversation,
} from "../../src/lib/jo/conversation";
import { newOriginal, useWriting } from "../../src/lib/originals";
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
  it("lets a new message replace a pending proposal without applying it (#41)", () => {
    const before = useJoConversation.getState().messages.length;
    expect(discardPendingProposal("unused")).toBe(false);
    useJoConversation.setState({
      pending: {
        calls: [{ name: "write_section", arguments: {} }],
        expected: "x",
      },
    });
    expect(discardPendingProposal("Proposal set aside")).toBe(true);
    const state = useJoConversation.getState();
    expect(state.pending).toBeNull();
    expect(state.messages).toHaveLength(before + 1);
    expect(state.messages.at(-1)?.text).toBe("Proposal set aside");
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
  it("transposes when Option or Windows AltGr typed [ or ] and leaves Enter on a link alone", () => {
    vi.stubGlobal("HTMLInputElement", class HTMLInputElement {});
    vi.stubGlobal("HTMLTextAreaElement", class HTMLTextAreaElement {});
    vi.stubGlobal("HTMLSelectElement", class HTMLSelectElement {});
    const ctx = { toggleHelp: () => {} };
    const transposeCurrentChart = vi.fn();
    const bandCue = vi.fn();
    const transportStop = vi.fn();
    const store = {
      transposeCurrentChart,
      bandCue,
      transportStop,
      telemetry: { transport: {}, band: {} },
    } as unknown as EngineState;
    expect(
      handleShortcut(
        {
          key: "[",
          code: "Digit8",
          altKey: true,
          target: null,
        } as unknown as KeyboardEvent,
        store,
        ctx,
      ),
    ).toBe(true);
    expect(transposeCurrentChart).toHaveBeenCalledWith(-1);
    expect(
      handleShortcut(
        {
          key: "]",
          code: "Digit9",
          altKey: true,
          target: null,
        } as unknown as KeyboardEvent,
        store,
        ctx,
      ),
    ).toBe(true);
    expect(transposeCurrentChart).toHaveBeenCalledWith(1);
    transposeCurrentChart.mockClear();
    expect(
      handleShortcut(
        {
          key: "[",
          code: "Digit8",
          ctrlKey: true,
          altKey: true,
          target: null,
        } as unknown as KeyboardEvent,
        store,
        ctx,
      ),
    ).toBe(true);
    expect(transposeCurrentChart).toHaveBeenCalledWith(-1);
    expect(
      handleShortcut(
        {
          key: "]",
          code: "Digit9",
          ctrlKey: true,
          altKey: true,
          target: null,
        } as unknown as KeyboardEvent,
        store,
        ctx,
      ),
    ).toBe(true);
    expect(transposeCurrentChart).toHaveBeenCalledWith(1);
    expect(
      handleShortcut(
        {
          key: "[",
          code: "Digit8",
          ctrlKey: true,
          altKey: false,
          target: null,
        } as unknown as KeyboardEvent,
        store,
        ctx,
      ),
    ).toBe(false);
    expect(
      handleShortcut(
        {
          key: "ƒ",
          code: "KeyF",
          altKey: true,
          target: null,
        } as unknown as KeyboardEvent,
        store,
        ctx,
      ),
    ).toBe(false);
    expect(bandCue).not.toHaveBeenCalled();
    expect(
      handleShortcut(
        {
          code: "Enter",
          key: "Enter",
          target: {
            closest: (sel: string) => (sel.includes("a[href]") ? {} : null),
          },
        } as unknown as KeyboardEvent,
        store,
        ctx,
      ),
    ).toBe(false);
    expect(transportStop).not.toHaveBeenCalled();
  });
  it("undoes and redoes Write from Ctrl/Cmd chords when a song is open", () => {
    class HTMLInputElement {
      closest() {
        return null;
      }
    }
    vi.stubGlobal("HTMLInputElement", HTMLInputElement);
    vi.stubGlobal("HTMLTextAreaElement", class HTMLTextAreaElement {});
    vi.stubGlobal("HTMLSelectElement", class HTMLSelectElement {});
    const ctx = { toggleHelp: () => {} };
    const store = {
      telemetry: { transport: {}, band: {} },
    } as unknown as EngineState;
    const undo = vi.fn();
    const redo = vi.fn();
    const previous = useWriting.getState();
    const chord = (
      init: Partial<KeyboardEvent> & { code: string },
    ): KeyboardEvent =>
      ({
        key: init.key ?? "",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        repeat: false,
        defaultPrevented: false,
        target: null,
        ...init,
      }) as unknown as KeyboardEvent;
    try {
      useWriting.setState({ song: newOriginal(), undo, redo });
      expect(
        handleShortcut(
          chord({ code: "KeyZ", key: "z", ctrlKey: true }),
          store,
          ctx,
        ),
      ).toBe(true);
      expect(undo).toHaveBeenCalledTimes(1);
      undo.mockClear();
      expect(
        handleShortcut(
          chord({
            code: "KeyZ",
            key: "z",
            ctrlKey: true,
            target: new HTMLInputElement() as unknown as EventTarget,
          }),
          store,
          ctx,
        ),
      ).toBe(false);
      expect(undo).not.toHaveBeenCalled();
      expect(
        handleShortcut(
          chord({ code: "KeyZ", key: "z", metaKey: true }),
          store,
          ctx,
        ),
      ).toBe(true);
      expect(undo).toHaveBeenCalledTimes(1);
      expect(
        handleShortcut(
          chord({ code: "KeyZ", key: "Z", ctrlKey: true, shiftKey: true }),
          store,
          ctx,
        ),
      ).toBe(true);
      expect(redo).toHaveBeenCalledTimes(1);
      redo.mockClear();
      expect(
        handleShortcut(
          chord({ code: "KeyZ", key: "Z", metaKey: true, shiftKey: true }),
          store,
          ctx,
        ),
      ).toBe(true);
      expect(redo).toHaveBeenCalledTimes(1);
      redo.mockClear();
      expect(
        handleShortcut(
          chord({ code: "KeyY", key: "y", ctrlKey: true }),
          store,
          ctx,
        ),
      ).toBe(true);
      expect(redo).toHaveBeenCalledTimes(1);
      useWriting.setState({ song: null });
      undo.mockClear();
      expect(
        handleShortcut(
          chord({ code: "KeyZ", key: "z", ctrlKey: true }),
          store,
          ctx,
        ),
      ).toBe(false);
      expect(undo).not.toHaveBeenCalled();
    } finally {
      useWriting.setState(previous, true);
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
  it("shows meter as a readout; the engine refuses a change the style cannot play", () => {
    const bar = fs.readFileSync(
      path.join("src", "components", "TransportBar.tsx"),
      "utf8",
    );
    expect(bar).not.toContain("<select");
    expect(bar).toContain("Meter");
    expect(bar).not.toContain("3/4");
    const stage = fs.readFileSync(
      path.join("src", "screens", "Stage.tsx"),
      "utf8",
    );
    expect(stage).toContain("stylesInMeter");
    expect(stage).toContain("sectionCue");
    expect(stage).not.toMatch(/styles\.map\(\(s\) =>/);
    const library = fs.readFileSync(
      path.join("src", "screens", "Library.tsx"),
      "utf8",
    );
    expect(library).toContain("stylesInMeter");
    const originals = fs.readFileSync(
      path.join("src", "screens", "Originals.tsx"),
      "utf8",
    );
    expect(originals).toContain("stylesInMeter");
    expect(originals).not.toMatch(/timeSig\[0\] === 4/);
    const setlist = fs.readFileSync(
      path.join("src", "components", "tools", "SetlistTool.tsx"),
      "utf8",
    );
    expect(setlist).toContain("stylesInMeter");
    expect(
      fs.readFileSync(path.join("src", "screens", "Stage.tsx"), "utf8"),
    ).toContain('from "../components/NumberField"');
    expect(originals).toContain('from "../components/NumberField"');
  });
  it("names the next section and the bars until it from the arranged form", () => {
    const first = chart.sections[0];
    const form = {
      ...chart,
      sections: [first, { ...first, id: "bridge", name: "Bridge" }],
      arrangement: [
        { sectionId: first.id, repeats: 1 },
        { sectionId: "bridge", repeats: 1 },
      ],
    } as Chart;
    const firstLen = first.bars.length;
    expect(sectionCue(form, 1)).toMatchObject({
      current: first.name,
      next: "Bridge",
      barsUntil: firstLen,
    });
    expect(sectionCue(form, firstLen)).toMatchObject({
      current: first.name,
      next: "Bridge",
      barsUntil: 1,
    });
    expect(sectionCue(form, firstLen + 1).current).toBe("Bridge");
    expect(sectionCue(form, firstLen + 1).next).toBeNull();
  });
});
