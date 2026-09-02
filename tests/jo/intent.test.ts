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
});
