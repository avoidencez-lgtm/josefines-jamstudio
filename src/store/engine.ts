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
  LibraryInfo,
  MeterTelemetry,
  MidiPortInfo,
  RigProfile,
  RigState,
  StyleSummary,
  TakeAnalysis,
  TakeMetadata,
  TransportTelemetry,
  TunerTelemetry,
} from "../ipc/contract";
import { transposeChart } from "../lib/chart/transpose";
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
  notices: Notice[];

  setScreen: (screen: ScreenId) => void;
  notify: (kind: Notice["kind"], text: string) => void;
  dismissNotice: (id: number) => void;
  setTone: (on: boolean, hz?: number) => Promise<void>;
  setTuner: (on: boolean) => Promise<void>;
  setClickVolume: (volume: number) => Promise<void>;
  setBandVolume: (volume: number) => Promise<void>;

  // Transport
  transportPlay: () => Promise<void>;
  transportPause: () => Promise<void>;
  transportStop: () => Promise<void>;
  transportSeekBar: (bar: number) => Promise<void>;
  transportSetLoop: (
    startBar: number,
    endBar: number,
    enabled: boolean,
  ) => Promise<void>;
  transportSetCountIn: (bars: number) => Promise<void>;
  transportSetTempo: (bpm: number) => Promise<void>;
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
  bandSetStyle: (styleId: string) => Promise<void>;
  bandSetIntensity: (intensity: number) => Promise<void>;
  bandCue: (cue: Cue) => Promise<void>;
  bandLoadChart: (chartId: string, followChart?: boolean) => Promise<void>;
  bandSet: (patch: BandPatch) => Promise<void>;
  togglePart: (part: "drums" | "bass" | "comp") => Promise<void>;
  toggleFollowEnergy: () => Promise<void>;

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
  /** Round-trip offset trimmed from the guitar stem, set by hand (no auto-calibration yet). */
  latencySamples: number;
  startRecording: (sessionId?: string) => Promise<string>;
  stopRecording: () => Promise<TakeMetadata | null>;
  setLatencySamples: (samples: number) => Promise<number>;
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

  // Take Analysis & DAW Export (M6)
  takeAnalysis: Record<string, TakeAnalysis>;
  analyzeTake: (takeId: string) => Promise<TakeAnalysis | null>;
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
  /** Runs an engine command; failures become visible notices instead of console noise. */
  const run = async <T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      const text = `${label}: ${errorText(e)}`;
      console.error(text);
      get().notify("error", text);
      return null;
    }
  };

  return {
    currentScreen: "originals",
    isPreview,
    activeSource: "band",
    toneOn: false,
    toneHz: 440,
    tunerOn: true,
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
      },
    },
    engineStatus: null,
    devices: { inputs: [], outputs: [] },
    settings: null,
    keysPresent: {},
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
    latencySamples: 0,
    rigState: null,
    availableProfiles: [],
    midiPorts: [],
    midiPortsError: null,
    takeAnalysis: {},

    setScreen: (screen) => set({ currentScreen: screen }),

    notify: (kind, text) => {
      const id = ++noticeSeq;
      set((s) => ({
        notices: [...s.notices.slice(-4), { id, kind, text, at: Date.now() }],
      }));
      setTimeout(() => get().dismissNotice(id), kind === "error" ? 8000 : 4000);
    },

    dismissNotice: (id) =>
      set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),

    setTone: async (on, hz) => {
      const finalHz = hz ?? get().toneHz;
      set({ toneOn: on, toneHz: finalHz });
      await run("Tone", () => ipc.invoke("tone_set", { on, hz: finalHz }));
    },

    setTuner: async (on) => {
      set({ tunerOn: on });
      await run("Tuner", () => ipc.invoke("tuner_set", { on }));
    },

    setClickVolume: async (volume) => {
      const clamped = Math.max(0, Math.min(1, volume));
      set({ clickVolume: clamped });
      await run("Click volume", () =>
        ipc.invoke("transport_set_click_volume", { volume: clamped }),
      );
    },

    setBandVolume: async (volume) => {
      const clamped = Math.max(0, Math.min(1, volume));
      set({ bandVolume: clamped });
      await run("Band volume", () =>
        ipc.invoke("audio_set_band_volume", { volume: clamped }),
      );
    },

    transportPlay: async () => {
      const trainer = get().tempoTrainer;
      if (trainer.enabled && get().telemetry.transport.state === "stopped") {
        await get().transportSetTempo(trainer.startBpm);
        set({ tempoTrainer: { ...trainer, playedBars: 0 } });
      }
      await run("Play", () => ipc.invoke("transport_play"));
    },
    transportPause: async () => {
      await run("Pause", () => ipc.invoke("transport_pause"));
    },
    transportStop: async () => {
      await run("Stop", () => ipc.invoke("transport_stop"));
    },
    transportSeekBar: async (bar) => {
      await run("Seek", () => ipc.invoke("transport_seek_bar", { bar }));
    },
    transportSetLoop: async (startBar, endBar, enabled) => {
      await run("Loop", () =>
        ipc.invoke("transport_set_loop", { startBar, endBar, enabled }),
      );
    },
    transportSetCountIn: async (bars) => {
      await run("Count-in", () =>
        ipc.invoke("transport_set_count_in", { bars }),
      );
    },
    transportSetTempo: async (bpm) => {
      const clamped = Math.max(20, Math.min(300, Math.round(bpm * 10) / 10));
      await run("Tempo", () =>
        ipc.invoke("transport_set_tempo", { bpm: clamped }),
      );
    },
    transportSetTimeSignature: async (numerator, denominator) => {
      await run("Time signature", () =>
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
        await get().transportSetTempo(bpm);
        return bpm;
      }
      return null;
    },

    setTempoTrainer: (patch) =>
      set((s) => ({ tempoTrainer: { ...s.tempoTrainer, ...patch } })),

    bandSetStyle: async (styleId) => {
      await run("Style", () => ipc.invoke("band_set_style", { styleId }));
    },
    bandSetIntensity: async (intensity) => {
      const clamped = Math.max(0, Math.min(1, intensity));
      await run("Intensity", () =>
        ipc.invoke("band_set_intensity", { intensity: clamped }),
      );
    },
    bandCue: async (cue) => {
      await run("Cue", () => ipc.invoke("band_cue", { cue }));
    },
    bandLoadChart: async (chartId, followChart = true) => {
      const chart = await run("Load chart", () =>
        ipc.invoke<Chart>("band_load_chart", { chartId, followChart }),
      );
      if (chart) set({ currentChart: chart, loadedOriginal: null });
    },
    bandSet: async (patch) => {
      await run("Band", () => ipc.invoke("band_set", { args: patch }));
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

    loadLibrary: async () => {
      const [styles, charts] = await Promise.all([
        run("Styles", () => ipc.invoke<StyleSummary[]>("band_list_styles")),
        run("Charts", () => ipc.invoke<Chart[]>("band_list_charts")),
      ]);
      set({ styles: styles ?? [], charts: charts ?? [] });
      if (!get().currentChart && charts && charts.length > 0) {
        const first = charts.find((c) => c.id === "blues-12-bar") ?? charts[0];
        await get().bandLoadChart(first.id);
      }
    },
    reloadLibrary: async () => {
      const info = await run("Library", () =>
        ipc.invoke<LibraryInfo>("library_reload"),
      );
      if (info) {
        set({ libraryInfo: info });
        for (const e of info.loadErrors) get().notify("error", e);
      }
      await get().loadLibrary();
    },
    saveChart: async (chart) => {
      const path = await run("Save chart", () =>
        ipc.invoke<string>("charts_save", { chart }),
      );
      if (path !== null) {
        get().notify("info", `Saved ${chart.name}`);
        await get().reloadLibrary();
      }
      return path;
    },
    deleteUserChart: async (chartId) => {
      const ok = await run("Delete chart", () =>
        ipc.invoke("charts_delete_user", { chartId }),
      );
      if (ok !== null) await get().reloadLibrary();
    },
    playChartInline: async (chart) => {
      const ok = await run("Play chart", () =>
        ipc.invoke("band_load_chart_inline", { chart }),
      );
      if (ok !== null) set({ currentChart: chart, loadedOriginal: null });
      return ok !== null;
    },
    transposeCurrentChart: async (semitones) => {
      const current = get().currentChart;
      if (!current) return;
      const moved = transposeChart(current, semitones);
      await get().playChartInline(moved);
    },

    startRecording: async (sessionId = "default-session") => {
      const takeId = await run("Record", () =>
        ipc.invoke<string>("recorder_start", { sessionId }),
      );
      if (takeId) set({ isRecording: true });
      return takeId ?? "";
    },
    stopRecording: async () => {
      const meta = await run("Stop recording", () =>
        ipc.invoke<TakeMetadata>("recorder_stop"),
      );
      set((state) => ({
        isRecording: false,
        takes: meta ? [meta, ...state.takes] : state.takes,
      }));
      if (meta?.notes.includes("interrupted")) {
        get().notify("error", meta.notes);
      }
      if (!meta) await get().loadTakes();
      return meta;
    },
    setLatencySamples: async (samples) => {
      const clamped = Math.max(0, Math.min(48_000, Math.round(samples)));
      const applied = await run("Latency offset", () =>
        ipc.invoke<number>("recorder_set_latency", { samples: clamped }),
      );
      if (applied !== null) set({ latencySamples: applied });
      return applied ?? get().latencySamples;
    },
    loadTakes: async () => {
      const latency = await run("Latency offset", () =>
        ipc.invoke<number>("recorder_get_latency"),
      );
      if (latency !== null) set({ latencySamples: latency });
      const takes = await run("Takes", () =>
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
      const ok = await run("Delete take", () =>
        ipc.invoke("takes_delete", { takeId }),
      );
      if (ok !== null)
        set((state) => ({ takes: state.takes.filter((t) => t.id !== takeId) }));
    },

    loadRigProfiles: async () => {
      const profiles = await run("Rig profiles", () =>
        ipc.invoke<RigProfile[]>("rig_list_profiles"),
      );
      const state = await run("Rig state", () =>
        ipc.invoke<RigState>("rig_get_state"),
      );
      set({ availableProfiles: profiles ?? [], rigState: state });
      await get().refreshMidiPorts();
    },
    selectRigProfile: async (id) => {
      const state = await run("Rig profile", () =>
        ipc.invoke<RigState>("rig_select_profile", { profileId: id }),
      );
      if (state) set({ rigState: state });
    },
    selectRigScene: async (sceneIdx) => {
      const state = await run("Rig scene", () =>
        ipc.invoke<RigState>("rig_select_scene", { sceneIdx }),
      );
      if (state) set({ rigState: state });
    },
    setRigSectionMapping: async (section, sceneIdx) => {
      const state = await run("Rig mapping", () =>
        ipc.invoke<RigState>("rig_set_section_mapping", { section, sceneIdx }),
      );
      if (state) set({ rigState: state });
    },
    setRigFollowSections: async (enabled) => {
      const state = await run("Rig follow", () =>
        ipc.invoke<RigState>("rig_set_follow_sections", { enabled }),
      );
      if (state) set({ rigState: state });
    },
    refreshMidiPorts: async () => {
      try {
        const ports = await ipc.invoke<MidiPortInfo[]>("rig_list_ports");
        set({ midiPorts: ports, midiPortsError: null });
      } catch (e) {
        set({ midiPorts: [], midiPortsError: String(e) });
      }
    },
    openMidiPort: async (port) => {
      const state = await run("MIDI port", () =>
        ipc.invoke<RigState>("rig_open_port", { port }),
      );
      if (state) {
        set({ rigState: state });
        get().notify(
          "info",
          state.live ? `MIDI out: ${state.port}` : "MIDI port closed",
        );
      }
    },
    setRigControl: async (cc, value) => {
      const state = await run("Rig control", () =>
        ipc.invoke<RigState>("rig_set_control", { cc, value }),
      );
      if (state) set({ rigState: state });
    },
    sendRigProgram: async (program) => {
      const state = await run("Rig program", () =>
        ipc.invoke<RigState>("rig_send_program", { program }),
      );
      if (state) set({ rigState: state });
    },
    clearRigMonitor: async () => {
      const state = await run("Rig monitor", () =>
        ipc.invoke<RigState>("rig_clear_monitor"),
      );
      if (state) set({ rigState: state });
    },

    analyzeTake: async (takeId) => {
      const analysis = await run("Analyze take", () =>
        ipc.invoke<TakeAnalysis>("takes_analyze", { takeId }),
      );
      if (analysis)
        set((state) => ({
          takeAnalysis: { ...state.takeAnalysis, [takeId]: analysis },
        }));
      return analysis;
    },
    exportTakeDaw: async (takeId) => {
      const report = await run("Export take", () =>
        ipc.invoke<ExportReport>("takes_export_daw", { takeId }),
      );
      if (report) {
        const stems = report.copiedStems.length;
        const missing = report.missingStems.length;
        get().notify(
          missing ? "error" : "info",
          missing
            ? `Exported ${stems} stem(s) + tempo map to ${report.dir}; ${missing} stem file(s) were missing on disk`
            : `Exported ${stems} stems + tempo map${report.reaperScript ? " + REAPER session builder" : ""} to ${report.dir}`,
        );
      }
      return report;
    },

    refreshDevices: async () => {
      const devs = await run("Audio devices", () =>
        ipc.invoke<AudioDevices>("audio_list_devices"),
      );
      if (devs) set({ devices: devs });
    },
    loadSettings: async () => {
      const s = await run("Settings", () =>
        ipc.invoke<AppSettings>("settings_get"),
      );
      if (s) set({ settings: s });
      const recovered = await run("Settings recovery", () =>
        ipc.invoke<string | null>("settings_recovery_notice"),
      );
      if (recovered) get().notify("error", recovered);
    },
    applyAudioConfig: async (config) => {
      const status = await run("Audio devices", () =>
        ipc.invoke<EngineStatus>("audio_set_config", { config }),
      );
      if (status) {
        set((s) => ({
          engineStatus: status,
          settings: s.settings ? { ...s.settings, ...config } : s.settings,
        }));
        if (status.last_error) get().notify("error", status.last_error);
        else get().notify("info", `Audio running at ${status.sample_rate} Hz`);
      } else {
        // The engine restarted anyway (possibly headless); show what it is doing now.
        await get().refreshEngineStatus();
      }
      return status;
    },
    refreshEngineStatus: async () => {
      const status = await run("Engine status", () =>
        ipc.invoke<EngineStatus>("engine_status"),
      );
      if (status) set({ engineStatus: status });
    },
    restartEngine: async () => {
      const status = await run("Restart audio", () =>
        ipc.invoke<EngineStatus>("engine_restart"),
      );
      if (status) set({ engineStatus: status });
      else await get().refreshEngineStatus();
    },

    checkKey: async (provider) => {
      try {
        const has = await ipc.invoke<boolean>("keys_has", { provider });
        set((state) => ({
          keysPresent: { ...state.keysPresent, [provider]: has },
        }));
        return has;
      } catch {
        return false;
      }
    },
    setKey: async (provider, key) => {
      await ipc.invoke("keys_set", { provider, key });
      set((state) => ({
        keysPresent: { ...state.keysPresent, [provider]: true },
      }));
    },
    deleteKey: async (provider) => {
      await ipc.invoke("keys_delete", { provider });
      set((state) => ({
        keysPresent: { ...state.keysPresent, [provider]: false },
      }));
    },

    initListeners: async () => {
      const subscriptions = await Promise.allSettled([
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
        ipc.listen<string>("rig.error", (text) => {
          get().notify("error", `Rig: ${text}`);
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
          `Live updates unavailable: ${String(result.reason)}`,
        );
        return [];
      });

      await Promise.all([
        get().refreshEngineStatus(),
        get().reloadLibrary(),
        get().loadSettings(),
      ]);

      return () => {
        for (const u of unlisten) u();
      };
    },
  };
});
