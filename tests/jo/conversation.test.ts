import { afterEach, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import {
  discardPendingProposal,
  handleJoQuery,
  useJoConversation,
} from "../../src/lib/jo/conversation";
import type { JoContext } from "../../src/lib/jo/gemini";
import * as providers from "../../src/lib/jo/providers";
import { joRequest, useAi } from "../../src/lib/jo/providers";
import { useEngineStore } from "../../src/store/engine";

afterEach(() => vi.restoreAllMocks());

it("shares real command outcomes across rooms without erasing another draft", async () => {
  vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  useEngineStore.setState({ isPreview: true });
  useJoConversation.setState({
    busy: false,
    messages: [],
    pending: null,
    inputValue: "Set tempo to 100",
  });
  const reply = await handleJoQuery("Set tempo to 100");
  expect(reply).toContain("100");
  expect(ipc.invoke).toHaveBeenCalledWith("transport_set_tempo", { bpm: 100 });
  expect(useJoConversation.getState().inputValue).toBe("");
  useJoConversation.setState({ inputValue: "An unfinished song idea" });
  await handleJoQuery("stop");
  expect(useJoConversation.getState().inputValue).toBe(
    "An unfinished song idea",
  );
  expect(useJoConversation.getState().messages.at(-1)?.text).toMatch(/stop/i);
});

it("does not execute offline transport after a provider failure", async () => {
  const engine = useEngineStore.getState();
  const ai = useAi.getState();
  const conversation = useJoConversation.getState();
  useEngineStore.setState({ ...engine, isPreview: false }, true);
  useAi.setState({
    ...ai,
    loaded: true,
    preferences: { ...ai.preferences, selected: "codex" },
  });
  useJoConversation.setState({
    ...conversation,
    busy: false,
    messages: [],
    pending: null,
  });
  const invoke = vi.spyOn(ipc, "invoke");
  vi.spyOn(providers, "askBrain").mockRejectedValue(
    new Error("HTTP 401 unauthorized"),
  );
  try {
    await handleJoQuery("why does it stop playing");
    expect(invoke).not.toHaveBeenCalled();
    const last = useJoConversation.getState().messages.at(-1);
    expect(last?.sender).toBe("jo");
    expect(last?.text).not.toMatch(/rolling|This is understood|Got it/i);
  } finally {
    useEngineStore.setState(engine, true);
    useAi.setState(ai, true);
    useJoConversation.setState(conversation, true);
  }
});

it("pairs a provider failure with an assistant turn so later requests keep alternating", async () => {
  const engine = useEngineStore.getState();
  const ai = useAi.getState();
  const conversation = useJoConversation.getState();
  useEngineStore.setState({ ...engine, isPreview: false }, true);
  useAi.setState({
    ...ai,
    loaded: true,
    preferences: { ...ai.preferences, selected: "codex" },
  });
  useJoConversation.setState({
    ...conversation,
    busy: false,
    messages: [],
    pending: null,
  });
  vi.spyOn(providers, "askBrain").mockRejectedValue(
    new Error("HTTP 429 rate limited"),
  );
  try {
    await handleJoQuery("Play something");
    const afterFail = useJoConversation.getState().messages;
    expect(afterFail.at(-2)?.sender).toBe("user");
    expect(afterFail.at(-1)?.sender).toBe("jo");
    expect(afterFail.at(-1)?.text).toMatch(/429|rate limited/i);
    const ctx: JoContext = {
      transportState: "stopped",
      bpm: 120,
      bar: 1,
      styleId: "blues-shuffle",
      styleName: "Blues Shuffle",
      intensity: 0.5,
      chartName: null,
      currentChord: "A7",
      currentSection: "",
      muted: { drums: false, bass: false, comp: false },
      styles: [],
      charts: [],
    };
    const roles = joRequest(afterFail, "Stop", ctx).messages.map((m) => m.role);
    expect(roles.at(-1)).toBe("user");
    for (let i = 1; i < roles.length; i++)
      expect(roles[i]).not.toBe(roles[i - 1]);
  } finally {
    useEngineStore.setState(engine, true);
    useAi.setState(ai, true);
    useJoConversation.setState(conversation, true);
  }
});

it("collapses a discarded proposal so Anthropic never sees two assistant turns", () => {
  useJoConversation.setState({
    messages: [
      {
        id: "u1",
        sender: "user",
        text: "change the verse groove",
        timestamp: "Jo",
      },
      {
        id: "j1",
        sender: "jo",
        text: "Proposed song edits. Review them below.",
        timestamp: "Jo",
      },
    ],
    pending: {
      calls: [{ name: "songwriting", arguments: { action: "groove" } }],
      expected: "song",
    },
  });
  expect(discardPendingProposal("The proposal was set aside.")).toBe(true);
  const ctx: JoContext = {
    transportState: "stopped",
    bpm: 120,
    bar: 1,
    styleId: "blues-shuffle",
    styleName: "Blues Shuffle",
    intensity: 0.5,
    chartName: null,
    currentChord: "A7",
    currentSection: "",
    muted: { drums: false, bass: false, comp: false },
    styles: [],
    charts: [],
  };
  const roles = joRequest(
    useJoConversation.getState().messages,
    "what is the current bpm?",
    ctx,
  ).messages.map((m) => m.role);
  expect(roles).toEqual(["user", "assistant", "user"]);
  for (let i = 1; i < roles.length; i++)
    expect(roles[i]).not.toBe(roles[i - 1]);
});

it("keeps song edits behind review and ignores a cancelled request before dispatch", async () => {
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  useEngineStore.setState({ isPreview: true });
  useJoConversation.setState({ busy: false, messages: [], pending: null });
  await handleJoQuery("lock bass");
  expect(useJoConversation.getState().pending?.calls[0].name).toBe(
    "songwriting",
  );
  expect(invoke).not.toHaveBeenCalled();
  await handleJoQuery("stop", () => false);
  expect(invoke).not.toHaveBeenCalled();
  expect(useJoConversation.getState().busy).toBe(false);
});
