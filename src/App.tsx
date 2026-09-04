import {
  BookOpen,
  FilmStrip,
  Gear,
  Guitar,
  Microphone,
  MusicNotes,
  Pause,
  Play,
  Record,
  Repeat,
  Sliders,
  Stop,
  Waveform,
} from "@phosphor-icons/react";
import type React from "react";
import { useEffect, useState } from "react";
import { EngineStatusPill } from "./components/EngineStatusPill";
import { Notices } from "./components/Notices";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { StudioAssistant } from "./components/StudioAssistant";
import { listenToController } from "./lib/controller";
import { useAi } from "./lib/jo/providers";
import { handleShortcut } from "./lib/shortcuts";
import { AiMusic } from "./screens/AiMusic";
import { Jo } from "./screens/Jo";
import { Library } from "./screens/Library";
import { MusicVideo } from "./screens/MusicVideo";
import { Originals } from "./screens/Originals";
import { Rig } from "./screens/Rig";
import { Sessions } from "./screens/Sessions";
import { Settings } from "./screens/Settings";
import { Songs } from "./screens/Songs";
import { Stage } from "./screens/Stage";
import { SCREENS } from "./screens/registry";
import { useEngineStore } from "./store/engine";

export const App: React.FC = () => {
  const {
    currentScreen,
    setScreen,
    telemetry,
    engineStatus,
    isPreview,
    isRecording,
    transportPlay,
    transportPause,
    transportStop,
    transportSetLoop,
    transportSetCountIn,
    transportSetTimeSignature,
    startRecording,
    stopRecording,
    initListeners,
  } = useEngineStore();

  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    void useAi
      .getState()
      .load()
      .catch((e) => useEngineStore.getState().notify("error", String(e)));
  }, []);
  useEffect(() => {
    let closed = false;
    let off: (() => void) | undefined;
    void listenToController()
      .then((cleanup) => {
        if (closed) cleanup();
        else off = cleanup;
      })
      .catch((e) => useEngineStore.getState().notify("error", String(e)));
    return () => {
      closed = true;
      off?.();
    };
  }, []);

  const transport = telemetry.transport;
  const isPlaying =
    transport.state === "playing" || transport.state === "counting_in";

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initListeners().then((c) => {
      cleanup = c;
    });
    return () => {
      if (cleanup) cleanup();
    };
  }, [initListeners]);

  // One global key handler for the whole app (see lib/shortcuts.ts for the list).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showHelp && e.key === "Escape") {
        setShowHelp(false);
        return;
      }
      const consumed = handleShortcut(e, useEngineStore.getState(), {
        toggleHelp: () => setShowHelp((v) => !v),
      });
      if (consumed) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showHelp]);

  const renderScreen = () => {
    switch (currentScreen) {
      case "originals":
        return <Originals />;
      case "stage":
        return <Stage />;
      case "library":
        return <Library />;
      case "jo":
        return <Jo />;
      case "songs":
        return <Songs />;
      case "ai-music":
        return <AiMusic />;
      case "music-video":
        return <MusicVideo />;
      case "sessions":
        return <Sessions />;
      case "rig":
        return <Rig />;
      case "settings":
        return <Settings />;
      default:
        return <Stage />;
    }
  };

  const getIcon = (iconName: string, active: boolean) => {
    const props = {
      size: 24,
      weight: active ? ("fill" as const) : ("regular" as const),
      className: active ? "text-[var(--accent)]" : "text-[var(--fg-1)]",
    };
    switch (iconName) {
      case "Guitar":
        return <Guitar {...props} />;
      case "BookOpen":
        return <BookOpen {...props} />;
      case "MusicNotes":
        return <MusicNotes {...props} />;
      case "FilmStrip":
        return <FilmStrip {...props} />;
      case "Waveform":
        return <Waveform {...props} />;
      case "Microphone":
        return <Microphone {...props} />;
      case "Record":
        return <Record {...props} />;
      case "Sliders":
        return <Sliders {...props} />;
      case "Gear":
        return <Gear {...props} />;
      default:
        return <Guitar {...props} />;
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[var(--bg-0)] text-[var(--fg-0)] overflow-hidden">
      <nav className="w-[72px] bg-[var(--bg-1)] border-r border-[var(--line)] flex flex-col items-center py-4 gap-4 shrink-0 z-20 overflow-y-auto">
        <div className="w-10 h-10 rounded-[var(--radius-m)] bg-[var(--accent)] flex items-center justify-center text-[var(--bg-0)] font-bold text-xl mb-2">
          J
        </div>
        <div className="flex flex-col gap-2 w-full px-2">
          {SCREENS.map((s) => {
            const active = currentScreen === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setScreen(s.id)}
                className={`flex flex-col items-center justify-center w-full py-2.5 rounded-[var(--radius-m)] transition-colors cursor-pointer ${
                  active
                    ? "bg-[var(--accent-soft)]"
                    : "hover:bg-[var(--bg-2)] text-[var(--fg-1)]"
                }`}
                title={s.label}
              >
                {getIcon(s.iconName, active)}
                <span className="text-[10px] tracking-tight mt-1 font-mono">
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="mt-auto text-[var(--fg-2)] hover:text-[var(--fg-0)] text-xs font-mono cursor-pointer"
          title="Keyboard shortcuts (?)"
        >
          ?
        </button>
      </nav>

      <div className="flex flex-col flex-1 min-w-0 h-full">
        {isPreview && (
          <div className="bg-[var(--accent-soft)] border-b border-[var(--accent)] text-[var(--fg-0)] text-xs font-mono px-6 py-1.5 flex items-center gap-3">
            <span className="uppercase tracking-wider font-semibold text-[var(--accent)]">
              Browser preview
            </span>
            <span>
              Simulated engine: the UI works, no audio is produced and nothing
              is written to disk. Run <code>pnpm tauri dev</code> for the real
              band.
            </span>
          </div>
        )}

        <header className="min-h-[56px] bg-[var(--bg-1)] border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => (isPlaying ? transportPause() : transportPlay())}
                className={`w-9 h-9 rounded flex items-center justify-center cursor-pointer transition-colors ${
                  isPlaying
                    ? "bg-[var(--accent)] text-[var(--bg-0)]"
                    : "bg-[var(--bg-2)] text-[var(--fg-0)] hover:bg-[var(--bg-3)]"
                }`}
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? (
                  <Pause size={18} weight="fill" />
                ) : (
                  <Play size={18} weight="fill" />
                )}
              </button>
              <button
                type="button"
                onClick={() => transportStop()}
                className="w-9 h-9 rounded flex items-center justify-center bg-[var(--bg-2)] text-[var(--fg-0)] hover:bg-[var(--bg-3)] cursor-pointer"
                title="Stop (Enter)"
              >
                <Stop size={18} weight="fill" />
              </button>
              <button
                type="button"
                onClick={() =>
                  isRecording ? stopRecording() : startRecording()
                }
                className={`w-9 h-9 rounded flex items-center justify-center cursor-pointer transition-colors ${
                  isRecording
                    ? "bg-[var(--record)] text-[var(--fg-0)] animate-pulse"
                    : "bg-[var(--bg-2)] text-[var(--record)] hover:bg-[var(--bg-3)]"
                }`}
                title={isRecording ? "Stop recording (R)" : "Record a take (R)"}
              >
                <Record size={18} weight="fill" />
              </button>
            </div>

            <div className="h-5 w-px bg-[var(--line)]" />

            <div className="flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-xs uppercase text-[var(--fg-2)] tracking-wider">
                {transport.state === "counting_in" ? "Count" : "Bar"}
              </span>
              <span
                className={`text-lg font-semibold ${
                  transport.state === "counting_in"
                    ? "text-[var(--accent)] animate-pulse"
                    : "text-[var(--fg-0)]"
                }`}
              >
                {transport.bar} : {transport.beat}
              </span>
            </div>

            <div className="h-5 w-px bg-[var(--line)]" />

            <div className="flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-xs uppercase text-[var(--fg-2)] tracking-wider">
                Tempo
              </span>
              <span className="text-lg font-semibold text-[var(--fg-0)]">
                {transport.bpm.toFixed(0)}
              </span>
              <span className="text-xs text-[var(--fg-2)]">BPM</span>
            </div>

            <div className="h-5 w-px bg-[var(--line)]" />

            <select
              value={`${transport.time_signature[0]}/${transport.time_signature[1]}`}
              onChange={(e) => {
                const parts = e.target.value.split("/").map(Number);
                transportSetTimeSignature(parts[0], parts[1]);
              }}
              className="bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] px-2 py-1 rounded text-xs font-mono cursor-pointer"
              title="Time Signature"
            >
              <option value="4/4">4/4</option>
              <option value="3/4">3/4</option>
              <option value="6/8">6/8</option>
              <option value="12/8">12/8</option>
            </select>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={() =>
                transportSetLoop(
                  transport.loop_start_bar,
                  transport.loop_end_bar,
                  !transport.loop_enabled,
                )
              }
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono border cursor-pointer transition-colors ${
                transport.loop_enabled
                  ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                  : "bg-[var(--bg-2)] border-[var(--line)] text-[var(--fg-2)] hover:text-[var(--fg-0)]"
              }`}
              title="Toggle Loop (L)"
            >
              <Repeat size={14} />
              <span>
                Loop {transport.loop_start_bar}-{transport.loop_end_bar - 1}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                transportSetCountIn((transport.count_in_bars + 1) % 3)
              }
              className="px-2.5 py-1 rounded text-xs font-mono border cursor-pointer transition-colors bg-[var(--bg-2)] border-[var(--line)] text-[var(--fg-0)]"
              title="Count-in (C)"
            >
              {transport.count_in_bars > 0
                ? `Count-in ${transport.count_in_bars} bar${transport.count_in_bars > 1 ? "s" : ""}`
                : "Count-in off"}
            </button>

            <EngineStatusPill
              status={engineStatus}
              isPreview={isPreview}
              onClick={() => setScreen("settings")}
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 relative">
          {renderScreen()}

          <StudioAssistant />
        </main>
      </div>

      <Notices />
      <ShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
};
