import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { LYRIA_MONTHLY_CAP_REFUSED } from "../../src/ipc/contract";
import { type PreviewEngine, createPreviewEngine } from "../../src/ipc/preview";
import protocol from "../fixtures/providers/lyria/protocol.json";
import seam from "../fixtures/seams/lyria.json";

describe("Lyria RealTime seam", () => {
  let engine: PreviewEngine | undefined;
  afterEach(() => engine?.dispose());

  it("keeps BPM off the clock and preview explicitly not configured", async () => {
    expect(seam.schemaVersion).toBe(1);
    expect(seam.id).toBe("lyria-realtime");
    expect(seam.drivesClock).toBe(false);
    expect(seam.exclusiveWith).toEqual(["band", "song"]);
    expect(protocol.setup.setup.model).toBe("models/lyria-realtime-exp");
    expect(protocol.audio.serverContent.audioChunks[0].mimeType).toBe(
      "audio/pcm;rate=48000",
    );
    engine = createPreviewEngine({ autoTick: false });
    await expect(engine.invoke("lyria_start", {})).rejects.toThrow(
      /not configured/,
    );
    await expect(engine.invoke("lyria_set", {})).rejects.toThrow(
      /not configured/,
    );
    expect(await engine.invoke("lyria_status", {})).toMatchObject({
      phase: "idle",
      live: false,
      drivesClock: false,
      spend: 0,
    });
  });

  it("refuses lyria_start at the monthly cap without confirm", async () => {
    engine = createPreviewEngine({ autoTick: false });
    await engine.invoke("settings_set", {
      settings: {
        schemaVersion: 1,
        lyria: { sessionMinutes: 10, monthlyUsd: 0 },
      },
    });
    await expect(engine.invoke("lyria_start", {})).rejects.toThrow(
      LYRIA_MONTHLY_CAP_REFUSED,
    );
    await expect(
      engine.invoke("lyria_start", { confirm: true }),
    ).rejects.toThrow(/not configured/);
  });

  it("shows spend and cap copy on Stage and Settings", () => {
    const stage = readFileSync("src/screens/Stage.tsx", "utf8");
    const settings = readFileSync("src/screens/Settings.tsx", "utf8");
    expect(stage).toContain("This session has spent");
    expect(stage).toContain("Start this session anyway.");
    expect(settings).toContain("Choose the Lyria session length.");
    expect(settings).toContain("Cap monthly Lyria spend.");
    expect(settings).toContain("Start this session anyway.");
  });
});
