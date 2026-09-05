/**
 * Desktop startup, end to end: the store's `initListeners()` (what `App` runs on
 * mount) against the real ipc client routed to the simulated preview engine.
 * Proves the store ends up holding what the top bar, the Stage and the Settings
 * room render from, that live telemetry flows only while subscribed, and that
 * settings round-trip through the engine. No ipc mocks: spies only observe calls.
 *
 * The engine auto-ticks on a real interval; fake timers are installed before it is
 * created so every test drives simulated time explicitly with `engine.tick()`.
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ipc, isPreview, isTauri } from "../../src/ipc/client";
import type {
  AppSettings,
  AudioConfig,
  EngineStatus,
  TransportTelemetry,
} from "../../src/ipc/contract";
import type { PreviewEngine } from "../../src/ipc/preview";
import { useEngineStore } from "../../src/store/engine";

const PREVIEW_KEY = "__jamPreviewEngine";
type PreviewHolder = { [PREVIEW_KEY]?: Promise<PreviewEngine> };

const PREVIEW_LAST_ERROR =
  "Browser preview: simulated engine, no audio is produced";

const BASELINE_CONFIG: AudioConfig = {
  input_device: null,
  output_device: null,
  input_channel: 2,
  sample_rate: 48_000,
  buffer_size: 256,
};

/** The engine the ipc client talks to (created lazily on the first call). */
async function previewEngine(): Promise<PreviewEngine> {
  const holder = globalThis as unknown as PreviewHolder;
  if (!holder[PREVIEW_KEY]) await ipc.invoke("engine_status");
  const engine = await holder[PREVIEW_KEY];
  if (!engine)
    throw new Error("the ipc client did not create a preview engine");
  return engine;
}

/** Advance simulated time in small steps, like the engine's own 30 Hz timer. */
function advance(engine: PreviewEngine, seconds: number, step = 0.1): void {
  const steps = Math.round(seconds / step);
  for (let i = 0; i < steps; i++) engine.tick(step);
}

function store() {
  return useEngineStore.getState();
}

