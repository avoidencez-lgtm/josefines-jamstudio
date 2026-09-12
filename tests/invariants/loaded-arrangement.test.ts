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

it("refuses Write play and loop when a reference is loaded", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  const commands: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      return undefined as T;
    },
  });
  useEngineStore.setState({
    telemetry: {
      ...useEngineStore.getState().telemetry,
      reference: {
        asset_id: "fixture",
        label: "Synthetic reference",
        seconds: 5,
        position: 2.5,
        state: "playing",
        loop_start: 0,
        loop_end: 5,
        loop_enabled: false,
      },
    },
  });
  await expect(useWriting.getState().play()).rejects.toThrow(
    "Band charts do not change reference audio.",
  );
  await expect(useWriting.getState().loopRange(1, 3)).rejects.toThrow(
    "Band charts do not change reference audio.",
  );
  expect(commands).toEqual([]);
  expect(useEngineStore.getState().loadedOriginal).toBeNull();
});

it("refuses Write record when a reference is loaded", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  const commands: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      return undefined as T;
    },
  });
  useEngineStore.setState({
    isRecording: false,
    telemetry: {
      ...useEngineStore.getState().telemetry,
      reference: {
        asset_id: "fixture",
        label: "Synthetic reference",
        seconds: 5,
        position: 2.5,
        state: "playing",
        loop_start: 0,
        loop_end: 5,
        loop_enabled: false,
      },
    },
  });
  await expect(useWriting.getState().record()).rejects.toThrow(
    "Band charts do not change reference audio.",
  );
  expect(commands).toEqual([]);
  expect(useEngineStore.getState().loadedOriginal).toBeNull();
  expect(useEngineStore.getState().isRecording).toBe(false);
});

it("routes Write record-start through the store", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  const commands: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      if (command === "originals_save") return song as T;
      if (command === "originals_list") return [song] as T;
      return undefined as T;
    },
  });
  useEngineStore.setState({
    isRecording: false,
    recordOriginal: async (sessionId) => {
      commands.push(`store.recordOriginal:${sessionId}`);
      return { ok: true as const, value: "take-1" };
    },
  });
  await useWriting.getState().record();
  expect(commands).toEqual([
    "originals_save",
    "originals_list",
    "originals_load",
    `store.recordOriginal:${song.id}`,
  ]);
  expect(useEngineStore.getState().isRecording).toBe(false);
});

it("routes Write capture through the store", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  const commands: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      return undefined as T;
    },
  });
  useEngineStore.setState({
    armCapture: async (seconds) => {
      commands.push(`store.armCapture:${seconds}`);
      return { ok: true as const, value: undefined };
    },
    keepCapture: async (sessionId) => {
      commands.push(`store.keepCapture:${sessionId}`);
      return { ok: true as const, value: undefined };
    },
    loadTakes: async () => {
      commands.push("store.loadTakes");
    },
  });
  await useWriting.getState().arm(8);
  await useWriting.getState().keep();
  expect(commands).toEqual([
    "store.armCapture:8",
    `store.keepCapture:${song.id}`,
    "store.loadTakes",
  ]);
  expect(useWriting.getState().captureSeconds).toBe(8);
});

it("routes Write save through the store", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  const commands: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      return undefined as T;
    },
  });
  useEngineStore.setState({
    saveOriginal: async (document) => {
      commands.push(`store.saveOriginal:${document.id}`);
      return { ok: true as const, value: document };
    },
    listOriginals: async () => {
      commands.push("store.listOriginals");
      return { ok: true as const, value: [song] };
    },
  });
  await useWriting.getState().save();
  expect(commands).toEqual([
    `store.saveOriginal:${song.id}`,
    "store.listOriginals",
  ]);
});

it("routes Write original load through the store", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  const commands: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      return undefined as T;
    },
  });
  useEngineStore.setState({
    loadOriginal: async (document) => {
      commands.push(`store.loadOriginal:${document.id}`);
      return { ok: true as const, value: undefined };
    },
    transportSetCountIn: async () => ({ ok: true as const, value: undefined }),
    transportPlay: async () => ({ ok: true as const, value: undefined }),
  });
  await useWriting.getState().play();
  expect(commands).toEqual([`store.loadOriginal:${song.id}`]);
});

it("routes Write play through the store", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  const commands: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      return undefined as T;
    },
  });
  useEngineStore.setState({
    transportSetCountIn: async (bars) => {
      commands.push(`store.transportSetCountIn:${bars}`);
      return { ok: true as const, value: undefined };
    },
    transportPlay: async () => {
      commands.push("store.transportPlay");
      return { ok: true as const, value: undefined };
    },
  });
  await useWriting.getState().play();
  expect(commands).toEqual([
    "originals_load",
    "store.transportSetCountIn:0",
    "store.transportPlay",
  ]);
});

