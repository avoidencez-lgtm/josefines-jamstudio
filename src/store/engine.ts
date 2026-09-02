import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type {
  AppSettings,
  AudioDevices,
  BandTelemetry,
  EngineTelemetry,
  MeterTelemetry,
  TransportTelemetry,
  TunerTelemetry,
} from "../ipc/contract";

async function cmd(
  name: string,
  args?: Record<string, unknown>,
): Promise<boolean> {
  try {
    await invoke(name, args);
    return true;
  } catch (e) {
    console.error(name, e);
    return false;
  }
}

async function cmdVal<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  try {
    return await invoke<T>(name, args);
  } catch (e) {
    console.error(name, e);
    return null;
  }
}

export type ScreenId =
  | "stage"
  | "jo"
  | "songs"
  | "ai-music"
  | "sessions"
  | "rig"
  | "settings"
  | "library";

export interface EngineState {
  currentScreen: ScreenId;
  activeSource: "none" | "band" | "song" | "lyria";
  toneOn: boolean;
  toneHz: number;
  tunerOn: boolean;
  clickVolume: number;
  telemetry: EngineTelemetry;
  devices: AudioDevices;
  settings: AppSettings | null;
  keysPresent: Record<string, boolean>;

  setScreen: (screen: ScreenId) => void;
  setActiveSource: (source: "none" | "band" | "song" | "lyria") => void;
  setTone: (on: boolean, hz?: number) => Promise<void>;
  setTuner: (on: boolean) => Promise<void>;
  setClickVolume: (volume: number) => Promise<void>;

  // Transport actions
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

  // Band actions
  bandSetStyle: (styleId: string) => Promise<void>;
  bandSetIntensity: (intensity: number) => Promise<void>;
  bandCue: (
    cue: "none" | "fill" | "crash" | "stop" | "ending",
  ) => Promise<void>;
  bandLoadChart: (chartId: string) => Promise<void>;
  bandSet: (patch: import("../ipc/contract").BandPatch) => Promise<void>;
  togglePart: (part: "drums" | "bass" | "comp") => Promise<void>;
  toggleFollowEnergy: () => Promise<void>;

  // Recorder & Takes
  takes: import("../ipc/contract").TakeMetadata[];
  isRecording: boolean;
  calibratedLatencySamples: number;
  startRecording: (sessionId?: string) => Promise<string>;
  stopRecording: () => Promise<import("../ipc/contract").TakeMetadata | null>;
  calibrateLatency: () => Promise<number>;
  loadTakes: () => Promise<void>;
  deleteTake: (id: string) => Promise<void>;

  // Real Song & Stem Separation (M3)
  currentSong: import("../ipc/contract").SongMetadata | null;
  songSpeed: number;
  songTranspose: number;
  stemSettings: import("../ipc/contract").StemSettings;
  importSong: (
    filePath: string,
  ) => Promise<import("../ipc/contract").SongMetadata | null>;
  setSongSpeed: (speed: number) => Promise<void>;
  setSongTranspose: (semitones: number) => Promise<void>;
  updateStemSettings: (
    patch: Partial<import("../ipc/contract").StemSettings>,
  ) => Promise<void>;

  // AI Music Streaming (M4)
  aiMusic: import("../ipc/contract").AiMusicState;
  startAiMusic: (
    config?: Partial<import("../ipc/contract").AiMusicConfig>,
  ) => Promise<void>;
  stopAiMusic: () => Promise<void>;
  steerAiMusic: (delta: string) => Promise<void>;
  setAiMusicVolume: (volume: number) => Promise<void>;

  // Rig Orchestration (M5)
  rigState: import("../ipc/contract").RigState | null;
  availableProfiles: import("../ipc/contract").RigProfile[];
  loadRigProfiles: () => Promise<void>;
  selectRigProfile: (id: string) => Promise<void>;
  selectRigScene: (sceneIdx: number) => Promise<void>;
  setRigSectionMapping: (section: string, sceneIdx: number) => Promise<void>;
  refreshRigState: () => Promise<void>;

