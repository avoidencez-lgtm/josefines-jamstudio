import { afterEach, expect, it } from "vitest";
import { __setIpcForTests, ipc } from "../../src/ipc/client";
import type { AppSettings } from "../../src/ipc/contract";
import { readHelpLanguage } from "../../src/lib/help";
import { saveRoomPreference } from "../../src/lib/roomActions";
import { useEngineStore } from "../../src/store/engine";

const originalIpc = { ...ipc };
afterEach(() => __setIpcForTests(originalIpc));

it("remembers the manual language in app settings and falls back to English", async () => {
  expect(readHelpLanguage(null)).toBe("en");
  expect(readHelpLanguage({ helpLanguage: "nb" })).toBe("nb");
  expect(readHelpLanguage({ helpLanguage: "de" })).toBe("en");
  const settings = {
    schemaVersion: 1,
    input_channel: 2,
    sample_rate: 48000,
    buffer_size: 256,
    futureField: { keep: true },
  };
  let saved: AppSettings | undefined;
  __setIpcForTests({
    invoke: async <T>(cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "settings_get") return settings as T;
      saved = args?.settings as AppSettings;
      return null as T;
    },
  });
  await saveRoomPreference("helpLanguage", "nb");
  expect(saved?.helpLanguage).toBe("nb");
  expect(saved?.futureField).toEqual({ keep: true });
  expect(readHelpLanguage(useEngineStore.getState().settings)).toBe("nb");
  await expect(saveRoomPreference("helpLanguage", "de")).rejects.toThrow();
});
