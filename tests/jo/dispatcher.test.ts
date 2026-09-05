import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import { dispatchJoToolCall } from "../../src/lib/jo/dispatcher";
import type { JoToolCall } from "../../src/lib/jo/persona";
import { newShot, newVideo, useMedia } from "../../src/lib/media";
import { newOriginal, useWriting } from "../../src/lib/originals";
import { useEngineStore } from "../../src/store/engine";

const initial = useEngineStore.getState();
const writing = useWriting.getState();
const media = useMedia.getState();
beforeEach(() => {
  useEngineStore.setState(initial, true);
  useWriting.setState(writing, true);
  useMedia.setState(media, true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const calls: JoToolCall[] = [
  ...["play", "pause", "stop"].map((action) => ({
    name: "transport_control",
    arguments: { action },
  })),
  { name: "set_tempo", arguments: { bpm: 120 } },
  { name: "set_tempo", arguments: { delta: 5 } },
  { name: "trigger_cue", arguments: { cue: "fill" } },
  { name: "set_style", arguments: { styleId: "ballad-68" } },
  { name: "set_intensity", arguments: { intensity: 0.5 } },
  { name: "load_chart", arguments: { chartId: "missing" } },
  { name: "set_loop", arguments: { enabled: true, startBar: 1, endBar: 5 } },
  { name: "set_parts", arguments: { muteBass: true } },
  { name: "toggle_energy_follower", arguments: { enabled: true } },
  { name: "record_take", arguments: { action: "start" } },
  { name: "record_take", arguments: { action: "stop" } },
];

describe("Jo reports accepted actions", () => {
  it.each(calls)(
    "propagates the engine refusal for $name $arguments",
    async (call) => {
      vi.spyOn(ipc, "invoke").mockRejectedValue(
        "Save the take before changing the band.",
      );
      await expect(dispatchJoToolCall(call)).rejects.toThrow(
        "Save the take before changing the band.",
      );
      expect(
        useEngineStore.getState().notices.some((n) => n.kind === "error"),
      ).toBe(true);
    },
  );

  it("accepts Tauri null success and reports the clamped tempo, not stale telemetry", async () => {
    const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
    await expect(
      dispatchJoToolCall({
        name: "transport_control",
        arguments: { action: "play" },
      }),
    ).resolves.toContain("playback");
    const result = await dispatchJoToolCall({
      name: "set_tempo",
      arguments: { bpm: 500 },
    });
    expect(invoke).toHaveBeenLastCalledWith("transport_set_tempo", {
      bpm: 300,
    });
    expect(result).toContain("300 BPM");
    expect(result).not.toContain("500");
  });

  it("does not play after the trainer's starting tempo is refused", async () => {
    useEngineStore.setState({
      tempoTrainer: { ...initial.tempoTrainer, enabled: true },
    });
    const invoke = vi.spyOn(ipc, "invoke").mockRejectedValue("Tempo refused");
    await expect(
      dispatchJoToolCall({
        name: "transport_control",
        arguments: { action: "play" },
      }),
    ).rejects.toThrow("Tempo refused");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("does not claim to change a groove when every part is locked", async () => {
    const song = newOriginal();
    for (const part of song.body.sections.verse.parts) part.locked = true;
    useWriting.setState({ song, selected: "verse" });
    useEngineStore.setState({
      styles: [{ id: "funk-16", name: "Funk" }] as typeof initial.styles,
    });
    const result = await dispatchJoToolCall({
      name: "songwriting",
      arguments: { action: "groove", styleId: "funk-16" },
    });
    expect(result).toMatch(/unchanged|locked/i);
    expect(result).not.toContain("parts changed");
    expect(useWriting.getState().song).toBe(song);
  });

  it("keeps the recording failure even when the recovery refresh also fails", async () => {
    vi.spyOn(ipc, "invoke").mockImplementation(async (name) => {
      throw new Error(
        name === "recorder_stop" ? "Disk full" : "Refresh unavailable",
      );
    });
    await expect(
      dispatchJoToolCall({
        name: "record_take",
        arguments: { action: "stop" },
      }),
    ).rejects.toThrow("Disk full");
  });

  it("does not create a version or undo step for an unchanged studio edit", async () => {
    const song = newOriginal();
    useWriting.setState({ song, past: [] });
    const result = await dispatchJoToolCall({
      name: "edit_song",
      arguments: { title: song.body.chart.name },
    });
    expect(result).toContain("unchanged");
    expect(useWriting.getState().song).toBe(song);
    expect(useWriting.getState().past).toEqual([]);
    expect(song.versions).toEqual([]);
  });

  it("reports a real groove edit and preserves the locked bass", async () => {
    const song = newOriginal();
    song.body.sections.verse.parts[1].locked = true;
    useWriting.setState({ song, selected: "verse", past: [] });
    useEngineStore.setState({
      styles: [{ id: "funk-16", name: "Funk" }] as typeof initial.styles,
    });
    await expect(
      dispatchJoToolCall({
        name: "songwriting",
        arguments: { action: "groove", styleId: "funk-16" },
      }),
    ).resolves.toContain("parts changed");
    expect(
      useWriting
        .getState()
        .song?.body.sections.verse.parts.map((p) => p.styleId),
    ).toEqual(["funk-16", "rock-straight", "funk-16"]);
    expect(useWriting.getState().past).toHaveLength(1);
  });

  it("keeps the saved render and undo history for an unchanged shot", async () => {
    const shot = newShot();
    const project = { ...newVideo(), shots: [shot] };
    useMedia.setState({ project, undo: [], renderPath: "movie.mp4" });
    const result = await dispatchJoToolCall({
      name: "edit_video_shot",
      arguments: { projectId: project.id, shotId: shot.id, title: shot.title },
    });
    expect(result).toContain("unchanged");
    expect(useMedia.getState().project).toBe(project);
    expect(useMedia.getState().undo).toEqual([]);
    expect(useMedia.getState().renderPath).toBe("movie.mp4");
  });
});