it("routes Write loop through the store", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  const commands: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      return undefined as T;
    },
  });
  useEngineStore.setState({
    transportSetCountIn: async (bars) => {
      commands.push(`store.transportSetCountIn:${bars}`);
      return { ok: true as const, value: undefined };
    },
    transportSetLoop: async (startBar, endBar, enabled) => {
      commands.push(`store.transportSetLoop:${startBar}:${endBar}:${enabled}`);
      return { ok: true as const, value: undefined };
    },
    transportSeekBar: async (bar) => {
      commands.push(`store.transportSeekBar:${bar}`);
      return { ok: true as const, value: undefined };
    },
    transportPlay: async () => {
      commands.push("store.transportPlay");
      return { ok: true as const, value: undefined };
    },
  });
  await useWriting.getState().loopRange(1, 3);
  expect(commands).toEqual([
    "originals_load",
    "store.transportSetCountIn:0",
    "store.transportSetLoop:1:3:true",
    "store.transportSeekBar:1",
    "store.transportPlay",
  ]);
});

it("routes Write record-stop through the store", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  const commands: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      return undefined as T;
    },
  });
  useEngineStore.setState({
    isRecording: true,
    stopRecording: async () => {
      commands.push("store.stopRecording");
      return { ok: true as const, value: null };
    },
    transportStop: async () => {
      commands.push("store.transportStop");
      return { ok: true as const, value: undefined };
    },
  });
  await useWriting.getState().record();
  expect(commands).toEqual(["store.stopRecording", "store.transportStop"]);
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

it("Stage transpose reloads a loaded original instead of inlining the chart", async () => {
  const song = newOriginal();
  useWriting.getState().openSong(song);
  const commands: string[] = [];
  let lastLoad:
    | { document?: { body: (typeof song)["body"] }; keepPlayback?: boolean }
    | undefined;
  __setIpcForTests({
    invoke: async <T>(command: string, args?: Record<string, unknown>) => {
      commands.push(command);
      if (command === "originals_load") {
        lastLoad = args as {
          document: { body: (typeof song)["body"] };
          keepPlayback?: boolean;
        };
      }
      if (command === "band_load_chart_inline") {
        throw new Error("inline load must not run after Play song");
      }
      return undefined as T;
    },
  });
  await useWriting.getState().play();
  expect(useEngineStore.getState().loadedOriginal?.body.sections).toEqual(
    song.body.sections,
  );
  commands.length = 0;
  await useEngineStore.getState().transposeCurrentChart(1);
  expect(commands).toEqual(["originals_load"]);
  expect(useEngineStore.getState().loadedOriginal?.id).toBe(song.id);
  expect(useEngineStore.getState().loadedOriginal?.body.sections).toEqual(
    song.body.sections,
  );
  expect(useEngineStore.getState().loadedOriginal?.body.chart.keyTonic).toBe(
    (song.body.chart.keyTonic + 1) % 12,
  );
  expect(useEngineStore.getState().currentChart?.keyTonic).toBe(
    (song.body.chart.keyTonic + 1) % 12,
  );
  expect(lastLoad?.document?.body.sections).toEqual(song.body.sections);
  expect(lastLoad?.keepPlayback).toBe(true);
});

it("routes Stage transpose of a loaded original through loadOriginal", async () => {
  const song = newOriginal();
  const commands: { id: string; keepPlayback?: boolean; tonic: number }[] = [];
  useEngineStore.setState({
    currentChart: song.body.chart,
    loadedOriginal: { id: song.id, body: song.body },
    loadOriginal: async (document, keepPlayback) => {
      commands.push({
        id: document.id,
        keepPlayback,
        tonic: document.body.chart.keyTonic,
      });
      return { ok: true as const, value: undefined };
    },
  });
  const result = await useEngineStore.getState().transposeCurrentChart(1);
  expect(result).toEqual({ ok: true, value: undefined });
  expect(commands).toEqual([
    {
      id: song.id,
      keepPlayback: true,
      tonic: (song.body.chart.keyTonic + 1) % 12,
    },
  ]);
});

it("Stage transpose still inlines a jam chart when no original is loaded", async () => {
  const song = newOriginal();
  const commands: string[] = [];
  useEngineStore.setState({
    currentChart: song.body.chart,
    loadedOriginal: null,
  });
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      return undefined as T;
    },
  });
  await useEngineStore.getState().transposeCurrentChart(1);
  expect(commands).toEqual(["band_load_chart_inline"]);
  expect(useEngineStore.getState().loadedOriginal).toBeNull();
  expect(useEngineStore.getState().currentChart?.keyTonic).toBe(
    (song.body.chart.keyTonic + 1) % 12,
  );
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

it("refuses to load or record a different song opened while saving", async () => {
  const song = newOriginal();
  const next = newOriginal();
  const commands: string[] = [];
  useWriting.getState().openSong(song);
  useEngineStore.setState({ isRecording: false, loadedOriginal: null });
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      commands.push(command);
      if (command === "originals_save") {
        useWriting.setState({ song: next });
        return { ...song, revision: 1 } as T;
      }
      return [] as T;
    },
  });
  await expect(useWriting.getState().record()).rejects.toThrow(
    "The open song changed while saving",
  );
  expect(commands).toEqual(["originals_save", "originals_list"]);
  expect(useWriting.getState().song?.id).toBe(next.id);
  expect(useEngineStore.getState().loadedOriginal).toBeNull();
  expect(useEngineStore.getState().isRecording).toBe(false);
});
