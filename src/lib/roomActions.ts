import { create } from "zustand";
import { ipc, isPreview } from "../ipc/client";
import type { AppSettings, Chart, RigState } from "../ipc/contract";
import { useEngineStore } from "../store/engine";
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
  w.version(`Before ${label}`);
  w.edit((b) => Object.assign(b, structuredClone(body)));
  useWriting.setState({
    message: `${label} applied. Undo and Versions preserve the previous song. Save to keep it on disk.`,
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
  const current = await ipc.invoke<AppSettings>("settings_get");
  const next = { ...current, [key]: value };
  await ipc.invoke("settings_set", { settings: next });
  useEngineStore.setState({ settings: next });
}

export async function cueSetlistItem(item: Setlist[number]) {
  if (isPreview)
    throw new Error("Setlist playback needs the desktop audio engine.");
  const e = useEngineStore.getState();
  if (e.isRecording)
    throw new Error("Save the recording before changing the setlist song.");
  const cue = setlistCue(item, e.charts, e.styles);
  await ipc.invoke("transport_stop");
  const chart = await ipc.invoke<Chart>("band_load_chart", {
    chartId: cue.chart.id,
    followChart: true,
  });
  // Reflect the successful load even if a later setup command fails.
  useEngineStore.setState({ currentChart: chart });
  // followChart restored the chart's default groove; the entry's own groove wins.
  if (cue.styleId) await ipc.invoke("band_set_style", { styleId: cue.styleId });
  await ipc.invoke("transport_set_tempo", { bpm: cue.bpm });
  await ipc.invoke("transport_set_loop", {
    startBar: 1,
    endBar: 2,
    enabled: false,
  });
  await ipc.invoke("transport_set_count_in", { bars: cue.countIn });
  await ipc.invoke("transport_seek_bar", { bar: 1 });
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
      `Rig recall stopped: ${String(e)}. Earlier MIDI commands may already have reached the rig; inspect its controls before retrying.`,
    );
  }
}
