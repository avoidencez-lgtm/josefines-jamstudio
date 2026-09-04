import { expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import { useEngineStore } from "../../src/store/engine";

it("loads settings and library even when a subscription fails, and releases successful subscriptions", async () => {
  const unlisten = vi.fn();
  const listen = vi
    .spyOn(ipc, "listen")
    .mockResolvedValue(unlisten)
    .mockRejectedValueOnce(new Error("ACL denied"));
  const load = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn();
  const previous = useEngineStore.getState();
  useEngineStore.setState({
    reloadLibrary: load,
    loadSettings: load,
    refreshEngineStatus: load,
    notify,
  });
  try {
    const cleanup = await useEngineStore.getState().initListeners();
    expect(load).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenCalledWith(
      "error",
      expect.stringContaining("ACL denied"),
    );
    cleanup();
    expect(unlisten).toHaveBeenCalledTimes(listen.mock.calls.length - 1);
  } finally {
    listen.mockRestore();
    useEngineStore.setState(previous, true);
  }
});
