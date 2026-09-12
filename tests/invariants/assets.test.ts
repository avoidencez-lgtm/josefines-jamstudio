import { afterEach, describe, expect, it } from "vitest";
import manifest from "../../assets/manifest.json";
import { type PreviewEngine, createPreviewEngine } from "../../src/ipc/preview";
import seam from "../fixtures/seams/assets.json";

describe("sample pack seam", () => {
  let engine: PreviewEngine | undefined;
  afterEach(() => engine?.dispose());

  it("records the published assets-v1 checksum and still gates preview download", async () => {
    expect(seam.schemaVersion).toBe(1);
    expect(seam.id).toBe("sample-packs");
    expect(seam.live).toBe(false);
    expect(manifest.packs[0].sha256).toBe(seam.sha256);
    expect(manifest.packs[0].sha256).not.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(manifest.packs[0].bytes).toBe(334392);
    engine = createPreviewEngine({ autoTick: false });
    const packs = await engine.invoke("assets_status", {});
    expect(packs).toMatchObject([
      { id: "standard-rock-kit", state: "recorded", live: false },
      { id: "freepats-bass-comp", state: "recorded", live: false },
    ]);
    expect(manifest.packs[1].sha256).toBe(
      "73cd2192f8f6422602e77c150e127c556214677a31e9c1440e28c9b96892465f",
    );
    await expect(engine.invoke("assets_ensure", {})).rejects.toThrow(
      /JAM_LIVE=1/,
    );
  });
});
