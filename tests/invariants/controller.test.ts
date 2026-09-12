import { afterEach, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import { useController } from "../../src/lib/controller";

const initial = useController.getState();
afterEach(() => {
  vi.restoreAllMocks();
  useController.setState(initial, true);
});

it("saves pedal mode before reopening the port and keeps actions disarmed", async () => {
  const config = { schemaVersion: 1, bindings: [], extraNote: "keep" };
  useController.setState({ config, port: "Pedal", enabled: true });
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(undefined);
  await useController.getState().setCcToggle(true);
  expect(invoke.mock.calls).toEqual([
    ["controller_save", { document: { ...config, ccToggle: true } }],
    ["controller_open", { port: null }],
    ["controller_open", { port: "Pedal" }],
  ]);
  expect(useController.getState()).toMatchObject({
    config: { ...config, ccToggle: true },
    port: "Pedal",
    enabled: false,
    busy: false,
  });
});

it("keeps the saved mode and reports a failed save without reopening the port", async () => {
  const config = { schemaVersion: 1, bindings: [], ccToggle: false };
  useController.setState({ config, port: "Pedal", enabled: true });
  const invoke = vi
    .spyOn(ipc, "invoke")
    .mockRejectedValue(new Error("Disk full"));
  await useController.getState().setCcToggle(true);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(useController.getState()).toMatchObject({
    config,
    enabled: false,
    busy: false,
    message: "Error: Disk full",
  });
});