  // Take Analysis & DAW Export (M6)
  takeAnalysis: Record<string, import("../ipc/contract").TakeAnalysis>;
  analyzeTake: (
    takeId: string,
  ) => Promise<import("../ipc/contract").TakeAnalysis | null>;
  exportTakeDaw: (takeId: string) => Promise<string | null>;

  refreshDevices: () => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  checkKey: (provider: string) => Promise<boolean>;
  setKey: (provider: string, key: string) => Promise<void>;
  deleteKey: (provider: string) => Promise<void>;
  initListeners: () => Promise<() => void>;
}

export const useEngineStore = create<EngineState>((set, get) => ({
  currentScreen: "stage",
  activeSource: "band",
  toneOn: false,
  toneHz: 440,
  tunerOn: true,
  clickVolume: 0.7,
  telemetry: {
    xruns: 0,
    input_level: { peak_db: -180, rms_db: -180 },
    output_level: { peak_db: -180, rms_db: -180 },
    tuner: null,
    transport: {
      state: "stopped",
      bar: 1,
      beat: 1,
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
      mute_drums: false,
      mute_bass: false,
      mute_comp: false,
      follow_energy: false,
      current_energy: 0.0,
    },
  },
  devices: { inputs: [], outputs: [] },
  settings: null,
  keysPresent: {},
  takes: [],
  isRecording: false,
  calibratedLatencySamples: 0,
  currentSong: null,
  songSpeed: 1.0,
  songTranspose: 0,
  stemSettings: {
    vocalsVolume: 1.0,
    drumsVolume: 1.0,
    bassVolume: 1.0,
    otherVolume: 1.0,
    vocalsMute: false,
    drumsMute: false,
    bassMute: false,
    otherMute: false,
    vocalsSolo: false,
    drumsSolo: false,
    bassSolo: false,
    otherSolo: false,
  },
  aiMusic: {
    active: false,
    provider: "offline-synthetic",
    currentPrompt: "Neo-soul groove with rhodes and pocket drums",
    promptDelta: "",
    mixVolume: 0.8,
  },
  rigState: null,
  availableProfiles: [],
  takeAnalysis: {},

  setScreen: (screen) => set({ currentScreen: screen }),
  setActiveSource: (source) => set({ activeSource: source }),

  setTone: async (on, hz) => {
    const finalHz = hz ?? get().toneHz;
    set({ toneOn: on, toneHz: finalHz });
    await cmd("tone_set", { on, hz: finalHz });
  },

  setTuner: async (on) => {
    set({ tunerOn: on });
    await cmd("tuner_set", { on });
  },

  setClickVolume: async (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    set({ clickVolume: clamped });
    await cmd("transport_set_click_volume", { volume: clamped });
  },

  transportPlay: async () => {
    await cmd("transport_play");
  },

  transportPause: async () => {
    await cmd("transport_pause");
  },

  transportStop: async () => {
    await cmd("transport_stop");
  },

  transportSeekBar: async (bar) => {
    await cmd("transport_seek_bar", { bar });
  },

  transportSetLoop: async (startBar, endBar, enabled) => {
    await cmd("transport_set_loop", { startBar, endBar, enabled });
  },

  transportSetCountIn: async (bars) => {
    await cmd("transport_set_count_in", { bars });
  },

  transportSetTempo: async (bpm) => {
    await cmd("transport_set_tempo", {
      bpm: Math.max(20, Math.min(300, bpm)),
    });
  },

  transportSetTimeSignature: async (numerator, denominator) => {
    await cmd("transport_set_time_signature", { numerator, denominator });
  },

  bandSetStyle: async (styleId) => {
    await cmd("band_set_style", { styleId });
  },

  bandSetIntensity: async (intensity) => {
    await cmd("band_set_intensity", {
      intensity: Math.max(0, Math.min(1, intensity)),
    });
  },

  bandCue: async (cue) => {
    await cmd("band_cue", { cue });
  },

  bandLoadChart: async (chartId: string) => {
    await cmd("band_load_chart", { chartId });
  },

  bandSet: async (patch) => {
    await cmd("band_set", { args: patch });
  },

  togglePart: async (part) => {
    const band = get().telemetry.band;
    const patch: import("../ipc/contract").BandPatch = {};
    if (part === "drums") patch.muteDrums = !band.mute_drums;
    if (part === "bass") patch.muteBass = !band.mute_bass;
    if (part === "comp") patch.muteComp = !band.mute_comp;
    await get().bandSet(patch);
  },

  toggleFollowEnergy: async () => {
    const band = get().telemetry.band;
    await get().bandSet({ followEnergy: !band.follow_energy });
  },

  startRecording: async (sessionId = "default-session") => {
    const takeId = await cmdVal<string>("recorder_start", { sessionId });
    if (takeId == null) return "";
    set({ isRecording: true });
    return takeId;
  },

  stopRecording: async () => {
    const meta =
      await cmdVal<import("../ipc/contract").TakeMetadata>("recorder_stop");
    if (meta == null) {
      set({ isRecording: false });
      return null;
    }
    set((state) => ({
      isRecording: false,
      takes: [meta, ...state.takes],
    }));
    return meta;
  },

  calibrateLatency: async () => {
    const samples = await cmdVal<number>("recorder_calibrate_latency");
    if (samples == null) return 0;
    set({ calibratedLatencySamples: samples });
    return samples;
  },

  loadTakes: async () => {
    const takes =
      await cmdVal<import("../ipc/contract").TakeMetadata[]>("takes_list");
    if (takes) set({ takes });
  },

  deleteTake: async (takeId: string) => {
    if (!(await cmd("takes_delete", { takeId }))) return;
    set((state) => ({
      takes: state.takes.filter((t) => t.id !== takeId),
    }));
  },

  importSong: async (filePath: string) => {
    const song = await cmdVal<import("../ipc/contract").SongMetadata>(
      "song_import",
      { filePath },
    );
    if (song == null) return null;
    set({ currentSong: song });
    return song;
  },

  setSongSpeed: async (speed: number) => {
    const clamped = Math.max(0.5, Math.min(1.5, speed));
    if (!(await cmd("song_set_speed", { speed: clamped }))) return;
    set({ songSpeed: clamped });
  },

  setSongTranspose: async (semitones: number) => {
    const clamped = Math.max(-12, Math.min(12, semitones));
    if (!(await cmd("song_set_transpose", { semitones: clamped }))) return;
    set({ songTranspose: clamped });
  },

  updateStemSettings: async (patch) => {
    const updated = { ...get().stemSettings, ...patch };
    if (!(await cmd("song_set_stem_settings", { settings: updated }))) return;
    set({ stemSettings: updated });
  },

  startAiMusic: async (config) => {
    const fullConfig: import("../ipc/contract").AiMusicConfig = {
      provider: config?.provider ?? "offline-synthetic",
      prompt: config?.prompt ?? get().aiMusic.currentPrompt,
      tempo: config?.tempo ?? 120,
      key: config?.key ?? "A",
      mixVolume: config?.mixVolume ?? get().aiMusic.mixVolume,
    };
    if (!(await cmd("ai_music_start", { config: fullConfig }))) return;
    set((state) => ({
      aiMusic: {
        ...state.aiMusic,
        active: true,
        provider: fullConfig.provider,
        currentPrompt: fullConfig.prompt,
      },
    }));
  },

  stopAiMusic: async () => {
    if (!(await cmd("ai_music_stop"))) return;
    set((state) => ({
      aiMusic: { ...state.aiMusic, active: false },
    }));
  },

  steerAiMusic: async (delta: string) => {
    if (!(await cmd("ai_music_steer", { delta }))) return;
    set((state) => ({
      aiMusic: { ...state.aiMusic, promptDelta: delta },
    }));
  },

  setAiMusicVolume: async (volume: number) => {
    if (!(await cmd("ai_music_set_volume", { volume }))) return;
    set((state) => ({
      aiMusic: { ...state.aiMusic, mixVolume: volume },
    }));
  },

  loadRigProfiles: async () => {
    const profiles =
      await cmdVal<import("../ipc/contract").RigProfile[]>("rig_list_profiles");
    const state =
      await cmdVal<import("../ipc/contract").RigState>("rig_get_state");
    if (profiles && state)
      set({ availableProfiles: profiles, rigState: state });
  },

  selectRigProfile: async (id: string) => {
    const profile = await cmdVal<import("../ipc/contract").RigProfile>(
      "rig_select_profile",
      { profileId: id },
    );
    if (profile == null) return;
    set((state) => ({
      rigState: state.rigState
        ? { ...state.rigState, currentProfile: profile, currentScene: 0 }
        : null,
    }));
  },

  selectRigScene: async (sceneIdx: number) => {
    if (!(await cmd("rig_select_scene", { sceneIdx }))) return;
    set((state) => ({
      rigState: state.rigState
        ? { ...state.rigState, currentScene: sceneIdx }
        : null,
    }));
  },

  setRigSectionMapping: async (section: string, sceneIdx: number) => {
    if (!(await cmd("rig_set_section_mapping", { section, sceneIdx }))) return;
    set((state) => ({
      rigState: state.rigState
        ? {
            ...state.rigState,
            sectionMappings: {
              ...state.rigState.sectionMappings,
              [section]: sceneIdx,
            },
          }
        : null,
    }));
  },

  refreshRigState: async () => {
    const state =
      await cmdVal<import("../ipc/contract").RigState>("rig_get_state");
    if (state) set({ rigState: state });
  },

  analyzeTake: async (takeId: string) => {
    const analysis = await cmdVal<import("../ipc/contract").TakeAnalysis>(
      "takes_analyze",
      { takeId },
    );
    if (analysis == null) return null;
    set((state) => ({
      takeAnalysis: { ...state.takeAnalysis, [takeId]: analysis },
    }));
    return analysis;
  },

  exportTakeDaw: async (takeId: string) => {
    return cmdVal<string>("takes_export_daw", { takeId });
  },

  refreshDevices: async () => {
    const devs = await cmdVal<AudioDevices>("audio_list_devices");
    if (devs) set({ devices: devs });
  },

  loadSettings: async () => {
    const s = await cmdVal<AppSettings>("settings_get");
    if (s) set({ settings: s });
  },

  saveSettings: async (settings) => {
    if (!(await cmd("settings_set", { settings }))) return;
    set({ settings });
  },

  checkKey: async (provider) => {
    const has = await cmdVal<boolean>("keys_has", { provider });
    if (has == null) return false;
    set((state) => ({
      keysPresent: { ...state.keysPresent, [provider]: has },
    }));
    return has;
  },

  setKey: async (provider, key) => {
    await invoke("keys_set", { provider, key });
    set((state) => ({
      keysPresent: { ...state.keysPresent, [provider]: true },
    }));
  },

  deleteKey: async (provider) => {
    await invoke("keys_delete", { provider });
    set((state) => ({
      keysPresent: { ...state.keysPresent, [provider]: false },
    }));
  },

  initListeners: async () => {
    const unlistenMeter = await listen<MeterTelemetry>("meters", (event) => {
      set((state) => ({
        telemetry: {
          ...state.telemetry,
          output_level: event.payload,
        },
      }));
    });

    const unlistenTuner = await listen<TunerTelemetry>(
      "tuner.state",
      (event) => {
        set((state) => ({
          telemetry: {
            ...state.telemetry,
            tuner: event.payload,
          },
        }));
      },
    );

    const unlistenTransport = await listen<TransportTelemetry>(
      "transport.state",
      (event) => {
        set((state) => ({
          telemetry: {
            ...state.telemetry,
            transport: event.payload,
          },
        }));
      },
    );

    const unlistenBand = await listen<BandTelemetry>("band.state", (event) => {
      set((state) => ({
        telemetry: {
          ...state.telemetry,
          band: event.payload,
        },
      }));
    });

    return () => {
      unlistenMeter();
      unlistenTuner();
      unlistenTransport();
      unlistenBand();
    };
  },
}));
