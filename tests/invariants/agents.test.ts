import { beforeEach, expect, it } from "vitest";
import { __setIpcForTests, ipc } from "../../src/ipc/client";
import { BRAINS, askBrain, readPreferences } from "../../src/lib/jo/providers";
import {
  applyStudioEdits,
  songFingerprint,
} from "../../src/lib/jo/studioTools";
import { newOriginal, useWriting } from "../../src/lib/originals";
import { useEngineStore } from "../../src/store/engine";
import fixture from "../fixtures/providers/agents.json";

beforeEach(() => {
  useWriting.setState({
    song: newOriginal(),
    busy: false,
    past: [],
    future: [],
  });
  useEngineStore.setState({ isRecording: false });
});
it("applies a musical edit group once, preserves the original, and rolls back invalid groups", () => {
  const original = songFingerprint();
  applyStudioEdits(fixture.edits, original);
  const s = useWriting.getState().song;
  if (!s) throw new Error("missing song");
  expect(s.versions).toHaveLength(1);
  expect(s.versions[0].body.chart.defaultBpm).toBe(100);
  expect(s.body.chart.defaultBpm).toBe(96);
  expect(s.body.chart.arrangement.map((a) => a.sectionId)).toEqual([
    "verse",
    "chorus",
    "verse",
    "chorus",
  ]);
  expect(s.body.sections.verse.parts[0].muted).toBe(true);
  expect(s.body.notes).toContain("Double the last chorus guitar");
  expect(() => applyStudioEdits(fixture.edits, original)).toThrow(/changed/);
  const before = songFingerprint();
  expect(() =>
    applyStudioEdits([
      { name: "edit_song", arguments: { bpm: 120 } },
      {
        name: "write_section",
        arguments: {
          sectionId: "verse",
          name: "Verse",
          chords: "broken-chord",
        },
      },
    ]),
  ).toThrow();
  expect(songFingerprint()).toBe(before);
  expect(useWriting.getState().song?.versions).toHaveLength(1);
  useWriting.getState().edit((b) => {
    b.sections.verse.parts[0].locked = true;
  });
  expect(() =>
    applyStudioEdits([
      {
        name: "shape_part",
        arguments: { sectionId: "verse", part: "drums", gain: 0.1 },
      },
    ]),
  ).toThrow(/locked/);
  useEngineStore.setState({ isRecording: true });
  expect(() =>
    applyStudioEdits([{ name: "write_notes", arguments: { text: "No" } }]),
  ).toThrow(/recording/);
});
it("adds playable sections and transposes the band without touching guitar layers", () => {
  applyStudioEdits([
    {
      name: "write_section",
      arguments: { name: "Bridge", chords: "Dm | F | Am | G" },
    },
    { name: "edit_song", arguments: { semitones: 2 } },
  ]);
  const s = useWriting.getState().song;
  expect(s?.body.chart.sections).toHaveLength(3);
  expect(s?.body.chart.sections[2].bars[0][0].chord).toBe("Em");
  expect(s?.body.clips).toEqual(s?.versions[0].body.clips);
  expect(() =>
    applyStudioEdits([
      {
        name: "arrange_song",
        arguments: { order: "verse*16,chorus*16,verse*16,chorus*16,verse" },
      },
    ]),
  ).toThrow(/256/);
});
it("uses the installed agent contract without provider keys and validates its proposed tools", async () => {
  const previous = { ...ipc };
  const engine = useEngineStore.getState();
  const calls: string[] = [];
  __setIpcForTests({
    invoke: async <T>(cmd: string, args?: Record<string, unknown>) => {
      calls.push(cmd);
      expect(args).toMatchObject({
        request: { provider: "codex", model: "default", executable: "" },
      });
      return fixture.reply as T;
    },
  });
  useEngineStore.setState({ isPreview: false, keysPresent: {} });
  try {
    const prefs = readPreferences(null);
    prefs.selected = "codex";
    const result = await askBrain(
      {
        system: "Studio test",
        messages: [{ role: "user", content: "Slow the song" }],
        tools: true,
      },
      prefs,
    );
    expect(result.toolCalls).toEqual([
      { name: "edit_song", arguments: { bpm: 96 } },
    ]);
    expect(calls).toEqual(["agent_request"]);
    await expect(
      askBrain({ system: "Ideas only", messages: [], tools: false }, prefs),
    ).rejects.toThrow(/Unexpected actions/);
    expect(() =>
      BRAINS.codex.read({
        reply: "Bad",
        toolCalls: [{ name: "shell", argumentsJson: "{}" }],
      }),
    ).toThrow(/Unknown/);
  } finally {
    __setIpcForTests(previous);
    useEngineStore.setState({
      isPreview: engine.isPreview,
      keysPresent: engine.keysPresent,
    });
  }
});
it("reads provider catalogs and excludes non-generative Gemini and non-tool OpenRouter models", () => {
  expect(BRAINS.openai.catalog?.read(fixture.catalog)).toEqual(["model-one"]);
  expect(BRAINS.anthropic.catalog?.read(fixture.catalog)).toEqual([
    "model-one",
  ]);
  expect(BRAINS.gemini.catalog?.read(fixture.geminiCatalog)).toEqual([
    "gemini-test",
  ]);
  expect(BRAINS.openrouter.catalog?.read(fixture.routerCatalog)).toEqual([
    "vendor/tool-model",
  ]);
});
