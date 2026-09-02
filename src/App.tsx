import {
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
import { useEffect } from "react";
import { AiMusic } from "./screens/AiMusic";
import { Jo } from "./screens/Jo";
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
    transportPlay,
    transportPause,
    transportStop,
    transportSetLoop,
    transportSetCountIn,
    transportSetTimeSignature,
    initListeners,
  } = useEngineStore();

  const transport = telemetry.transport;
  const isPlaying =
    transport.state === "playing" || transport.state === "counting_in";

  // Setup event listeners
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initListeners().then((c) => {
      cleanup = c;
    });
    return () => {
      if (cleanup) cleanup();
    };
  }, [initListeners]);

  // Global keyboard shortcuts: Space (play/pause), Enter (stop), L (loop), C (count-in)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        if (isPlaying) {
          transportPause();
        } else {
          transportPlay();
        }
      } else if (e.code === "Enter") {
        e.preventDefault();
        transportStop();
      } else if (e.code === "KeyL") {
        e.preventDefault();
        transportSetLoop(
          transport.loop_start_bar,
          transport.loop_end_bar,
          !transport.loop_enabled,
        );
      } else if (e.code === "KeyC") {
        e.preventDefault();
        const nextCount = (transport.count_in_bars + 1) % 3;
        transportSetCountIn(nextCount);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isPlaying,
    transport,
    transportPlay,
    transportPause,
    transportStop,
    transportSetLoop,
    transportSetCountIn,
  ]);

  const renderScreen = () => {
    switch (currentScreen) {
      case "stage":
        return <Stage />;
      case "jo":
        return <Jo />;
      case "songs":
        return <Songs />;
      case "ai-music":
        return <AiMusic />;
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
      case "MusicNotes":
        return <MusicNotes {...props} />;
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
      {/* 72 px left rail */}
      <nav className="w-[72px] bg-[var(--bg-1)] border-r border-[var(--line)] flex flex-col items-center py-4 gap-6 shrink-0 z-20">
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
      </nav>

      {/* Main viewport */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* 56 px top bar: transport */}
        <header className="h-[56px] bg-[var(--bg-1)] border-b border-[var(--line)] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            {/* Play / Pause / Stop */}
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
                className="w-9 h-9 rounded flex items-center justify-center bg-[var(--bg-2)] text-[var(--record)] hover:bg-[var(--bg-3)] cursor-pointer"
                title="Arm Recording"
              >
                <Record size={18} weight="fill" />
              </button>
            </div>

            <div className="h-5 w-px bg-[var(--line)]" />

            {/* Position: Bar : Beat */}
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

            {/* Tempo */}
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

            {/* Time signature */}
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

          {/* Loop & Count-in options */}
          <div className="flex items-center gap-3">
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
              onClick={() => {
                const nextCount = (transport.count_in_bars + 1) % 3;
                transportSetCountIn(nextCount);
              }}
              className={`px-2.5 py-1 rounded text-xs font-mono border cursor-pointer transition-colors ${
                transport.count_in_bars > 0
                  ? "bg-[var(--bg-2)] border-[var(--line)] text-[var(--fg-0)]"
                  : "bg-[var(--bg-2)] border-[var(--line)] text-[var(--fg-2)]"
              }`}
              title="Toggle Count-In (C)"
            >
              {transport.count_in_bars > 0
                ? `Count-in ${transport.count_in_bars} Bar`
                : "Count-in Off"}
            </button>
          </div>
        </header>

        {/* Screen body */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          {renderScreen()}

          {/* Jo's presence pinned bottom-right */}
          <aside className="fixed bottom-6 right-6 flex items-center gap-2.5 px-3 py-2 bg-[var(--bg-1)] border border-[var(--line)] rounded-full shadow-[var(--shadow)] z-30">
            <div className="w-3 h-3 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-xs font-mono font-medium text-[var(--fg-0)]">
              Jo (Ready)
            </span>
          </aside>
        </main>
      </div>
    </div>
  );
};
