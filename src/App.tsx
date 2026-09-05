import { BookOpen } from "@phosphor-icons/react";
import type React from "react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Button } from "./components/Button";
import { Notices } from "./components/Notices";
import { RoomTools } from "./components/RoomTools";
import { TransportBar } from "./components/TransportBar";
import { ipc } from "./ipc/client";
import {
  ACTIVE_WORK_MESSAGE,
  closeDecision,
  hasActiveWork,
  hasUnsavedWork,
} from "./lib/closeGuard";
import { listenToController } from "./lib/controller";
import { useAi } from "./lib/jo/providers";
import { handleShortcut } from "./lib/shortcuts";
import { SCREENS, SCREEN_ICONS } from "./screens/registry";
import { useEngineStore } from "./store/engine";
import "./screens/studio.css";

// Every room and the manual are their own chunks: the first paint carries the shell,
// the transport and the room that opens first (issues #40, #50).
const Originals = lazy(() =>
  import("./screens/Originals").then((m) => ({ default: m.Originals })),
);
const Stage = lazy(() =>
  import("./screens/Stage").then((m) => ({ default: m.Stage })),
);
const Library = lazy(() =>
  import("./screens/Library").then((m) => ({ default: m.Library })),
);
const Jo = lazy(() => import("./screens/Jo").then((m) => ({ default: m.Jo })));
const Songs = lazy(() =>
  import("./screens/Songs").then((m) => ({ default: m.Songs })),
);
const AiMusic = lazy(() =>
  import("./screens/AiMusic").then((m) => ({ default: m.AiMusic })),
);
const MusicVideo = lazy(() =>
  import("./screens/MusicVideo").then((m) => ({ default: m.MusicVideo })),
);
const Sessions = lazy(() =>
  import("./screens/Sessions").then((m) => ({ default: m.Sessions })),
);
const Rig = lazy(() =>
  import("./screens/Rig").then((m) => ({ default: m.Rig })),
);
const Settings = lazy(() =>
  import("./screens/Settings").then((m) => ({ default: m.Settings })),
);
const ShortcutsHelp = lazy(() =>
  import("./components/ShortcutsHelp").then((m) => ({
    default: m.ShortcutsHelp,
  })),
);

