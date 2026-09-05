import { beforeEach, describe, expect, it } from "vitest";
import { __setIpcForTests, ipc } from "../../src/ipc/client";
import { type JoContext } from "../../src/lib/jo/gemini";
import {
  BRAINS,
  type BrainRequest,
  askBrain,
  estimateRequest,
  joRequest,
  readPreferences,
} from "../../src/lib/jo/providers";
import {
  type Proposal,
  applyProposal,
  labRequest,
  readIdea,
} from "../../src/lib/jo/songLab";
import { newOriginal, useWriting } from "../../src/lib/originals";
import { useEngineStore } from "../../src/store/engine";
import fixture from "../fixtures/providers/brains.json";

const request: BrainRequest = {
  system: "Help write an original song.",
  messages: [{ role: "user", content: "Five BPM faster" }],
  tools: true,
};
describe("provider contracts and creative proposals", () => {
  beforeEach(() => {
    useWriting.setState({
      song: newOriginal(),
      selected: "verse",
      busy: false,
      past: [],
      future: [],
    });
    useEngineStore.setState({ isRecording: false });
  });
  it("builds documented requests and normalizes the same action for three providers", () => {
    const config = readPreferences(null);
    expect(BRAINS.openai.request(request, config.models.openai)).toMatchObject({
      path: "/v1/responses",
      body: {
        model: "gpt-4.1-mini",
        store: false,
        tools: expect.arrayContaining([
          expect.objectContaining({ type: "function", strict: false }),
        ]),
      },
    });
    expect(
      BRAINS.anthropic.request(request, config.models.anthropic),
    ).toMatchObject({
      path: "/v1/messages",
      headers: { "anthropic-version": "2023-06-01" },
      body: { max_tokens: 1024 },
    });
    expect(
      BRAINS.openrouter.request(request, config.models.openrouter).path,
    ).toBe("/api/v1/chat/completions");
    for (const id of ["openai", "anthropic", "openrouter"] as const) {
      expect(BRAINS[id].read(fixture[id])).toEqual({
        reply: "Up five.",
        toolCalls: [{ name: "set_tempo", arguments: { delta: 5 } }],
      });
      const body = BRAINS[id].request(
        { ...request, tools: false },
        config.models[id],
      ).body;
      expect(body).not.toHaveProperty("tools");
    }
  });
  it("starts every built request with a user turn, never the UI welcome", () => {
    const ctx: JoContext = {
      transportState: "stopped",
      bpm: 120,
      bar: 1,
      styleId: "blues-shuffle",
      styleName: "Blues Shuffle",
      intensity: 0.5,
      chartName: null,
      currentChord: "A7",
      currentSection: "",
      muted: { drums: false, bass: false, comp: false },
      styles: [],
      charts: [],
    };
    const welcome = {
      id: "welcome",
      sender: "jo" as const,
      text: "Tell me what the band should do.",
      timestamp: "Jo",
    };
    const built = joRequest([welcome], "Five BPM faster", ctx);
    expect(built.messages[0]?.role).toBe("user");
    expect(built.messages.some((m) => m.content.includes("Tell me"))).toBe(
      false,
    );
    const config = readPreferences(null);
    const anthropic = BRAINS.anthropic.request(built, config.models.anthropic)
      .body as { messages: { role: string }[] };
    expect(anthropic.messages[0]?.role).toBe("user");
    const openai = BRAINS.openai.request(built, config.models.openai).body as {
      input: { role: string }[];
    };
    expect(openai.input[0]?.role).toBe("user");
  });
  it("rejects truncated, malformed and unauthorized actions before dispatch", () => {
    expect(() =>
      BRAINS.openai.read({ ...fixture.openai, status: "incomplete" }),
    ).toThrow(/finish/);
    expect(() =>
      BRAINS.anthropic.read({
        ...fixture.anthropic,
        stop_reason: "max_tokens",
      }),
    ).toThrow(/finish/);
    expect(() =>
      BRAINS.openrouter.read({ choices: [{ finish_reason: "length" }] }),
    ).toThrow(/finish/);
    expect(() =>
      BRAINS.openai.read({
        status: "completed",
        output: [
          {
            type: "function_call",
            name: "set_tempo",
            arguments: '{"delta":"five"}',
          },
        ],
      }),
    ).toThrow(/Invalid/);
    expect(() =>
      BRAINS.openai.read({
        status: "completed",
        output: [
          { type: "function_call", name: "delete_everything", arguments: "{}" },
        ],
      }),
    ).toThrow(/Unknown/);
    expect(() =>
      BRAINS.openai.read({
        status: "completed",
        output: [
          { type: "function_call", name: "set_tempo", arguments: "{broken" },
        ],
      }),
    ).toThrow();
  });
  it("uses the Rust proxy once with metadata, never another paid provider on failure", async () => {
    const previous = { ...ipc };
    const engine = useEngineStore.getState();
    const calls: unknown[] = [];
    __setIpcForTests({
      invoke: async <T>(_command: string, args?: Record<string, unknown>) => {
        calls.push(args);
        return {
          status: 429,
          headers: {},
          body: '{"error":{"message":"Rate limited"}}',
        } as T;
      },
    });
    useEngineStore.setState({
      isPreview: false,
      keysPresent: { openai: true },
    });
    try {
      const config = readPreferences(null);
      config.selected = "openai";
      config.models.openai.inputPrice = 0.4;
      config.models.openai.outputPrice = 1.6;
      await expect(askBrain(request, config)).rejects.toThrow("Rate limited");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        request: {
          provider: "openai",
          path: "/v1/responses",
          model: "gpt-4.1-mini",
          estimatedCostUsd: expect.any(Number),
        },
      });
      const unknown = readPreferences(null);
      expect(estimateRequest(request, unknown.models.openai)).toBeNull();
      expect(readPreferences({ ...config, custom: "keep" }).custom).toBe(
        "keep",
      );
    } finally {
      __setIpcForTests(previous);
      useEngineStore.setState({
        isPreview: engine.isPreview,
        keysPresent: engine.keysPresent,
      });
    }
  });
  it("keeps the original version, preserves part locks and blocks stale proposals", () => {
    const song = useWriting.getState().song;
    if (!song) throw new Error("Test song missing");
    song.body.sections.verse.parts[1].locked = true;
    const original = JSON.stringify(song.body);
    const proposal: Proposal = {
      idea: readIdea(JSON.stringify(fixture.idea), "chords"),
      kind: "chords",
      songId: song.id,
      sectionId: "verse",
      originalBody: original,
      source: "fixture",
    };
    const prompt = labRequest(song, "verse", "chords", "open chords");
    expect(prompt.tools).toBe(false);
    expect(prompt.system).toContain("not recorded audio");
    applyProposal(proposal);
    const changed = useWriting.getState().song;
    if (!changed) throw new Error("Test song missing");
    expect(JSON.stringify(changed.versions[0].body)).toBe(original);
    expect(changed.body.sections.verse.parts[1].locked).toBe(true);
    expect(changed.body.chart.sections[0].bars).not.toEqual(
      song.body.chart.sections[0].bars,
    );
    expect(() => applyProposal(proposal)).toThrow(/changed/);
    expect(() =>
      readIdea(
        JSON.stringify({ ...fixture.idea, chords: "notachord" }),
        "bridge",
      ),
    ).toThrow();
  });
});
