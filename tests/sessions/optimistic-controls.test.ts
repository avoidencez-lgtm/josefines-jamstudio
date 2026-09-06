import { expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import { useEngineStore } from "../../src/store/engine";

it("rolls tuner, tone and volumes back when the engine refuses the change", async () => {
  const previous = useEngineStore.getState();
  try {
    useEngineStore.setState({
      tunerOn: true,
      toneOn: false,
      toneHz: 440,
      clickVolume: 0.5,
      bandVolume: 0.8,
    });
    vi.spyOn(ipc, "invoke").mockRejectedValue(new Error("device gone"));

    await useEngineStore.getState().setTuner(false);
    expect(useEngineStore.getState().tunerOn).toBe(true);

    await useEngineStore.getState().setTone(true, 880);
    expect(useEngineStore.getState().toneOn).toBe(false);
    expect(useEngineStore.getState().toneHz).toBe(440);

    await useEngineStore.getState().setClickVolume(0.2);
    expect(useEngineStore.getState().clickVolume).toBe(0.5);

    await useEngineStore.getState().setBandVolume(0.1);
    expect(useEngineStore.getState().bandVolume).toBe(0.8);
  } finally {
    vi.restoreAllMocks();
    useEngineStore.setState(previous, true);
  }
});
