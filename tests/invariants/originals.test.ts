import { beforeEach, describe, expect, it } from "vitest";
import { __setIpcForTests, ipc } from "../../src/ipc/client";
import { createPreviewEngine } from "../../src/ipc/preview";
import { assignPedal, useController } from "../../src/lib/controller";
import { parseNaturalIntent } from "../../src/lib/jo/intent";
import { JO_TOOLS } from "../../src/lib/jo/tools";
import {
  type Original,
  arrangementRanges,
  changeGroove,
  defaultSection,
  fitTempo,
  newOriginal,
  sectionBars,
  songsReferencingTake,
  useWriting,
} from "../../src/lib/originals";
import { SCREENS } from "../../src/screens/registry";
import fixture from "../fixtures/seams/original.json";

describe("songwriting workflow", () => {
  it("learning saves a binding without performing it; enabled presses reach capture", async () => {
    const previous = { ...ipc };
    const calls: string[] = [];
    __setIpcForTests({
      invoke: async <T>(command: string) => {
        calls.push(command);
        return (
          command === "takes_list"
            ? []
            : command === "recorder_get_latency"
              ? 0
              : null
        ) as T;
      },
    });
    try {
      useController.setState({
        config: { schemaVersion: 1, bindings: [] },
        enabled: false,
        learning: "keep",
        busy: false,
      });
      const press = { kind: "program" as const, channel: 1, number: 12 };
      await useController.getState().receive(press);
      expect(calls).toEqual(["controller_save"]);
      useController.setState({ enabled: true });
      await useController.getState().receive(press);
      expect(calls.filter((c) => c === "capture_keep")).toHaveLength(1);
    } finally {
      __setIpcForTests(previous);
      useController.setState({ enabled: false, learning: null });
    }
  });
  it("pedal learn reassigns a press instead of firing two actions; repeated form entries remain reachable", () => {
    const press = { kind: "program" as const, channel: 1, number: 12 };
    const initial = { schemaVersion: 1, bindings: [], custom: "keep" };
    const config = assignPedal(
      assignPedal(initial, "keep", press),
      "record",
      press,
    );
    expect(config.bindings).toEqual([{ action: "record", press }]);
    expect(config.custom).toBe("keep");
    const chart = newOriginal().body.chart;
    chart.arrangement = [
      { sectionId: "verse", repeats: 2 },
      { sectionId: "chorus", repeats: 1 },
      { sectionId: "verse", repeats: 1 },
    ];
    expect(arrangementRanges(chart)).toEqual([
      { sectionId: "verse", startBar: 1, endBar: 9 },
      { sectionId: "chorus", startBar: 9, endBar: 13 },
      { sectionId: "verse", startBar: 13, endBar: 17 },
    ]);
  });
  it("names songs and versions that still clip this take", () => {
    const clip = {
      takeId: "take-1",
      label: "This is guitar 1.",
      trimStart: 0,
      trimEnd: 4,
      startBar: 1,
      repeats: 1,
      gain: 1,
      muted: false,
    };
    const song = newOriginal();
    song.body.chart.name = "River Song";
    song.body.clips = [clip];
    const other = newOriginal();
    other.body.chart.name = "Leaving Town";
    other.versions = [
      {
        id: "v1",
        name: "demo",
        body: { ...other.body, clips: [clip] },
      },
    ];
    const unused = newOriginal();
    unused.body.chart.name = "Unused";
    expect(songsReferencingTake([song, other, unused], "take-1")).toEqual([
      "River Song",
      "Leaving Town",
    ]);
    expect(songsReferencingTake([song], "take-missing")).toEqual([]);
  });
  beforeEach(() =>
    useWriting.setState({
      song: newOriginal(),
      past: [],
      future: [],
      dirty: false,
      busy: false,
    }),
  );
  it("keeps locked parts while trying another groove", () => {
    const s = defaultSection();
    s.parts[1].locked = true;
    const next = changeGroove(s, "funk-16");
    expect(next.parts[0].styleId).toBe("funk-16");
    expect(next.parts[1]).toEqual(s.parts[1]);
    expect(s.parts[0].styleId).toBe("rock-straight");
  });
  it("undo and versions restore sections, clips and musical settings together", () => {
    const w = useWriting.getState();
    const original = structuredClone(w.song?.body);
    w.version("Original");
    w.edit((b) => {
      b.chart.defaultBpm = 130;
      b.sections.verse.parts[0].muted = true;
    });
    w.undo();
    expect(useWriting.getState().song?.body).toEqual(original);
    w.redo();
    expect(useWriting.getState().song?.body.chart.defaultBpm).toBe(130);
    w.restore(useWriting.getState().song?.versions[0].id ?? "");
    expect(useWriting.getState().song?.body).toEqual(original);
  });
  it("restore keeps a selected section that still exists and otherwise falls back, and resets rehearsal", () => {
    const w = useWriting.getState();
    w.version("Before the bridge");
    const versionId = useWriting.getState().song?.versions[0].id ?? "";
    w.edit((b) => {
      b.chart.sections.push({
        id: "bridge",
        name: "Bridge",
        bars: [[{ chord: "G", beats: 4 }]],
      });
      b.chart.arrangement.push({ sectionId: "bridge", repeats: 1 });
      b.sections.bridge = defaultSection();
    });
    w.select("bridge");
    useWriting.setState({ rehearsalIndex: 2 });
    expect(w.restore(versionId)).toBe(true);
    const restored = useWriting.getState();
    expect(restored.selected).toBe("verse");
    expect(restored.rehearsalIndex).toBe(-1);
    expect(
      arrangementRanges(
        restored.song?.body.chart ?? newOriginal().body.chart,
      ).some((r) => r.sectionId === restored.selected),
    ).toBe(true);
  });
  it("saveCopy writes the duplicate without replacing the open song or undo history", async () => {
    const previous = { ...ipc };
    const savedIds: string[] = [];
    __setIpcForTests({
      invoke: async <T>(command: string, args?: Record<string, unknown>) => {
        if (command === "originals_save") {
          const document = args?.document as Original;
          savedIds.push(document.id);
          return { ...document, revision: 1 } as T;
        }
        if (command === "originals_list") return [] as T;
        return undefined as T;
      },
    });
    try {
      const w = useWriting.getState();
      const openId = w.song?.id;
      w.edit((b) => {
        b.chart.name = "Draft title";
      });
      const past = useWriting.getState().past;
      await w.saveCopy();
      const after = useWriting.getState();
      expect(savedIds).toHaveLength(1);
      expect(savedIds[0]).not.toBe(openId);
      expect(after.song?.id).toBe(openId);
      expect(after.song?.body.chart.name).toBe("Draft title");
      expect(after.past).toEqual(past);
      expect(after.message).toBe("Copy saved. Original kept.");
    } finally {
      __setIpcForTests(previous);
    }
  });
  it("fits the band to a trimmed audio loop without changing that audio", () => {
    const clip = {
      takeId: "x",
      label: "Riff",
      trimStart: 2,
      trimEnd: 10,
      startBar: 1,
      repeats: 4,
      gain: 1,
      muted: false,
    };
    expect(fitTempo(clip, 4)).toBe(120);
    expect(clip.trimEnd).toBe(10);
    expect(() => fitTempo({ ...clip, trimEnd: 2 }, 4)).toThrow();
    expect(sectionBars("Am | F | C G | Am")).toHaveLength(4);
    expect(() => sectionBars("nonsense")).toThrow();
  });
  it("refuses malformed version lists without replacing a saved preview song", async () => {
    const engine = createPreviewEngine({ autoTick: false });
    try {
      const saved = await engine.invoke<typeof fixture>("originals_save", {
        document: fixture,
      });
      for (const versions of [undefined, null, {}, "bad", 1]) {
        await expect(
          engine.invoke("originals_save", {
            document: { ...saved, versions },
          }),
        ).rejects.toThrow(/version/);
        expect(await engine.invoke("originals_list", {})).toEqual([saved]);
      }
    } finally {
      engine.dispose();
    }
  });
  it("registers the screen, tool and data fixture; preview never pretends to capture audio", async () => {
    expect(SCREENS.some((s) => s.id === "originals")).toBe(true);
    expect(JO_TOOLS.some((t) => t.name === "songwriting")).toBe(true);
    expect(parseNaturalIntent("keep that").toolCalls[0]).toEqual({
      name: "songwriting",
      arguments: { action: "keep" },
    });
    const engine = createPreviewEngine({ autoTick: false });
    const saved = await engine.invoke<typeof fixture>("originals_save", {
      document: fixture,
    });
    expect(saved.customNote).toBe("keep me");
    expect(saved.revision).toBe(1);
    const list = await engine.invoke<(typeof fixture)[]>("originals_list", {});
    expect(list[0].body).toEqual(fixture.body);
    await expect(
      engine.invoke("capture_keep", { sessionId: "x" }),
    ).rejects.toThrow(/desktop/);
    engine.dispose();
  });
});
