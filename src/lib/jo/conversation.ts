import { create } from "zustand";
import { useMedia } from "../media";
import type { JoMessage, JoToolCall } from "./persona";
import { STUDIO_TOOLS, songFingerprint } from "./studioTools";

/** Song, film and legacy songwriting mutations wait for the guitarist's review. */
export function joNeedsReview(call: JoToolCall): boolean {
  return (
    Object.hasOwn(STUDIO_TOOLS, call.name) ||
    call.name === "edit_video_shot" ||
    (call.name === "songwriting" &&
      ["lock", "groove", "restore"].includes(String(call.arguments.action)))
  );
}

/** A proposal is only applied to the documents it was made for. */
export const documentFingerprint = () =>
  JSON.stringify([songFingerprint(), useMedia.getState().project]);

/** The Jo room conversation survives navigation; other rooms may draft into it. */
export const useJoConversation = create<{
  messages: JoMessage[];
  inputValue: string;
  busy: boolean;
  lastBrain: string | null;
  pending: { calls: JoToolCall[]; expected: string } | null;
}>(() => ({
  messages: [
    {
      id: "welcome",
      sender: "jo",
      text: "Tell me what the band should do. Live commands run when you send them; changes to your original song are proposed for review.",
      timestamp: "Jo",
    },
  ],
  inputValue: "",
  busy: false,
  lastBrain: null,
  pending: null,
}));
export const setMessages = (update: (previous: JoMessage[]) => JoMessage[]) =>
  useJoConversation.setState((s) => ({ messages: update(s.messages) }));
export const setInputValue = (inputValue: string) =>
  useJoConversation.setState({ inputValue });
export const setLastBrain = (lastBrain: string) =>
  useJoConversation.setState({ lastBrain });

/**
 * A new message supersedes a proposal still waiting for review (#41): the
 * composer stays usable and the conversation records that nothing was applied.
 */
export function discardPendingProposal(reason: string): boolean {
  if (!useJoConversation.getState().pending) return false;
  useJoConversation.setState({ pending: null });
  setMessages((previous) => [
    ...previous,
    {
      id: crypto.randomUUID(),
      sender: "jo",
      text: reason,
      timestamp: "Review",
    },
  ]);
  return true;
}
