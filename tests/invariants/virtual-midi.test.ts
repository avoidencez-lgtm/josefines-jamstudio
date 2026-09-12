import { afterEach, expect, it } from "vitest";
import { type PreviewEngine, createPreviewEngine } from "../../src/ipc/preview";
import seam from "../fixtures/seams/virtual-midi.json";

let engine: PreviewEngine | undefined;
afterEach(() => engine?.dispose());

it("keeps the virtual MIDI monitor not configured in preview", async () => {
  expect(seam.ownerGate).toBe("v2");
  expect(seam.claimsHardware).toBe(false);
  engine = createPreviewEngine({ autoTick: false });
  await expect(engine.invoke("rig_virtual_check", {})).rejects.toThrow(
    /not configured/,
  );
});
