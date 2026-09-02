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

export interface EngineState {
  currentScreen: "stage" | "library" | "sessions" | "rig" | "settings";
  activeSource: "none" | "band" | "song" | "lyria";
  toneOn: boolean;
  toneHz: number;
  tunerOn: boolean;
  clickVolume: number;
  telemetry: EngineTelemetry;
  devices: AudioDevices;
  settings: AppSettings | null;
  keysPresent: Record<string, boolean>;

  setScreen: (
    screen: "stage" | "library" | "sessions" | "rig" | "settings",
  ) => void;
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
  activeSource: "none",
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

  setTone: async (on, hz) => {
    const finalHz = hz ?? get().toneHz;
    set({ toneOn: on, toneHz: finalHz });
    try {
      await invoke("tone_set", { on, hz: finalHz });
    } catch (e) {
      console.error("Failed to set tone:", e);
    }
  },

  setTuner: async (on) => {
    set({ tunerOn: on });
    try {
      await invoke("tuner_set", { on });
    } catch (e) {
      console.error("Failed to set tuner:", e);
    }
  },

  setClickVolume: async (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    set({ clickVolume: clamped });
    try {
      await invoke("transport_set_click_volume", { volume: clamped });
    } catch (e) {
      console.error("Failed to set click volume:", e);
    }
  },

  transportPlay: async () => {
    try {
      await invoke("transport_play");
    } catch (e) {
      console.error("Failed to start playback:", e);
    }
  },

  transportPause: async () => {
    try {
      await invoke("transport_pause");
    } catch (e) {
      console.error("Failed to pause playback:", e);
    }
  },

  transportStop: async () => {
    try {
      await invoke("transport_stop");
    } catch (e) {
      console.error("Failed to stop playback:", e);
    }
  },

  transportSeekBar: async (bar) => {
    try {
      await invoke("transport_seek_bar", { bar });
    } catch (e) {
      console.error("Failed to seek bar:", e);
    }
  },

  transportSetLoop: async (startBar, endBar, enabled) => {
    try {
      await invoke("transport_set_loop", { startBar, endBar, enabled });
    } catch (e) {
      console.error("Failed to set loop:", e);
    }
  },

  transportSetCountIn: async (bars) => {
    try {
      await invoke("transport_set_count_in", { bars });
    } catch (e) {
      console.error("Failed to set count in:", e);
    }
  },

  transportSetTempo: async (bpm) => {
    const clamped = Math.max(20, Math.min(300, bpm));
    try {
      await invoke("transport_set_tempo", { bpm: clamped });
    } catch (e) {
      console.error("Failed to set tempo:", e);
    }
  },

  transportSetTimeSignature: async (numerator, denominator) => {
    try {
      await invoke("transport_set_time_signature", { numerator, denominator });
    } catch (e) {
      console.error("Failed to set time signature:", e);
    }
  },

  bandSetStyle: async (styleId) => {
    try {
      await invoke("band_set_style", { styleId });
    } catch (e) {
      console.error("Failed to set band style:", e);
    }
  },

  bandSetIntensity: async (intensity) => {
    const clamped = Math.max(0, Math.min(1, intensity));
    try {
      await invoke("band_set_intensity", { intensity: clamped });
    } catch (e) {
      console.error("Failed to set band intensity:", e);
    }
  },

  bandCue: async (cue) => {
    try {
      await invoke("band_cue", { cue });
    } catch (e) {
      console.error("Failed to set band cue:", e);
    }
  },

  bandLoadChart: async (chartId: string) => {
    try {
      await invoke("band_load_chart", { chartId });
    } catch (e) {
      console.error("Failed to load chart:", e);
    }
  },

  bandSet: async (patch) => {
    try {
      await invoke("band_set", { args: patch });
    } catch (e) {
      console.error("Failed to apply band patch:", e);
    }
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
    try {
      const takeId = await invoke<string>("recorder_start", { sessionId });
      set({ isRecording: true });
      return takeId;
    } catch (e) {
      console.error("Failed to start recording:", e);
      return "";
    }
  },

  stopRecording: async () => {
    try {
      const meta =
        await invoke<import("../ipc/contract").TakeMetadata>("recorder_stop");
      set((state) => ({
        isRecording: false,
        takes: [meta, ...state.takes],
      }));
      return meta;
    } catch (e) {
      console.error("Failed to stop recording:", e);
      set({ isRecording: false });
      return null;
    }
  },

  calibrateLatency: async () => {
    try {
      const samples = await invoke<number>("recorder_calibrate_latency");
      set({ calibratedLatencySamples: samples });
      return samples;
    } catch (e) {
      console.error("Failed to calibrate latency:", e);
      return 0;
    }
  },

  loadTakes: async () => {
    try {
      const takes =
        await invoke<import("../ipc/contract").TakeMetadata[]>("takes_list");
      set({ takes });
    } catch (e) {
      console.error("Failed to load takes:", e);
    }
  },

  deleteTake: async (takeId: string) => {
    try {
      await invoke("takes_delete", { takeId });
      set((state) => ({
        takes: state.takes.filter((t) => t.id !== takeId),
      }));
    } catch (e) {
      console.error("Failed to delete take:", e);
    }
  },

  importSong: async (filePath: string) => {
    try {
      const song = await invoke<import("../ipc/contract").SongMetadata>(
        "song_import",
        { filePath },
      );
      set({ currentSong: song });
      return song;
    } catch (e) {
      console.error("Failed to import song:", e);
      return null;
    }
  },

