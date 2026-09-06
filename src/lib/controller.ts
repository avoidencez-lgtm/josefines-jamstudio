import { create } from "zustand";
import { ipc, isPreview } from "../ipc/client";
import { useEngineStore } from "../store/engine";
import { handleJoQuery } from "./jo/conversation";
import { cancelVoice, toggleVoice, useVoice } from "./jo/voice";
import { useWriting } from "./originals";
import { toggleReferenceRamp } from "./referenceRamp";

export const PEDAL_ACTIONS = {
  keep: "Keep that riff",
  record: "Record / save take",
  play: "Play / stop",
  loop: "Loop selected section",
  next: "Next section loop",
  version: "Keep a version",
  voice: "Talk / send to Jo",
  ramp: "Toggle reference practice ramp",
} as const;
export type PedalAction = keyof typeof PEDAL_ACTIONS;
export interface PedalPress {
  kind: "program" | "cc" | "note";
  channel: number;
  number: number;
}
export interface PedalConfig {
  schemaVersion: number;
  bindings: { action: PedalAction; press: PedalPress }[];
  [key: string]: unknown;
}
export const samePress = (a: PedalPress, b: PedalPress) =>
  a.kind === b.kind && a.channel === b.channel && a.number === b.number;
export function assignPedal(
  config: PedalConfig,
  action: PedalAction,
  press: PedalPress,
): PedalConfig {
  const previous = config.bindings.find((b) => b.action === action);
  return {
    ...config,
    bindings: [
      ...config.bindings.filter(
        (b) => b.action !== action && !samePress(b.press, press),
      ),
      { ...previous, action, press: { ...previous?.press, ...press } },
    ],
  };
}
export const describePress = (p: PedalPress) =>
  `${p.kind.toUpperCase()} ${p.number} · channel ${p.channel}`;

interface ControllerState {
  config: PedalConfig;
  ports: string[];
  port: string;
  enabled: boolean;
  learning: PedalAction | null;
  message: string;
  busy: boolean;
  refresh: () => Promise<void>;
  connect: (port: string) => Promise<void>;
  receive: (press: PedalPress) => Promise<void>;
  remove: (action: PedalAction) => Promise<void>;
}
export const useController = create<ControllerState>((set, get) => ({
  config: { schemaVersion: 1, bindings: [] },
  ports: [],
  port: "",
  enabled: false,
  learning: null,
  message: "",
  busy: false,
  refresh: async () => {
    if (isPreview) return;
    try {
      set({
        config: await ipc.invoke<PedalConfig>("controller_config"),
        ports: await ipc.invoke<string[]>("controller_ports"),
      });
      if (get().port && !get().ports.includes(get().port)) {
        await get().connect("");
        set({
          message: "Controller disconnected. Reconnect it and rescan inputs.",
        });
      }
    } catch (e) {
      set({ message: String(e) });
    }
  },
  connect: async (port) => {
    set({ enabled: false, learning: null, busy: true });
    try {
      if (["opening", "listening"].includes(useVoice.getState().phase))
        await cancelVoice();
      await ipc.invoke("controller_open", { port: port || null });
      set({
        port,
        message: port
          ? "Connected. Learn your pedals, then enable control."
          : "Disconnected.",
      });
    } catch (e) {
      set({ message: String(e) });
    } finally {
      set({ busy: false });
    }
  },
  remove: async (action) => {
    if (get().busy) return;
    set({ busy: true });
    const config = {
      ...get().config,
      bindings: get().config.bindings.filter((b) => b.action !== action),
    };
    try {
      await ipc.invoke("controller_save", { document: config });
      set({ config });
    } catch (e) {
      set({ message: String(e) });
    } finally {
      set({ busy: false });
    }
  },
  receive: async (press) => {
    const { learning, enabled, busy, config } = get();
    if (busy) return;
    set({ message: describePress(press) });
    if (learning) {
      set({ busy: true, learning: null });
      const next = assignPedal(config, learning, press);
      try {
        await ipc.invoke("controller_save", { document: next });
        set({ config: next, message: `Learned: ${PEDAL_ACTIONS[learning]}.` });
      } catch (e) {
        set({ message: String(e) });
      } finally {
        set({ busy: false });
      }
      return;
    }
    if (!enabled) return;
    const action = config.bindings.find((b) =>
      samePress(b.press, press),
    )?.action;
    if (!action) return;
    if (action === "voice") {
      await toggleVoice(handleJoQuery);
      return;
    }
    if (action === "ramp") {
      await toggleReferenceRamp();
      return;
    }
    const w = useWriting.getState();
    await w.action(async () => {
      if (action === "keep") await w.keep();
      else if (action === "record") await w.record();
      else if (action === "play") {
        const engine = useEngineStore.getState();
        if (engine.isRecording) await w.record();
        else if (engine.telemetry.transport.state === "playing")
          await ipc.invoke("transport_stop");
        else await w.play();
      } else if (action === "loop" || action === "next")
        await w.rehearse(action === "next");
      else if (action === "version") {
        if (
          !w.song ||
          useEngineStore.getState().isRecording ||
          w.song.versions.length >= 20
        )
          throw new Error(
            "Open a song and stop recording before keeping a version (maximum 20).",
          );
        w.version();
        await w.save();
      }
    });
  },
}));

export async function listenToController() {
  await useController.getState().refresh();
  return ipc.listen<PedalPress>("controller.press", (p) => {
    void useController.getState().receive(p);
  });
}
