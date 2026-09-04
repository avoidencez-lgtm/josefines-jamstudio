import { create } from "zustand";
import { ipc } from "../ipc/client";
import type { Chart, TakeMetadata } from "../ipc/contract";
import { useEngineStore } from "../store/engine";
import { parseChartText } from "./chart/text";

export const PARTS = ["Drums", "Bass", "Comp"] as const;
export interface PartSettings {
  styleId: string;
  intensity: number;
  gain: number;
  muted: boolean;
  locked: boolean;
}
export interface SectionSettings {
  parts: PartSettings[];
  swing: number;
  rigScene?: number | null;
}
export interface GuitarClip {
  takeId: string;
  label: string;
  trimStart: number;
  trimEnd: number;
  startBar: number;
  repeats: number;
  gain: number;
  muted: boolean;
}
export interface SongBody {
  chart: Chart;
  sections: Record<string, SectionSettings>;
  clips: GuitarClip[];
  notes: string;
  toneProfileId?: string | null;
}

export function arrangementRanges(chart: Chart) {
  let bar = 1;
  return chart.arrangement.map((a) => {
    const section = chart.sections.find((s) => s.id === a.sectionId);
    if (!section) throw new Error("Section missing from song form.");
    const range = {
      sectionId: a.sectionId,
      startBar: bar,
      endBar: bar + section.bars.length * a.repeats,
    };
    bar = range.endBar;
    return range;
  });
}
export interface Original {
  schemaVersion: number;
  id: string;
  revision: number;
  body: SongBody;
  versions: { id: string; name: string; body: SongBody }[];
  [key: string]: unknown;
}

export function defaultSection(): SectionSettings {
  return {
    swing: 0.5,
    parts: PARTS.map(() => ({
      styleId: "rock-straight",
      intensity: 0.5,
      gain: 0.8,
      muted: false,
      locked: false,
    })),
  };
}
export function newOriginal(): Original {
  const id = `song-${crypto.randomUUID()}`;
  const chart = parseChartText(
    "# New song\nkey: A minor\nbpm: 100\n[Verse]\n| Am | F | C | G |\n[Chorus]\n| F | C | G | Am |",
    { id },
  ).chart;
  if (!chart) throw new Error("Starter chart is invalid");
  return {
    schemaVersion: 1,
    id,
    revision: 0,
    versions: [],
    body: {
      chart,
      sections: { verse: defaultSection(), chorus: defaultSection() },
      clips: [],
      notes: "",
    },
  };
}
/** Try a different groove without changing parts the guitarist chose to keep. */
export function changeGroove(
  section: SectionSettings,
  styleId: string,
): SectionSettings {
  return {
    ...section,
    parts: section.parts.map((p) => (p.locked ? p : { ...p, styleId })),
  };
}
export function sectionBars(text: string): Chart["sections"][number]["bars"] {
  const parsed = parseChartText(`[Section]\n${text}`);
  if (!parsed.chart || parsed.problems.length)
    throw new Error(parsed.problems.map((p) => p.message).join("; "));
  return parsed.chart.sections[0].bars;
}
export function fitTempo(clip: GuitarClip, bars: number): number {
  const bpm = (bars * 4 * 60) / (clip.trimEnd - clip.trimStart);
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240)
    throw new Error("Choose a trim and bar count that fit 40–240 BPM.");
  return Math.round(bpm * 100) / 100;
}

interface WritingState {
  song: Original | null;
  saved: Original[];
  selected: string;
  past: SongBody[];
  future: SongBody[];
  dirty: boolean;
  busy: boolean;
  message: string;
  captureSeconds: number;
  rehearsalIndex: number;
  rehearse: (next?: boolean) => Promise<void>;
  edit: (fn: (body: SongBody) => void) => void;
  createSong: () => void;
  openSong: (song: Original) => void;
  select: (id: string) => void;
  undo: () => void;
  redo: () => void;
  version: (name?: string) => void;
  restore: (id: string) => void;
  refresh: () => Promise<void>;
  save: () => Promise<void>;
  saveCopy: () => Promise<void>;
  play: () => Promise<void>;
  record: () => Promise<void>;
  arm: (seconds: number) => Promise<void>;
  keep: () => Promise<void>;
  attach: (take: TakeMetadata) => void;
  action: (fn: () => Promise<void>) => Promise<void>;
}

