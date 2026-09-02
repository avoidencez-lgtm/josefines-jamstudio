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
