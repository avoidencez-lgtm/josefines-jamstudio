import { describe, expect, it } from "vitest";
import type { Chart } from "../../src/ipc/contract";
import { dispatchJoToolCall } from "../../src/lib/jo/dispatcher";
import {
  MEDIA_MODELS,
  applyShotIdeas,
  clampGenerationSeconds,
  fitShots,
  newVideo,
  shotsFromChart,
  useMedia,
  videoDuration,
} from "../../src/lib/media";

describe("music video seam", () => {
  it("agent shot edits validate IDs, preserve attached clips and support undo", async () => {
    const project = newVideo();
    project.shots[0].assetId = "existing";
    useMedia.getState().open(project);
    await dispatchJoToolCall({
      name: "edit_video_shot",
      arguments: {
        projectId: project.id,
        shotId: project.shots[0].id,
        title: "Golden chorus",
        seconds: 6,
      },
    });
    expect(useMedia.getState().project.shots[0].assetId).toBe("existing");
    expect(useMedia.getState().project.shots[0].seconds).toBe(6);
    await expect(
      dispatchJoToolCall({
        name: "edit_video_shot",
        arguments: {
          projectId: "wrong",
          shotId: project.shots[0].id,
          seconds: 9,
        },
      }),
    ).rejects.toThrow();
    await expect(
      dispatchJoToolCall({
        name: "set_tempo",
        arguments: {},
      }),
    ).rejects.toThrow(/bpm or a delta/);
    await expect(
      dispatchJoToolCall({
        name: "transport_control",
        arguments: { action: "status" },
      }),
    ).rejects.toThrow(/Invalid action|Unknown transport/);
    await expect(
      dispatchJoToolCall({
        name: "record_take",
        arguments: { action: "begin" },
      }),
    ).rejects.toThrow(/Invalid action|Unknown recording/);
    useMedia.getState().undoEdit();
    expect(useMedia.getState().project).toEqual(project);
  });
  it("fits chart sections to actual recording duration without moving original audio", () => {
    const chart: Chart = {
      schemaVersion: 1,
      id: "a",
      name: "Original",
      keyTonic: 0,
      mode: "major",
      timeSig: [4, 4],
      defaultBpm: 120,
      sections: [
        {
          id: "v",
          name: "Verse",
          bars: Array.from({ length: 8 }, () => [{ chord: "C", beats: 4 }]),
        },
      ],
      arrangement: [{ sectionId: "v", repeats: 2 }],
    };
    const shots = shotsFromChart(chart, 31.8);
    expect(shots).toHaveLength(4);
    expect(Math.abs(videoDuration(shots) - 31.8)).toBeLessThan(1e-9);
    expect(chart.defaultBpm).toBe(120);
    expect(() => fitShots(shots, Number.NaN)).toThrow();
    expect(new Set(MEDIA_MODELS.map((m) => m.id)).size).toBe(
      MEDIA_MODELS.length,
    );
  });

  it("snaps Veo generate seconds onto the backend allow-list", () => {
    expect(clampGenerationSeconds("veo", 2)).toBe(4);
    expect(clampGenerationSeconds("veo", 10)).toBe(8);
    expect(clampGenerationSeconds("veo", 6)).toBe(6);
    expect(clampGenerationSeconds("veo", Number.NaN)).toBe(8);
    expect(clampGenerationSeconds("veo", Number.POSITIVE_INFINITY)).toBe(8);
    expect(clampGenerationSeconds("omni", 2)).toBe(2);
  });
  it("director edits preserve clips and timing and reject missing or duplicated shots", () => {
    const p = newVideo();
    p.shots[0].assetId = "existing";
    const idea = {
      id: p.shots[0].id,
      title: "Afterglow",
      prompt: "Slow push into golden light",
    };
    const applied = applyShotIdeas(p, JSON.stringify([idea]));
    expect(applied.shots[0].assetId).toBe("existing");
    expect(applied.shots[0].seconds).toBe(p.shots[0].seconds);
    expect(p.shots[0].title).toBe("Opening");
    expect(() => applyShotIdeas(p, JSON.stringify([idea, idea]))).toThrow();
    expect(() =>
      applyShotIdeas(p, JSON.stringify([{ ...idea, id: "other" }])),
    ).toThrow();
  });
});
