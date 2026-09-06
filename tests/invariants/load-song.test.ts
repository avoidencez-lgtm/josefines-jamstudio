import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import {
  handleJoQuery,
  useJoConversation,
} from "../../src/lib/jo/conversation";
import { dispatchJoToolCall } from "../../src/lib/jo/dispatcher";
import { parseNaturalIntent } from "../../src/lib/jo/intent";
import { useAi } from "../../src/lib/jo/providers";
import * as providers from "../../src/lib/jo/providers";
import { JO_TOOLS } from "../../src/lib/jo/tools";
import { loadReference, useMedia } from "../../src/lib/media";
import { newOriginal } from "../../src/lib/originals";
import { useEngineStore } from "../../src/store/engine";

const engine = useEngineStore.getState();
const media = useMedia.getState();
const ai = useAi.getState();
const conversation = useJoConversation.getState();
// Synthetic library: duplicate titles, a prefix collision and a non-audio entry.
const assets = [
  {
    id: "song-a",
    kind: "audio",
    label: "Blå natt",
    path: "/private/a.wav",
    seconds: 30,
  },
  {
    id: "song-b",
    kind: "audio",
    label: "Blå natt live",
    path: "/private/b.wav",
    seconds: 40,
  },
  {
    id: "song-c",
    kind: "audio",
    label: "Encore",
    path: "/private/c.wav",
    seconds: 20,
  },
  {
    id: "song-d",
    kind: "audio",
    label: "Encore",
    path: "/private/d.wav",
    seconds: 20,
  },
  {
    id: "film",
    kind: "video",
    label: "Film only",
    path: "/private/film.mp4",
    seconds: 10,
  },
];
const call = (query: string) => ({ name: "load_song", arguments: { query } });
beforeEach(() => {
  useEngineStore.setState(
    {
      ...engine,
      isPreview: false,
      loadedOriginal: newOriginal(),
      tempoTrainer: { ...engine.tempoTrainer, enabled: true },
    },
    true,
  );
  useMedia.setState({ ...media, assets: [] }, true);
  useAi.setState({ ...ai, loaded: false }, true);
  useJoConversation.setState(
    { ...conversation, busy: false, messages: [], pending: null },
    true,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  useEngineStore.setState(engine, true);
  useMedia.setState(media, true);
  useAi.setState(ai, true);
  useJoConversation.setState(conversation, true);
});
const mockLibrary = () =>
  vi.spyOn(ipc, "invoke").mockImplementation(async (name) => {
    if (name === "media_list")
      return { assets, projects: [], jobs: [], warnings: [] };
    if (name === "media_reference_load") return null;
    throw new Error(`Unexpected command: ${name}`);
  });

it("routes the declared tool from English/Bokmål text through fresh native lookup and reports actual loading", async () => {
  const invoke = mockLibrary();
  expect(JO_TOOLS.filter((t) => t.name === "load_song")).toHaveLength(1);
  for (const text of ["load song Blå natt", 'last inn sangen "Blå natt"']) {
    expect(parseNaturalIntent(text).toolCalls).toEqual([call("Blå natt")]);
    expect(await handleJoQuery(text)).toContain("Blå natt");
    expect(invoke).toHaveBeenLastCalledWith("media_reference_load", {
      assetId: "song-a",
      useStems: undefined,
    });
  }
  expect(invoke.mock.calls.map(([name]) => name)).toEqual([
    "media_list",
    "media_reference_load",
    "media_list",
    "media_reference_load",
  ]);
  expect(useEngineStore.getState().currentScreen).toBe("stage");
  expect(useEngineStore.getState().tempoTrainer.enabled).toBe(false);
  expect(useEngineStore.getState().loadedOriginal).toBeNull();
  expect(useMedia.getState().busy).toBe("");
  expect(useMedia.getState().assets).toEqual(assets);
});

it("prefers exact IDs/titles, allows a unique title fragment, and refuses ambiguous or missing audio", async () => {
  const invoke = mockLibrary();
  for (const query of [" song-a ", "BLA\u030a NATT", "natt live"]) {
    await expect(dispatchJoToolCall(call(query))).resolves.toContain("Loaded");
  }
  for (const query of ["natt", "Encore", "Film only", "missing"]) {
    invoke.mockClear();
    await expect(dispatchJoToolCall(call(query))).rejects.toThrow();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("media_list");
  }
  await expect(dispatchJoToolCall(call("Encore"))).rejects.toThrow("song-c");
  await expect(dispatchJoToolCall(call("Encore"))).rejects.not.toThrow(
    "/private/",
  );
});

it("refuses malformed queries, preview, recording and overlapping media work before IPC", async () => {
  const invoke = mockLibrary();
  for (const query of ["", " ", "a".repeat(201)])
    await expect(dispatchJoToolCall(call(query))).rejects.toThrow();
  await expect(
    dispatchJoToolCall({ name: "load_song", arguments: { query: 5 } }),
  ).rejects.toThrow();
  useEngineStore.setState({ isPreview: true });
  await expect(dispatchJoToolCall(call("Blå natt"))).rejects.toThrow("desktop");
  useEngineStore.setState({ isPreview: false, isRecording: true });
  await expect(dispatchJoToolCall(call("Blå natt"))).rejects.toThrow(
    "recording",
  );
  useEngineStore.setState({ isRecording: false });
  useMedia.setState({ busy: "Rendering film" });
  await expect(dispatchJoToolCall(call("Blå natt"))).rejects.toThrow(
    "operation",
  );
  expect(invoke).not.toHaveBeenCalled();
  expect(useMedia.getState().busy).toBe("Rendering film");
});

it("keeps the previous rehearsal on native failure and rechecks recording after lookup", async () => {
  const invoke = mockLibrary();
  const before = useEngineStore.getState();
  invoke.mockImplementation(async (name) => {
    if (name === "media_list") return { assets, projects: [], jobs: [] };
    throw new Error("Source hash changed");
  });
  expect(await handleJoQuery("load song Blå natt")).toContain(
    "Source hash changed",
  );
  expect(useEngineStore.getState().currentScreen).toBe(before.currentScreen);
  expect(useEngineStore.getState().tempoTrainer).toBe(before.tempoTrainer);
  expect(useEngineStore.getState().loadedOriginal).toBe(before.loadedOriginal);
  expect(useEngineStore.getState().telemetry).toBe(before.telemetry);
  expect(useMedia.getState().busy).toBe("");
  invoke.mockClear().mockImplementation(async () => {
    useEngineStore.setState({ isRecording: true });
    return { assets, projects: [], jobs: [] };
  });
  await expect(dispatchJoToolCall(call("Blå natt"))).rejects.toThrow(
    "recording",
  );
  expect(invoke).toHaveBeenCalledTimes(1);
});

it("stops a provider command sequence if song lookup fails instead of playing the old source", async () => {
  const invoke = mockLibrary();
  useAi.setState({
    loaded: true,
    preferences: { ...ai.preferences, selected: "codex" },
  });
  vi.spyOn(providers, "askBrain").mockResolvedValue({
    reply: "Playing your song.",
    toolCalls: [
      call("Encore"),
      { name: "transport_control", arguments: { action: "play" } },
    ],
  });
  const reply = await handleJoQuery("Load Encore and play it");
  expect(reply).toContain("Several songs match");
  expect(reply).toContain("Remaining commands were not applied");
  expect(reply).not.toContain("Playing your song");
  expect(invoke.mock.calls.map(([name]) => name)).toEqual(["media_list"]);
});

it("reserves the media operation during lookup and releases it on a library error", async () => {
  let rejectLookup: (error: Error) => void = () => {};
  const invoke = vi.spyOn(ipc, "invoke").mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectLookup = reject;
      }),
  );
  const pending = dispatchJoToolCall(call("Blå natt"));
  await expect(dispatchJoToolCall(call("natt live"))).rejects.toThrow(
    "operation",
  );
  expect(invoke).toHaveBeenCalledTimes(1);
  rejectLookup(new Error("Library unavailable"));
  await expect(pending).rejects.toThrow("Library unavailable");
  expect(useMedia.getState().busy).toBe("");
});

it("shares original-mix selection with Songs without resetting state on refusal", async () => {
  const invoke = vi
    .spyOn(ipc, "invoke")
    .mockRejectedValueOnce(new Error("Missing source"))
    .mockResolvedValue(null);
  const before = useEngineStore.getState();
  await expect(loadReference("song-a", false)).rejects.toThrow(
    "Missing source",
  );
  expect(useEngineStore.getState().loadedOriginal).toBe(before.loadedOriginal);
  await loadReference("song-a", false);
  expect(invoke).toHaveBeenLastCalledWith("media_reference_load", {
    assetId: "song-a",
    useStems: false,
  });
  expect(useEngineStore.getState().loadedOriginal).toBeNull();
});

it("does not reinterpret questions or negated song requests as transport/style commands", () => {
  for (const text of [
    "Can you load song Funk?",
    "Don't load song Stop",
    "ikke last inn sangen Jazz",
    "load song",
    "last inn sangen",
  ])
    expect(parseNaturalIntent(text).toolCalls).toEqual([]);
});
