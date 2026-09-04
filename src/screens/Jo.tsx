import { Microphone } from "@phosphor-icons/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { WorkspaceHeader } from "../components/Workspace";
import { dispatchJoToolCall, speakJoReply } from "../lib/jo/dispatcher";
import type { JoContext } from "../lib/jo/gemini";
import { parseNaturalIntent } from "../lib/jo/intent";
import type { JoMessage, JoToolCall } from "../lib/jo/persona";
import { BRAINS, askBrain, joRequest, useAi } from "../lib/jo/providers";
import {
  STUDIO_TOOLS,
  applyStudioEdits,
  songFingerprint,
} from "../lib/jo/studioTools";
import { useMedia } from "../lib/media";
import { useWriting } from "../lib/originals";
import { useEngineStore } from "../store/engine";
import { openAiSettings } from "./Settings";

interface SpeechResultEvent {
  results: Array<Array<{ transcript: string }>>;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (event: SpeechResultEvent) => void;
  onend: () => void;
  onerror: (error: unknown) => void;
}

export function joNeedsReview(call: JoToolCall): boolean {
  return (
    Object.hasOwn(STUDIO_TOOLS, call.name) ||
    call.name === "edit_video_shot" ||
    (call.name === "songwriting" &&
      ["lock", "groove", "restore"].includes(String(call.arguments.action)))
  );
}
const documentFingerprint = () =>
  JSON.stringify([songFingerprint(), useMedia.getState().project]);

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
const setMessages = (update: (previous: JoMessage[]) => JoMessage[]) =>
  useJoConversation.setState((s) => ({ messages: update(s.messages) }));
const setInputValue = (inputValue: string) =>
  useJoConversation.setState({ inputValue });
const setLastBrain = (lastBrain: string) =>
  useJoConversation.setState({ lastBrain });

