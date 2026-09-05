import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import { askBrain, useAi } from "../../src/lib/jo/providers";
import { useEngineStore } from "../../src/store/engine";

const initial = useEngineStore.getState();
const ai = useAi.getState();
beforeEach(() =>
  useEngineStore.setState({ ...initial, isPreview: false }, true),
);
afterEach(() => {
  vi.restoreAllMocks();
  useEngineStore.setState(initial, true);
  useAi.setState(ai, true);
});

it("keeps a failed credential distinct from missing keys through provider loading and Jo", async () => {
  const invoke = vi.spyOn(ipc, "invoke").mockImplementation(async (command) => {
    if (command === "settings_get") return {};
    if (command === "providers_list")
      return [
        {
          id: "gemini",
          hasKey: false,
          keyError: "keychain unavailable: locked",
        },
        { id: "openai", hasKey: true },
      ];
    throw new Error(`Unexpected command: ${command}`);
  });
  await useAi.getState().load();
  expect(useEngineStore.getState().keysPresent.openai).toBe(true);
  await expect(
    askBrain({ system: "Test", messages: [], tools: false }),
  ).rejects.toThrow("keychain unavailable: locked");
  expect(invoke).toHaveBeenCalledTimes(2);
});

it("rethrows failed presence checks and preserves saved status until a successful retry", async () => {
  useEngineStore.setState({ keysPresent: { gemini: true } });
  const invoke = vi
    .spyOn(ipc, "invoke")
    .mockRejectedValue("keychain unavailable: locked");
  await expect(useEngineStore.getState().checkKey("gemini")).rejects.toThrow(
    "keychain unavailable: locked",
  );
  expect(useEngineStore.getState().keysPresent.gemini).toBe(true);
  invoke.mockResolvedValue(false);
  await expect(useEngineStore.getState().checkKey("gemini")).resolves.toBe(
    false,
  );
  await expect(
    askBrain({ system: "Test", messages: [], tools: false }),
  ).rejects.toThrow("Add a Google Gemini API key");
});
