import { afterEach, describe, expect, it } from "vitest";
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
    });
  });
});
