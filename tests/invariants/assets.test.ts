import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../../assets/manifest.json";
import { ipc } from "../../src/ipc/client";
import { type PreviewEngine, createPreviewEngine } from "../../src/ipc/preview";
import { useEngineStore } from "../../src/store/engine";
import seam from "../fixtures/seams/assets.json";

const PACK_LICENCES = new Set([
  "CC0-1.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "Apache-2.0",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Zlib",
]);

describe("sample pack seam", () => {
  it("cargo deny includes exclusive dev-dependencies so AGPL cannot enter green", () => {
    const deny = readFileSync("deny.toml", "utf8");
    expect(deny).toMatch(/\[licenses\][\s\S]*?include-dev\s*=\s*true/);
  });

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

  it("requires each pack id to have a LICENSES.md heading and an allowlisted licence", () => {
    const licenses = readFileSync("assets/LICENSES.md", "utf8");
    expect(manifest.packs.length).toBeGreaterThan(0);
    for (const pack of manifest.packs) {
      expect(pack.licence, pack.id).toBeTruthy();
      expect(
        PACK_LICENCES.has(pack.licence),
        `${pack.id} licence ${pack.licence}`,
      ).toBe(true);
      expect(licenses).toMatch(new RegExp(`^## ${pack.id}\\s*$`, "m"));
    }
  });

  it("subscribes to assets.state so pack progress updates the store", async () => {
    const previous = useEngineStore.getState();
    const load = vi.fn().mockResolvedValue(undefined);
    let onPacks: ((payload: unknown) => void) | undefined;
    const listen = vi
      .spyOn(ipc, "listen")
      .mockImplementation(async (event, handler) => {
        if (event === "assets.state") onPacks = handler as typeof onPacks;
        return () => {};
      });
    useEngineStore.setState({
      reloadLibrary: load,
      loadSettings: load,
      refreshEngineStatus: load,
    });
    try {
      const cleanup = await useEngineStore.getState().initListeners();
      expect(onPacks).toBeTypeOf("function");
      onPacks?.([
        {
          id: "standard-rock-kit",
          name: "Standard Rock Kit",
          state: "downloading",
          live: false,
          message: "Downloading this sample pack.",
          percent: 40,
        },
      ]);
      expect(useEngineStore.getState().assetPacks).toEqual([
        expect.objectContaining({
          id: "standard-rock-kit",
          state: "downloading",
          percent: 40,
        }),
      ]);
      cleanup();
    } finally {
      listen.mockRestore();
      useEngineStore.setState(previous, true);
    }
  });
});
