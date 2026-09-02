import {
  Gear,
  Guitar,
  MusicNotes,
  Play,
  Record,
  Sliders,
  Square,
  Waveform,
} from "@phosphor-icons/react";
import type React from "react";
import { useEffect } from "react";
import { Library, Rig, Sessions } from "./screens/OtherScreens";
import { Settings } from "./screens/Settings";
import { Stage } from "./screens/Stage";
import { SCREENS } from "./screens/registry";
import { useEngineStore } from "./store/engine";

export const App: React.FC = () => {
  const {
    currentScreen,
    setScreen,
    metronomeOn,
    setMetronome,
    metronomeBpm,
    initListeners,
  } = useEngineStore();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initListeners().then((c) => {
      cleanup = c;
    });
    return () => {
      if (cleanup) cleanup();
    };
  }, [initListeners]);

  const renderScreen = () => {
    switch (currentScreen) {
      case "stage":
        return <Stage />;
      case "settings":
        return <Settings />;
      case "library":
        return <Library />;
      case "sessions":
        return <Sessions />;
      case "rig":
        return <Rig />;
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
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMetronome(!metronomeOn)}
                className={`w-9 h-9 rounded flex items-center justify-center cursor-pointer transition-colors ${
                  metronomeOn
                    ? "bg-[var(--accent)] text-[var(--bg-0)]"
                    : "bg-[var(--bg-2)] text-[var(--fg-0)] hover:bg-[var(--bg-3)]"
                }`}
                title="Play/Pause Metronome"
              >
                {metronomeOn ? (
                  <Square size={18} weight="fill" />
                ) : (
                  <Play size={18} weight="fill" />
                )}
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

            <div className="flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-xs uppercase text-[var(--fg-2)] tracking-wider">
                Bar
              </span>
              <span className="text-lg font-semibold text-[var(--fg-0)]">
                1 : 1
              </span>
            </div>

            <div className="h-5 w-px bg-[var(--line)]" />

            <div className="flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-xs uppercase text-[var(--fg-2)] tracking-wider">
                Tempo
              </span>
              <span className="text-lg font-semibold text-[var(--fg-0)]">
                {metronomeBpm.toFixed(0)}
              </span>
              <span className="text-xs text-[var(--fg-2)]">BPM</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-[var(--fg-2)]">
              4/4 · 48 kHz
            </span>
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
