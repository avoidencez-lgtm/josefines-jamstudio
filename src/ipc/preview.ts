/**
 * Simulated engine for browser preview. Musical time, chart following, cues, mutes
 * and the library behave like the Rust engine; audio, recording, MIDI and network are
 * faked. Every fake result is labelled as such where a user could see it.
 */

import { resolveChart } from "../lib/chart/text";
import type {
  AiMusicState,
  AudioConfig,
  BandPatch,
  BandTelemetry,
  Chart,
  EngineStatus,
  EngineTelemetry,
  LibraryInfo,
  MeterTelemetry,
  RigCommand,
  RigControl,
  RigProfile,
  RigState,
  SentMidiMessage,
  StyleSummary,
  TakeMetadata,
  TransportTelemetry,
  TunerTelemetry,
} from "./contract";

type Handler = (payload: unknown) => void;

const styleModules = import.meta.glob("../../styles/*.json", {
  eager: true,
}) as Record<string, { default: StyleSummary }>;
const chartModules = import.meta.glob("../../charts/*.json", {
  eager: true,
}) as Record<string, { default: Chart }>;
/** Rig JSON as written by hand: the same optional fields serde defaults in Rust. */
type RawRig = Omit<
  RigProfile,
  "schemaVersion" | "programs" | "controls" | "scenes" | "supports" | "notes"
> & {
  schemaVersion?: number;
  programs?: RigProfile["programs"];
  controls?: Array<Pick<RigControl, "cc" | "name"> & Partial<RigControl>>;
  scenes: Array<{ name: string; commands?: RigCommand[] }>;
  supports?: Partial<RigProfile["supports"]>;
  notes?: string | null;
};
const rigModules = import.meta.glob("../../rigs/*.json", {
  eager: true,
}) as Record<string, { default: RawRig }>;

