import type React from "react";
import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { useEngineStore } from "../store/engine";

export const Settings: React.FC = () => {
  const {
    devices,
    settings,
    keysPresent,
    refreshDevices,
    loadSettings,
    saveSettings,
    checkKey,
    setKey,
    deleteKey,
  } = useEngineStore();

  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [elevenKeyInput, setElevenKeyInput] = useState("");

  useEffect(() => {
    refreshDevices();
    loadSettings();
    checkKey("gemini");
    checkKey("elevenlabs");
  }, [refreshDevices, loadSettings, checkKey]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Panel title="Audio Devices">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
              Input Device
              <select
                value={settings?.input_device ?? ""}
                onChange={(e) => {
                  if (settings) {
                    saveSettings({
                      ...settings,
                      input_device: e.target.value || null,
                    });
                  }
                }}
                className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
              >
                <option value="">Default Input Device</option>
                {devices.inputs.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name} ({d.channels} ch)
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
              Output Device
              <select
                value={settings?.output_device ?? ""}
                onChange={(e) => {
                  if (settings) {
                    saveSettings({
                      ...settings,
                      output_device: e.target.value || null,
                    });
                  }
                }}
                className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
              >
                <option value="">Default Output Device</option>
                {devices.outputs.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name} ({d.channels} ch)
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
                Input Channel (HeadRush DI = Channel 3)
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={settings?.input_channel ?? 3}
                  onChange={(e) => {
                    if (settings) {
                      saveSettings({
                        ...settings,
                        input_channel: Number.parseInt(e.target.value, 10) || 1,
                      });
                    }
                  }}
                  className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
                />
              </label>
            </div>
            <div>
              <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
                Buffer Size (Frames)
                <select
                  value={settings?.buffer_size ?? 256}
                  onChange={(e) => {
                    if (settings) {
                      saveSettings({
                        ...settings,
                        buffer_size: Number.parseInt(e.target.value, 10) || 256,
                      });
                    }
                  }}
                  className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
                >
                  <option value={128}>128 (2.7 ms)</option>
                  <option value={256}>256 (5.3 ms)</option>
                  <option value={512}>512 (10.7 ms)</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="API Credentials (Stored in OS Keychain)">
        <div className="flex flex-col gap-6">
          {/* Gemini */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--fg-0)]">
                Google Gemini
              </span>
              <StatusPill
                status={keysPresent.gemini ? "ok" : "idle"}
                label={keysPresent.gemini ? "Configured" : "Missing"}
              />
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder={
                  keysPresent.gemini
                    ? "••••••••••••••••"
                    : "Paste Gemini API Key"
                }
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                className="flex-1 bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
              />
              <Button
                variant="primary"
                onClick={async () => {
                  if (geminiKeyInput) {
                    await setKey("gemini", geminiKeyInput);
                    setGeminiKeyInput("");
                  }
                }}
              >
                Save
              </Button>
              {keysPresent.gemini && (
                <Button variant="danger" onClick={() => deleteKey("gemini")}>
                  Delete
                </Button>
              )}
            </div>
          </div>

          {/* ElevenLabs */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--fg-0)]">
                ElevenLabs
              </span>
              <StatusPill
                status={keysPresent.elevenlabs ? "ok" : "idle"}
                label={keysPresent.elevenlabs ? "Configured" : "Missing"}
              />
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder={
                  keysPresent.elevenlabs
                    ? "••••••••••••••••"
                    : "Paste ElevenLabs API Key"
                }
                value={elevenKeyInput}
                onChange={(e) => setElevenKeyInput(e.target.value)}
                className="flex-1 bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
              />
              <Button
                variant="primary"
                onClick={async () => {
                  if (elevenKeyInput) {
                    await setKey("elevenlabs", elevenKeyInput);
                    setElevenKeyInput("");
                  }
                }}
              >
                Save
              </Button>
              {keysPresent.elevenlabs && (
                <Button
                  variant="danger"
                  onClick={() => deleteKey("elevenlabs")}
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
};
