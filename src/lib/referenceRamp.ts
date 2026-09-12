import { z } from "zod";
import { create } from "zustand";
import { ipc } from "../ipc/client";
import type { ReferenceRampConfig, ReferenceState } from "../ipc/contract";
import { useEngineStore } from "../store/engine";
import type { JoAction } from "./jo/tools";

const schema = z
  .object({
    schemaVersion: z.literal(1),
    startPercent: z.number().int().min(50).max(149),
    stepPercent: z.number().int().min(1).max(50),
    targetPercent: z.number().int().min(51).max(150),
    barsPerStep: z.number().int().min(1).max(64),
  })
  .refine((c) => c.targetPercent > c.startPercent);

// Session draft shared by Songs, Stage, keyboard and pedal; loading never arms a ramp.
export const useReferenceRamp = create<{
  config: ReferenceRampConfig;
  busy: boolean;
}>(() => ({
  config: {
    schemaVersion: 1,
    startPercent: 75,
    stepPercent: 5,
    targetPercent: 100,
    barsPerStep: 4,
  },
  busy: false,
}));

export async function applyReferenceRamp(
  assetId: string,
  config: ReferenceRampConfig | null,
  toggle = false,
) {
  const engine = useEngineStore.getState();
  if (engine.isPreview)
    throw new Error("Open the desktop app to use a practice ramp.");
  if (engine.isRecording)
    throw new Error("Save the take before changing the practice ramp.");
  if (engine.telemetry.reference?.asset_id !== assetId)
    throw new Error("The loaded reference changed.");
  if (useReferenceRamp.getState().busy)
    throw new Error("Wait for the current ramp change.");
  if (config && !schema.safeParse(config).success)
    throw new Error(
      "Choose 50–149% start, a higher target up to 150%, 1–50 percentage points and 1–64 bars per step.",
    );
  useReferenceRamp.setState({ busy: true });
  try {
    const result = await ipc.invoke<ReferenceState["ramp"]>(
      "media_reference_ramp",
      { assetId, config, toggle },
    );
    if (config) useReferenceRamp.setState({ config });
    return result;
  } finally {
    useReferenceRamp.setState({ busy: false });
  }
}

export async function toggleReferenceRamp() {
  const engine = useEngineStore.getState();
  try {
    await applyReferenceRamp(
      engine.telemetry.reference?.asset_id ?? "",
      useReferenceRamp.getState().config,
      true,
    );
  } catch (error) {
    engine.notify("error", String(error));
  }
}

export const rampAction: JoAction = {
  declaration: {
    name: "ramp",
    description:
      "Start a native reference practice ramp: increase speed from startPercent to targetPercent by stepPercent percentage points every barsPerStep complete confirmed bars. Uses the loaded assetId; requires a confirmed grid and downbeat-aligned loop. Does not start playback. Pause preserves progress, Stop resets it; seek/loop/manual speed edits cancel it. Stop with stop:true to hold the current speed. Session-only; unavailable while recording.",
    parameters: {
      type: "object",
      properties: {
        assetId: { type: "string" },
        startPercent: { type: "number" },
        stepPercent: { type: "number" },
        targetPercent: { type: "number" },
        barsPerStep: { type: "number" },
        stop: { type: "boolean" },
      },
      required: ["assetId"],
    },
  },
  run: async (args) => {
    const config =
      args.stop === true
        ? null
        : {
            schemaVersion: 1 as const,
            startPercent: Number(args.startPercent),
            stepPercent: Number(args.stepPercent),
            targetPercent: Number(args.targetPercent),
            barsPerStep: Number(args.barsPerStep),
          };
    const result = await applyReferenceRamp(String(args.assetId), config);
    return result
      ? `Ramp armed from ${result.config.startPercent}% to ${result.config.targetPercent}% every ${result.config.barsPerStep} complete bars. Press Play when ready.`
      : "Ramp stopped; current speed kept.";
  },
};