export function bundledRigs(): RigProfile[] {
  return Object.values(rigModules)
    .map((m): RigProfile => {
      const r = m.default;
      return {
        ...r,
        schemaVersion: r.schemaVersion ?? 1,
        programs: r.programs ?? [],
        controls: (r.controls ?? []).map((c) => ({
          cc: c.cc,
          name: c.name,
          min: c.min ?? 0,
          max: c.max ?? 127,
          default: c.default ?? 0,
          toggle: c.toggle ?? false,
        })),
        scenes: r.scenes.map((s) => ({
          name: s.name,
          commands: s.commands ?? [],
        })),
        supports: {
          programChange: true,
          controlChange: true,
          midiClock: false,
          ...(r.supports ?? {}),
        },
        notes: r.notes ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Same rules as `RigProfile::scene_commands` + `render` in jam-rig. */
export function sceneMidi(profile: RigProfile, sceneIdx: number): number[][] {
  const scene = profile.scenes[sceneIdx];
  if (!scene)
    throw new Error(`scene ${sceneIdx} does not exist on ${profile.name}`);
  const ch = profile.midiChannel & 0x0f;
  const cmds: RigCommand[] =
    scene.commands.length > 0
      ? scene.commands
      : profile.sceneCc !== null
        ? [{ type: "controlChange", cc: profile.sceneCc, value: sceneIdx }]
        : [{ type: "programChange", program: sceneIdx }];
  const out: number[][] = [];
  for (const c of cmds) {
    if (c.type === "programChange") out.push([0xc0 | ch, c.program & 0x7f]);
    else if (c.type === "controlChange")
      out.push([0xb0 | ch, c.cc & 0x7f, c.value & 0x7f]);
  }
  return out;
}

export function describeMidi(bytes: number[]): string {
  const [status, ...data] = bytes;
  const ch = (status & 0x0f) + 1;
  const kind = status & 0xf0;
  if (kind === 0xc0 && data.length === 1) return `PC ${data[0]} ch${ch}`;
  if (kind === 0xb0 && data.length === 2)
    return `CC ${data[0]} = ${data[1]} ch${ch}`;
  return bytes
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

export function bundledStyles(): StyleSummary[] {
  return Object.values(styleModules)
    .map((m) => m.default)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function bundledCharts(): Chart[] {
  return Object.values(chartModules)
    .map((m) => m.default)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface PreviewEngine {
  invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
  /** Advance simulated time (tests). */
  tick(dtSeconds: number): void;
  dispose(): void;
}

type Cue = "none" | "fill" | "crash" | "stop" | "ending";

export function createPreviewEngine(
  opts: { autoTick?: boolean } = {},
): PreviewEngine {
  const listeners = new Map<string, Set<Handler>>();
  const emit = (event: string, payload: unknown) => {
    for (const h of listeners.get(event) ?? []) h(payload);
  };

  const styles = new Map(bundledStyles().map((s) => [s.id, s]));
  const charts = new Map(bundledCharts().map((c) => [c.id, c]));
  const userCharts = new Set<string>();

  let chart: Chart = charts.get("blues-12-bar") ?? bundledCharts()[0];
  let bars = resolveChart(chart);

  const transport: TransportTelemetry = {
    state: "stopped",
    bar: 1,
    beat: 1,
    position_beats: 0,
    bar_progress: 0,
    bpm: chart.defaultBpm,
    time_signature: chart.timeSig,
    loop_enabled: false,
    loop_start_bar: 1,
    loop_end_bar: 5,
    count_in_bars: 1,
  };
  const band: BandTelemetry = {
    style_id: chart.defaultStyleId ?? "blues-shuffle",
    style_name:
      styles.get(chart.defaultStyleId ?? "blues-shuffle")?.name ??
      "Blues Shuffle",
    intensity: 0.5,
    active_cue: "none",
    pending_cue: "none",
    current_chord: bars[0]?.chords[0]?.chord ?? "A7",
    next_chord: bars[1]?.chords[0]?.chord ?? null,
    current_section: bars[0]?.sectionName ?? "",
    mute_drums: false,
    mute_bass: false,
    mute_comp: false,
    follow_energy: false,
    current_energy: 0,
    pending_style_id: null,
    pending_intensity: null,
    is_stopped: false,
  };
  const status: EngineStatus = {
    mode: "Headless",
    running: true,
    output: null,
    input: null,
    sample_rate: 48_000,
    buffer_size: 256,
    last_error: "Browser preview: simulated engine, no audio is produced",
    stream_errors: 0,
    input_gaps: 0,
  };
  let config: AudioConfig = {
    input_device: null,
    output_device: null,
    input_channel: 2,
    sample_rate: 48_000,
    buffer_size: 256,
  };
  let tunerOn = true;
  let toneOn = false;
  let clickVolume = 0.7;
  let countInRemainingBeats = 0;
  let lastBar = -1;
  let takes: TakeMetadata[] = [];
  let recordingSince: number | null = null;
  let recordingId: string | null = null;
  let previewLatency = 0;
  let clock = 0;
  const aiMusic: AiMusicState = {
    active: false,
    provider: "offline-synthetic",
    currentPrompt: "Neo-soul groove with rhodes and pocket drums",
    promptDelta: "",
    mixVolume: 0.8,
  };
  const rigProfiles = bundledRigs();
  const rigStart = Date.now();
  const rig: RigState = {
    currentProfile:
      rigProfiles.find((r) => r.id === "headrush-pedalboard") ?? rigProfiles[0],
    currentScene: 0,
    sectionMappings: {},
    controlValues: {},
    followSections: true,
    port: null,
    portDescription: "no MIDI port open (browser preview: MIDI is simulated)",
    live: false,
    monitor: [],
  };
  let rigLastSection: string | null = null;
  let rigLastSentScene: number | null = null;
  const resetRigControls = () => {
    rig.controlValues = Object.fromEntries(
      rig.currentProfile.controls.map((c) => [String(c.cc), c.default]),
    );
  };
  resetRigControls();
  const rigSend = (bytes: number[], reason: string) => {
    const msg: SentMidiMessage = {
      atMs: Date.now() - rigStart,
      bytes,
      text: describeMidi(bytes),
      reason,
      live: false,
    };
    if (bytes[0] >> 4 === 0xb) rig.controlValues[String(bytes[1])] = bytes[2];
    rig.monitor = [...rig.monitor.slice(-63), msg];
  };
  const rigSelectScene = (idx: number, reason: string) => {
    for (const bytes of sceneMidi(rig.currentProfile, idx))
      rigSend(bytes, reason);
    rig.currentScene = idx;
    rigLastSentScene = idx;
  };
  const rigSnapshot = (): RigState => ({
    ...rig,
    sectionMappings: { ...rig.sectionMappings },
    controlValues: { ...rig.controlValues },
    monitor: [...rig.monitor],
  });
  const rigOnSection = (section: string) => {
    if (rigLastSection === section) return;
    rigLastSection = section;
    if (!rig.followSections) return;
    const idx = rig.sectionMappings[section];
    if (idx === undefined || rigLastSentScene === idx) return;
    rigSelectScene(
      idx,
      `section ${section} -> ${rig.currentProfile.scenes[idx]?.name ?? idx}`,
    );
    emit("rig.state", rigSnapshot());
  };

  const beatsPerBar = () => transport.time_signature[0];
  const barCount = () => Math.max(1, bars.length);

  function chordAt(
    barIdx: number,
    beatInBar: number,
  ): { now: string; next: string | null; section: string } {
    const b = bars[((barIdx % barCount()) + barCount()) % barCount()];
    if (!b) return { now: "—", next: null, section: "" };
    let acc = 0;
    let now = b.chords[0]?.chord ?? "—";
    let idx = 0;
    for (let i = 0; i < b.chords.length; i++) {
      acc += b.chords[i].beats;
      if (beatInBar < acc - 1e-9) {
        now = b.chords[i].chord;
        idx = i;
        break;
      }
    }
    let next: string | null = null;
    if (idx + 1 < b.chords.length) next = b.chords[idx + 1].chord;
    else {
      const nb = bars[(barIdx + 1) % barCount()];
      next = nb?.chords[0]?.chord ?? null;
      if (transport.loop_enabled && barIdx + 1 >= transport.loop_end_bar - 1) {
        next = bars[transport.loop_start_bar - 1]?.chords[0]?.chord ?? next;
      }
    }
    return { now, next, section: b.sectionName };
  }

  function refreshBand() {
    const barIdx = Math.max(0, transport.bar - 1);
    const beatInBar = transport.position_beats - barIdx * beatsPerBar();
    const c = chordAt(barIdx, beatInBar);
    band.current_chord = c.now;
    band.next_chord = c.next;
    band.current_section = c.section;
    if (transport.state === "playing" && c.section) rigOnSection(c.section);
  }

  function seekBar(bar: number) {
    const clamped = Math.min(Math.max(1, bar), barCount());
    transport.bar = clamped;
    transport.beat = 1;
    transport.position_beats = (clamped - 1) * beatsPerBar();
    transport.bar_progress = 0;
    refreshBand();
  }

  function stop() {
    transport.state = "stopped";
    band.active_cue = "none";
    band.pending_cue = "none";
    band.is_stopped = false;
    seekBar(transport.loop_enabled ? transport.loop_start_bar : 1);
  }

  function onBarBoundary() {
    // Pending cues and style changes land here, like the sequencer.
    if (band.pending_style_id) {
      const s = styles.get(band.pending_style_id);
      if (s) {
        band.style_id = s.id;
        band.style_name = s.name;
      }
      band.pending_style_id = null;
    }
    if (band.pending_intensity != null) {
      band.intensity = band.pending_intensity;
      band.pending_intensity = null;
    }
    const cue = band.pending_cue as Cue;
    band.pending_cue = "none";
    if (band.active_cue === "ending") {
      transport.state = "stopped";
      band.active_cue = "none";
      seekBar(1);
      return;
    }
    band.active_cue = cue === "none" ? "none" : cue;
    if (cue === "stop") {
      band.is_stopped = !band.is_stopped;
      band.active_cue = "none";
    }
    if (cue === "fill" || cue === "crash") {
      // One bar of fill/crash, then back to the groove.
      setTimeout(
        () => {
          if (band.active_cue === cue) band.active_cue = "none";
        },
        (beatsPerBar() * 60_000) / transport.bpm,
      );
    }
  }

  function tick(dt: number) {
    clock += dt;
    if (transport.state === "counting_in") {
      const beats = (dt * transport.bpm) / 60;
      countInRemainingBeats -= beats;
      const done =
        transport.count_in_bars * beatsPerBar() -
        Math.max(0, countInRemainingBeats);
      transport.bar = Math.floor(done / beatsPerBar()) + 1;
      transport.beat = (Math.floor(done) % beatsPerBar()) + 1;
      transport.bar_progress = (done % beatsPerBar()) / beatsPerBar();
      if (countInRemainingBeats <= 0) {
        transport.state = "playing";
        seekBar(transport.loop_enabled ? transport.loop_start_bar : 1);
        lastBar = transport.bar;
        onBarBoundary();
      }
    } else if (transport.state === "playing") {
      transport.position_beats += (dt * transport.bpm) / 60;
      const total = barCount() * beatsPerBar();
      if (transport.loop_enabled) {
        const loopEnd =
          Math.min(transport.loop_end_bar - 1, barCount()) * beatsPerBar();
        const loopStart = (transport.loop_start_bar - 1) * beatsPerBar();
        if (transport.position_beats >= loopEnd) {
          transport.position_beats =
            loopStart + (transport.position_beats - loopEnd);
        }
      } else if (transport.position_beats >= total) {
        transport.position_beats -= total;
      }
      const barIdx = Math.floor(transport.position_beats / beatsPerBar());
      const beatInBar = transport.position_beats - barIdx * beatsPerBar();
      transport.bar = barIdx + 1;
      transport.beat = Math.floor(beatInBar) + 1;
      transport.bar_progress = beatInBar / beatsPerBar();
      if (transport.bar !== lastBar) {
        lastBar = transport.bar;
        onBarBoundary();
      }
      refreshBand();
    }

    const playing = transport.state === "playing" && !band.is_stopped;
    const pulse = playing
      ? 0.6 +
        0.4 *
          Math.max(
            0,
            Math.cos(transport.bar_progress * beatsPerBar() * Math.PI * 2),
          )
      : 0;
    // The click shows up on the meter as a short tick on each beat.
    const beatPhase = (transport.bar_progress * beatsPerBar()) % 1;
    const click =
      transport.state !== "stopped" && beatPhase < 0.08 ? 6 * clickVolume : 0;
    const level = playing
      ? -18 + 10 * band.intensity * pulse + click
      : click > 0
        ? -30 + click
        : -180;
    const outMeter: MeterTelemetry = {
      peak_db: toneOn ? -6 : level,
      rms_db: toneOn ? -9 : level - 6,
    };
    const inMeter: MeterTelemetry = { peak_db: -180, rms_db: -180 };
    const tuner: TunerTelemetry | null = tunerOn
      ? {
          hz: 440 * 2 ** ((Math.sin(clock * 0.7) * 6) / 1200),
          note: "A4",
          cents: Math.sin(clock * 0.7) * 6,
          confidence: 0.9,
        }
      : null;

    emit("meters", outMeter);
    emit("input.meters", inMeter);
    emit("transport.state", { ...transport });
    emit("band.state", { ...band });
    if (tuner) emit("tuner.state", tuner);
    emit("engine.status", { ...status });
  }

  const timer =
    opts.autoTick === false || typeof setInterval === "undefined"
      ? null
      : setInterval(() => tick(1 / 30), 1000 / 30);

  function telemetry(): EngineTelemetry {
    return {
      xruns: 0,
      input_level: { peak_db: -180, rms_db: -180 },
      output_level: { peak_db: -180, rms_db: -180 },
      tuner: null,
      transport: { ...transport },
      band: { ...band },
    };
  }

  function loadChart(next: Chart, follow: boolean) {
    chart = next;
    bars = resolveChart(chart);
    if (follow) {
      transport.time_signature = chart.timeSig;
      if (chart.defaultBpm > 0) transport.bpm = chart.defaultBpm;
      const s = chart.defaultStyleId
        ? styles.get(chart.defaultStyleId)
        : undefined;
      if (s) {
        band.style_id = s.id;
        band.style_name = s.name;
      }
    }
    if (transport.state === "stopped") seekBar(1);
    else refreshBand();
  }

  const commands: Record<string, (args: Record<string, unknown>) => unknown> = {
    settings_get: () => ({
      schemaVersion: 1,
      input_device: config.input_device,
      output_device: config.output_device,
      input_channel: config.input_channel,
      sample_rate: config.sample_rate,
      buffer_size: config.buffer_size,
    }),
    settings_set: (a) => {
      const s = a.settings as AudioConfig;
      config = { ...config, ...s };
    },
    keys_set: () => undefined,
    keys_has: () => false,
    provider_fetch: () => {
      throw new Error(
        "Browser preview: network is disabled (provider_fetch only exists in the desktop app)",
      );
    },
    providers_list: () => [
      { id: "gemini", description: "Google Gemini", hasKey: false },
      { id: "elevenlabs", description: "ElevenLabs", hasKey: false },
    ],
    cost_log_list: () => [],
    cost_log_totals: () => [],
    keys_delete: () => undefined,
    audio_list_devices: () => ({
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
    }),
    audio_get_config: () => config,
    audio_set_config: (a) => {
      config = a.config as AudioConfig;
      status.sample_rate = config.sample_rate;
      status.buffer_size = config.buffer_size;
      return status;
    },
    audio_set_band_volume: () => undefined,
    audio_set_input_monitor: () => undefined,
    engine_status: () => status,
    engine_restart: () => status,
    audio_get_telemetry: () => telemetry(),
    tone_set: (a) => {
      toneOn = Boolean(a.on);
    },
    metronome_set: () => undefined,
    tuner_set: (a) => {
      tunerOn = Boolean(a.on);
    },
    transport_play: () => {
      if (transport.state === "playing") return;
      rigLastSection = null;
      if (transport.state === "paused") {
        transport.state = "playing";
        return;
      }
      if (transport.count_in_bars > 0) {
        transport.state = "counting_in";
        countInRemainingBeats = transport.count_in_bars * beatsPerBar();
        transport.bar = 1;
        transport.beat = 1;
      } else {
        transport.state = "playing";
        seekBar(transport.loop_enabled ? transport.loop_start_bar : 1);
        lastBar = transport.bar;
        onBarBoundary();
      }
    },
    transport_pause: () => {
      if (transport.state === "playing") transport.state = "paused";
    },
    transport_stop: () => stop(),
    transport_seek_bar: (a) => seekBar(Number(a.bar)),
    transport_set_loop: (a) => {
      transport.loop_start_bar = Math.max(1, Number(a.startBar));
      transport.loop_end_bar = Math.max(
        transport.loop_start_bar + 1,
        Number(a.endBar),
      );
      transport.loop_enabled = Boolean(a.enabled);
    },
    transport_set_count_in: (a) => {
      transport.count_in_bars = Math.max(0, Math.min(4, Number(a.bars)));
    },
    transport_set_tempo: (a) => {
      transport.bpm = Math.max(20, Math.min(300, Number(a.bpm)));
    },
    transport_set_time_signature: (a) => {
      transport.time_signature = [Number(a.numerator), Number(a.denominator)];
    },
    transport_set_click_volume: (a) => {
      clickVolume = Number(a.volume);
    },
    band_set_style: (a) => {
      const s = styles.get(String(a.styleId));
      if (!s) throw new Error(`unknown style "${a.styleId}"`);
      if (transport.state === "playing") band.pending_style_id = s.id;
      else {
        band.style_id = s.id;
        band.style_name = s.name;
      }
    },
    band_set_intensity: (a) => {
      band.intensity = Math.max(0, Math.min(1, Number(a.intensity)));
    },
    band_cue: (a) => {
      band.pending_cue = String(a.cue) as Cue;
      if (transport.state !== "playing") {
        band.active_cue = band.pending_cue;
        band.pending_cue = "none";
      }
    },
    band_list_styles: () => bundledStyles(),
    band_list_charts: () =>
      [...charts.values()].sort((x, y) => x.name.localeCompare(y.name)),
    band_load_chart: (a) => {
      const c = charts.get(String(a.chartId));
      if (!c) throw new Error(`unknown chart "${a.chartId}"`);
      loadChart(c, a.followChart !== false);
      return c;
    },
    band_load_chart_inline: (a) => loadChart(a.chart as Chart, true),
    charts_save: (a) => {
      const c = a.chart as Chart;
      charts.set(c.id, c);
      userCharts.add(c.id);
      return `(preview) ~/JosefinesJamstudio/charts/${c.id}.json`;
    },
    charts_import_file: () => {
      throw new Error("file import is only available in the desktop app");
    },
    charts_delete_user: (a) => {
      const id = String(a.chartId);
      if (!userCharts.has(id)) throw new Error(`"${id}" is not a user chart`);
      userCharts.delete(id);
      const bundled = bundledCharts().find((c) => c.id === id);
      if (bundled) charts.set(id, bundled);
      else charts.delete(id);
    },
    library_reload: (): LibraryInfo => ({
      stylesDir: "(preview) ~/JosefinesJamstudio/styles",
      chartsDir: "(preview) ~/JosefinesJamstudio/charts",
      userChartIds: [...userCharts],
      loadErrors: [],
    }),
    band_set: (a) => {
      const p = a.args as BandPatch;
      const live = transport.state === "playing" && p.atNextBar !== false;
      if (p.styleId !== undefined) {
        const s = styles.get(p.styleId);
        if (!s) throw new Error(`unknown style "${p.styleId}"`);
        if (live) band.pending_style_id = s.id;
        else {
          band.style_id = s.id;
          band.style_name = s.name;
        }
      }
      if (p.intensity !== undefined) {
        if (live) band.pending_intensity = p.intensity;
        else band.intensity = p.intensity;
      }
      if (p.followEnergy !== undefined) band.follow_energy = p.followEnergy;
      if (p.muteDrums !== undefined) band.mute_drums = p.muteDrums;
      if (p.muteBass !== undefined) band.mute_bass = p.muteBass;
      if (p.muteComp !== undefined) band.mute_comp = p.muteComp;
    },
    recorder_start: (a) => {
      recordingSince = clock;
      recordingId = `preview-${Date.now()}`;
      void a;
      return recordingId;
    },
    recorder_stop: (): TakeMetadata => {
      const dur = recordingSince === null ? 0 : clock - recordingSince;
      const meta: TakeMetadata = {
        id: recordingId ?? `preview-${Date.now()}`,
        sessionId: "preview",
        timestamp: new Date().toISOString(),
        durationSecs: dur,
        styleId: band.style_id,
        chartId: chart.id,
        tempo: transport.bpm,
        sampleCount: Math.round(dur * 48_000),
        pathInput: "(preview) not written",
        pathBand: "(preview) not written",
        pathMaster: "(preview) not written",
        waveformPeaks: Array.from(
          { length: 64 },
          (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i / 3)),
        ),
        notes: "Simulated take from browser preview (no audio).",
      };
      takes = [meta, ...takes];
      recordingSince = null;
      return meta;
    },
    recorder_set_latency: (a) => {
      previewLatency = Math.max(0, Math.min(48_000, Number(a.samples) || 0));
      return previewLatency;
    },
    recorder_get_latency: () => previewLatency,
    takes_list: () => takes,
    takes_delete: (a) => {
      takes = takes.filter((t) => t.id !== a.takeId);
    },
    takes_analyze: () => ({
      timingAccuracyPct: 0,
      dynamicConsistencyPct: 0,
      intonationAccuracyPct: 0,
      detectedTransients: 0,
      summary:
        "Analysis needs the desktop app: no audio was recorded in browser preview.",
    }),
    takes_export_daw: () => {
      throw new Error("export is only available in the desktop app");
    },
    song_import: () => {
      throw new Error("song import is only available in the desktop app");
    },
    song_set_speed: () => undefined,
    song_set_transpose: () => undefined,
    song_set_stem_settings: () => undefined,
    ai_music_start: () => {
      throw new Error(
        "Generative AI music is not connected yet (milestone M4); nothing would be heard.",
      );
    },
    ai_music_stop: () => {
      aiMusic.active = false;
    },
    ai_music_steer: (a) => {
      aiMusic.promptDelta = String(a.delta);
    },
    ai_music_set_volume: (a) => {
      aiMusic.mixVolume = Number(a.volume);
    },
    ai_music_get_state: () => aiMusic,
    rig_list_profiles: () => rigProfiles,
    rig_select_profile: (a) => {
      const p = rigProfiles.find((r) => r.id === a.profileId);
      if (!p) throw new Error(`unknown rig profile "${a.profileId}"`);
      rig.currentProfile = p;
      rig.currentScene = 0;
      rigLastSentScene = null;
      for (const [section, idx] of Object.entries(rig.sectionMappings)) {
        if (idx >= p.scenes.length) delete rig.sectionMappings[section];
      }
      resetRigControls();
      return rigSnapshot();
    },
    rig_select_scene: (a) => {
      const idx = Number(a.sceneIdx);
      rigSelectScene(
        idx,
        `scene ${rig.currentProfile.scenes[idx]?.name ?? idx}`,
      );
      return rigSnapshot();
    },
    rig_set_section_mapping: (a) => {
      const section = String(a.section);
      if (a.sceneIdx === null || a.sceneIdx === undefined) {
        delete rig.sectionMappings[section];
      } else {
        const idx = Number(a.sceneIdx);
        if (idx >= rig.currentProfile.scenes.length)
          throw new Error(
            `scene ${idx} does not exist on ${rig.currentProfile.name}`,
          );
        rig.sectionMappings[section] = idx;
      }
      return rigSnapshot();
    },
    rig_set_follow_sections: (a) => {
      rig.followSections = Boolean(a.enabled);
      return rigSnapshot();
    },
    rig_get_state: () => rigSnapshot(),
    rig_list_ports: () => [{ name: "Preview MIDI Out (simulated)" }],
    rig_open_port: (a) => {
      if (a.port === null || a.port === undefined) {
        rig.port = null;
        rig.live = false;
        rig.portDescription =
          "no MIDI port open (browser preview: MIDI is simulated)";
      } else {
        rig.port = String(a.port);
        rig.live = false;
        rig.portDescription = `${a.port} (browser preview: nothing is sent)`;
      }
      return rigSnapshot();
    },
    rig_set_control: (a) => {
      const cc = Number(a.cc);
      const ctl = rig.currentProfile.controls.find((c) => c.cc === cc);
      const raw = Math.min(127, Math.max(0, Number(a.value)));
      const v = ctl ? Math.min(ctl.max, Math.max(ctl.min, raw)) : raw;
      rigSend(
        [0xb0 | (rig.currentProfile.midiChannel & 0x0f), cc, v],
        `knob ${ctl?.name ?? `CC ${cc}`}`,
      );
      return rigSnapshot();
    },
    rig_send_program: (a) => {
      const program = Math.min(127, Math.max(0, Number(a.program)));
      const named = rig.currentProfile.programs.find(
        (p) => p.number === program,
      );
      rigSend(
        [0xc0 | (rig.currentProfile.midiChannel & 0x0f), program],
        `manual ${named?.name ?? `program ${program}`}`,
      );
      return rigSnapshot();
    },
    rig_clear_monitor: () => {
      rig.monitor = [];
      return rigSnapshot();
    },
  };

  return {
    async invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
      const fn = commands[cmd];
      if (!fn) throw new Error(`preview engine: unknown command "${cmd}"`);
      return fn(args) as T;
    },
    async listen<T>(event: string, handler: (payload: T) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(handler as Handler);
      listeners.set(event, set);
      return () => {
        set.delete(handler as Handler);
      };
    },
    tick,
    dispose() {
      if (timer) clearInterval(timer);
      listeners.clear();
    },
  };
}
