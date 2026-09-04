import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { ipc } from "../ipc/client";
import type {
  AudioConfig,
  CostEntry,
  CostTotal,
  EngineStatus,
} from "../ipc/contract";
import { useEngineStore } from "../store/engine";

const EngineStatusView: React.FC<{
  status: EngineStatus | null;
  isPreview: boolean;
  busy: boolean;
  onRestart: () => void;
}> = ({ status, isPreview, busy, onRestart }) => {
  if (isPreview) {
    return (
      <div className="flex items-center gap-3">
        <StatusPill status="idle" label="Browser preview" />
        <span className="text-xs font-mono text-[var(--fg-2)]">
          Simulated engine. Device settings are remembered for this session
          only.
        </span>
      </div>
    );
  }
  if (!status) {
    return (
      <span className="text-xs font-mono text-[var(--fg-2)]">
        Waiting for the engine…
      </span>
    );
  }
  const healthy = status.mode === "Hardware" && !status.last_error;
  const rows: [string, string][] = [
    [
      "Mode",
      status.mode === "Hardware"
        ? "Hardware"
        : status.mode === "Headless"
          ? "Headless (no audio device)"
          : "Stopped",
    ],
    [
      "Output",
      status.output
        ? `${status.output.device_name} · ${status.output.channels} ch · ${status.output.sample_format}`
        : "none",
    ],
    [
      "Input",
      status.input
        ? `${status.input.device_name} · ${status.input.channels} ch · ${status.input.sample_format}`
        : "none (tuner and recording are silent)",
    ],
    [
      "Clock",
      `${status.sample_rate} Hz · ${status.output?.buffer_frames ?? "driver-default"} frame buffer`,
    ],
    ["Stream errors", String(status.stream_errors)],
    ["Input gaps", String(status.input_gaps)],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <StatusPill
          status={
            healthy ? "ok" : status.mode === "Hardware" ? "live" : "error"
          }
          label={
            healthy
              ? "Running"
              : status.mode === "Hardware"
                ? "Running with warnings"
                : "No audio"
          }
        />
        <Button size="sm" onClick={onRestart} disabled={busy}>
          Restart audio
        </Button>
      </div>
      {status.last_error && (
        <p className="text-xs font-mono text-[var(--record)] bg-[rgba(224,83,78,0.08)] border border-[var(--record)] rounded p-2">
          {status.last_error}
        </p>
      )}
      <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs font-mono">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[var(--fg-2)] uppercase tracking-wider">{k}</dt>
            <dd className="text-[var(--fg-0)]">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export const Settings: React.FC = () => {
  const {
    devices,
    settings,
    engineStatus,
    isPreview,
    keysPresent,
    refreshDevices,
    loadSettings,
    applyAudioConfig,
    refreshEngineStatus,
    restartEngine,
    checkKey,
    setKey,
    deleteKey,
  } = useEngineStore();

  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [elevenKeyInput, setElevenKeyInput] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    refreshDevices();
    loadSettings();
    refreshEngineStatus();
    checkKey("gemini");
    checkKey("elevenlabs");
  }, [refreshDevices, loadSettings, refreshEngineStatus, checkKey]);

  const applyAudio = async (patch: Partial<AudioConfig>) => {
    if (!settings) return;
    const config: AudioConfig = {
      input_device: settings.input_device ?? null,
      output_device: settings.output_device ?? null,
      input_channel: settings.input_channel,
      sample_rate: settings.sample_rate,
      buffer_size: settings.buffer_size,
      ...patch,
    };
    setApplying(true);
    try {
      await applyAudioConfig(config);
    } finally {
      setApplying(false);
    }
  };

  const selectedInput = devices.inputs.find(
    (d) => d.name === settings?.input_device,
  );
  const inputChannels =
    selectedInput?.channels ??
    devices.inputs.find((d) => d.is_default)?.channels ??
    2;
  const channelNumbers = Array.from(
    { length: Math.max(inputChannels, (settings?.input_channel ?? 2) + 1) },
    (_, i) => i + 1,
  );
  const bufferMs = (frames: number) =>
    ((frames / (engineStatus?.sample_rate ?? 48000)) * 1000).toFixed(1);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <Panel title="Audio Engine">
        <EngineStatusView
          status={engineStatus}
          isPreview={isPreview}
          onRestart={restartEngine}
          busy={applying}
        />
      </Panel>

      <Panel title="Audio Devices">
        <p className="text-xs font-mono text-[var(--fg-2)] mb-4">
          Changes apply immediately (the engine restarts on the new device) and
          are saved. Use one interface for both input and output so the tuner
          and the band share a clock.
        </p>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
              Output Device
              <select
                value={settings?.output_device ?? ""}
                disabled={applying}
                onChange={(e) =>
                  applyAudio({ output_device: e.target.value || null })
                }
                className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
              >
                <option value="">System default output</option>
                {devices.outputs.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name} ({d.channels} ch{d.is_default ? ", default" : ""})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
              Input Device (guitar DI)
              <select
                value={settings?.input_device ?? ""}
                disabled={applying}
                onChange={(e) =>
                  applyAudio({ input_device: e.target.value || null })
                }
                className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
              >
                <option value="">System default input</option>
                {devices.inputs.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name} ({d.channels} ch{d.is_default ? ", default" : ""})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div>
              <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
                Input Channel
                <select
                  value={(settings?.input_channel ?? 2) + 1}
                  disabled={applying}
                  onChange={(e) =>
                    applyAudio({
                      input_channel: Number.parseInt(e.target.value, 10) - 1,
                    })
                  }
                  className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
                >
                  {channelNumbers.map((ch) => (
                    <option key={ch} value={ch}>
                      Channel {ch}
                      {ch === 3 ? " (HeadRush dry DI)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
                Sample Rate
                <select
                  value={settings?.sample_rate ?? 48000}
                  disabled={applying}
                  onChange={(e) =>
                    applyAudio({
                      sample_rate: Number.parseInt(e.target.value, 10) || 48000,
                    })
                  }
                  className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
                >
                  <option value={44100}>44.1 kHz</option>
                  <option value={48000}>48 kHz</option>
                  <option value={96000}>96 kHz</option>
                </select>
              </label>
            </div>
            <div>
              <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
                Buffer Size
                <select
                  value={settings?.buffer_size ?? 256}
                  disabled={applying}
                  onChange={(e) =>
                    applyAudio({
                      buffer_size: Number.parseInt(e.target.value, 10) || 256,
                    })
                  }
                  className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded text-sm font-mono"
                >
                  {[64, 128, 256, 512, 1024].map((n) => (
                    <option key={n} value={n}>
                      {n} frames ({bufferMs(n)} ms)
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => refreshDevices()}>
              Rescan devices
            </Button>
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
          <p className="text-xs font-mono text-[var(--fg-2)]">
            Keys never reach the UI. Every request goes through the Rust{" "}
            <code>provider_fetch</code> proxy, which only talks to allow-listed
            hosts and writes one line per call to the usage log below (no
            request bodies).
          </p>
        </div>
      </Panel>

      <UsageLog />
    </div>
  );
};

const UsageLog: React.FC = () => {
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [totals, setTotals] = useState<CostTotal[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [e, t] = await Promise.all([
        ipc.invoke<CostEntry[]>("cost_log_list", { limit: 30 }),
        ipc.invoke<CostTotal[]>("cost_log_totals"),
      ]);
      setEntries(e);
      setTotals(t);
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    load();
    let unlisten: (() => void) | undefined;
    ipc
      .listen<CostTotal[]>("cost.state", (t) => {
        setTotals(t);
        load();
      })
      .then((u) => {
        unlisten = u;
      });
    return () => unlisten?.();
  }, [load]);

  return (
    <Panel title="Network usage log">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-3 text-xs font-mono text-[var(--fg-1)]">
          {totals.length === 0 && (
            <span className="text-[var(--fg-2)]">No provider calls yet.</span>
          )}
          {totals.map((t) => (
            <span
              key={t.provider}
              className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--bg-2)]"
            >
              {t.provider}: {t.calls} call{t.calls === 1 ? "" : "s"}
              {t.failures > 0 && ` (${t.failures} failed)`} ·{" "}
              {formatBytes(t.bytesOut)} out / {formatBytes(t.bytesIn)} in
            </span>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={() => load()}>
          Refresh
        </Button>
      </div>
      {error && (
        <div className="text-xs font-mono text-[var(--danger,#e5534b)]">
          {error}
        </div>
      )}
      {entries.length > 0 && (
        <ul className="font-mono text-xs divide-y divide-[var(--line)] max-h-56 overflow-y-auto">
          {[...entries].reverse().map((e) => (
            <li
              key={`${e.atMs}-${e.provider}-${e.path}`}
              className="py-1.5 flex items-center gap-3"
            >
              <span className="text-[var(--fg-2)] w-36 shrink-0 tabular-nums">
                {new Date(e.atMs).toLocaleString([], {
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span
                className={`w-10 shrink-0 tabular-nums ${
                  e.error || e.status >= 400
                    ? "text-[var(--danger,#e5534b)]"
                    : "text-[var(--fg-0)]"
                }`}
              >
                {e.error ? "ERR" : e.status}
              </span>
              <span className="text-[var(--fg-0)] w-24 shrink-0">
                {e.provider}
              </span>
              <span
                className="text-[var(--fg-2)] truncate"
                title={e.error ?? e.path}
              >
                {e.method} {e.path}
              </span>
              <span className="ml-auto text-[var(--fg-2)] tabular-nums shrink-0">
                {e.durationMs} ms · {formatBytes(e.bytesOut)}↑{" "}
                {formatBytes(e.bytesIn)}↓
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
