import { afterEach, expect, it } from "vitest";
import { __setIpcForTests, ipc } from "../../src/ipc/client";
import {
  readVoiceConfig,
  writeVoiceConfig,
} from "../../src/components/JoVoice";
import { useEngineStore } from "../../src/store/engine";

const originalIpc = { ...ipc };
const originalEngine = useEngineStore.getState();
afterEach(() => {
  __setIpcForTests(originalIpc);
  useEngineStore.setState(originalEngine, true);
});

it("routes Jo voice settings through the store", async () => {
  const commands: string[] = [];
  const ipcCalls: string[] = [];
  __setIpcForTests({
    invoke: async <T>(command: string) => {
      ipcCalls.push(command);
      return undefined as T;
    },
  });
  const voice = {
    microphone: "Mic",
    voiceId: "voice-1",
    duckDb: -9,
    shortcut: "CommandOrControl+Shift+J",
    sttUsdPerHour: null,
    ttsUsdPer1k: null,
  };
  useEngineStore.setState({
    getSettings: async () => {
      commands.push("store.getSettings");
      return { ok: true as const, value: { schemaVersion: 1, voice } };
    },
    saveSettings: async (settings) => {
      commands.push(`store.saveSettings:${settings.voice?.voiceId ?? ""}`);
      return { ok: true as const, value: undefined };
    },
  });
  expect(await readVoiceConfig()).toMatchObject({ voiceId: "voice-1" });
  await writeVoiceConfig({ ...voice, voiceId: "voice-2" });
  expect(commands).toEqual([
    "store.getSettings",
    "store.getSettings",
    "store.saveSettings:voice-2",
  ]);
  expect(ipcCalls).toEqual([]);
});