export const App: React.FC = () => {
  const { currentScreen, setScreen, isPreview, initListeners } = useEngineStore(
    useShallow((s) => ({
      currentScreen: s.currentScreen,
      setScreen: s.setScreen,
      isPreview: s.isPreview,
      initListeners: s.initListeners,
    })),
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWork() || hasActiveWork()) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const [showClose, setShowClose] = useState(false);
  const closeDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (showClose) closeDialog.current?.showModal();
  }, [showClose]);
  useEffect(() => {
    if (isPreview) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const off = await getCurrentWindow().onCloseRequested((event) => {
          const decision = closeDecision();
          if (decision === "close") return;
          event.preventDefault();
          if (decision === "refuse")
            useEngineStore.getState().notify("error", ACTIVE_WORK_MESSAGE);
          else setShowClose(true);
        });
        if (disposed) off();
        else cleanup = off;
      })
      .catch((e) =>
        useEngineStore.getState().notify("error", `Close guard: ${String(e)}`),
      );
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [isPreview]);
  // An app-level quit (Cmd+Q on macOS) arrives from Rust and takes the same road (#35).
  useEffect(() => {
    if (isPreview) return;
    let disposed = false;
    let off: (() => void) | undefined;
    void ipc
      .listen("app.exit-requested", () => {
        const decision = closeDecision();
        if (decision === "refuse")
          useEngineStore.getState().notify("error", ACTIVE_WORK_MESSAGE);
        else if (decision === "ask") setShowClose(true);
        else
          void ipc
            .invoke("app_exit")
            .catch((e) => useEngineStore.getState().notify("error", String(e)));
      })
      .then((cleanup) => {
        if (disposed) cleanup();
        else off = cleanup;
      })
      .catch((e) =>
        useEngineStore.getState().notify("error", `Quit guard: ${String(e)}`),
      );
    return () => {
      disposed = true;
      off?.();
    };
  }, [isPreview]);
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

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;
    initListeners()
      .then((c) => {
        if (disposed) c();
        else cleanup = c;
      })
      .catch((e) =>
        useEngineStore.getState().notify("error", `Startup: ${String(e)}`),
      );
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [initListeners]);

  // One global key handler for the whole app (see lib/shortcuts.ts for the list).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showClose) return;
      if (showHelp) {
        if (e.key === "Escape") setShowHelp(false);
        return;
      }
      const consumed = handleShortcut(e, useEngineStore.getState(), {
        toggleHelp: () => setShowHelp((v) => !v),
      });
      if (consumed) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showHelp, showClose]);

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

  return (
    <div className="flex h-screen w-screen bg-[var(--bg-0)] text-[var(--fg-0)] overflow-hidden">
      <nav className="studio-nav" aria-label="Studio rooms">
        <div className="studio-brand">
          <span>J</span>
          <div>
            JOSEFINES<small>JAMSTUDIO</small>
          </div>
        </div>
        <div className="studio-nav-items">
          {SCREENS.map((s) => {
            const active = currentScreen === s.id;
            const Icon = SCREEN_ICONS[s.iconName];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setShowHelp(false);
                  setScreen(s.id);
                }}
                aria-current={active ? "page" : undefined}
                aria-label={s.label}
                title={`${s.label} · ${s.description}`}
              >
                <Icon
                  size={25}
                  weight={active ? "fill" : "regular"}
                  aria-hidden="true"
                />
                <span>
                  {s.label}
                  <small>{s.description}</small>
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="studio-shortcuts"
          onClick={() => setShowHelp(true)}
          title="Help & guides (?)"
        >
          <BookOpen size={21} aria-hidden="true" />
          <span>Help & guides</span>
        </button>
      </nav>

      <div className="flex flex-col flex-1 min-w-0 h-full">
        {isPreview && (
          <div className="bg-[var(--accent-soft)] border-b border-[var(--accent)] text-[var(--fg-0)] text-xs font-mono px-6 py-1.5 flex items-center gap-3">
            <span className="uppercase tracking-wider font-semibold text-[var(--accent)]">
              Browser preview
            </span>
            <span>
              Explore the studio. Sound, files and connected services work in
              the desktop app.
            </span>
          </div>
        )}

        <TransportBar />

        <main className="flex-1 overflow-y-auto p-8 relative">
          <div hidden={showHelp}>
            <RoomTools screen={currentScreen} />
            <Suspense
              fallback={<p className="workspace-note">Opening the room…</p>}
            >
              {renderScreen()}
            </Suspense>
          </div>
          {showHelp && (
            <Suspense
              fallback={<p className="workspace-note">Opening help…</p>}
            >
              <ShortcutsHelp
                open
                room={currentScreen}
                onClose={() => setShowHelp(false)}
              />
            </Suspense>
          )}
        </main>
      </div>

      {showClose && (
        <dialog
          ref={closeDialog}
          aria-labelledby="close-title"
          onCancel={() => setShowClose(false)}
          className="bg-[var(--bg-1)] text-[var(--fg-0)] border border-[var(--line)] rounded-xl p-6 max-w-md m-auto backdrop:bg-black/70"
        >
          <h2 id="close-title" className="text-lg font-semibold mb-2">
            Keep your unsaved work?
          </h2>
          <p className="mb-5 text-sm">
            Your song, chart or film has unsaved changes. Keep editing to save
            them before closing.
          </p>
          <div className="flex gap-3">
            <Button onClick={() => setShowClose(false)}>Keep editing</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (hasActiveWork()) return;
                try {
                  // Rust exits for real; the WebView never destroys its own window.
                  await ipc.invoke("app_exit");
                } catch (e) {
                  useEngineStore.getState().notify("error", String(e));
                }
              }}
            >
              Discard and close
            </Button>
          </div>
        </dialog>
      )}
      <Notices />
    </div>
  );
};
