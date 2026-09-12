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
    expect(s).toContain("Muted parts are bass");
    expect(s).toContain("blues-shuffle");
    expect(s).toContain("blues-12-bar");
    // From the Jo room the film tool can only work with real shot ids (#45).
    expect(s).toContain("No Film project is open.");
    expect(s).toContain("No songwriting document is open.");
    expect(s).not.toContain("is none");
    expect(s).not.toContain("are none");
    const empty = contextSummary({
      ...ctx,
      chartName: null,
      muted: { drums: false, bass: false, comp: false },
    });
    expect(empty).toContain("No chart is loaded.");
    expect(empty).toContain("Now on D7 in the Chorus.");
    expect(empty).toContain("No parts are muted.");
    const reference = contextSummary({
      ...ctx,
      currentChord: "F",
      nextChord: "G",
      reference: {
        assetId: "fixture",
        label: "Synthetic reference",
        position: 2.5,
        seconds: 5,
        loopEnabled: true,
        loopStart: 2.2,
        loopEnd: 4.6,
        speed: 0.75,
        semitones: 2,
        confirmedBars: 2,
        gridOrigin: "confirmed-local",
        beatsPerBar: 4,
        beat: 1,
        analysisBeat: 5,
        analysisBeatCount: 8,
        confidence: "low",
        analysisBpm: 100,
        key: "C major",
        stems: [
          {
            id: "drums",
            label: "Drums",
            gain: 0.8,
            muted: false,
            guitar: false,
          },
          {
            id: "gtr",
            label: "Guitar",
            gain: 1,
            muted: true,
            guitar: true,
          },
        ],
        sections: [{ id: "chorus", label: "Chorus" }],
        ramp: {
          config: {
            schemaVersion: 1,
            startPercent: 75,
            stepPercent: 5,
            targetPercent: 100,
            barsPerStep: 4,
          },
          active: true,
          completed_bars: 2,
          speed_percent: 80,
        },
      },
    });
    expect(reference).toContain(
      "Reference is Synthetic reference (id fixture) at 75% and 2 semitones; now on F in the Chorus.",
    );
    expect(reference).toContain(
      "Confirmed reference section ids are chorus (Chorus).",
    );
    expect(reference).toContain(
      "This ramp is armed from 75 to 100 by 5 every 4 bars.",
    );
    expect(reference).toContain("Confirmed reference bars are 2.");
    expect(reference).toContain("Reference loop is 2.2 to 4.6 s.");
    expect(reference).toContain("The reference is at 2.5 of 5.0 s.");
    expect(reference).toContain("Next is G.");
    expect(reference).toContain("The key is C major.");
    expect(reference).toContain("Reference analysis has no error.");
    expect(reference).toContain("Reference grid has no error.");
    expect(reference).toContain("Reference processing has no error.");
    expect(reference).toContain(
      "Reference stem ids are drums (Drums, 80%, playing), gtr (Guitar, 100%, muted, guitar).",
    );
    expect(reference).toContain("Reference grid origin is confirmed-local.");
    expect(reference).toContain("Reference beats per bar are 4.");
    expect(reference).toContain("Reference beat is 1.");
    expect(reference).toContain("Beat 5 of 8.");
    expect(reference).toContain("Local estimates. Low confidence.");
    expect(reference).toContain("The analysed tempo is 100.0 BPM.");
    const bare = contextSummary({
      ...ctx,
      currentChord: "F",
      reference: {
        assetId: "fixture",
        label: "Synthetic reference",
        position: 2.5,
        seconds: 5,
        loopEnabled: false,
        loopStart: 0,
        loopEnd: 5,
        speed: 1,
        semitones: 0,
      },
    });
    expect(bare).toContain("No confirmed reference sections are present.");
    expect(bare).toContain("No reference ramp is active.");
    expect(bare).toContain("No confirmed reference bars are present.");
    expect(bare).toContain("Reference looping is off.");
    expect(bare).toContain("The reference is at 2.5 of 5.0 s.");
    expect(bare).toContain("No next chord is present.");
    expect(bare).toContain("No reference key is known.");
    expect(bare).toContain("Reference analysis has no error.");
    expect(bare).toContain("Reference grid has no error.");
    expect(bare).toContain("Reference processing has no error.");
    expect(bare).toContain("No reference stems are loaded.");
    expect(bare).toContain("No reference grid is present.");
    expect(bare).toContain("No reference beats per bar are known.");
    expect(bare).toContain("No reference beat is known.");
    expect(bare).toContain("No analysed beat at this position.");
    expect(bare).toContain("No analysis confidence is known.");
    expect(bare).toContain("No analysed tempo is known.");
    const failed = contextSummary({
      ...ctx,
      currentChord: "F",
      reference: {
        assetId: "fixture",
        label: "Synthetic reference",
        position: 2.5,
        seconds: 5,
        loopEnabled: false,
        loopStart: 0,
        loopEnd: 5,
        speed: 1,
        semitones: 0,
        analysisError: "Local analysis failed. Try again in Songs.",
        gridError: "Confirm bars in Songs before a practice ramp.",
        processingError: "Speed and key could not be applied. Reload the reference.",
      },
    });
    expect(failed).toContain("Local analysis failed. Try again in Songs.");
    expect(failed).toContain("Confirm bars in Songs before a practice ramp.");
    expect(failed).toContain(
      "Speed and key could not be applied. Reload the reference.",
    );
    expect(failed).not.toContain("Reference analysis has no error.");
    expect(failed).not.toContain("Reference grid has no error.");
    expect(failed).not.toContain("Reference processing has no error.");
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
    ).toBe("This is underway.");
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
