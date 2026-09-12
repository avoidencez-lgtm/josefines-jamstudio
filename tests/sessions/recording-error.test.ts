import { expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import { closeDecision } from "../../src/lib/closeGuard";
import { useEngineStore } from "../../src/store/engine";

it("shows disk-full and permission app.error notices with the path", async () => {
  const previous = useEngineStore.getState();
  const handlers = new Map<string, (payload: unknown) => void>();
  vi.spyOn(ipc, "listen").mockImplementation(async (event, handler) => {
    handlers.set(event, handler);
    return () => handlers.delete(event);
  });
  const stop = await previous.initListeners();
  try {
    const disk =
      "Cannot write C:\\JosefinesJamstudio\\takes\\full\\guitar-di.wav. The disk is full.";
    const permission =
      "Cannot create C:\\JosefinesJamstudio\\takes\\blocked. Permission denied.";
    handlers.get("app.error")?.(disk);
    handlers.get("app.error")?.(permission);
    const notices = useEngineStore.getState().notices.map((n) => n.text);
    expect(notices.some((t) => t.includes(disk))).toBe(true);
    expect(notices.some((t) => t.includes(permission))).toBe(true);
    expect(notices.some((t) => t.includes("C:\\JosefinesJamstudio\\takes\\full"))).toBe(
      true,
    );
    expect(
      notices.some((t) => t.includes("C:\\JosefinesJamstudio\\takes\\blocked")),
    ).toBe(true);
  } finally {
    stop();
    vi.restoreAllMocks();
    useEngineStore.setState(previous, true);
  }
});

it("keeps a failed take guarded until saving and clears its error before another take", async () => {
  const previous = useEngineStore.getState();
  const handlers = new Map<string, (payload: unknown) => void>();
  vi.spyOn(ipc, "listen").mockImplementation(async (event, handler) => {
    handlers.set(event, handler);
    return () => handlers.delete(event);
  });
  const stop = await previous.initListeners();
  try {
    useEngineStore.setState({ isRecording: true });
    const message = "Recording was interrupted. Save the partial take.";
    handlers.get("recorder.error")?.(message);
    handlers.get("app.error")?.(message);
    expect(useEngineStore.getState().recordingError).toBe(message);
    expect(useEngineStore.getState().notices.at(-1)?.text).toBe(message);
    expect(closeDecision()).toBe("refuse");

    // A finalisation failure still releases the recorder, with an error and refresh.
    const invoke = ipc.invoke.bind(ipc);
    vi.spyOn(ipc, "invoke").mockImplementation((cmd, args) => {
      if (cmd === "recorder_stop")
        return Promise.reject(new Error("Disk unavailable"));
      return invoke(cmd, args);
    });
    await useEngineStore.getState().stopRecording();
    expect(useEngineStore.getState().isRecording).toBe(false);
    expect(useEngineStore.getState().recordingError).toBeNull();
    expect(
      useEngineStore
        .getState()
        .notices.some((n) => n.text.includes("Disk unavailable")),
    ).toBe(true);
    vi.mocked(ipc.invoke).mockResolvedValue("next-take");
    expect(await useEngineStore.getState().startRecording()).toEqual({
      ok: true,
      value: "next-take",
    });
    expect(useEngineStore.getState().recordingError).toBeNull();
    expect(useEngineStore.getState().isRecording).toBe(true);
  } finally {
    stop();
    vi.restoreAllMocks();
    useEngineStore.setState(previous, true);
  }
});
