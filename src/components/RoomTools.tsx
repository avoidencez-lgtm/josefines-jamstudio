import { type ComponentType, Suspense, lazy, useRef } from "react";
import { useMedia } from "../lib/media";
import { useWriting } from "../lib/originals";
import { useRoomOperation } from "../lib/roomActions";
import { SCREENS, SCREEN_ICONS } from "../screens/registry";
import { type ScreenId, useEngineStore } from "../store/engine";

/**
 * One registered capability per room. Each tool is its own chunk, loaded the first
 * time its room is shown (issue #60); the registry stays the single place a room's
 * tool is named.
 */
export const ROOM_TOOLS: Record<
  ScreenId,
  { title: string; description: string; component: ComponentType }
> = {
  originals: {
    component: lazy(() => import("./tools/MelodyTool")),
    title: "Melody → harmony",
    description: "Turn a single-note idea into an editable chord variation.",
  },
  stage: {
    component: lazy(() => import("./tools/SetlistTool")),
    title: "Rehearsal setlist",
    description: "Queue charts with their own tempo and count-in.",
  },
  library: {
    component: lazy(() => import("./tools/DiscoveryTool")),
    title: "Harmonic discovery",
    description: "Find familiar chord movements in a different key.",
  },
  jo: {
    component: lazy(() => import("./tools/CoachTool")),
    title: "Three perspectives",
    description:
      "Ask a composition, arrangement and performance coach in one request.",
  },
  songs: {
    component: lazy(() => import("./tools/BlueprintTool")),
    title: "Reference blueprint",
    description: "Borrow a song's shape, then develop it with your own chords.",
  },
  "ai-music": {
    component: lazy(() => import("./tools/BriefTool")),
    title: "Arrangement brief",
    description: "Give the generator your song's structure and musical intent.",
  },
  "music-video": {
    component: lazy(() => import("./tools/BeatCutsTool")),
    title: "Beat-grid cuts",
    description:
      "Align cuts to the music while preserving the film's duration.",
  },
  sessions: {
    component: lazy(() => import("./tools/ComparisonTool")),
    title: "Blind take comparison",
    description: "Choose with your ears before revealing the recording names.",
  },
  rig: {
    component: lazy(() => import("./tools/RigSnapshotTool")),
    title: "Song tone snapshot",
    description: "Keep a rig scene and its controls with your original.",
  },
  settings: {
    component: lazy(() => import("./tools/AudioProfilesTool")),
    title: "Audio setup profiles",
    description:
      "Recall the input, output and guitar channel for each place you play.",
  },
};

export function RoomTools({ screen }: { screen: ScreenId }) {
  const busy = useRoomOperation((s) => s.busy);
  const recording = useEngineStore((s) => s.isRecording);
  const writingBusy = useWriting((s) => s.busy);
  const mediaBusy = useMedia((s) => s.busy);
  // A tool mounts the first time its room is shown and then stays mounted (hidden),
  // so scratch drafts survive navigation. No component starts work on mount.
  const shown = useRef(new Set<ScreenId>());
  shown.current.add(screen);
  return (
    <>
      {SCREENS.map((room) => {
        const Tool = ROOM_TOOLS[room.id].component;
        const Icon = SCREEN_ICONS[room.iconName];
        const descriptor = ROOM_TOOLS[room.id];
        return (
          <details
            key={room.id}
            hidden={screen !== room.id}
            className="room-tools"
          >
            <summary>
              <Icon size={23} aria-hidden="true" />
              <span>
                <strong>{descriptor.title}</strong>
                <small>{descriptor.description}</small>
              </span>
            </summary>
            <fieldset
              disabled={busy || recording || writingBusy || Boolean(mediaBusy)}
              className="room-tool-body"
              aria-label={descriptor.title}
            >
              <legend className="sr-only">{descriptor.title}</legend>
              {shown.current.has(room.id) && (
                <Suspense fallback={<p>Opening the tool…</p>}>
                  <Tool />
                </Suspense>
              )}
            </fieldset>
            {(busy || recording) && (
              <output className="room-tool-status">
                {recording
                  ? "Finish the recording to use this tool."
                  : "Working…"}
              </output>
            )}
          </details>
        );
      })}
    </>
  );
}