  setSongSpeed: async (speed: number) => {
    try {
      const clamped = Math.max(0.5, Math.min(1.5, speed));
      await invoke("song_set_speed", { speed: clamped });
      set({ songSpeed: clamped });
    } catch (e) {
      console.error("Failed to set song speed:", e);
    }
  },

  setSongTranspose: async (semitones: number) => {
    try {
      const clamped = Math.max(-12, Math.min(12, semitones));
      await invoke("song_set_transpose", { semitones: clamped });
      set({ songTranspose: clamped });
    } catch (e) {
      console.error("Failed to set song transpose:", e);
    }
  },

  updateStemSettings: async (patch) => {
    const updated = { ...get().stemSettings, ...patch };
    try {
      await invoke("song_set_stem_settings", { settings: updated });
      set({ stemSettings: updated });
    } catch (e) {
      console.error("Failed to update stem settings:", e);
    }
  },

  startAiMusic: async (config) => {
    const fullConfig: import("../ipc/contract").AiMusicConfig = {
      provider: config?.provider ?? "offline-synthetic",
      prompt: config?.prompt ?? get().aiMusic.currentPrompt,
      tempo: config?.tempo ?? 120,
      key: config?.key ?? "A",
      mixVolume: config?.mixVolume ?? get().aiMusic.mixVolume,
    };
    try {
      await invoke("ai_music_start", { config: fullConfig });
      set((state) => ({
        aiMusic: {
          ...state.aiMusic,
          active: true,
          provider: fullConfig.provider,
          currentPrompt: fullConfig.prompt,
        },
      }));
    } catch (e) {
      console.error("Failed to start AI music stream:", e);
    }
  },

  stopAiMusic: async () => {
    try {
      await invoke("ai_music_stop");
      set((state) => ({
        aiMusic: { ...state.aiMusic, active: false },
      }));
    } catch (e) {
      console.error("Failed to stop AI music stream:", e);
    }
  },

  steerAiMusic: async (delta: string) => {
    try {
      await invoke("ai_music_steer", { delta });
      set((state) => ({
        aiMusic: { ...state.aiMusic, promptDelta: delta },
      }));
    } catch (e) {
      console.error("Failed to steer AI music stream:", e);
    }
  },

  setAiMusicVolume: async (volume: number) => {
    try {
      await invoke("ai_music_set_volume", { volume });
      set((state) => ({
        aiMusic: { ...state.aiMusic, mixVolume: volume },
      }));
    } catch (e) {
      console.error("Failed to set AI music volume:", e);
    }
  },

  loadRigProfiles: async () => {
    try {
      const profiles =
        await invoke<import("../ipc/contract").RigProfile[]>(
          "rig_list_profiles",
        );
      const state =
        await invoke<import("../ipc/contract").RigState>("rig_get_state");
      set({ availableProfiles: profiles, rigState: state });
    } catch (e) {
      console.error("Failed to load rig profiles:", e);
    }
  },

  selectRigProfile: async (id: string) => {
    try {
      const profile = await invoke<import("../ipc/contract").RigProfile>(
        "rig_select_profile",
        { profileId: id },
      );
      set((state) => ({
        rigState: state.rigState
          ? { ...state.rigState, currentProfile: profile, currentScene: 0 }
          : null,
      }));
    } catch (e) {
      console.error("Failed to select rig profile:", e);
    }
  },

  selectRigScene: async (sceneIdx: number) => {
    try {
      await invoke("rig_select_scene", { sceneIdx });
      set((state) => ({
        rigState: state.rigState
          ? { ...state.rigState, currentScene: sceneIdx }
          : null,
      }));
    } catch (e) {
      console.error("Failed to select rig scene:", e);
    }
  },

  setRigSectionMapping: async (section: string, sceneIdx: number) => {
    try {
      await invoke("rig_set_section_mapping", { section, sceneIdx });
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
    } catch (e) {
      console.error("Failed to set section mapping:", e);
    }
  },

  refreshRigState: async () => {
    try {
      const state =
        await invoke<import("../ipc/contract").RigState>("rig_get_state");
      set({ rigState: state });
    } catch (e) {
      console.error("Failed to refresh rig state:", e);
    }
  },

  analyzeTake: async (takeId: string) => {
    try {
      const analysis = await invoke<import("../ipc/contract").TakeAnalysis>(
        "takes_analyze",
        { takeId },
      );
      set((state) => ({
        takeAnalysis: { ...state.takeAnalysis, [takeId]: analysis },
      }));
      return analysis;
    } catch (e) {
      console.error("Failed to analyze take:", e);
      return null;
    }
  },

  exportTakeDaw: async (takeId: string) => {
    try {
      const path = await invoke<string>("takes_export_daw", { takeId });
      return path;
    } catch (e) {
      console.error("Failed to export take for DAW:", e);
      return null;
    }
  },

  refreshDevices: async () => {
    try {
      const devs = await invoke<AudioDevices>("audio_list_devices");
      set({ devices: devs });
    } catch (e) {
      console.error("Failed to list audio devices:", e);
    }
  },

  loadSettings: async () => {
    try {
      const s = await invoke<AppSettings>("settings_get");
      set({ settings: s });
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  },

  saveSettings: async (settings) => {
    try {
      await invoke("settings_set", { settings });
      set({ settings });
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  },

  checkKey: async (provider) => {
    try {
      const has = await invoke<boolean>("keys_has", { provider });
      set((state) => ({
        keysPresent: { ...state.keysPresent, [provider]: has },
      }));
      return has;
    } catch {
      return false;
    }
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
