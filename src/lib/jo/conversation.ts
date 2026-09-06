import { create } from "zustand";
import { useEngineStore } from "../../store/engine";
import { useMedia } from "../media";
import { useWriting } from "../originals";
import { dispatchJoToolCall } from "./dispatcher";
import type { JoContext } from "./gemini";
import { parseNaturalIntent } from "./intent";
import type { JoMessage, JoToolCall } from "./persona";
import { BRAINS, askBrain, joRequest, useAi } from "./providers";
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

const snapshotContext = (): JoContext => {
  const s = useEngineStore.getState();
  const t = s.telemetry;
  const w = useWriting.getState();
  return {
    transportState: t.transport.state,
    bpm: t.transport.bpm,
    bar: t.transport.bar,
    styleId: t.band.style_id,
    styleName: t.band.style_name,
    intensity: t.band.intensity,
    chartName: s.currentChart?.name ?? null,
    currentChord: t.band.current_chord,
    currentSection: t.band.current_section,
    muted: {
      drums: t.band.mute_drums,
      bass: t.band.mute_bass,
      comp: t.band.mute_comp,
    },
    styles: s.styles.map((x) => ({ id: x.id, name: x.name })),
    charts: s.charts.map((x) => ({ id: x.id, name: x.name })),
    writing: w.song
      ? {
          name: w.song.body.chart.name,
          chart: w.song.body.chart,
          notes: w.song.body.notes,
          lyrics: w.song.body.lyrics,
          selected: w.selected,
          sections: w.song.body.chart.sections.map((section) => ({
            name: section.name,
            id: section.id,
            ...w.song?.body.sections[section.id],
          })),
          versions: w.song.versions.map((v) => v.name),
        }
      : undefined,
    film: (() => {
      const p = useMedia.getState().project;
      return {
        id: p.id,
        title: p.title,
        shots: p.shots.map(({ id, title, seconds }) => ({
          id,
          title,
          seconds,
        })),
      };
    })(),
  };
};

/** Failed provider requests never become unrelated offline commands. */
const think = async (
  history: JoMessage[],
  query: string,
): Promise<{ reply: string; toolCalls: JoToolCall[] }> => {
  const current = useAi.getState();
  const selected = current.preferences.selected;
  const engine = useEngineStore.getState();
  if (!BRAINS[selected].local && engine.keyErrors[selected])
    throw new Error(engine.keyErrors[selected]);
  if (
    current.loaded &&
    (BRAINS[selected].local || engine.keysPresent[selected]) &&
    !engine.isPreview
  ) {
    const out = await askBrain(
      joRequest(history, query, snapshotContext()),
      current.preferences,
    );
    setLastBrain(BRAINS[selected].name);
    return out;
  }
  setLastBrain("offline");
  return parseNaturalIntent(query, useEngineStore.getState().styles);
};

export const handleJoQuery = async (query: string, current = () => true) => {
  if (!query.trim() || useJoConversation.getState().busy) return;
  discardPendingProposal(
    "Proposal set aside: your new message replaces it. Nothing was applied.",
  );
  useJoConversation.setState({ busy: true });
  try {
    const userMsg: JoMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const history = useJoConversation.getState().messages;
    setMessages((prev) => [...prev, userMsg]);
    if (useJoConversation.getState().inputValue.trim() === query.trim())
      setInputValue("");

    const expectedSong = documentFingerprint();
    const { reply, toolCalls } = await think(history, query);
    if (!current()) return;

    const results: string[] = [];
    const needsReview = toolCalls.some(joNeedsReview);
    if (needsReview) {
      useJoConversation.setState({
        pending: { calls: toolCalls, expected: expectedSong },
      });
      results.push("Proposed song edits · awaiting your review below");
    } else
      for (const call of toolCalls) {
        if (!current()) {
          results.push(
            "Voice turn cancelled. Remaining commands were not applied.",
          );
          break;
        }
        try {
          results.push(await dispatchJoToolCall(call));
        } catch (e) {
          results.push(`${call.name} failed: ${String(e)}`);
        }
      }

    const joMsg: JoMessage = {
      id: crypto.randomUUID(),
      sender: "jo",
      // Replies are generated before execution. Preserve actual outcomes in
      // both the visible conversation and the history sent on the next turn.
      text: toolCalls.length && !needsReview ? results.join("\n") : reply,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      toolCalls,
      toolResults: results,
    };

    setMessages((prev) => [...prev, joMsg]);
    return joMsg.text;
  } catch (e) {
    useEngineStore.getState().notify("error", String(e));
  } finally {
    useJoConversation.setState({ busy: false });
  }
};
