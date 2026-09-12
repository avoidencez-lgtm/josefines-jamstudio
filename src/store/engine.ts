import { create } from "zustand";
import { ipc, isPreview } from "../ipc/client";
import type {
  AppSettings,
  AudioConfig,
  AudioDevices,
  BandPatch,
  BandTelemetry,
  Chart,
  EngineStatus,
  EngineTelemetry,
  ExportReport,
  LatencyCalibration,
  LibraryInfo,
  LyriaStatus,
  MeterTelemetry,
  MidiPortInfo,
  ReferenceState,
  RigProfile,
  RigState,
  StyleSummary,
  TakeAnalysis,
  TakeMetadata,
  TransportTelemetry,
  TunerTelemetry,
} from "../ipc/contract";
import { transposeChart } from "../lib/chart/transpose";
import { withNextStep } from "../lib/loudError";
import type { Original } from "../lib/originals";
import { savedTakeAnalysis } from "../lib/sessions/analysis";

export type ScreenId =
  | "originals"
  | "stage"
  | "library"
  | "jo"
  | "songs"
  | "ai-music"
  | "music-video"
  | "sessions"
  | "rig"
  | "settings";

export type Cue = "none" | "fill" | "crash" | "stop" | "ending";

export type CommandResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** Automated callers must check the same outcome that produced the UI notice. */
export function requireCommand<T>(result: CommandResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** A message the UI shows in the toast rail; errors from the engine land here. */
export interface Notice {
  id: number;
  kind: "info" | "error";
  text: string;
  at: number;
}

/**
 * Tempo trainer: after every `everyBars` bars of playing, the tempo moves by
 * `stepBpm` until it reaches `targetBpm`. Classic "start slow, creep up" practice.
 */
export interface TempoTrainer {
  enabled: boolean;
  startBpm: number;
  targetBpm: number;
  stepBpm: number;
  everyBars: number;
  /** Completed bar transitions since the last tempo step, including loop wraps. */
  playedBars: number;
}

export interface EngineState {
  currentScreen: ScreenId;
  isPreview: boolean;
  activeSource: "none" | "band" | "song" | "lyria";
  toneOn: boolean;
  toneHz: number;
  tunerOn: boolean;
  clickVolume: number;
  bandVolume: number;
  telemetry: EngineTelemetry;
  engineStatus: EngineStatus | null;
  devices: AudioDevices;
  settings: AppSettings | null;
  keysPresent: Record<string, boolean>;
  keyErrors: Record<string, string | undefined>;
  notices: Notice[];

  setScreen: (screen: ScreenId) => void;
  notify: (kind: Notice["kind"], text: string) => void;
  dismissNotice: (id: number) => void;
  setTone: (on: boolean, hz?: number) => Promise<void>;
  setTuner: (on: boolean) => Promise<void>;
  setClickVolume: (volume: number) => Promise<void>;
  setBandVolume: (volume: number) => Promise<void>;

  // Transport
  transportPlay: () => Promise<CommandResult>;
  transportPause: () => Promise<CommandResult>;
  transportStop: () => Promise<CommandResult>;
  transportSeekBar: (bar: number) => Promise<void>;
  transportSetLoop: (
    startBar: number,
    endBar: number,
    enabled: boolean,
  ) => Promise<CommandResult>;
  transportSetCountIn: (bars: number) => Promise<void>;
  transportSetTempo: (bpm: number) => Promise<CommandResult<number>>;
  transportSetTimeSignature: (
    numerator: number,
    denominator: number,
  ) => Promise<void>;
  /** Tap tempo: call on each tap; the tempo follows the average interval. */
  tapTempo: () => Promise<number | null>;
  tapTimes: number[];

  tempoTrainer: TempoTrainer;
  setTempoTrainer: (patch: Partial<TempoTrainer>) => void;

  // Band
  bandSetStyle: (styleId: string) => Promise<CommandResult>;
  bandSetIntensity: (intensity: number) => Promise<CommandResult<number>>;
  bandCue: (cue: Cue) => Promise<CommandResult>;
  bandLoadChart: (
    chartId: string,
    followChart?: boolean,
  ) => Promise<CommandResult<Chart>>;
  bandSet: (patch: BandPatch) => Promise<CommandResult>;
  togglePart: (part: "drums" | "bass" | "comp") => Promise<void>;
  toggleFollowEnergy: () => Promise<void>;

  lyriaStatus: LyriaStatus;
  lyriaStart: () => Promise<CommandResult<LyriaStatus>>;
  lyriaStop: () => Promise<CommandResult<LyriaStatus>>;

  // Library (styles and charts)
  styles: StyleSummary[];
  charts: Chart[];
  currentChart: Chart | null;
  loadedOriginal: Pick<Original, "id" | "body"> | null;
  libraryInfo: LibraryInfo | null;
  loadLibrary: () => Promise<void>;
  reloadLibrary: () => Promise<void>;
  saveChart: (chart: Chart) => Promise<string | null>;
  deleteUserChart: (chartId: string) => Promise<void>;
  /** Load a chart object straight into the band without saving (editor preview). */
  playChartInline: (chart: Chart) => Promise<boolean>;
  transposeCurrentChart: (semitones: number) => Promise<void>;

  // Recorder & Takes
  takes: TakeMetadata[];
  isRecording: boolean;
  /** Capture stopped, but the partial take still needs finalising. */
  recordingError: string | null;
  /** Round-trip offset trimmed from the guitar stem. */
  latencySamples: number;
  latencyEstimated: boolean;
  latencyConfidence: number;
  calibrating: boolean;
  startRecording: (sessionId?: string) => Promise<CommandResult<string>>;
  stopRecording: () => Promise<CommandResult<TakeMetadata>>;
  setLatencySamples: (samples: number) => Promise<number>;
  calibrateLatency: () => Promise<CommandResult<LatencyCalibration>>;
  loadTakes: () => Promise<void>;
  deleteTake: (id: string) => Promise<void>;

  // Rig Orchestration (M5)
  rigState: RigState | null;
  availableProfiles: RigProfile[];
  midiPorts: MidiPortInfo[];
  midiPortsError: string | null;
  loadRigProfiles: () => Promise<void>;
  selectRigProfile: (id: string) => Promise<void>;
  selectRigScene: (sceneIdx: number) => Promise<void>;
  setRigSectionMapping: (
    section: string,
    sceneIdx: number | null,
  ) => Promise<void>;
  setRigFollowSections: (enabled: boolean) => Promise<void>;
  refreshMidiPorts: () => Promise<void>;
  openMidiPort: (port: string | null) => Promise<void>;
  setRigControl: (cc: number, value: number) => Promise<void>;
  sendRigProgram: (program: number) => Promise<void>;
  clearRigMonitor: () => Promise<void>;
  checkVirtualMidi: () => Promise<CommandResult>;
  ensureAssets: (ids?: string[]) => Promise<CommandResult>;
  exportLogs: () => Promise<CommandResult<string>>;

  // Take Analysis & DAW Export (M6)
  takeAnalysis: Record<string, TakeAnalysis>;
  analyzeTake: (takeId: string) => Promise<TakeAnalysis | null>;
  reviewTake: (takeId: string) => Promise<unknown>;
  exportTakeDaw: (takeId: string) => Promise<ExportReport | null>;

  // Devices, settings, keys
  refreshDevices: () => Promise<void>;
  loadSettings: () => Promise<void>;
  applyAudioConfig: (config: AudioConfig) => Promise<EngineStatus | null>;
  refreshEngineStatus: () => Promise<void>;
  restartEngine: () => Promise<void>;
  checkKey: (provider: string) => Promise<boolean>;
  setKey: (provider: string, key: string) => Promise<void>;
  deleteKey: (provider: string) => Promise<void>;
  initListeners: () => Promise<() => void>;
}

let noticeSeq = 0;

function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export const useEngineStore = create<EngineState>((set, get) => {
  /** Retain each command's error for its caller, including Tauri's null unit success. */
  const command = async <T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<CommandResult<T>> => {
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      const error = `${label} failed. ${errorText(e)}`;
      console.error(error);
      get().notify("error", error);
      return { ok: false, error };
    }
  };

  const run = async <T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | null> => {
    const result = await command(label, fn);
    return result.ok ? result.value : null;
  };

  /** Tauri serialises `()` as JSON `null`, so `run` cannot tell success from failure (#165). */
  const runOk = async (
    label: string,
    fn: () => Promise<unknown>,
  ): Promise<boolean> => {
    return (await command(label, fn)).ok;
  };

  return {
    currentScreen: "originals",
    isPreview,
    activeSource: "band",
    lyriaStatus: {
      phase: "idle",
      requestedBpm: 0,
      scale: "",
      buffering: false,
      live: false,
      drivesClock: false,
      outbound: 0,
    },
    toneOn: false,
    toneHz: 440,
    tunerOn: false,
    clickVolume: 0.7,
    bandVolume: 0.8,
    telemetry: {
      xruns: 0,
      input_level: { peak_db: -180, rms_db: -180 },
      output_level: { peak_db: -180, rms_db: -180 },
      tuner: null,
      transport: {
        state: "stopped",
        bar: 1,
        beat: 1,
        position_beats: 0,
        bar_progress: 0,
        bpm: 120,
        time_signature: [4, 4],
        loop_enabled: false,
        loop_start_bar: 1,
        loop_end_bar: 5,
        count_in_bars: 1,
      },
      band: {
        style_id: "blues-shuffle",
        style_name: "Blues Shuffle",
        intensity: 0.5,
        active_cue: "none",
        pending_cue: "none",
        current_chord: "A7",
        next_chord: "D7",
        current_section: "",
        mute_drums: false,
        mute_bass: false,
        mute_comp: false,
        follow_energy: false,
        current_energy: 0.0,
        is_stopped: false,
        kit_id: "standard-rock-kit",
        kit_source: "synthetic",
        kit_message:
          "Drum kit 'standard-rock-kit' is not unpacked. Run Settings → Check these sample packs with JAM_LIVE=1. Playing the bundled synthetic kit.",
        bass_source: "sine",
        bass_message:
          "SoundFont is not unpacked. Run Settings → Check these sample packs with JAM_LIVE=1. Bass and comp use sine voices until freepats-bass-comp is installed.",
      },
    },
    engineStatus: null,
    devices: { inputs: [], outputs: [] },
    settings: null,
    keysPresent: {},
    keyErrors: {},
    notices: [],
    tapTimes: [],
    tempoTrainer: {
      enabled: false,
      startBpm: 80,
      targetBpm: 120,
      stepBpm: 4,
      everyBars: 4,
      playedBars: 0,
    },
    styles: [],
    charts: [],
    currentChart: null,
    loadedOriginal: null,
    libraryInfo: null,
    takes: [],
    isRecording: false,
    recordingError: null,
    latencySamples: 0,
    latencyEstimated: false,
    latencyConfidence: 0,
    calibrating: false,
    rigState: null,
    availableProfiles: [],
    midiPorts: [],
    midiPortsError: null,
    takeAnalysis: {},

    setScreen: (screen) => set({ currentScreen: screen }),

    notify: (kind, text) => {
      const id = ++noticeSeq;
      const shown = kind === "error" ? withNextStep(text) : text;
      set((s) => ({
        notices: [
          ...s.notices.slice(-4),
          { id, kind, text: shown, at: Date.now() },
        ],
      }));
      setTimeout(() => get().dismissNotice(id), kind === "error" ? 8000 : 4000);
    },

    dismissNotice: (id) =>
      set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),

    setTone: async (on, hz) => {
      const finalHz = hz ?? get().toneHz;
      set({ toneOn: on, toneHz: finalHz });
      await run("The tone", () => ipc.invoke("tone_set", { on, hz: finalHz }));
    },

    setTuner: async (on) => {
      set({ tunerOn: on });
      await run("The tuner", () => ipc.invoke("tuner_set", { on }));
    },

    setClickVolume: async (volume) => {
      const clamped = Math.max(0, Math.min(1, volume));
      set({ clickVolume: clamped });
      await run("The click volume", () =>
        ipc.invoke("transport_set_click_volume", { volume: clamped }),
      );
    },

    setBandVolume: async (volume) => {
      const clamped = Math.max(0, Math.min(1, volume));
      set({ bandVolume: clamped });
      await run("The band volume", () =>
        ipc.invoke("audio_set_band_volume", { volume: clamped }),
      );
    },

    transportPlay: async () => {
      const trainer = get().tempoTrainer;
      if (trainer.enabled && get().telemetry.transport.state === "stopped") {
        const tempo = await get().transportSetTempo(trainer.startBpm);
        if (!tempo.ok) return tempo;
        set({ tempoTrainer: { ...trainer, playedBars: 0 } });
      }
      return command("The play", () => ipc.invoke<void>("transport_play"));
    },
    transportPause: async () => {
      return command("The pause", () => ipc.invoke<void>("transport_pause"));
    },
    transportStop: async () => {
      return command("Stop", () => ipc.invoke<void>("transport_stop"));
    },
    transportSeekBar: async (bar) => {
      await run("Seek", () => ipc.invoke("transport_seek_bar", { bar }));
    },
    transportSetLoop: async (startBar, endBar, enabled) => {
      return command("The loop", () =>
        ipc.invoke<void>("transport_set_loop", { startBar, endBar, enabled }),
      );
    },
    transportSetCountIn: async (bars) => {
      await run("The count-in", () =>
        ipc.invoke("transport_set_count_in", { bars }),
      );
    },
    transportSetTempo: async (bpm) => {
      const clamped = Math.max(20, Math.min(300, Math.round(bpm * 10) / 10));
      return command("Tempo", async () => {
        await ipc.invoke("transport_set_tempo", { bpm: clamped });
        return clamped;
      });
    },
    transportSetTimeSignature: async (numerator, denominator) => {
      await run("The time signature", () =>
        ipc.invoke("transport_set_time_signature", { numerator, denominator }),
      );
    },

    tapTempo: async () => {
      const now = performance.now();
      const recent = [
        ...get().tapTimes.filter((t) => now - t < 2500),
        now,
      ].slice(-6);
      set({ tapTimes: recent });
      if (recent.length < 2) return null;
      const intervals = recent.slice(1).map((t, i) => t - recent[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60_000 / avg);
      if (bpm >= 20 && bpm <= 300) {
        const result = await get().transportSetTempo(bpm);
        return result.ok ? result.value : null;
      }
      return null;
    },

    setTempoTrainer: (patch) =>
      set((s) => ({ tempoTrainer: { ...s.tempoTrainer, ...patch } })),

    bandSetStyle: async (styleId) => {
      return command("The style", () =>
        ipc.invoke<void>("band_set_style", { styleId }),
      );
    },
    bandSetIntensity: async (intensity) => {
      const clamped = Math.max(0, Math.min(1, intensity));
      return command("The intensity", async () => {
        await ipc.invoke("band_set_intensity", { intensity: clamped });
        return clamped;
      });
    },
    bandCue: async (cue) => {
      return command("The cue", () => ipc.invoke<void>("band_cue", { cue }));
    },
    bandLoadChart: async (chartId, followChart = true) => {
      const result = await command("The load chart", () =>
        ipc.invoke<Chart>("band_load_chart", { chartId, followChart }),
      );
      if (result.ok) set({ currentChart: result.value, loadedOriginal: null });
      return result;
    },
    bandSet: async (patch) => {
      return command("The band", () =>
        ipc.invoke<void>("band_set", { args: patch }),
      );
    },
    togglePart: async (part) => {
      const band = get().telemetry.band;
      const patch: BandPatch = {};
      if (part === "drums") patch.muteDrums = !band.mute_drums;
      if (part === "bass") patch.muteBass = !band.mute_bass;
      if (part === "comp") patch.muteComp = !band.mute_comp;
      await get().bandSet(patch);
    },
    toggleFollowEnergy: async () => {
      const band = get().telemetry.band;
      await get().bandSet({ followEnergy: !band.follow_energy });
    },

    lyriaStart: async () => {
      const result = await command("The Lyria", () =>
        ipc.invoke<LyriaStatus>("lyria_start"),
      );
      if (result.ok) {
        set({
          lyriaStatus: result.value,
          activeSource: "lyria",
        });
      }
      return result;
    },
    lyriaStop: async () => {
      const result = await command("The Lyria stop", () =>
        ipc.invoke<LyriaStatus>("lyria_stop"),
      );
      if (result.ok) {
        set({
          lyriaStatus: result.value,
          activeSource: get().telemetry.reference ? "song" : "band",
        });
      }
      return result;
    },

    loadLibrary: async () => {
      const [styles, charts] = await Promise.all([
        run("The styles", () => ipc.invoke<StyleSummary[]>("band_list_styles")),
        run("The charts", () => ipc.invoke<Chart[]>("band_list_charts")),
      ]);
      set({ styles: styles ?? [], charts: charts ?? [] });
      if (!get().currentChart && charts && charts.length > 0) {
        const first = charts.find((c) => c.id === "blues-12-bar") ?? charts[0];
        await get().bandLoadChart(first.id);
      }
    },
    reloadLibrary: async () => {
      const info = await run("The library", () =>
        ipc.invoke<LibraryInfo>("library_reload"),
      );
      if (info) {
        set({ libraryInfo: info });
        for (const e of info.loadErrors) get().notify("error", e);
      }
      await get().loadLibrary();
    },
    saveChart: async (chart) => {
      const path = await run("The save chart", () =>
        ipc.invoke<string>("charts_save", { chart }),
      );
      if (path !== null) {
        get().notify("info", `This saved ${chart.name}.`);
        await get().reloadLibrary();
      }
      return path;
    },
    deleteUserChart: async (chartId) => {
      if (
        await runOk("The delete chart", () =>
          ipc.invoke("charts_delete_user", { chartId }),
        )
      )
        await get().reloadLibrary();
    },
    playChartInline: async (chart) => {
      const ok = await runOk("The play chart", () =>
        ipc.invoke("band_load_chart_inline", { chart }),
      );
      if (ok) set({ currentChart: chart, loadedOriginal: null });
      return ok;
    },
    transposeCurrentChart: async (semitones) => {
      const current = get().currentChart;
      if (!current) return;
      const moved = transposeChart(current, semitones);
      const loaded = get().loadedOriginal;
      if (loaded) {
        const document: Original = {
          schemaVersion: 1,
          id: loaded.id,
          revision: 0,
          versions: [],
          body: { ...loaded.body, chart: moved },
        };
        if (
          await runOk("The transpose song", () =>
            ipc.invoke("originals_load", { document, keepPlayback: true }),
          )
        ) {
          set({
            currentChart: moved,
            loadedOriginal: { id: loaded.id, body: document.body },
          });
        }
        return;
      }
      await get().playChartInline(moved);
    },

    startRecording: async (sessionId = "default-session") => {
      const result = await command("The record", () =>
        ipc.invoke<string>("recorder_start", { sessionId }),
      );
      if (result.ok) set({ isRecording: true, recordingError: null });
      return result;
    },
    stopRecording: async () => {
      const result = await command("The stop recording", () =>
        ipc.invoke<TakeMetadata>("recorder_stop"),
      );
      const meta = result.ok ? result.value : null;
      set((state) => ({
        isRecording: false,
        recordingError: null,
        takes: meta ? [meta, ...state.takes] : state.takes,
      }));
      if (meta?.notes.includes("interrupted")) {
        get().notify("error", meta.notes);
      }
      if (!meta) await get().loadTakes();
      return result;
    },
    setLatencySamples: async (samples) => {
      const clamped = Math.max(0, Math.min(48_000, Math.round(samples)));
      const applied = await run("The latency offset", () =>
        ipc.invoke<number>("recorder_set_latency", { samples: clamped }),
      );
      if (applied !== null) {
        set({
          latencySamples: applied,
          latencyEstimated: false,
          latencyConfidence: 1,
        });
      }
      return applied ?? get().latencySamples;
    },
    calibrateLatency: async () => {
      set({ calibrating: true });
      const result = await command("Measure loopback", () =>
        ipc.invoke<LatencyCalibration>("audio_calibrate_latency"),
      );
      if (result.ok) {
        const applied = await run("The latency offset", () =>
          ipc.invoke<number>("recorder_get_latency"),
        );
        set({
          calibrating: false,
          latencyEstimated: result.value.estimated,
          latencyConfidence: result.value.confidence,
          latencySamples: applied ?? get().latencySamples,
        });
        get().notify(
          "info",
          result.value.estimated
            ? `No loopback heard. Estimate ${result.value.roundTripFrames} samples (2× buffer). Connect output to the guitar input and measure again, or type an offset.`
            : `Loopback ${result.value.roundTripFrames} samples.`,
        );
      } else {
        set({ calibrating: false });
      }
      return result;
    },
    loadTakes: async () => {
      const latency = await run("The latency offset", () =>
        ipc.invoke<number>("recorder_get_latency"),
      );
      if (latency !== null) set({ latencySamples: latency });
      const takes = await run("The takes", () =>
        ipc.invoke<TakeMetadata[]>("takes_list"),
      );
      if (takes) {
        const takeAnalysis: Record<string, TakeAnalysis> = {};
        for (const take of takes) {
          const analysis = savedTakeAnalysis(take.analysis);
          if (analysis) takeAnalysis[take.id] = analysis;
        }
        set({ takes, takeAnalysis });
      }
    },
    deleteTake: async (takeId) => {
      if (
        await runOk("The delete take", () =>
          ipc.invoke("takes_delete", { takeId }),
        )
      )
        set((state) => ({ takes: state.takes.filter((t) => t.id !== takeId) }));
    },

    loadRigProfiles: async () => {
      const profiles = await run("The rig profiles", () =>
        ipc.invoke<RigProfile[]>("rig_list_profiles"),
      );
      const state = await run("The rig state", () =>
        ipc.invoke<RigState>("rig_get_state"),
      );
      set({ availableProfiles: profiles ?? [], rigState: state });
      await get().refreshMidiPorts();
    },
    selectRigProfile: async (id) => {
      const state = await run("The rig profile", () =>
        ipc.invoke<RigState>("rig_select_profile", { profileId: id }),
      );
      if (state) set({ rigState: state });
    },
    selectRigScene: async (sceneIdx) => {
      const state = await run("The rig scene", () =>
        ipc.invoke<RigState>("rig_select_scene", { sceneIdx }),
      );
      if (state) set({ rigState: state });
    },
    setRigSectionMapping: async (section, sceneIdx) => {
      const state = await run("The rig mapping", () =>
        ipc.invoke<RigState>("rig_set_section_mapping", { section, sceneIdx }),
      );
      if (state) set({ rigState: state });
    },
    setRigFollowSections: async (enabled) => {
      const state = await run("The rig follow", () =>
        ipc.invoke<RigState>("rig_set_follow_sections", { enabled }),
      );
      if (state) set({ rigState: state });
    },
    refreshMidiPorts: async () => {
      try {
        const ports = await ipc.invoke<MidiPortInfo[]>("rig_list_ports");
        set({ midiPorts: ports, midiPortsError: null });
      } catch (e) {
        set({ midiPorts: [], midiPortsError: withNextStep(String(e)) });
      }
    },
    openMidiPort: async (port) => {
      const state = await run("The MIDI port", () =>
        ipc.invoke<RigState>("rig_open_port", { port }),
      );
      if (state) {
        set({ rigState: state });
        get().notify(
          "info",
          state.live
            ? `MIDI output is ${state.port}.`
            : "The MIDI port is closed.",
        );
      }
    },
    setRigControl: async (cc, value) => {
      const state = await run("The rig control", () =>
        ipc.invoke<RigState>("rig_set_control", { cc, value }),
      );
      if (state) set({ rigState: state });
    },
    sendRigProgram: async (program) => {
      const state = await run("The rig program", () =>
        ipc.invoke<RigState>("rig_send_program", { program }),
      );
      if (state) set({ rigState: state });
    },
    clearRigMonitor: async () => {
      const state = await run("The rig monitor", () =>
        ipc.invoke<RigState>("rig_clear_monitor"),
      );
      if (state) set({ rigState: state });
    },
    checkVirtualMidi: async () => {
      return command("The virtual MIDI", () => ipc.invoke("rig_virtual_check"));
    },
    ensureAssets: async (ids) => {
      return command("The sample packs", () =>
        ipc.invoke("assets_ensure", ids ? { ids } : {}),
      );
    },
    exportLogs: async () => {
      return command("The log export", () => ipc.invoke<string>("logs_export"));
    },

    analyzeTake: async (takeId) => {
      const analysis = await run("The analyze take", () =>
        ipc.invoke<TakeAnalysis>("takes_analyze", { takeId }),
      );
      if (analysis)
        set((state) => ({
          takeAnalysis: { ...state.takeAnalysis, [takeId]: analysis },
        }));
      return analysis;
    },
    reviewTake: async (takeId) => {
      return run("The take review", () =>
        ipc.invoke("takes_review", { takeId }),
      );
    },
    exportTakeDaw: async (takeId) => {
      const report = await run("The export take", () =>
        ipc.invoke<ExportReport>("takes_export_daw", { takeId }),
      );
      if (report) {
        const stems = report.copiedStems.length;
        const missing = report.missingStems.length;
        get().notify(
          missing ? "error" : "info",
          missing
            ? `This exported ${stems} stem(s) and the tempo map to ${report.dir}. ${missing} stem file(s) were missing on disk.`
            : `This exported ${stems} stems and the tempo map${report.reaperScript ? " and the REAPER session builder" : ""} to ${report.dir}.`,
        );
      }
      return report;
    },

    refreshDevices: async () => {
      const devs = await run("The audio devices", () =>
        ipc.invoke<AudioDevices>("audio_list_devices"),
      );
      if (devs) set({ devices: devs });
    },
    loadSettings: async () => {
      const s = await run("The settings", () =>
        ipc.invoke<AppSettings>("settings_get"),
      );
      if (s) set({ settings: s });
      const recovered = await run("The settings recovery", () =>
        ipc.invoke<string | null>("settings_recovery_notice"),
      );
      if (recovered) get().notify("error", recovered);
    },
    applyAudioConfig: async (config) => {
      const status = await run("The audio devices", () =>
        ipc.invoke<EngineStatus>("audio_set_config", { config }),
      );
      if (status) {
        set((s) => ({
          engineStatus: status,
          settings: s.settings ? { ...s.settings, ...config } : s.settings,
          toneOn: false,
          tunerOn: false,
          isRecording: false,
        }));
        if (status.last_error) get().notify("error", status.last_error);
        else
          get().notify("info", `Audio is running at ${status.sample_rate} Hz.`);
      } else {
        // The engine restarted anyway (possibly headless); show what it is doing now.
        await get().refreshEngineStatus();
      }
      return status;
    },
    refreshEngineStatus: async () => {
      const status = await run("The engine status", () =>
        ipc.invoke<EngineStatus>("engine_status"),
      );
      if (status) set({ engineStatus: status });
    },
    restartEngine: async () => {
      const status = await run("The restart audio", () =>
        ipc.invoke<EngineStatus>("engine_restart"),
      );
      if (status) {
        set({
          engineStatus: status,
          toneOn: false,
          tunerOn: false,
          isRecording: false,
        });
      } else await get().refreshEngineStatus();
    },

    checkKey: async (provider) => {
      try {
        const has = await ipc.invoke<boolean>("keys_has", { provider });
        set((state) => ({
          keysPresent: { ...state.keysPresent, [provider]: has },
          keyErrors: { ...state.keyErrors, [provider]: undefined },
        }));
        return has;
      } catch (error) {
        set((state) => ({
          keyErrors: {
            ...state.keyErrors,
            [provider]: withNextStep(String(error)),
          },
        }));
        throw new Error(String(error));
      }
    },
    setKey: async (provider, key) => {
      await ipc.invoke("keys_set", { provider, key });
      set((state) => ({
        keysPresent: { ...state.keysPresent, [provider]: true },
        keyErrors: { ...state.keyErrors, [provider]: undefined },
      }));
    },
    deleteKey: async (provider) => {
      await ipc.invoke("keys_delete", { provider });
      set((state) => ({
        keysPresent: { ...state.keysPresent, [provider]: false },
        keyErrors: { ...state.keyErrors, [provider]: undefined },
      }));
    },

    initListeners: async () => {
      const subscriptions = await Promise.allSettled([
        ipc.listen<ReferenceState | null>("reference.state", (reference) => {
          set((state) => ({
            telemetry: { ...state.telemetry, reference },
            activeSource: reference
              ? "song"
              : state.lyriaStatus.phase !== "idle"
                ? "lyria"
                : state.activeSource === "song"
                  ? "band"
                  : state.activeSource,
          }));
        }),
        ipc.listen<LyriaStatus>("lyria.state", (lyriaStatus) => {
          set((state) => ({
            lyriaStatus,
            activeSource:
              lyriaStatus.phase !== "idle"
                ? "lyria"
                : state.telemetry.reference
                  ? "song"
                  : state.activeSource === "lyria"
                    ? "band"
                    : state.activeSource,
          }));
        }),
        ipc.listen<MeterTelemetry>("meters", (output_level) => {
          set((state) => ({ telemetry: { ...state.telemetry, output_level } }));
        }),
        ipc.listen<MeterTelemetry>("input.meters", (input_level) => {
          set((state) => ({ telemetry: { ...state.telemetry, input_level } }));
        }),
        ipc.listen<TunerTelemetry>("tuner.state", (tuner) => {
          set((state) => ({ telemetry: { ...state.telemetry, tuner } }));
        }),
        ipc.listen<TransportTelemetry>("transport.state", (transport) => {
          const prev = get().telemetry.transport;
          set((state) => ({ telemetry: { ...state.telemetry, transport } }));
          // Count performed bars, not absolute bar numbers: short loops wrap.
          const trainer = get().tempoTrainer;
          const boundary =
            transport.bar === prev.bar + 1 ||
            (transport.loop_enabled &&
              prev.loop_enabled &&
              prev.bar === transport.loop_end_bar - 1 &&
              transport.bar === transport.loop_start_bar &&
              transport.bar_progress < prev.bar_progress);
          if (
            trainer.enabled &&
            !get().telemetry.reference &&
            !get().isRecording &&
            prev.state === "playing" &&
            transport.state === "playing" &&
            boundary
          ) {
            const playedBars = trainer.playedBars + 1;
            set({
              tempoTrainer: {
                ...trainer,
                playedBars: playedBars >= trainer.everyBars ? 0 : playedBars,
              },
            });
            if (playedBars >= trainer.everyBars) {
              const dir = Math.sign(trainer.targetBpm - transport.bpm);
              if (dir !== 0) {
                const next =
                  dir > 0
                    ? Math.min(
                        trainer.targetBpm,
                        transport.bpm + trainer.stepBpm,
                      )
                    : Math.max(
                        trainer.targetBpm,
                        transport.bpm - trainer.stepBpm,
                      );
                void get().transportSetTempo(next);
              }
            }
          }
        }),
        ipc.listen<BandTelemetry>("band.state", (band) => {
          set((state) => ({ telemetry: { ...state.telemetry, band } }));
        }),
        ipc.listen<RigState>("rig.state", (rigState) => {
          set({ rigState });
        }),
        ipc.listen<string>("app.error", (text) => get().notify("error", text)),
        ipc.listen<string | null>("recorder.error", (recordingError) => {
          set({
            recordingError: recordingError
              ? withNextStep(recordingError)
              : null,
          });
        }),
        ipc.listen<string>("rig.error", (text) => {
          get().notify("error", `The rig reported a problem. ${text}`);
        }),
        ipc.listen<EngineStatus>("engine.status", (engineStatus) => {
          const prev = get().engineStatus;
          set({ engineStatus });
          if (
            !isPreview &&
            engineStatus.last_error &&
            engineStatus.last_error !== prev?.last_error
          ) {
            get().notify("error", engineStatus.last_error);
          }
        }),
      ]);

      const unlisten = subscriptions.flatMap((result) => {
        if (result.status === "fulfilled") return [result.value];
        get().notify(
          "error",
          `Live updates are unavailable. ${String(result.reason)}`,
        );
        return [];
      });

      await Promise.all([
        get().refreshEngineStatus(),
        get().reloadLibrary(),
        get().loadSettings(),
      ]);
      const sample = await ipc
        .invoke<boolean>("diagnostics_sample_stage")
        .catch(() => false);
      if (sample) get().setScreen("stage");

      return () => {
        for (const u of unlisten) u();
      };
    },
  };
});
