import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ReferencePlayer } from "../../src/components/ReferencePlayer";
import { ipc } from "../../src/ipc/client";
import { useController } from "../../src/lib/controller";
import { dispatchJoToolCall } from "../../src/lib/jo/dispatcher";
import { parseNaturalIntent } from "../../src/lib/jo/intent";
import { useReferenceRamp } from "../../src/lib/referenceRamp";
import { SHORTCUTS } from "../../src/lib/shortcuts";
import { useEngineStore } from "../../src/store/engine";
import config from "../fixtures/seams/reference-ramp.json";

const before = useEngineStore.getState();
const controller = useController.getState();
const draft = useReferenceRamp.getState();
afterEach(() => {
  useEngineStore.setState(before, true);
  useController.setState(controller, true);
  useReferenceRamp.setState(draft, true);
  vi.restoreAllMocks();
});
it("routes explicit ramp commands through one native action and rejects stale or recording contexts", async () => {
  useEngineStore.setState({
    isPreview: false,
    telemetry: {
      ...before.telemetry,
      reference: {
        asset_id: "fixture",
        label: "Fixture",
        seconds: 5,
        position: 0,
        state: "stopped",
        loop_start: 0,
        loop_end: 5,
        loop_enabled: false,
        grid: {
          origin: "confirmed-local",
          beats_per_bar: 4,
          bars: 2,
          sections: [],
          position: null,
        },
      },
    },
  });
  const call = {
    name: "ramp",
    arguments: {
      assetId: "fixture",
      startPercent: 50,
      stepPercent: 25,
      targetPercent: 125,
      barsPerStep: 1,
    },
  };
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue({
    config,
    active: true,
    completed_bars: 0,
    speed_percent: 50,
  });
  expect(await dispatchJoToolCall(call)).toContain("50%");
  expect(invoke).toHaveBeenCalledWith("media_reference_ramp", {
    assetId: "fixture",
    config,
    toggle: false,
  });
  const shortcut = SHORTCUTS.find((s) => s.keys === "Q");
  expect(shortcut).toBeDefined();
  await shortcut?.run(useEngineStore.getState());
  useController.setState({
    enabled: true,
    learning: null,
    busy: false,
    config: {
      schemaVersion: 1,
      bindings: [
        { action: "ramp", press: { kind: "cc", channel: 1, number: 5 } },
      ],
    },
  });
  await useController.getState().receive({ kind: "cc", channel: 1, number: 5 });
  expect(invoke).toHaveBeenLastCalledWith("media_reference_ramp", {
    assetId: "fixture",
    config,
    toggle: true,
  });
  const reference = useEngineStore.getState().telemetry.reference;
  if (!reference) throw new Error("Missing reference");
  const html = renderToStaticMarkup(
    createElement(ReferencePlayer, { song: reference }),
  );
  expect(html).toContain('aria-label="Reference practice ramp"');
  expect(html).toContain("Complete bars per step");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Start ramp/);
  expect(html).not.toContain("<audio");
  for (const text of [
    "ramp 50 to 125 by 25 every 1 bars",
    "ramp fra 50 til 125 med 25 hver 1 takt",
  ]) {
    expect(
      parseNaturalIntent(text, { assetId: "fixture", speed: 1 }).toolCalls,
    ).toEqual([call]);
  }
  expect(
    parseNaturalIntent("do not ramp 50 to 125 by 25 every 1 bars", {
      assetId: "fixture",
      speed: 1,
    }).toolCalls,
  ).toEqual([]);
  expect(parseNaturalIntent("load song Ramp").toolCalls).toEqual([
    { name: "load_song", arguments: { query: "Ramp" } },
  ]);
  invoke.mockClear();
  for (const arguments_ of [
    { ...call.arguments, assetId: "stale" },
    { ...call.arguments, startPercent: 49 },
  ])
    await expect(
      dispatchJoToolCall({ ...call, arguments: arguments_ }),
    ).rejects.toThrow();
  useEngineStore.setState({ isRecording: true });
  await expect(dispatchJoToolCall(call)).rejects.toThrow("Save the take");
  expect(invoke).not.toHaveBeenCalled();
  useEngineStore.setState({ isRecording: false });
  invoke.mockRejectedValueOnce(new Error("Native refusal"));
  await expect(dispatchJoToolCall(call)).rejects.toThrow("Native refusal");
});
