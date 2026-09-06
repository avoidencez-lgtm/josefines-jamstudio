import { describe, expect, it } from "vitest";
import type { Chart } from "../../src/ipc/contract";
import { dispatchJoToolCall } from "../../src/lib/jo/dispatcher";
import {
  COALESCE_MS,
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

  it("groups a run of typing into one Undo step so a prompt cannot evict Add shot", () => {
    const project = newVideo();
    useMedia.getState().open(project);
    useMedia.getState().edit({
      shots: [...project.shots, { ...project.shots[0], id: "second" }],
    });
    expect(useMedia.getState().undo).toHaveLength(1);
    const shotId = useMedia.getState().project.shots[0].id;
    for (const prompt of ["a", "ab", "abc"])
      useMedia.getState().edit(
        {
          shots: useMedia
            .getState()
            .project.shots.map((s) => (s.id === shotId ? { ...s, prompt } : s)),
        },
        `shot-prompt:${shotId}`,
      );
    expect(useMedia.getState().undo).toHaveLength(2);
    expect(useMedia.getState().project.shots[0].prompt).toBe("abc");
    useMedia.getState().undoEdit();
    expect(useMedia.getState().project.shots[0].prompt).toBe(
      project.shots[0].prompt,
    );
    expect(useMedia.getState().project.shots).toHaveLength(2);
    useMedia.setState({
      lastEdit: {
        key: `shot-prompt:${shotId}`,
        at: Date.now() - COALESCE_MS - 1,
      },
    });
    useMedia.getState().edit(
      {
        shots: useMedia
          .getState()
          .project.shots.map((s) =>
            s.id === shotId ? { ...s, prompt: "later" } : s,
          ),
      },
      `shot-prompt:${shotId}`,
    );
    expect(useMedia.getState().undo).toHaveLength(2);
  });
});
