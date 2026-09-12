import { afterEach, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import {
  discardPendingProposal,
  handleJoQuery,
  useJoConversation,
} from "../../src/lib/jo/conversation";
import type { JoContext } from "../../src/lib/jo/gemini";
import { joRequest } from "../../src/lib/jo/providers";
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
  for (let i = 1; i < roles.length; i++) expect(roles[i]).not.toBe(roles[i - 1]);
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
