import { useShallow } from "zustand/shallow";
import { isPreview } from "../../ipc/client";
import { songFingerprint } from "../../lib/jo/studioTools";
import { useWriting } from "../../lib/originals";
import { applySongIdea, recallRig } from "../../lib/roomActions";
import { captureRig, validateRigSnapshot } from "../../lib/roomTools";
import { useEngineStore } from "../../store/engine";
import { Button } from "../Button";
import { SongRequired, Status, currentSong, useTool } from "./shared";

export default function RigSnapshotTool() {
  const e = useEngineStore(
    useShallow((s) => ({
      rigState: s.rigState,
      availableProfiles: s.availableProfiles,
    })),
  );
  const song = useWriting((s) => s.song);
  const { run, message } = useTool();
  if (!song) return <SongRequired />;
  let description = "No tone snapshot saved with this original.";
  let valid = false;
  if (song.body.rigSnapshot) {
    try {
      const { snap, profile } = validateRigSnapshot(
        song.body.rigSnapshot,
        e.availableProfiles,
      );
      description = `${profile.name} · ${profile.scenes[snap.scene].name} · ${
        Object.entries(snap.controls)
          .map(([cc, value]) => `CC ${cc}: ${value}`)
          .join(", ") || "scene defaults"
      }`;
      valid = true;
    } catch {
      description =
        "The saved tone needs its matching profile and valid controls. Load that profile before recalling.";
    }
  }
  return (
    <>
      <p>
        Capture the current scene and control values. Recall sends MIDI to the
        currently connected port and turns section following off, so the next
        bar cannot immediately replace the tone. Port selection stays under your
        control.
      </p>
      <p>{description}</p>
      <div className="room-tool-row">
        <Button
          disabled={!e.rigState}
          onClick={() =>
            void run(() => {
              const rig = useEngineStore.getState().rigState;
              if (!rig) throw new Error("Load a rig profile first.");
              const body = structuredClone(currentSong().body);
              body.rigSnapshot = captureRig(rig);
              validateRigSnapshot(body.rigSnapshot, e.availableProfiles);
              applySongIdea(body, songFingerprint(), "tone snapshot");
              return "Tone snapshot attached to the original. Save in Write to keep it; Undo restores the previous snapshot.";
            })
          }
        >
          Capture current tone
        </Button>
        <Button
          disabled={!valid || isPreview}
          onClick={() =>
            void run(async () => {
              await recallRig(useWriting.getState().song?.body.rigSnapshot);
              return "Tone recalled. Section following is off; enable it below when wanted. Verify the sound on your rig.";
            })
          }
        >
          Recall snapshot to rig
        </Button>
      </div>
      <Status text={message} />
    </>
  );
}
