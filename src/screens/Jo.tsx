import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { dispatchJoToolCall, speakJoReply } from "../lib/jo/dispatcher";
import type { JoContext } from "../lib/jo/gemini";
import { parseNaturalIntent } from "../lib/jo/intent";
import type { JoMessage, JoToolCall } from "../lib/jo/persona";
import { BRAINS, askBrain, joRequest, useAi } from "../lib/jo/providers";
import { useWriting } from "../lib/originals";
import { useEngineStore } from "../store/engine";

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

export const Jo: React.FC = () => {
  const [messages, setMessages] = useState<JoMessage[]>([
    {
      id: "msg-welcome",
      sender: "jo",
      text: "Hey! I'm Jo, your rhythm section leader. Ask me to change tempos, cues, styles, drop the bass, or record a take.",
      timestamp: "Just now",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [joState, setJoState] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");
  const [isHoldingPtt, setIsHoldingPtt] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // The speech-recognition callback is created once; it reads history through a ref.
  const messagesRef = useRef<JoMessage[]>(messages);
  messagesRef.current = messages;

  const { keysPresent, isPreview, notify } = useEngineStore();
  const { preferences, loaded } = useAi();
  const useLlm =
    loaded && Boolean(keysPresent[preferences.selected]) && !isPreview;
  const [lastBrain, setLastBrain] = useState<string | null>(null);

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
    if (current.loaded && engine.keysPresent[selected] && !engine.isPreview) {
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
          setJoState("idle");
        };

        rec.onerror = () => {
          setJoState("idle");
        };

        recognitionRef.current = rec;
      }
    }
  }, []);

  // Global Push-to-Talk shortcut ('t' key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if ((e.key === "t" || e.key === "T") && !isHoldingPtt) {
        e.preventDefault();
        startListening();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
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
    setIsHoldingPtt(true);
    setJoState("listening");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {
        // already active
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
    if (!query.trim()) return;

    const userMsg: JoMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const history = messagesRef.current;
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setJoState("thinking");

    const { reply, toolCalls } = await think(history, query);

    const results: string[] = [];
    for (const call of toolCalls) {
      try {
        results.push(await dispatchJoToolCall(call));
      } catch (e) {
        results.push(`${call.name} failed: ${String(e)}`);
      }
    }

    const joMsg: JoMessage = {
      id: `msg-${Date.now() + 1}`,
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
    setJoState("speaking");
    speakJoReply(reply);

    setTimeout(() => {
      setJoState("idle");
    }, 2500);
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full h-[calc(100vh-140px)]">
      {/* Top Banner with Orb & Provider Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-1)] p-4 rounded-[var(--radius-m)] border border-[var(--line)]">
        <div className="flex items-center gap-4">
          {/* Animated Jo Orb */}
          <div className="relative flex items-center justify-center w-12 h-12">
            <div
              className={`w-10 h-10 rounded-full transition-all duration-300 ${
                joState === "listening"
                  ? "bg-purple-500 shadow-[0_0_20px_#a855f7] animate-pulse scale-110"
                  : joState === "thinking"
                    ? "bg-amber-500 shadow-[0_0_20px_#f59e0b] animate-spin scale-105"
                    : joState === "speaking"
                      ? "bg-emerald-500 shadow-[0_0_20px_#10b981] animate-bounce scale-110"
                      : "bg-[var(--accent)] shadow-[0_0_15px_var(--accent)]"
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-wide uppercase font-mono text-[var(--fg-0)]">
                Jo (AI Bandmate)
              </h1>
              <StatusPill
                status={joState === "idle" ? "idle" : "live"}
                label={joState.toUpperCase()}
              />
            </div>
            <p className="text-xs font-mono text-[var(--fg-2)] mt-0.5">
              Natural rhythm section director with full engine control
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5 text-[11px] font-mono text-[var(--fg-2)]">
          <span>
            Brain:{" "}
            {useLlm
              ? `${BRAINS[preferences.selected].name} · ${preferences.models[preferences.selected].model}`
              : isPreview
                ? "offline intent parser (browser preview)"
                : "offline intent parser (configure your selected provider in Settings)"}
          </span>
          {lastBrain && (
            <span className="text-[10px]">
              last answer:{" "}
              {lastBrain === "offline" ? "offline parser" : lastBrain}
            </span>
          )}
        </div>
      </div>

      {/* Main Chat & Action History Panel */}
      <Panel className="flex-1 flex flex-col min-h-0 p-4">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-lg p-3 rounded-[var(--radius-m)] text-xs font-mono leading-relaxed ${
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
                        ⚡ {tc.name}
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

        {/* Push-to-Talk & Input Bar */}
        <div className="pt-4 border-t border-[var(--line)] flex items-center gap-3">
          {/* Push-to-talk button */}
          <Button
            variant={isHoldingPtt ? "danger" : "primary"}
            size="md"
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            className="select-none min-w-[140px]"
          >
            {isHoldingPtt ? "Listening..." : "Hold to Talk [T]"}
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
              placeholder="Or type a command (e.g. 'faster', 'drop the bass', 'record a take')..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1 bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-3 py-2 rounded-[var(--radius-m)] text-xs font-mono focus:outline-none focus:border-[var(--accent)]"
            />
            <Button type="submit" size="md" variant="secondary">
              Send
            </Button>
          </form>
        </div>
      </Panel>
    </div>
  );
};
