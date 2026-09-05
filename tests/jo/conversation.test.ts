import { afterEach, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import {
  handleJoQuery,
  useJoConversation,
} from "../../src/lib/jo/conversation";
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
