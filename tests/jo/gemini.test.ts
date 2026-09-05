import { describe, expect, it } from "vitest";
import {
  type JoContext,
  buildRequest,
  contextSummary,
  readResponse,
} from "../../src/lib/jo/gemini";
import { JO_TOOLS } from "../../src/lib/jo/tools";
import { summariseError } from "../../src/lib/net/providerFetch";

const ctx: JoContext = {
  transportState: "playing",
  bpm: 110,
  bar: 7,
  styleId: "blues-shuffle",
  styleName: "Blues Shuffle",
  intensity: 0.5,
  chartName: "12-Bar Blues",
  currentChord: "D7",
  currentSection: "Chorus",
  muted: { drums: false, bass: true, comp: false },
  styles: [{ id: "blues-shuffle", name: "Blues Shuffle" }],
  charts: [{ id: "blues-12-bar", name: "12-Bar Blues" }],
};

describe("Jo's Gemini request", () => {
  it("tells the model what is going on and which ids exist", () => {
    const s = contextSummary(ctx);
    expect(s).toContain("110 BPM");
    expect(s).toContain("Muted parts: bass");
    expect(s).toContain("blues-shuffle");
    expect(s).toContain("blues-12-bar");
    // From the Jo room the film tool can only work with real shot ids (#45).
    expect(s).toContain("Film project: none");
    expect(
      contextSummary({
        ...ctx,
        film: {
          id: "film-1",
          title: "Clip",
          shots: [{ id: "shot-a", title: "Intro", seconds: 4 }],
        },
      }),
    ).toContain("shot-a");
  });

  it("does not send the UI welcome as a model turn", () => {
    const welcome = {
      id: "welcome",
      sender: "jo" as const,
      text: "Tell me what the band should do.",
      timestamp: "Jo",
    };
    const leftover = {
      id: "notice",
      sender: "jo" as const,
      text: "Still here.",
      timestamp: "Jo",
    };
    const req = buildRequest([welcome, leftover], "play some funk", ctx);
    expect(req.contents).toEqual([
      { role: "user", parts: [{ text: "play some funk" }] },
    ]);
  });

  it("declares every tool the dispatcher understands and keeps recent history", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      sender: (i % 2 ? "jo" : "user") as "jo" | "user",
      text: `turn ${i}`,
      timestamp: "",
    }));
    const req = buildRequest(history, "faster please", ctx);
    expect(req.tools[0].functionDeclarations).toBe(JO_TOOLS);
    expect(req.contents.length).toBe(9);
    expect(req.contents.at(-1)).toEqual({
      role: "user",
      parts: [{ text: "faster please" }],
    });
    expect(req.contents[0]?.role).toBe("user");
    expect(req.systemInstruction.parts[0].text).toMatch(/You are Jo/);
    const names = JO_TOOLS.map((t) => t.name);
    for (const n of [
      "set_tempo",
      "set_style",
      "trigger_cue",
      "record_take",
      "load_chart",
    ]) {
      expect(names).toContain(n);
    }
  });
});

describe("Jo's Gemini reply", () => {
  it("extracts function calls and the spoken sentence", () => {
    const out = readResponse({
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: "set_tempo", args: { delta: 5 } } },
              { text: "Pushing it up a notch." },
            ],
          },
        },
      ],
    });
    expect(out.toolCalls).toEqual([
      { name: "set_tempo", arguments: { delta: 5 } },
    ]);
    expect(out.reply).toBe("Pushing it up a notch.");
  });

  it("has something to say when the model only calls tools or says nothing", () => {
    expect(
      readResponse({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "transport_control" } }],
            },
          },
        ],
      }).reply,
    ).toBe("On it.");
    expect(readResponse({}).toolCalls).toEqual([]);
    expect(readResponse({}).reply).toMatch(/didn't catch/);
    expect(
      readResponse({ promptFeedback: { blockReason: "SAFETY" } }).reply,
    ).toMatch(/safety/);
  });

  it("pulls the message out of provider error bodies", () => {
    expect(
      summariseError('{"error":{"code":400,"message":"API key not valid"}}'),
    ).toBe("API key not valid");
    expect(summariseError("plain text")).toBe("plain text");
    expect(summariseError("x".repeat(300)).length).toBeLessThan(210);
  });
});