describe("desktop startup against the preview engine", () => {
  let engine: PreviewEngine;
  let previous: ReturnType<typeof useEngineStore.getState>;
  let cleanups: Array<() => void>;

  /** `App` mounting: subscribe, refresh status, reload the library, load settings. */
  async function startDesktop(): Promise<() => void> {
    const cleanup = await store().initListeners();
    cleanups.push(cleanup);
    return cleanup;
  }

  beforeAll(async () => {
    vi.useFakeTimers();
    engine = await previewEngine();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    previous = useEngineStore.getState();
    cleanups = [];
    // Refused commands are reported as notices; keep the console quiet.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    for (const cleanup of cleanups) cleanup();
    // The engine is a singleton across tests: put it back where a fresh launch starts.
    await engine.invoke("transport_stop", {});
    await engine.invoke("transport_set_loop", {
      startBar: 1,
      endBar: 5,
      enabled: false,
    });
    await engine.invoke("transport_set_count_in", { bars: 1 });
    await engine.invoke("band_load_chart", {
      chartId: "blues-12-bar",
      followChart: true,
    });
    await engine.invoke("audio_set_config", { config: BASELINE_CONFIG });
    vi.restoreAllMocks();
    useEngineStore.setState(previous, true);
  });

  it("routes the ui to the simulated engine outside tauri and says so in the store", async () => {
    expect(isTauri).toBe(false);
    expect(isPreview).toBe(true);
    expect(store().isPreview).toBe(true);
    const status = await ipc.invoke<EngineStatus>("engine_status");
    expect(status.mode).toBe("Headless");
    // A misspelt command is refused by name, never silently ignored.
    await expect(ipc.invoke("engine_statuz")).rejects.toThrow(
      'preview engine: unknown command "engine_statuz"',
    );
  });

  it("publishes the headless engine status the top bar pill renders from", async () => {
    expect(previous.engineStatus).toBeNull();
    await startDesktop();
    expect(store().engineStatus).toEqual({
      mode: "Headless",
      running: true,
      output: null,
      input: null,
      sample_rate: 48_000,
      buffer_size: 256,
      last_error: PREVIEW_LAST_ERROR,
      stream_errors: 0,
      input_gaps: 0,
    });
    // "Restart audio" in the settings room keeps the same honest answer.
    await store().restartEngine();
    expect(store().engineStatus?.mode).toBe("Headless");
    expect(store().engineStatus?.last_error).toBe(PREVIEW_LAST_ERROR);
    // In the preview the loud last_error is a banner, not a toast.
    expect(store().notices).toEqual([]);
  });

  it("fills the library with the bundled styles and charts and opens the standard 12-bar blues", async () => {
    expect(previous.styles).toEqual([]);
    expect(previous.charts).toEqual([]);
    expect(previous.currentChart).toBeNull();
    await startDesktop();
    const { styles, charts, currentChart, libraryInfo } = store();
    expect(styles.map((s) => s.name)).toEqual([
      "Blues Shuffle",
      "Funk 16th Groove",
      "Heavy Metal Gallop",
      "Jazz Swing",
      "Rock Straight 8th",
      "Slow 6/8 Ballad",
    ]);
    expect(styles.map((s) => s.id)).toEqual([
      "blues-shuffle",
      "funk-16",
      "metal-gallop",
      "jazz-swing",
      "rock-straight",
      "ballad-68",
    ]);
    for (const s of styles) {
      expect(s.schemaVersion).toBe(1);
      expect(s.feel.timeSig).toHaveLength(2);
      expect(s.feel.bpmRange[0]).toBeLessThan(s.feel.bpmRange[1]);
    }
    expect(charts.map((c) => c.id)).toEqual([
      "blues-quick-change",
      "blues-12-bar",
      "rock-16-bar",
      "blues-8-bar",
      "i-v-vi-iv",
      "ii-v-i",
      "blues-minor",
      "one-chord-vamp",
      "rock-song-form",
    ]);
    for (const c of charts) {
      expect(c.schemaVersion).toBe(1);
      expect(c.sections.length).toBeGreaterThan(0);
      expect(c.arrangement.length).toBeGreaterThan(0);
    }
    expect(currentChart?.id).toBe("blues-12-bar");
    expect(currentChart?.name).toBe("12-Bar Blues (Standard)");
    expect(currentChart?.defaultBpm).toBe(110);
    expect(currentChart?.defaultStyleId).toBe("blues-shuffle");
    expect(libraryInfo).toEqual({
      stylesDir: "(preview) ~/JosefinesJamstudio/styles",
      chartsDir: "(preview) ~/JosefinesJamstudio/charts",
      userChartIds: [],
      loadErrors: [],
    });
    expect(store().notices).toEqual([]);
  });

  it("loads settings with a schema version and stays quiet when the engine has no recovery notice", async () => {
    expect(previous.settings).toBeNull();
    const invoke = vi.spyOn(ipc, "invoke");
    await startDesktop();
    expect(store().settings).toEqual({
      schemaVersion: 1,
      input_device: null,
      output_device: null,
      input_channel: 2,
      sample_rate: 48_000,
      buffer_size: 256,
    });
    const recoveryCalls = invoke.mock.calls.filter(
      ([cmd]) => cmd === "settings_recovery_notice",
    );
    expect(recoveryCalls).toHaveLength(1);
    const recoveryIndex = invoke.mock.calls.findIndex(
      ([cmd]) => cmd === "settings_recovery_notice",
    );
    await expect(invoke.mock.results[recoveryIndex].value).resolves.toBeNull();
    expect(store().notices).toEqual([]);
    // The settings room reloads on open: still one question, still no false alarm.
    await store().loadSettings();
    expect(
      invoke.mock.calls.filter(([cmd]) => cmd === "settings_recovery_notice"),
    ).toHaveLength(2);
    expect(store().notices).toEqual([]);
    expect(store().settings?.schemaVersion).toBe(1);
  });

  it("asks the engine for exactly the startup commands and subscribes to every live channel", async () => {
    const invoke = vi.spyOn(ipc, "invoke");
    const listen = vi.spyOn(ipc, "listen");
    await startDesktop();
    expect(invoke.mock.calls.map(([cmd]) => cmd).sort()).toEqual([
      "band_list_charts",
      "band_list_styles",
      "band_load_chart",
      "engine_status",
      "library_reload",
      "settings_get",
      "settings_recovery_notice",
    ]);
    expect(
      invoke.mock.calls.find(([cmd]) => cmd === "band_load_chart")?.[1],
    ).toEqual({ chartId: "blues-12-bar", followChart: true });
    expect(listen.mock.calls.map(([event]) => event).sort()).toEqual([
      "app.error",
      "band.state",
      "engine.status",
      "input.meters",
      "meters",
      "recorder.error",
      "reference.state",
      "rig.error",
      "rig.state",
      "transport.state",
      "tuner.state",
    ]);
    const reference = {
      asset_id: "fixture",
      label: "Reference",
      seconds: 4,
      position: 1,
      state: "playing",
      loop_start: 0,
      loop_end: 4,
      loop_enabled: false,
    };
    const onReference = listen.mock.calls.find(
      ([event]) => event === "reference.state",
    )?.[1];
    expect(onReference).toBeDefined();
    onReference?.(reference);
    expect(store().telemetry.reference).toEqual(reference);
    expect(store().activeSource).toBe("song");
    onReference?.(null);
    expect(store().telemetry.reference).toBeNull();
    expect(store().activeSource).toBe("band");
  });

  it("delivers live telemetry to the store only once the engine ticks", async () => {
    await startDesktop();
    // Nothing has ticked: the store still shows its own defaults, not the chart's.
    expect(store().telemetry.transport.bpm).toBe(120);
    expect(store().telemetry.band.next_chord).toBe("D7");
    expect(store().telemetry.tuner).toBeNull();

    engine.tick(0);
    const { transport, band, output_level, input_level, tuner } =
      store().telemetry;
    expect(transport.state).toBe("stopped");
    expect(transport.bpm).toBe(110);
    expect(transport.time_signature).toEqual([4, 4]);
    expect(transport.bar).toBe(1);
    expect(transport.beat).toBe(1);
    expect(transport.count_in_bars).toBe(1);
    expect(band.style_id).toBe("blues-shuffle");
    expect(band.style_name).toBe("Blues Shuffle");
    expect(band.current_chord).toBe("A7");
    expect(band.next_chord).toBe("A7");
    expect(band.current_section).toBe("Chorus");
    expect(band.intensity).toBe(0.5);
    expect(output_level).toEqual({ peak_db: -180, rms_db: -186 });
    expect(input_level).toEqual({ peak_db: -180, rms_db: -180 });
    expect(tuner?.note).toBe("A4");
    expect(tuner?.confidence).toBe(0.9);
    expect(Math.abs((tuner?.hz ?? 0) - 440)).toBeLessThan(2);
    expect(Math.abs(tuner?.cents ?? 99)).toBeLessThanOrEqual(6);
    expect(store().engineStatus?.last_error).toBe(PREVIEW_LAST_ERROR);
  });

  it("pressing play counts in, then the band walks the chart bar by bar until stop", async () => {
    await startDesktop();
    engine.tick(0);
    await store().transportSetTempo(120);
    await store().transportSetCountIn(1);
    engine.tick(0);
    expect(store().telemetry.transport.bpm).toBe(120);
    expect(store().telemetry.transport.count_in_bars).toBe(1);
    expect(store().telemetry.transport.state).toBe("stopped");

    await store().transportPlay();
    engine.tick(0.01);
    expect(store().telemetry.transport.state).toBe("counting_in");
    expect(store().telemetry.transport.bar).toBe(1);
    expect(store().telemetry.output_level.peak_db).toBeGreaterThan(-180);

    // One bar of count-in at 120 BPM in 4/4 is two seconds.
    advance(engine, 2);
    expect(store().telemetry.transport.state).toBe("playing");
    expect(store().telemetry.transport.bar).toBe(1);
    expect(store().telemetry.band.current_chord).toBe("A7");
    expect(store().telemetry.band.current_section).toBe("Chorus");
    expect(store().telemetry.output_level.peak_db).toBeGreaterThan(-30);

    // Four bars later the IV chord arrives.
    advance(engine, 8.1);
    expect(store().telemetry.transport.bar).toBe(5);
    expect(store().telemetry.transport.position_beats).toBeCloseTo(16.2, 6);
    expect(store().telemetry.band.current_chord).toBe("D7");
    expect(store().telemetry.band.next_chord).toBe("D7");

    await store().transportPause();
    engine.tick(0.5);
    expect(store().telemetry.transport.state).toBe("paused");
    expect(store().telemetry.transport.bar).toBe(5);

    await store().transportStop();
    engine.tick(0);
    const { transport, band, output_level } = store().telemetry;
    expect(transport.state).toBe("stopped");
    expect(transport.bar).toBe(1);
    expect(transport.beat).toBe(1);
    expect(transport.position_beats).toBe(0);
    expect(band.current_chord).toBe("A7");
    expect(output_level.peak_db).toBe(-180);
  });

  it("clamps count-in and tempo to the engine's range before they reach the store", async () => {
    await startDesktop();
    await store().transportSetCountIn(9);
    engine.tick(0);
    expect(store().telemetry.transport.count_in_bars).toBe(4);
    await store().transportSetCountIn(-3);
    engine.tick(0);
    expect(store().telemetry.transport.count_in_bars).toBe(0);
    await store().transportSetTempo(999);
    engine.tick(0);
    expect(store().telemetry.transport.bpm).toBe(300);
    await store().transportSetTempo(1);
    engine.tick(0);
    expect(store().telemetry.transport.bpm).toBe(20);
    await store().transportSetTempo(100.26);
    engine.tick(0);
    expect(store().telemetry.transport.bpm).toBe(100.3);
    expect(store().notices).toEqual([]);
  });

  it("stops live updates after cleanup while the engine keeps playing", async () => {
    const cleanup = await startDesktop();
    await store().transportSetCountIn(0);
    await store().transportPlay();
    engine.tick(0.5);
    expect(store().telemetry.transport.state).toBe("playing");
    const frozenTelemetry = store().telemetry;
    const frozenStatus = store().engineStatus;

    cleanup();
    const heard: TransportTelemetry[] = [];
    const off = await engine.listen<TransportTelemetry>(
      "transport.state",
      (t) => heard.push(t),
    );
    advance(engine, 3);
    off();
    expect(heard.length).toBe(30);
    expect(heard.at(-1)?.position_beats).toBeGreaterThan(
      frozenTelemetry.transport.position_beats,
    );
    expect(store().telemetry).toBe(frozenTelemetry);
    expect(store().engineStatus).toBe(frozenStatus);
  });

  it("remounting subscribes once: a tick produces one store update per live channel", async () => {
    const first = await startDesktop();
    first();
    await startDesktop();
    let updates = 0;
    const unsubscribe = useEngineStore.subscribe(() => {
      updates++;
    });
    engine.tick(0);
    unsubscribe();
    // meters, input.meters, transport.state, band.state, tuner.state, engine.status
    expect(updates).toBe(6);
    expect(store().telemetry.transport.bpm).toBe(110);
  });

  it("round-trips a settings change through the engine", async () => {
    await startDesktop();
    const original = store().settings as AppSettings;
    const changed: AppSettings = {
      ...original,
      buffer_size: 512,
      input_channel: 0,
    };
    await ipc.invoke("settings_set", { settings: changed });
    await store().loadSettings();
    expect(store().settings).toEqual(changed);
    expect(store().notices).toEqual([]);

    // Forget what the store knows and ask the engine again.
    useEngineStore.setState({ settings: null });
    await store().loadSettings();
    expect(store().settings).toEqual({
      schemaVersion: 1,
      input_device: null,
      output_device: null,
      input_channel: 0,
      sample_rate: 48_000,
      buffer_size: 512,
    });
    const config = await ipc.invoke<AudioConfig>("audio_get_config");
    expect(config.buffer_size).toBe(512);
    expect(config.input_channel).toBe(0);

    await ipc.invoke("settings_set", { settings: original });
    useEngineStore.setState({ settings: null });
    await store().loadSettings();
    expect(store().settings).toEqual(original);
  });

  it("opening the settings room lists the simulated devices and applies a device change to the engine clock", async () => {
    await startDesktop();
    expect(previous.devices).toEqual({ inputs: [], outputs: [] });
    await store().refreshDevices();
    expect(store().devices).toEqual({
      inputs: [
        {
          name: "Preview Input (simulated)",
          is_default: true,
          channels: 2,
          supported_sample_rates: [48_000],
        },
      ],
      outputs: [
        {
          name: "Preview Output (simulated)",
          is_default: true,
          channels: 2,
          supported_sample_rates: [48_000],
        },
      ],
    });

    const config: AudioConfig = {
      input_device: "Preview Input (simulated)",
      output_device: "Preview Output (simulated)",
      input_channel: 1,
      sample_rate: 44_100,
      buffer_size: 128,
    };
    const status = await store().applyAudioConfig(config);
    expect(status?.sample_rate).toBe(44_100);
    expect(status?.buffer_size).toBe(128);
    expect(store().engineStatus?.sample_rate).toBe(44_100);
    expect(store().settings).toEqual({ schemaVersion: 1, ...config });
    // The preview's status carries a last_error, and the room shows it as a toast.
    expect(store().notices.map((n) => [n.kind, n.text])).toEqual([
      ["error", PREVIEW_LAST_ERROR],
    ]);
    // What the engine now believes is what the next launch reads back.
    const reloaded = await ipc.invoke<AppSettings>("settings_get");
    expect(reloaded).toEqual({ schemaVersion: 1, ...config });
    engine.tick(0);
    expect(store().engineStatus?.buffer_size).toBe(128);
  });

  it("refuses an unknown chart or style by id and leaves the room untouched", async () => {
    await startDesktop();
    engine.tick(0);
    await store().bandLoadChart("no-such-chart");
    expect(store().currentChart?.id).toBe("blues-12-bar");
    expect(store().notices.at(-1)).toMatchObject({
      kind: "error",
      text: 'Load chart: unknown chart "no-such-chart"',
    });

    await store().bandSetStyle("no-such-style");
    expect(store().notices.at(-1)).toMatchObject({
      kind: "error",
      text: 'Style: unknown style "no-such-style"',
    });

    await store().bandSet({ styleId: "no-such-style", intensity: 0.9 });
    expect(store().notices.at(-1)).toMatchObject({
      kind: "error",
      text: 'Band: unknown style "no-such-style"',
    });
    engine.tick(0);
    expect(store().telemetry.band.style_id).toBe("blues-shuffle");
    expect(store().telemetry.band.intensity).toBe(0.5);
    expect(store().telemetry.transport.state).toBe("stopped");
    expect(store().notices).toHaveLength(3);
    expect(console.error).toHaveBeenCalledTimes(3);
  });
});
