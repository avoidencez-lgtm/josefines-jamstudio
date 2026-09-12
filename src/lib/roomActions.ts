import { create } from "zustand";
import { ipc, isPreview } from "../ipc/client";
import type { RigState } from "../ipc/contract";
import { requireCommand, useEngineStore } from "../store/engine";
import { helpLanguageSchema } from "./help";
import { songFingerprint } from "./jo/studioTools";
import { type SongBody, useWriting } from "./originals";
import {
  type Setlist,
  audioProfileSchema,
  setlistCue,
  setlistSchema,
  validateRigSnapshot,
} from "./roomTools";
import { checkWritingForm } from "./writingTools";

/**
 * One foreground room operation at a time. `blocking` marks work the window must
 * not close during (an edit, save or recall in flight); a request that only waits
 * for advice is `busy` but not blocking, so the close guard lets the window go.
 */
export const useRoomOperation = create<{ busy: boolean; blocking: boolean }>(
  () => ({ busy: false, blocking: false }),
);
export function applySongIdea(body: SongBody, base: string, label: string) {
  const w = useWriting.getState();
  if (!w.song || w.busy || useEngineStore.getState().isRecording)
    throw new Error("Open an original and finish the current operation first.");
  if (songFingerprint() !== base)
    throw new Error(
      "The song changed. Preview the idea again before applying it.",
    );
  checkWritingForm(body);
  if (JSON.stringify(body) === JSON.stringify(w.song.body))
    throw new Error("This idea is already in the song.");
  if (w.song.versions.length >= 20)
    throw new Error(
      "Remove an unused version to preserve the current song first.",
    );
  w.version(`This is before ${label}.`);
  w.edit((b) => Object.assign(b, structuredClone(body)));
  useWriting.setState({
    message: `${label} applied. Undo and This is Versions. preserve the previous song. Save to keep it on disk.`,
  });
}

const PREFERENCE_SCHEMAS = {
  rehearsalSetlist: setlistSchema,
  audioProfiles: audioProfileSchema,
  helpLanguage: helpLanguageSchema,
} as const;

export async function saveRoomPreference(
  key: keyof typeof PREFERENCE_SCHEMAS,
  value: unknown,
) {
  PREFERENCE_SCHEMAS[key].parse(value);
  // Merge into a fresh settings document; credentials are never part of these presets.
  const e = useEngineStore.getState();
  const current = requireCommand(await e.getSettings());
  const next = { ...current, [key]: value };
  requireCommand(await e.saveSettings(next));
}

export async function cueSetlistItem(item: Setlist[number]) {
  const e = useEngineStore.getState();
  if (e.telemetry.reference)
    throw new Error(
      "Band charts do not change reference audio. Choose play on the loaded song instead.",
    );
  if (isPreview)
    throw new Error("Setlist playback needs the desktop audio engine.");
  if (e.isRecording)
    throw new Error("Save the recording before changing the setlist song.");
  const cue = setlistCue(item, e.charts, e.styles);
  requireCommand(await e.transportStop());
  requireCommand(await e.bandLoadChart(cue.chart.id, true));
  // followChart restored the chart's default groove; the entry's own groove wins.
  if (cue.styleId) requireCommand(await e.bandSetStyle(cue.styleId));
  requireCommand(await e.transportSetTempo(cue.bpm));
  requireCommand(await e.transportSetLoop(1, 2, false));
  requireCommand(await e.transportSetCountIn(cue.countIn));
  requireCommand(await e.transportSeekBar(1));
  e.setTempoTrainer({ enabled: false });
}

export async function recallRig(value: unknown) {
  if (isPreview) throw new Error("Hardware recall needs the desktop app.");
  const e = useEngineStore.getState();
  if (e.isRecording)
    throw new Error("Finish the recording before recalling a rig.");
  const { snap } = validateRigSnapshot(value, e.availableProfiles);
  const invoke = async (cmd: string, args: Record<string, unknown>) => {
    const rigState = await ipc.invoke<RigState>(cmd, args);
    useEngineStore.setState({ rigState });
  };
  try {
    await invoke("rig_set_follow_sections", { enabled: false });
    await invoke("rig_select_profile", { profileId: snap.profileId });
    await invoke("rig_select_scene", { sceneIdx: snap.scene });
    for (const [cc, value] of Object.entries(snap.controls))
      await invoke("rig_set_control", { cc: Number(cc), value });
  } catch (e) {
    throw new Error(
      `Could not finish recalling the rig. ${String(e).replace(/^Error:\s*/, "")} Earlier MIDI commands may already have reached the rig; inspect its controls before retrying.`,
    );
  }
}
