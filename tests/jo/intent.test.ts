import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNaturalIntent } from "../../src/lib/jo/intent";

describe("Jo Natural Intent Parser", () => {
  it("parses playback commands", () => {
    const playRes = parseNaturalIntent("let's jam");
    expect(playRes.toolCalls[0]).toEqual({
      name: "transport_control",
      arguments: { action: "play" },
    });

    const stopRes = parseNaturalIntent("stop");
    expect(stopRes.toolCalls[0]).toEqual({
      name: "transport_control",
      arguments: { action: "stop" },
    });

    for (const text of ["stop playing", "stop playback"]) {
      expect(parseNaturalIntent(text).toolCalls[0]).toEqual({
        name: "transport_control",
        arguments: { action: "stop" },
      });
    }
    expect(parseNaturalIntent("pause playing").toolCalls[0]).toEqual({
      name: "transport_control",
      arguments: { action: "pause" },
    });
    expect(parseNaturalIntent("play").toolCalls[0]).toEqual({
      name: "transport_control",
      arguments: { action: "play" },
    });
  });

  it("parses tempo adjustments", () => {
    const bpmRes = parseNaturalIntent("set tempo to 135 bpm");
    expect(bpmRes.toolCalls[0]).toEqual({
      name: "set_tempo",
      arguments: { bpm: 135 },
    });

    const fasterRes = parseNaturalIntent("pick it up, a bit faster");
    expect(fasterRes.toolCalls[0]).toEqual({
      name: "set_tempo",
      arguments: { delta: 5 },
    });
  });

  it("parses cues", () => {
    const fillRes = parseNaturalIntent("give me a drum fill");
    expect(fillRes.toolCalls[0]).toEqual({
      name: "trigger_cue",
      arguments: { cue: "fill" },
    });

    const endRes = parseNaturalIntent("bring it home with an ending");
    expect(endRes.toolCalls[0]).toEqual({
      name: "trigger_cue",
      arguments: { cue: "ending" },
    });
  });

  it("parses style changes", () => {
    const funkRes = parseNaturalIntent("let's play some funk");
    expect(funkRes.toolCalls[0]).toEqual({
      name: "set_style",
      arguments: { styleId: "funk-16" },
    });

    const metalRes = parseNaturalIntent("give me heavy metal");
    expect(metalRes.toolCalls[0]).toEqual({
      name: "set_style",
      arguments: { styleId: "metal-gallop" },
    });
  });

  it("parses parts muting", () => {
    const dropBass = parseNaturalIntent("drop the bass for now");
    expect(dropBass.toolCalls[0]).toEqual({
      name: "set_parts",
      arguments: { muteBass: true },
    });

    const bringBass = parseNaturalIntent("bring in bass");
    expect(bringBass.toolCalls[0]).toEqual({
      name: "set_parts",
      arguments: { muteBass: false },
    });
  });

  it("parses Stage count-in, tap, seek, transpose and tuner", () => {
    expect(parseNaturalIntent("count in 2").toolCalls[0]).toEqual({
      name: "set_count_in",
      arguments: { bars: 2 },
    });
    expect(parseNaturalIntent("slå inn tempoet").toolCalls[0]).toEqual({
      name: "tap_tempo",
      arguments: {},
    });
    expect(parseNaturalIntent("go to bar 8").toolCalls[0]).toEqual({
      name: "seek_bar",
      arguments: { bar: 8 },
    });
    expect(parseNaturalIntent("transpose down 2").toolCalls[0]).toEqual({
      name: "transpose_chart",
      arguments: { semitones: -2 },
    });
    expect(parseNaturalIntent("tuner on").toolCalls[0]).toEqual({
      name: "toggle_tuner",
      arguments: { enabled: true },
    });
  });

  it("parses recording takes", () => {
    const recRes = parseNaturalIntent("record a take");
    expect(recRes.toolCalls[0]).toEqual({
      name: "record_take",
      arguments: { action: "start" },
    });

    const stopRecRes = parseNaturalIntent("stop recording");
    expect(stopRecRes.toolCalls[0]).toEqual({
      name: "record_take",
      arguments: { action: "stop" },
    });
  });

  it("Jo-visible copy has no exclamation marks", () => {
    const files = [
      "src/lib/jo/intent.ts",
      "src/lib/jo/dispatcher.ts",
      "src/lib/jo/conversation.ts",
      "src/lib/jo/tools.ts",
      "src/lib/jo/loadSong.ts",
      "src/lib/jo/studioTools.ts",
      "src/lib/jo/gemini.ts",
      "src/lib/jo/providers.ts",
      "src/components/StudioAssistant.tsx",
      "src/screens/Jo.tsx",
      "src/components/JoStage.tsx",
      "src/components/JoVoice.tsx",
    ];
    const hits = files.flatMap((path) => {
      const text = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      return text.split("\n").flatMap((line, i) => {
        if (line.includes("[.!") || line.includes("[.!?]")) return [];
        return [...line.matchAll(/(["'`])([^"'`\n]*![^"'`\n]*)\1/g)].map(
          (m) => `${path}:${i + 1}: ${m[2].slice(0, 80)}`,
        );
      });
    });
    expect(hits).toEqual([]);
  });

  it("Jo failures and assistant history are sentences", () => {
    const conversation = readFileSync("src/lib/jo/conversation.ts", "utf8");
    const assistant = readFileSync(
      "src/components/StudioAssistant.tsx",
      "utf8",
    );
    const media = readFileSync("src/lib/media.ts", "utf8");
    expect(conversation).not.toContain("failed:");
    expect(assistant).not.toContain("Applied:");
    expect(assistant).not.toContain("Action result:");
    expect(assistant).not.toContain("Action failed:");
    expect(media).not.toContain("refresh failed:");
    expect(media).toContain("Open Songs and retry");
    expect(
      readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
    ).not.toContain("Applied:");
    expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
      "Last reply:",
    );
    expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
      "Active:",
    );
  });
});