export const useWriting = create<WritingState>((set, get) => ({
  song: null,
  saved: [],
  selected: "verse",
  past: [],
  future: [],
  dirty: false,
  busy: false,
  message: "",
  captureSeconds: 0,
  rehearsalIndex: -1,
  action: async (fn) => {
    if (get().busy) return;
    set({ busy: true, message: "" });
    try {
      await fn();
    } catch (e) {
      set({ message: String(e) });
      useEngineStore.getState().notify("error", String(e));
    } finally {
      set({ busy: false });
    }
  },
  edit: (fn) => {
    const song = get().song;
    if (!song) return;
    if (useEngineStore.getState().isRecording) {
      set({ message: "Save the take before editing the song." });
      return;
    }
    const body = structuredClone(song.body);
    fn(body);
    set({
      song: { ...song, body },
      past: [...get().past, song.body].slice(-50),
      future: [],
      dirty: true,
      message: "",
    });
  },
  createSong: () => {
    if (get().dirty || useEngineStore.getState().isRecording) {
      set({ message: "Save this song and recording before starting another." });
      return;
    }
    set({
      song: newOriginal(),
      selected: "verse",
      dirty: true,
      past: [],
      future: [],
      message: "",
    });
  },
  openSong: (song) => {
    if (get().dirty || useEngineStore.getState().isRecording) {
      set({ message: "Save your current song and recording first." });
      return;
    }
    set({
      song: structuredClone(song),
      selected: song.body.chart.sections[0].id,
      past: [],
      future: [],
      message: "",
    });
  },
  select: (selected) => set({ selected }),
  undo: () => {
    const { song, past } = get();
    if (!song || !past.length || useEngineStore.getState().isRecording) return;
    set({
      song: { ...song, body: past[past.length - 1] },
      past: past.slice(0, -1),
      future: [song.body, ...get().future],
      dirty: true,
    });
  },
  redo: () => {
    const { song, future } = get();
    if (!song || !future.length || useEngineStore.getState().isRecording)
      return;
    set({
      song: { ...song, body: future[0] },
      future: future.slice(1),
      past: [...get().past, song.body],
      dirty: true,
    });
  },
  version: (name) => {
    const song = get().song;
    if (!song) return;
    if (song.versions.length >= 20) {
      set({
        message:
          "Twenty versions saved. Remove an unused version before adding another.",
      });
      return;
    }
    set({
      song: {
        ...song,
        versions: [
          ...song.versions,
          {
            id: crypto.randomUUID(),
            name: name?.trim() || `Version ${song.versions.length + 1}`,
            body: structuredClone(song.body),
          },
        ],
      },
      dirty: true,
    });
  },
  restore: (id) => {
    const v = get().song?.versions.find((v) => v.id === id);
    if (v) get().edit((b) => Object.assign(b, structuredClone(v.body)));
  },
  refresh: async () => {
    const saved = await ipc.invoke<Original[]>("originals_list");
    set({ saved });
  },
  save: async () => {
    const song = get().song;
    if (!song) return;
    const saved = await ipc.invoke<Original>("originals_save", {
      document: song,
    });
    set({ song: saved, dirty: false, message: "Song saved." });
    await get().refresh();
  },
  saveCopy: async () => {
    const song = get().song;
    if (!song) return;
    const copy = structuredClone(song);
    copy.id = `song-${crypto.randomUUID()}`;
    copy.revision = 0;
    copy.body.chart.id = copy.id;
    copy.body.chart.name += " (copy)";
    const saved = await ipc.invoke<Original>("originals_save", {
      document: copy,
    });
    set({ song: saved, dirty: false, message: "Copy saved. Original kept." });
    await get().refresh();
  },
  play: async () => {
    const song = get().song;
    if (!song) return;
    await ipc.invoke("originals_load", { document: song });
    useEngineStore.setState({ currentChart: song.body.chart });
    await ipc.invoke("transport_set_count_in", { bars: 0 });
    await ipc.invoke("transport_play");
  },
  rehearse: async (next = false) => {
    const { song, selected, rehearsalIndex } = get();
    if (!song) throw new Error("Create or open a song first.");
    if (useEngineStore.getState().isRecording)
      throw new Error("Save the take before changing its timeline.");
    const ranges = arrangementRanges(song.body.chart);
    let index =
      ranges[rehearsalIndex]?.sectionId === selected
        ? rehearsalIndex
        : ranges.findIndex((r) => r.sectionId === selected);
    if (index < 0) throw new Error("Add this section to the song form first.");
    if (next) index = (index + 1) % ranges.length;
    const range = ranges[index];
    await ipc.invoke("originals_load", { document: song });
    await ipc.invoke("transport_set_count_in", { bars: 0 });
    await ipc.invoke("transport_set_loop", {
      startBar: range.startBar,
      endBar: range.endBar,
      enabled: true,
    });
    await ipc.invoke("transport_seek_bar", { bar: range.startBar });
    await ipc.invoke("transport_play");
    set({
      selected: range.sectionId,
      rehearsalIndex: index,
      message: `Looping bars ${range.startBar}–${range.endBar - 1}. Next section advances through your form.`,
    });
    useEngineStore.setState({ currentChart: song.body.chart });
  },
  record: async () => {
    const engine = useEngineStore.getState();
    if (engine.isRecording) {
      const take = await engine.stopRecording();
      if (!take)
        throw new Error(
          "The take could not be saved. Check the recording error.",
        );
      await ipc.invoke("transport_stop");
      return;
    }
    const song = get().song;
    if (!song) return;
    await get().save();
    await ipc.invoke("originals_load", { document: get().song });
    await ipc.invoke("originals_record", { sessionId: song.id });
    useEngineStore.setState({
      isRecording: true,
      currentChart: song.body.chart,
    });
  },
  arm: async (seconds) => {
    await ipc.invoke("capture_arm", { seconds });
    set({
      captureSeconds: seconds,
      message: seconds
        ? `Listening locally. Keeping the last ${seconds} seconds.`
        : "Capture off. Unsaved buffer cleared.",
    });
  },
  keep: async () => {
    const song = get().song;
    await ipc.invoke<TakeMetadata>("capture_keep", {
      sessionId: song?.id ?? "ideas",
    });
    await useEngineStore.getState().loadTakes();
    set({ message: "Idea saved. Add it below, then trim the part you want." });
    useEngineStore.getState().notify("info", "Idea saved.");
    useEngineStore.getState().setScreen("originals");
  },
  attach: (take) =>
    get().edit((b) =>
      b.clips.push({
        takeId: take.id,
        label: `Guitar ${b.clips.length + 1}`,
        trimStart: 0,
        trimEnd: take.durationSecs,
        startBar: 1,
        repeats: 1,
        gain: 1,
        muted: false,
      }),
    ),
}));
