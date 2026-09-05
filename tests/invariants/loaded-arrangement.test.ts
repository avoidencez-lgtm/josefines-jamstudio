import { afterEach, expect, it } from "vitest";
import { __setIpcForTests, ipc } from "../../src/ipc/client";
import { newOriginal, useWriting } from "../../src/lib/originals";
import { useEngineStore } from "../../src/store/engine";

const originalIpc = { ...ipc };
const originalWriting = useWriting.getState();
const originalEngine = useEngineStore.getState();
afterEach(() => {
  __setIpcForTests(originalIpc);
  useWriting.setState(originalWriting, true);
  useEngineStore.setState(originalEngine, true);
});

it("keeps the accepted draft through edits and later transport failures, but not chart replacement", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  let fail = "transport_play";
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      if (command === fail) throw new Error("deliberate failure");
      return undefined as T;
    },
  });
  await expect(useWriting.getState().play()).rejects.toThrow(
    "deliberate failure",
  );
  expect(useEngineStore.getState().loadedOriginal?.body).toEqual(song.body);
  useWriting.getState().edit((body) => {
    body.sections.verse.parts[0].muted = true;
  });
  expect(
    useEngineStore.getState().loadedOriginal?.body.sections.verse.parts[0]
      .muted,
  ).toBe(false);

  fail = "originals_load";
  await expect(useWriting.getState().play()).rejects.toThrow(
    "deliberate failure",
  );
  expect(useEngineStore.getState().loadedOriginal?.body).toEqual(song.body);
  fail = "";
  await useWriting.getState().loopRange(1, 3);
  expect(useEngineStore.getState().loadedOriginal?.body).toEqual(
    useWriting.getState().song?.body,
  );
  await useEngineStore.getState().playChartInline(song.body.chart);
  expect(useEngineStore.getState().loadedOriginal).toBeNull();
});

it("records the draft accepted after saving and retains it if recording fails", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  useEngineStore.setState({ isRecording: false });
  const saved = structuredClone(song);
  saved.revision = 1;
  saved.body.chart.name = "Saved title";
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      if (command === "originals_save") return saved as T;
      if (command === "originals_list") return [saved] as T;
      if (command === "originals_record")
        throw new Error("recorder unavailable");
      return undefined as T;
    },
  });
  await expect(useWriting.getState().record()).rejects.toThrow(
    "recorder unavailable",
  );
  expect(useEngineStore.getState().loadedOriginal).toEqual({
    id: saved.id,
    body: saved.body,
  });
  expect(useEngineStore.getState().currentChart?.name).toBe("Saved title");
  expect(useEngineStore.getState().isRecording).toBe(false);
});