export const Jo: React.FC = () => {
  const { messages, inputValue, busy, pending, lastBrain } =
    useJoConversation();
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [joState, setJoState] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");
  const [isHoldingPtt, setIsHoldingPtt] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { keysPresent, isPreview, notify } = useEngineStore();
  const { preferences, loaded } = useAi();
  const useLlm =
    loaded &&
    Boolean(
      BRAINS[preferences.selected].local || keysPresent[preferences.selected],
    ) &&
    !isPreview;

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
    };
  };

  /** Only the selected provider is contacted; failures fall back to local commands. */
  const think = async (
    history: JoMessage[],
    query: string,
  ): Promise<{ reply: string; toolCalls: JoToolCall[] }> => {
    const current = useAi.getState();
    const selected = current.preferences.selected;
    const engine = useEngineStore.getState();
    if (
      current.loaded &&
      (BRAINS[selected].local || engine.keysPresent[selected]) &&
      !engine.isPreview
    ) {
      try {
        const out = await askBrain(
          joRequest(history, query, snapshotContext()),
          current.preferences,
        );
        setLastBrain(BRAINS[selected].name);
        return out;
      } catch (e) {
        notify(
          "error",
          `Jo (${BRAINS[selected].name}): ${String(e)}. Using the offline parser.`,
        );
      }
    }
    setLastBrain("offline");
    return parseNaturalIntent(query);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom whenever messages or state updates
  useEffect(() => {
    const list = messagesEndRef.current?.parentElement;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, joState]);

  // Setup Web Speech API if supported
  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as unknown as {
        SpeechRecognition?: new () => BrowserSpeechRecognition;
        webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
      };
      const RecognitionCtor =
        win.SpeechRecognition || win.webkitSpeechRecognition;

      setVoiceAvailable(Boolean(RecognitionCtor));
      if (RecognitionCtor) {
        const rec = new RecognitionCtor();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = "en-US";

        rec.onresult = (event: SpeechResultEvent) => {
          const transcript = event.results[0]?.[0]?.transcript;
          if (transcript) {
            handleUserQuery(transcript);
          }
        };

        rec.onend = () => {
          setIsHoldingPtt(false);
          setJoState("idle");
        };

        rec.onerror = () => {
          setIsHoldingPtt(false);
          setJoState("idle");
        };

        recognitionRef.current = rec;
        return () => {
          rec.onresult = () => {};
          rec.onend = () => {};
          rec.onerror = () => {};
          try {
            rec.stop();
          } catch {
            /* Some WebViews reject stop before start. */
          }
          recognitionRef.current = null;
        };
      }
    }
  }, []);

  // Global Push-to-Talk shortcut ('t' key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if ((e.key === "t" || e.key === "T") && !isHoldingPtt && !e.repeat) {
        e.preventDefault();
        startListening();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        stopListening();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isHoldingPtt]);

  const startListening = () => {
    if (
      !recognitionRef.current ||
      useJoConversation.getState().busy ||
      useJoConversation.getState().pending
    )
      return;
    setIsHoldingPtt(true);
    setJoState("listening");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {
        setIsHoldingPtt(false);
        setJoState("idle");
      }
    }
  };

  const stopListening = () => {
    setIsHoldingPtt(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignored
      }
    }
  };

  const handleUserQuery = async (query: string) => {
    if (
      !query.trim() ||
      useJoConversation.getState().busy ||
      useJoConversation.getState().pending
    )
      return;
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
      setInputValue("");
      setJoState("thinking");

      const expectedSong = documentFingerprint();
      const { reply, toolCalls } = await think(history, query);

      const results: string[] = [];
      if (toolCalls.some(joNeedsReview)) {
        useJoConversation.setState({
          pending: { calls: toolCalls, expected: expectedSong },
        });
        results.push("Proposed song edits · awaiting your review below");
      } else
        for (const call of toolCalls) {
          try {
            results.push(await dispatchJoToolCall(call));
          } catch (e) {
            results.push(`${call.name} failed: ${String(e)}`);
          }
        }

      const joMsg: JoMessage = {
        id: crypto.randomUUID(),
        sender: "jo",
        text: reply,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        toolCalls,
        toolResults: results,
      };

      setMessages((prev) => [...prev, joMsg]);
      speakJoReply(reply);
    } catch (e) {
      notify("error", String(e));
    } finally {
      useJoConversation.setState({ busy: false });
      setJoState("idle");
    }
  };

  return (
    <div className="jo-workspace flex flex-col gap-4 max-w-5xl mx-auto w-full">
      <WorkspaceHeader
        screen="jo"
        title="A bandmate you can talk to."
        description="Direct the band in plain language, or work on your original song together."
      >
        <StatusPill
          status={busy || joState === "listening" ? "live" : "idle"}
          label={
            busy ? "Thinking" : joState === "listening" ? "Listening" : "Ready"
          }
        />
        <Button onClick={openAiSettings}>Choose AI & model</Button>
      </WorkspaceHeader>
      <div className="workspace-summary">
        <span>
          <strong>
            {useLlm ? BRAINS[preferences.selected].name : "Offline commands"}
          </strong>
          {useLlm
            ? preferences.models[preferences.selected].model
            : "Tempo, cues, styles & recording"}
        </span>
        {lastBrain && <span>Last reply: {lastBrain}</span>}
        <span>
          {voiceAvailable
            ? "Voice available · hold T outside text fields"
            : "Voice unavailable here · type below"}
        </span>
      </div>
      <div className="jo-suggestions" aria-label="Suggested prompts">
        {[
          "Set tempo to 100",
          "Drop the bass",
          "Play a fill",
          ...(useLlm ? ["Suggest a stronger chorus for my song"] : []),
        ].map((prompt) => (
          <Button
            key={prompt}
            size="sm"
            disabled={busy || Boolean(pending)}
            onClick={() => setInputValue(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
      {/* Main Chat & Action History Panel */}
      <Panel className="jo-chat flex-1 flex flex-col min-h-0 p-4">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`jo-message max-w-2xl p-3 rounded-[var(--radius-m)] ${
                  m.sender === "user"
                    ? "bg-[var(--bg-2)] text-[var(--fg-0)] border border-[var(--line)]"
                    : "bg-[var(--accent)]/10 text-[var(--fg-0)] border border-[var(--accent)]/30"
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1 text-[10px] text-[var(--fg-2)]">
                  <span className="font-bold">
                    {m.sender === "user" ? "You" : "Jo"}
                  </span>
                  <span>{m.timestamp}</span>
                </div>
                <p>{m.text}</p>

                {/* Tool call execution badges */}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[var(--accent)]/20 flex flex-wrap gap-1.5">
                    {m.toolCalls.map((tc, idx) => (
                      <span
                        key={`${m.id}-${tc.name}-${idx}`}
                        title={
                          m.toolResults?.[idx] ?? JSON.stringify(tc.arguments)
                        }
                        className="px-1.5 py-0.5 rounded bg-[var(--bg-1)] border border-[var(--accent)] text-[10px] text-[var(--accent)] font-mono"
                      >
                        {tc.name.replaceAll("_", " ")}
                        {m.toolResults?.[idx] && (
                          <span className="text-[var(--fg-2)]">
                            {" "}
                            · {m.toolResults[idx]}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {pending && (
          <section
            className="workspace-stack py-4"
            aria-label="Proposed studio edits"
          >
            <h2>Review studio changes</h2>
            <div className="max-h-48 overflow-auto text-sm">
              {pending.calls.map((call, i) => (
                <details key={`${call.name}-${i}`} open>
                  <summary>{call.name.replaceAll("_", " ")}</summary>
                  <pre className="whitespace-pre-wrap break-words text-xs p-2">
                    {JSON.stringify(call.arguments, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
            <div className="workspace-actions">
              <Button
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  if (useJoConversation.getState().busy) return;
                  useJoConversation.setState({ busy: true });
                  try {
                    if (documentFingerprint() !== pending.expected)
                      throw new Error(
                        "The song or film changed. Dismiss this proposal and ask again.",
                      );
                    const allComposition = pending.calls.every((c) =>
                      Object.hasOwn(STUDIO_TOOLS, c.name),
                    );
                    if (!allComposition && pending.calls.length !== 1)
                      throw new Error(
                        "Request composition edits, individual legacy song commands and film edits separately. Nothing was applied.",
                      );
                    const result = allComposition
                      ? applyStudioEdits(pending.calls, songFingerprint())
                      : await dispatchJoToolCall(pending.calls[0]);
                    setMessages((previous) => [
                      ...previous,
                      {
                        id: crypto.randomUUID(),
                        sender: "jo",
                        text: result,
                        timestamp: "Applied",
                      },
                    ]);
                    useJoConversation.setState({ pending: null });
                  } catch (e) {
                    notify("error", String(e));
                  } finally {
                    useJoConversation.setState({ busy: false });
                  }
                }}
              >
                Apply proposed edits
              </Button>
              <Button
                onClick={() => useJoConversation.setState({ pending: null })}
              >
                Dismiss proposal
              </Button>
            </div>
          </section>
        )}
        {/* Push-to-Talk & Input Bar */}
        <div className="jo-composer">
          {/* Push-to-talk button */}
          <Button
            variant={isHoldingPtt ? "danger" : "primary"}
            size="md"
            disabled={!voiceAvailable || busy || Boolean(pending)}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              startListening();
            }}
            onPointerUp={stopListening}
            onPointerCancel={stopListening}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                startListening();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                stopListening();
              }
            }}
            onBlur={stopListening}
            className="select-none min-w-[140px]"
          >
            <Microphone size={18} aria-hidden="true" />
            {isHoldingPtt ? "Listening…" : "Hold to talk"}
          </Button>

          {/* Text input fallback */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUserQuery(inputValue);
            }}
            className="flex-1 flex gap-2"
          >
            <input
              type="text"
              aria-label="Message Jo"
              disabled={busy || Boolean(pending)}
              placeholder="Or type a command (e.g. 'faster', 'drop the bass', 'record a take')..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1 bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-3 py-2 rounded-[var(--radius-m)] text-xs font-mono focus:outline-none focus:border-[var(--accent)]"
            />
            <Button
              type="submit"
              size="md"
              variant="primary"
              disabled={busy || Boolean(pending) || !inputValue.trim()}
            >
              Send
            </Button>
          </form>
        </div>
      </Panel>
    </div>
  );
};
