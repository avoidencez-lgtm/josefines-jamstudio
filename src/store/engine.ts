import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type {
  AppSettings,
  AudioDevices,
  EngineTelemetry,
  MeterTelemetry,
  TunerTelemetry,
} from "../ipc/contract";

export interface EngineState {
  currentScreen: "stage" | "library" | "sessions" | "rig" | "settings";
  activeSource: "none" | "band" | "song" | "lyria";
  toneOn: boolean;
  toneHz: number;
  metronomeOn: boolean;
  metronomeBpm: number;
  tunerOn: boolean;
  telemetry: EngineTelemetry;
  devices: AudioDevices;
  settings: AppSettings | null;
  keysPresent: Record<string, boolean>;

  setScreen: (
    screen: "stage" | "library" | "sessions" | "rig" | "settings",
  ) => void;
  setTone: (on: boolean, hz?: number) => Promise<void>;
  setMetronome: (on: boolean, bpm?: number) => Promise<void>;
  setTuner: (on: boolean) => Promise<void>;
  setBpm: (bpm: number) => Promise<void>;
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
  metronomeOn: false,
  metronomeBpm: 120,
  tunerOn: true,
  telemetry: {
    xruns: 0,
    input_level: { peak_db: -180, rms_db: -180 },
    output_level: { peak_db: -180, rms_db: -180 },
    tuner: null,
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

  setMetronome: async (on, bpm) => {
    const finalBpm = bpm ?? get().metronomeBpm;
    set({ metronomeOn: on, metronomeBpm: finalBpm });
    try {
      await invoke("metronome_set", { on, bpm: finalBpm });
    } catch (e) {
      console.error("Failed to set metronome:", e);
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

  setBpm: async (bpm) => {
    const clamped = Math.max(40, Math.min(240, bpm));
    set({ metronomeBpm: clamped });
    if (get().metronomeOn) {
      try {
        await invoke("metronome_set", { on: true, bpm: clamped });
      } catch (e) {
        console.error("Failed to update bpm:", e);
      }
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

    return () => {
      unlistenMeter();
      unlistenTuner();
    };
  },
}));
