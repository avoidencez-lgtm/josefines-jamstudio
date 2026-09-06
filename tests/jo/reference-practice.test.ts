import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import { dispatchJoToolCall } from "../../src/lib/jo/dispatcher";
import { parseNaturalIntent } from "../../src/lib/jo/intent";
import { useEngineStore } from "../../src/store/engine";
import fixture from "../fixtures/seams/reference-practice.json";

const initial = useEngineStore.getState();
beforeEach(() =>
  useEngineStore.setState(
    {
      ...initial,
      isPreview: false,
      telemetry: {
        ...initial.telemetry,
        reference: {
          asset_id: "fixture",
          label: "Test",
          seconds: 2,
          position: 0,
          state: "paused",
          loop_start: 0,
          loop_end: 2,
          loop_enabled: false,
          speed: 1,
          semitones: 0,
        },
      },
    },
    true,
  ),
);
afterEach(() => {
  useEngineStore.setState(initial, true);
  vi.restoreAllMocks();
});

it("applies partial reference settings without overwriting the other value from stale telemetry", async () => {
  const invoke = vi
    .spyOn(ipc, "invoke")
    .mockResolvedValueOnce({ speed: 0.75, semitones: 0 })
    .mockResolvedValueOnce(fixture.applied);
  expect(await dispatchJoToolCall(fixture.speed)).toContain("75%");
  expect(await dispatchJoToolCall(fixture.transpose)).toContain("+2 semitones");
  expect(invoke).toHaveBeenNthCalledWith(1, "media_reference_processing", {
    assetId: "fixture",
    speed: 0.75,
    semitones: undefined,
  });
  expect(invoke).toHaveBeenNthCalledWith(2, "media_reference_processing", {
    assetId: "fixture",
    speed: undefined,
    semitones: 2,
  });
});

it("refuses stale sources, out-of-range values, preview, recording and native failures", async () => {
  const invoke = vi
    .spyOn(ipc, "invoke")
    .mockRejectedValue(new Error("Disk unavailable"));
  for (const args of [
    { assetId: "old", speedPercent: 75 },
    { assetId: "fixture", speedPercent: 49 },
    { assetId: "fixture", semitones: 1.5 },
    { assetId: "fixture" },
  ])
    await expect(
      dispatchJoToolCall({ name: "set_reference_practice", arguments: args }),
    ).rejects.toThrow();
  useEngineStore.setState({ isRecording: true });
  await expect(dispatchJoToolCall(fixture.speed)).rejects.toThrow(
    "Save the take",
  );
  useEngineStore.setState({ isRecording: false, isPreview: true });
  await expect(dispatchJoToolCall(fixture.speed)).rejects.toThrow("desktop");
  expect(invoke).not.toHaveBeenCalled();
  useEngineStore.setState({ isPreview: false });
  await expect(dispatchJoToolCall(fixture.speed)).rejects.toThrow(
    "Disk unavailable",
  );
});

it("routes explicit English and Bokmål offline practice commands to the loaded reference", () => {
  const reference = { assetId: "fixture", speed: 0.75 };
  for (const text of [
    "speed 75%",
    "set speed to 75 percent",
    "sett hastighet til 75 prosent",
  ])
    expect(parseNaturalIntent(text, reference).toolCalls).toEqual([
      fixture.speed,
    ]);
  for (const text of ["transpose +2", "transponer til 2 halvtoner"])
    expect(parseNaturalIntent(text, reference).toolCalls).toEqual([
      fixture.transpose,
    ]);
  expect(
    parseNaturalIntent("slower", reference).toolCalls[0].arguments.speedPercent,
  ).toBe(70);
  expect(
    parseNaturalIntent("raskere", reference).toolCalls[0].arguments
      .speedPercent,
  ).toBe(80);
  expect(parseNaturalIntent("speed 75% ").toolCalls).toEqual([]);
  expect(parseNaturalIntent("slower").toolCalls[0].name).toBe("set_tempo");
});
