import { expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import type { TransportTelemetry } from "../../src/ipc/contract";
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

it("tempo practice continues across one-bar loops and never retimes a recording", async () => {
  let tick!: (transport: TransportTelemetry) => void;
  const listen = vi
    .spyOn(ipc, "listen")
    .mockImplementation(async (event, handler) => {
      if (event === "transport.state") tick = handler as typeof tick;
      return () => {};
    });
  const previous = useEngineStore.getState();
  const setTempo = vi.fn().mockResolvedValue(undefined);
  const load = vi.fn().mockResolvedValue(undefined);
  useEngineStore.setState({
    reloadLibrary: load,
    loadSettings: load,
    refreshEngineStatus: load,
    transportSetTempo: setTempo,
    isRecording: false,
    tempoTrainer: {
      enabled: true,
      startBpm: 80,
      targetBpm: 100,
      stepBpm: 5,
      everyBars: 2,
      playedBars: 0,
    },
  });
  try {
    const off = await useEngineStore.getState().initListeners();
    const t: TransportTelemetry = {
      ...previous.telemetry.transport,
      state: "playing",
      bpm: 80,
      bar: 1,
      loop_enabled: true,
      loop_start_bar: 1,
      loop_end_bar: 2,
    };
    useEngineStore.setState({
      telemetry: {
        ...previous.telemetry,
        transport: { ...t, bar_progress: 0 },
      },
    });
    for (let i = 0; i < 4; i++) {
      tick({ ...t, bar_progress: 0.95 });
      tick({ ...t, bar_progress: 0 });
    }
    expect(setTempo).toHaveBeenCalledTimes(2);
    expect(setTempo).toHaveBeenLastCalledWith(85);
    useEngineStore.setState({ isRecording: true });
    tick({ ...t, bar_progress: 0.95 });
    tick({ ...t, bar_progress: 0 });
    expect(setTempo).toHaveBeenCalledTimes(2);
    off();
  } finally {
    listen.mockRestore();
    useEngineStore.setState(previous, true);
  }
});
