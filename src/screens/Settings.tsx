import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { AiSettings } from "../components/AiSettings";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { StatusPill } from "../components/States";
import { WorkspaceHeader, WorkspaceViews } from "../components/Workspace";
import { ipc } from "../ipc/client";
import type {
  AudioConfig,
  CostEntry,
  CostTotal,
  EngineStatus,
  IdleCpuSample,
} from "../ipc/contract";
import { bundledControlMaps } from "../lib/controls";
import { withNextStep } from "../lib/loudError";
import { lastMeterFps, lastPlayheadFps } from "../lib/meterFps";
import { type ReducedMotion, readReducedMotion } from "../lib/reducedMotion";
import { saveReducedMotion } from "../lib/roomActions";
import { useSettingsView } from "../lib/settingsView";
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
        Waiting for the engine.
      </span>
    );
  }
  const healthy = status.mode === "Hardware" && !status.last_error;
  const rows: [string, string][] = [
    [
      "This is the mode.",
      status.mode === "Hardware"
        ? "This is hardware."
        : status.mode === "Headless"
          ? "This is headless. This has no audio device."
          : "This is stopped.",
    ],
    [
      "This is the output.",
      status.output
        ? `${status.output.device_name}. ${status.output.sample_rate} Hz. ${status.output.channels} channels. ${status.output.sample_format}.`
        : "No output device.",
    ],
    [
      "This is the input.",
      status.input
        ? `${status.input.device_name}. ${status.input.sample_rate} Hz. ${status.input.channels} channels. ${status.input.sample_format}.`
        : "No input device. Tuner and recording are silent.",
    ],
    [
      "This is the clock.",
      `${status.sample_rate} Hz. The driver buffer is ${status.output?.buffer_frames ?? "default"} frames. Rendered in blocks of at most 1024 frames.`,
    ],
    [
      "These are the stream errors.",
      `The stream has ${status.stream_errors} errors.`,
    ],
    ["These are the input gaps.", `The input has ${status.input_gaps} gaps.`],
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
              ? "The engine is running."
              : status.mode === "Hardware"
                ? "The engine is running with warnings."
                : "There is no audio."
          }
        />
        <Button size="sm" onClick={onRestart} disabled={busy}>
          Restart this audio.
        </Button>
      </div>
      {status.last_error && (
        <p className="text-xs font-mono text-[var(--record)] bg-[var(--record-soft)] border border-[var(--record)] rounded-[var(--radius-m)] p-2">
          {withNextStep(status.last_error)}
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
    refreshDevices,
    loadSettings,
    applyAudioConfig,
    refreshEngineStatus,
    restartEngine,
    latencySamples,
    latencyEstimated,
    calibrating,
    isRecording,
    calibrateLatency,
    ensureAssets,
    assetPacks,
    exportLogs,
    xruns,
    kitMessage,
    bassMessage,
  } = useEngineStore(
    useShallow((s) => ({
      devices: s.devices,
      settings: s.settings,
      engineStatus: s.engineStatus,
      isPreview: s.isPreview,
      refreshDevices: s.refreshDevices,
      loadSettings: s.loadSettings,
      applyAudioConfig: s.applyAudioConfig,
      refreshEngineStatus: s.refreshEngineStatus,
      restartEngine: s.restartEngine,
      latencySamples: s.latencySamples,
      latencyEstimated: s.latencyEstimated,
      calibrating: s.calibrating,
      isRecording: s.isRecording,
      calibrateLatency: s.calibrateLatency,
      ensureAssets: s.ensureAssets,
      assetPacks: s.assetPacks,
      exportLogs: s.exportLogs,
      xruns: s.telemetry.xruns,
      kitMessage: s.telemetry.band.kit_message,
      bassMessage: s.telemetry.band.bass_message,
    })),
  );
  const [appVersion, setAppVersion] = useState("…");
  const [logPath, setLogPath] = useState<string | null>(null);
  const [meterFps, setMeterFps] = useState(0);
  const [playheadFps, setPlayheadFps] = useState(0);
  const [idleCpu, setIdleCpu] = useState<IdleCpuSample | null>(null);
  const [idleBusy, setIdleBusy] = useState(false);

  useEffect(() => {
    void ipc
      .invoke<string>("app_version")
      .then(setAppVersion)
      .catch((e) => {
        const text = `Version unavailable. ${String(e)}`;
        setAppVersion(text);
        useEngineStore.getState().notify("error", text);
      });
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMeterFps(lastMeterFps());
      setPlayheadFps(lastPlayheadFps());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const { view } = useSettingsView();
  const setView = (view: string) => useSettingsView.setState({ view });
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    refreshDevices();
    loadSettings();
    refreshEngineStatus();
  }, [refreshDevices, loadSettings, refreshEngineStatus]);

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
      <WorkspaceHeader
        screen="settings"
        title="Make the studio yours."
        description="Set up your interface, choose your AI, and see what your connections use."
      />
      <WorkspaceViews
        labels={["First run", "Audio devices", "AI & models", "Usage"]}
        value={view}
        onChange={setView}
      />
      <div hidden={view !== "First run"} className="workspace-stack">
        <Panel title="This is the first-run checklist.">
          <p className="text-xs font-mono text-[var(--fg-2)] mb-3">
            Walk these steps once, then re-open this page any time. Guitar tone
            stays on the hardware. The WebView never plays audio.
          </p>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>
              Choose the same interface for input and output under Audio
              devices, then the guitar channel.
            </li>
            <li>
              Measure loopback with a cable, or enter the guitar offset. Owner
              gate 2 stays V2.
            </li>
            <li>
              Store provider keys in AI & models. Keys live in the OS keychain.
              Test this key stays not configured. Check this key status looks
              only in the keychain.
            </li>
            <li>
              Open Rig, create a loopMIDI or IAC port, then Check this virtual
              MIDI. HeadRush and Black Spirit are not claimed here.
            </li>
            <li>
              Check these sample packs After unpack, the band plays
              kit.json/WAVs and FreePats bass.sf2/comp.sf2 from
              JosefinesJamstudio/assets. A missing pack stays synthetic or sine
              and says so. Download needs JAM_LIVE=1. See docs/guide/setup.md.
            </li>
            <li>
              These are the diagnostics. Reduced motion is saved as
              ui.reducedMotion. Meter and playhead fps are rAF reports, not a 60
              fps pass. The tuner starts off so Stage shows tempo and bar.
            </li>
            <li>
              In Songs, import a track, mark the guitar, Check this guitar
              residual, then Load this minus-guitar mix. In Sessions, record a
              take, read Progress from the take files, export, and open
              README.txt. Opening Logic and real-song residual at or below -6 dB
              stay V2 / not claimed.
            </li>
            <li>
              Signing and notarisation are not configured. Installers stay
              unsigned until an Apple Developer account and Windows signing are
              set up. On Mac use right-click Open or{" "}
              <code className="font-mono text-xs">
                xattr -dr com.apple.quarantine
              </code>
              .
            </li>
          </ol>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" onClick={() => setView("Audio devices")}>
              Audio devices
            </Button>
            <Button size="sm" onClick={() => setView("AI & models")}>
              Open these API keys.
            </Button>
            <Button
              size="sm"
              onClick={() => useEngineStore.getState().setScreen("rig")}
            >
              Open these Rig ports.
            </Button>
            <Button
              size="sm"
              onClick={() => useEngineStore.getState().setScreen("songs")}
            >
              Songs
            </Button>
            <Button
              size="sm"
              onClick={() => useEngineStore.getState().setScreen("sessions")}
            >
              Sessions
            </Button>
            <Button size="sm" onClick={() => void ensureAssets()}>
              Check these sample packs.
            </Button>
          </div>
        </Panel>
        <Panel title="These are the sample packs.">
          <p className="text-xs font-mono text-[var(--fg-2)] mb-3">
            GitHub Release assets-v1 records standard-rock-kit-acoustic.zip and
            freepats-bass-comp.zip. Download needs JAM_LIVE=1. After unpack the
            band plays the acoustic kit and SoundFonts; a missing pack stays
            synthetic or sine and says so.
          </p>
          <p className="text-xs font-mono text-[var(--fg-0)] mb-3">
            {kitMessage}
          </p>
          <p className="text-xs font-mono text-[var(--fg-2)] mb-3">
            {bassMessage}
          </p>
          {assetPacks.map((pack) => (
            <p
              key={pack.id}
              className="text-xs font-mono text-[var(--fg-0)] mb-1"
            >
              {pack.name}: {pack.state}
              {pack.state === "downloading" ? ` ${pack.percent ?? 0}%` : ""}
            </p>
          ))}
          <Button size="sm" onClick={() => void ensureAssets()}>
            Check these sample packs.
          </Button>
        </Panel>
      </div>
      <div hidden={view !== "Audio devices"} className="workspace-stack">
        <Panel title="This is the audio engine.">
          <EngineStatusView
            status={engineStatus}
            isPreview={isPreview}
            onRestart={restartEngine}
            busy={applying}
          />
        </Panel>
        <Panel title="These are the diagnostics.">
          <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs font-mono mb-3">
            <div className="contents">
              <dt className="text-[var(--fg-2)] uppercase tracking-wider">
                Version
              </dt>
              <dd className="text-[var(--fg-0)]">{appVersion}</dd>
            </div>
            <div className="contents">
              <dt className="text-[var(--fg-2)] uppercase tracking-wider">
                Xruns
              </dt>
              <dd className="text-[var(--fg-0)]">{xruns}</dd>
            </div>
            <div className="contents">
              <dt className="text-[var(--fg-2)] uppercase tracking-wider">
                Control map
              </dt>
              <dd className="text-[var(--fg-0)]">
                {bundledControlMaps()
                  .map((map) => `${map.name} (${map.id})`)
                  .join(". ")}
                . Bindings are Jo tools plus push-to-talk.
              </dd>
            </div>
            <div className="contents">
              <dt className="text-[var(--fg-2)] uppercase tracking-wider">
                Logs
              </dt>
              <dd className="text-[var(--fg-0)]">
                {logPath ?? "~/JosefinesJamstudio/logs"}
              </dd>
            </div>
            <div className="contents">
              <dt className="text-[var(--fg-2)] uppercase tracking-wider">
                Meter fps
              </dt>
              <dd className="text-[var(--fg-0)]">
                {meterFps > 0
                  ? `${meterFps.toFixed(0)} rAF frames/s. DESIGN 60 fps is not proven on a fixture run.`
                  : "Not measured. Open Stage so a canvas meter paints."}
              </dd>
            </div>
            <div className="contents">
              <dt className="text-[var(--fg-2)] uppercase tracking-wider">
                Playhead fps
              </dt>
              <dd className="text-[var(--fg-0)]">
                {playheadFps > 0
                  ? `${playheadFps.toFixed(0)} rAF frames/s. DESIGN 60 fps is not proven on a fixture run.`
                  : "Not measured. Open Stage or Library so a canvas playhead paints."}
              </dd>
            </div>
            <div className="contents">
              <dt className="text-[var(--fg-2)] uppercase tracking-wider">
                Reduced motion
              </dt>
              <dd className="text-[var(--fg-0)]">
                <select
                  aria-label="Choose the reduced motion."
                  className="px-2 py-1 rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-2)]"
                  value={readReducedMotion(settings)}
                  onChange={(e) => {
                    const reducedMotion = e.target.value as ReducedMotion;
                    void saveReducedMotion(reducedMotion);
                  }}
                >
                  <option value="system">Match the OS.</option>
                  <option value="on">Always reduce motion.</option>
                  <option value="off">Never reduce motion.</option>
                </select>
              </dd>
            </div>
            <div className="contents">
              <dt className="text-[var(--fg-2)] uppercase tracking-wider">
                Idle CPU
              </dt>
              <dd className="text-[var(--fg-0)]">
                {idleCpu
                  ? idleCpu.message
                  : "Idle CPU is not proven. Sample this process; DESIGN under 3% still needs a desktop WebView+engine idle fixture."}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={idleBusy}
              onClick={() => {
                setIdleBusy(true);
                void ipc
                  .invoke<IdleCpuSample>("diagnostics_idle_cpu")
                  .then(setIdleCpu)
                  .finally(() => setIdleBusy(false));
              }}
            >
              Sample this idle CPU.
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void exportLogs().then((result) => {
                  if (result.ok) setLogPath(result.value);
                });
              }}
            >
              Export these logs.
            </Button>
          </div>
        </Panel>

        <Panel title="These are the audio devices.">
          <p className="text-xs font-mono text-[var(--fg-2)] mb-4">
            Changes apply immediately (the engine restarts on the new device)
            and are saved. Use one interface for both input and output so the
            tuner and the band share a clock.
          </p>
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
                Choose the output device.
                <select
                  value={settings?.output_device ?? ""}
                  disabled={applying}
                  onChange={(e) =>
                    applyAudio({ output_device: e.target.value || null })
                  }
                  className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded-[var(--radius-m)] text-sm font-mono"
                >
                  <option value="">Use the system default output.</option>
                  {devices.outputs.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name} ({d.channels} ch{d.is_default ? ", default" : ""}
                      )
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
                Choose the guitar DI input.
                <select
                  value={settings?.input_device ?? ""}
                  disabled={applying}
                  onChange={(e) =>
                    applyAudio({ input_device: e.target.value || null })
                  }
                  className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded-[var(--radius-m)] text-sm font-mono"
                >
                  <option value="">Use the system default input.</option>
                  {devices.inputs.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name} ({d.channels} ch{d.is_default ? ", default" : ""}
                      )
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              <div>
                <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
                  Choose the input channel.
                  <select
                    value={(settings?.input_channel ?? 2) + 1}
                    disabled={applying}
                    onChange={(e) =>
                      applyAudio({
                        input_channel: Number.parseInt(e.target.value, 10) - 1,
                      })
                    }
                    className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded-[var(--radius-m)] text-sm font-mono"
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
                  Choose the sample rate.
                  <select
                    value={settings?.sample_rate ?? 48000}
                    disabled={applying}
                    onChange={(e) =>
                      applyAudio({
                        sample_rate:
                          Number.parseInt(e.target.value, 10) || 48000,
                      })
                    }
                    className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded-[var(--radius-m)] text-sm font-mono"
                  >
                    <option value={44100}>44.1 kHz</option>
                    <option value={48000}>48 kHz</option>
                    <option value={96000}>96 kHz</option>
                  </select>
                </label>
              </div>
              <div>
                <label className="block text-xs uppercase font-mono text-[var(--fg-2)] mb-1">
                  Choose the buffer size.
                  <select
                    value={settings?.buffer_size ?? 256}
                    disabled={applying}
                    onChange={(e) =>
                      applyAudio({
                        buffer_size: Number.parseInt(e.target.value, 10) || 256,
                      })
                    }
                    className="mt-1 block w-full bg-[var(--bg-2)] border border-[var(--line)] text-[var(--fg-0)] p-2 rounded-[var(--radius-m)] text-sm font-mono"
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refreshDevices()}
              >
                Rescan these devices.
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="This is guitar alignment.">
          <p className="text-xs font-mono text-[var(--fg-2)] mb-3">
            Connect a cable from an output to the guitar input (or Scarlett
            Loopback), then Measure loopback. Three clicks play; the app stores
            the round-trip offset for this device. Remove the cable afterwards.
            Without a loopback you get a 2× buffer estimate. Software monitoring
            stays off.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              disabled={applying || calibrating || isRecording || isPreview}
              onClick={() => void calibrateLatency()}
            >
              {calibrating ? "Measuring the loopback." : "Measure loopback"}
            </Button>
            <span className="text-xs font-mono text-[var(--fg-0)]">
              {latencySamples} samples.{" "}
              {(
                (latencySamples * 1000) /
                (engineStatus?.sample_rate ?? 48000)
              ).toFixed(1)}{" "}
              ms.
              {latencyEstimated ? " This is estimated." : ""}
            </span>
            {isPreview && (
              <span className="text-xs font-mono text-[var(--fg-2)]">
                Browser preview cannot measure a physical loopback.
              </span>
            )}
          </div>
        </Panel>
      </div>
      <div hidden={view !== "AI & models"}>
        <AiSettings />
      </div>

      <div hidden={view !== "Usage"}>
        <UsageLog />
      </div>
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
    let closed = false;
    let unlisten: (() => void) | undefined;
    ipc
      .listen<CostTotal[]>("cost.state", (t) => {
        setTotals(t);
        load();
      })
      .then((u) => {
        if (closed) u();
        else unlisten = u;
      })
      .catch((e) => setError(String(e)));
    return () => {
      closed = true;
      unlisten?.();
    };
  }, [load]);

  return (
    <Panel title="This is the network usage log.">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-3 text-xs font-mono text-[var(--fg-1)]">
          {!error && totals.length === 0 && (
            <span className="text-[var(--fg-2)]">No provider calls yet.</span>
          )}
          {!error &&
            totals.map((t) => (
              <span
                key={t.provider}
                className="px-2 py-1 rounded-[var(--radius-m)] border border-[var(--line)] bg-[var(--bg-2)]"
              >
                {t.provider} has {t.calls} call{t.calls === 1 ? "" : "s"}
                {t.failures > 0 && ` (${t.failures} failed)`}.{" "}
                {t.invalidValues ? (
                  "Usage amounts are unavailable. Check this provider's local usage log for invalid values."
                ) : (
                  <>
                    {formatBytes(t.bytesOut)} out. {formatBytes(t.bytesIn)} in.
                    {t.sttSeconds > 0 &&
                      ` ${t.sttSeconds.toFixed(1)} STT seconds.`}
                    {t.ttsCharacters > 0 &&
                      ` ${t.ttsCharacters} TTS characters.`}
                    {t.totalTokens > 0 && ` ${t.totalTokens} LLM tokens.`}
                    {t.estimatedCostUsd != null &&
                      ` Estimated cost is $${t.estimatedCostUsd.toFixed(4)}.`}
                    {t.unpricedCalls > 0 &&
                      ` ${t.unpricedCalls} calls have unknown cost.`}
                  </>
                )}
              </span>
            ))}
        </div>
        <Button size="sm" variant="secondary" onClick={() => load()}>
          Refresh this usage.
        </Button>
      </div>
      <p className="text-xs text-[var(--fg-1)] mb-3">
        Totals cover the latest 10,000 valid log entries across all providers,
        including failed or interrupted requests. Older entries remain in the
        log. Estimates use the price saved for each request, exclude unknown
        costs, and are not invoices or spending limits. LLM token counts are
        provider-reported when present. Set speech prices in Jo AI → Voice
        setup; check your provider dashboard for actual charges.
      </p>
      {error && (
        <div className="text-xs font-mono text-[var(--record)]">{error}</div>
      )}
      {!error && entries.length > 0 && (
        <ul className="font-mono text-xs divide-y divide-[var(--line)] max-h-56 overflow-y-auto">
          {[...entries].reverse().map((e) => (
            <li
              key={`${e.atMs}-${e.provider}-${e.path}`}
              className="py-1.5 flex flex-wrap items-center gap-3"
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
                    ? "text-[var(--record)]"
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
              {e.model && (
                <span className="text-[var(--fg-1)] break-all">
                  {e.model}.{" "}
                  {e.estimatedCostUsd == null
                    ? "Cost is unknown."
                    : `Estimated cost is $${e.estimatedCostUsd.toFixed(4)}.`}
                </span>
              )}
              {e.sttSeconds != null && (
                <span>{e.sttSeconds.toFixed(1)} STT seconds.</span>
              )}
              {e.ttsCharacters != null && (
                <span>{e.ttsCharacters} TTS characters.</span>
              )}
              {e.totalTokens != null && (
                <span>{e.totalTokens} LLM tokens.</span>
              )}
              <span className="ml-auto text-[var(--fg-2)] tabular-nums shrink-0">
                {e.durationMs} ms. {formatBytes(e.bytesOut)} sent.{" "}
                {formatBytes(e.bytesIn)} received.
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
