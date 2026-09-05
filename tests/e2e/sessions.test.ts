/**
 * Sessions, end to end on the simulated engine: a jam is recorded through the store
 * (the same actions the Sessions buttons and Jo's record_take tool run), the take
 * lists with its metadata, gets analysed, favourited and deleted; the header
 * statistics come from those takes; the Film "use take" and render flows; and the
 * guitar-offset (latency) setting round-trips through the engine.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { ipc } from "../../src/ipc/client";
import type { TakeMetadata } from "../../src/ipc/contract";
import type { PreviewEngine } from "../../src/ipc/preview";
import { closeDecision } from "../../src/lib/closeGuard";
import { dispatchJoToolCall } from "../../src/lib/jo/dispatcher";
import {
  fitShots,
  newShot,
  newVideo,
  shotsFromChart,
  useMedia,
  videoDuration,
} from "../../src/lib/media";
import {
  drillFor,
  formatJamTime,
  practiceStreakDays,
  takeDate,
} from "../../src/lib/sessions/stats";
import { useEngineStore } from "../../src/store/engine";

/** A Friday evening jam; every test starts here so timestamps and ids are stable. */
const TODAY = new Date(2026, 8, 5, 18, 0, 0);
const daysAgo = (days: number, hour = 12) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d;
};

type PreviewHolder = { __jamPreviewEngine?: Promise<PreviewEngine> };

let engine: PreviewEngine;
let stopListening: () => void;
let previous: ReturnType<typeof useEngineStore.getState>;
let previousMedia: ReturnType<typeof useMedia.getState>;

const store = () => useEngineStore.getState();
const engineTakes = () => engine.invoke<TakeMetadata[]>("takes_list", {});
const lastNotice = () => store().notices.at(-1)?.text ?? "";

/** What "Record New Take" then "Stop Recording" do, with `seconds` of simulated time between. */
async function recordTake(at: Date, seconds: number): Promise<TakeMetadata> {
  vi.setSystemTime(at);
  const id = await store().startRecording();
  expect(id).toMatch(/^preview-\d+$/);
  engine.tick(seconds);
  const meta = await store().stopRecording();
  if (!meta) throw new Error(`stopRecording returned nothing for ${id}`);
  expect(meta.id).toBe(id);
  return meta;
}

beforeAll(async () => {
  // Fake timers before the engine exists: its auto-tick interval never fires, so
  // simulated time only moves through engine.tick() and Date only via setSystemTime.
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
  await ipc.invoke("engine_status");
  const holder = globalThis as PreviewHolder;
  if (!holder.__jamPreviewEngine)
    throw new Error("the ipc client did not create the preview engine");
  engine = await holder.__jamPreviewEngine;
  // The same wiring App does at startup: telemetry events flow into the store.
  stopListening = await store().initListeners();
});

afterAll(() => {
  stopListening();
  vi.useRealTimers();
});

beforeEach(async () => {
  vi.setSystemTime(TODAY);
  previous = store();
  previousMedia = useMedia.getState();
  await store().transportStop();
  await store().transportSetCountIn(0);
  engine.tick(0.01);
});

afterEach(() => {
  useEngineStore.setState(previous, true);
  useMedia.setState(previousMedia, true);
  vi.restoreAllMocks();
});

it("records a jam: load a chart, pick a style, press play, hear the chord change, stop the take and find it listed with its chart, style and tempo", async () => {
  const s = store();
  await s.bandLoadChart("blues-12-bar");
  await s.bandSetStyle("funk-16");
  await s.transportSetTempo(120);
  await s.transportPlay();
  engine.tick(0.01);
  expect(store().telemetry.transport.state).toBe("playing");
  expect(store().telemetry.band).toMatchObject({
    style_id: "funk-16",
    current_chord: "A7",
  });

  const id = await s.startRecording("evening-jam");
  expect(id).toMatch(/^preview-\d+$/);
  expect(store().isRecording).toBe(true);
  expect(closeDecision()).toBe("refuse");

  // Four bars at 120 BPM in 4/4 is 8 seconds: the band has moved to the IV chord.
  for (let i = 0; i < 80; i++) engine.tick(0.1);
  expect(store().telemetry.transport.bar).toBe(5);
  expect(store().telemetry.band.current_chord).toBe("D7");

  const meta = await s.stopRecording();
  expect(meta).toMatchObject({
    id,
    chartId: "blues-12-bar",
    styleId: "funk-16",
    tempo: 120,
    sampleCount: 384_000,
  });
  expect(meta?.durationSecs).toBeCloseTo(8, 6);
  expect(meta?.waveformPeaks).toHaveLength(64);
  for (const peak of meta?.waveformPeaks ?? []) {
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(1);
  }
  expect(takeDate(meta?.timestamp ?? "")?.getTime()).toBe(TODAY.getTime());
  expect(meta?.notes).toMatch(/preview/i);

  expect(store().isRecording).toBe(false);
  expect(store().takes[0]?.id).toBe(id);
  expect(closeDecision()).toBe("close");
  // Stopping the take does not stop the band.
  expect(store().telemetry.transport.state).toBe("playing");
  await s.transportStop();
  engine.tick(0.01);
  expect(store().telemetry.transport).toMatchObject({
    state: "stopped",
    bar: 1,
  });

  // "Refresh" in Sessions lists what the engine keeps, newest first.
  useEngineStore.setState({ takes: [] });
  await s.loadTakes();
  expect(store().takes[0]?.id).toBe(id);
  expect(store().takes.map((t) => t.id)).toEqual(
    (await engineTakes()).map((t) => t.id),
  );
});

it("lets Jo start and stop a take by voice and refuses an unknown or missing action", async () => {
  const started = await dispatchJoToolCall({
    name: "record_take",
    arguments: { action: "start" },
  });
  expect(started).toMatch(/^Recording started: preview-\d+$/);
  expect(store().isRecording).toBe(true);
  engine.tick(2);
  const stopped = await dispatchJoToolCall({
    name: "record_take",
    arguments: { action: "stop" },
  });
  const take = store().takes[0];
  expect(stopped).toBe(`Recording saved: ${take.id}`);
  expect(started.endsWith(take.id)).toBe(true);
  expect(take.durationSecs).toBeCloseTo(2, 6);
  expect(store().isRecording).toBe(false);

  await expect(
    dispatchJoToolCall({
      name: "record_take",
      arguments: { action: "pause" },
    }),
  ).rejects.toThrow("Invalid action for record_take.");
  await expect(
    dispatchJoToolCall({ name: "record_take", arguments: {} }),
  ).rejects.toThrow("Missing action for record_take.");
  expect(store().isRecording).toBe(false);
});

it("refuses stopping without an active recording", async () => {
  const before = (await engineTakes()).map((t) => t.id);
  expect(store().isRecording).toBe(false);
  const meta = await store().stopRecording();
  expect(meta).toBeNull();
  expect(lastNotice()).toMatch(/No active recording/);
  expect((await engineTakes()).map((t) => t.id)).toEqual(before);
  expect(store().takes.some((t) => t.durationSecs === 0)).toBe(false);
});

it("preserves the active take when a duplicate start is refused", async () => {
  const first = await store().startRecording();
  engine.tick(1.5);
  const second = await store().startRecording();
  expect(second).toBe("");
  expect(lastNotice()).toMatch(/already recording/);
  engine.tick(0.5);
  const meta = await store().stopRecording();
  expect(meta?.id).toBe(first);
  expect(meta?.durationSecs).toBeCloseTo(2, 6);
});

it("records the requested session ID", async () => {
  const id = await store().startRecording("song-evening-jam");
  engine.tick(1);
  const meta = await store().stopRecording();
  expect(meta).toMatchObject({ id, sessionId: "song-evening-jam" });
});

it("sums recorded jam time and the practice streak in the Sessions header from the takes the engine lists", async () => {
  const s = store();
  for (const take of await engineTakes()) await s.deleteTake(take.id);
  await s.loadTakes();
  expect(store().takes).toEqual([]);
  expect(practiceStreakDays(store().takes)).toBe(0);
  expect(formatJamTime(0)).toBe("0 s");

  const old = await recordTake(daysAgo(5, 10), 30);
  const twoDaysAgo = await recordTake(daysAgo(2, 11), 90);
  const yesterday = await recordTake(daysAgo(1, 9), 45);
  const today = await recordTake(TODAY, 135);
  vi.setSystemTime(TODAY);

  await s.loadTakes();
  const takes = store().takes;
  expect(takes.map((t) => t.id)).toEqual([
    today.id,
    yesterday.id,
    twoDaysAgo.id,
    old.id,
  ]);
  expect(takes.map((t) => takeDate(t.timestamp)?.getTime())).toEqual([
    TODAY.getTime(),
    daysAgo(1, 9).getTime(),
    daysAgo(2, 11).getTime(),
    daysAgo(5, 10).getTime(),
  ]);
  const totalSecs = takes.reduce((acc, t) => acc + t.durationSecs, 0);
  expect(totalSecs).toBeCloseTo(300, 6);
  expect(formatJamTime(totalSecs)).toBe("5 min");
  // Today, yesterday and the day before: three days; the take five days ago is a gap.
  expect(practiceStreakDays(takes)).toBe(3);
  // Opening the app tomorrow still shows the streak; the day after, it is over.
  expect(practiceStreakDays(takes, daysAgo(-1))).toBe(3);
  expect(practiceStreakDays(takes, daysAgo(-2))).toBe(0);
  // Deleting today's take shortens the streak to yesterday's two days.
  await s.deleteTake(today.id);
  expect(practiceStreakDays(store().takes)).toBe(2);
  expect(
    formatJamTime(store().takes.reduce((a, t) => a + t.durationSecs, 0)),
  ).toBe("3 min");
});

it("analyses a take honestly in the preview (no audio, all zeros), caches it per take, suggests a drill, and Jo refuses ids that are not listed", async () => {
  const s = store();
  const meta = await recordTake(TODAY, 12);
  const analysis = await s.analyzeTake(meta.id);
  expect(analysis).toEqual({
    meanGridDistanceMs: null,
    gridBiasMs: null,
    gridSpreadMs: null,
    attackLevelCvPct: null,
    meanAbsCents: null,
    pitchedFrames: 0,
    timingAccuracyPct: 0,
    dynamicConsistencyPct: 0,
    intonationAccuracyPct: 0,
    detectedTransients: 0,
    summary: expect.stringMatching(/desktop app/),
  });
  expect(store().takeAnalysis[meta.id]).toEqual(analysis);
  useEngineStore.setState({ takeAnalysis: {}, takes: [] });
  await store().loadTakes();
  expect(store().takeAnalysis[meta.id]).toEqual(analysis);
  const savedTake = store().takes.find((t) => t.id === meta.id);
  expect(savedTake?.analysis).toMatchObject({
    schemaVersion: 1,
    analyzerVersion: 2,
    analyzedAtMs: TODAY.getTime(),
  });
  if (!analysis) throw new Error("no analysis");
  // The Jo review card: too few pick attacks means "record a real take" rather than a drill.
  expect(drillFor(analysis, Math.round(meta.tempo))).toMatch(
    /Too few pick attacks/,
  );

  // Jo's analyze_take tool checks the take list before touching the engine.
  const jo = await dispatchJoToolCall({
    name: "analyze_take",
    arguments: { takeId: meta.id },
  });
  expect(jo).toContain("Local heuristic analysis");
  expect(jo).toContain(JSON.stringify(analysis));
  await expect(
    dispatchJoToolCall({
      name: "analyze_take",
      arguments: { takeId: "take-does-not-exist" },
    }),
  ).rejects.toThrow("Choose a saved take from the current take list.");
  expect(store().takeAnalysis).not.toHaveProperty("take-does-not-exist");

  await s.startRecording();
  await expect(
    dispatchJoToolCall({
      name: "analyze_take",
      arguments: { takeId: meta.id },
    }),
  ).rejects.toThrow("Finish recording before analyzing a take.");
  await s.stopRecording();
});

it("keeps a take available when its saved analysis is damaged", async () => {
  const meta = await recordTake(TODAY, 2);
  const originalInvoke = ipc.invoke;
  const damaged = { ...meta, analysis: { schemaVersion: 999 } };
  vi.spyOn(ipc, "invoke").mockImplementation(async (command, args) => {
    if (command === "takes_list") return [damaged] as never;
    return originalInvoke(command, args);
  });
  await store().loadTakes();
  expect(store().takes).toEqual([damaged]);
  expect(store().takeAnalysis).not.toHaveProperty(meta.id);
});

it("deletes a take from the store and the engine, and an unknown id leaves the list untouched", async () => {
  const s = store();
  const first = await recordTake(daysAgo(0, 15), 4);
  const second = await recordTake(daysAgo(0, 16), 6);
  await s.loadTakes();
  const ids = () => store().takes.map((t) => t.id);
  expect(ids().slice(0, 2)).toEqual([second.id, first.id]);

  await s.deleteTake(first.id);
  expect(ids()).not.toContain(first.id);
  expect(ids()).toContain(second.id);
  expect((await engineTakes()).map((t) => t.id)).toEqual(ids());

  const before = store().takes;
  const notices = store().notices.length;
  await s.deleteTake("take-does-not-exist");
  expect(store().takes).toEqual(before);
  expect(store().notices).toHaveLength(notices);
  expect((await engineTakes()).map((t) => t.id)).toEqual(ids());
});

it("keeps favouriting a desktop-only action: the preview names the missing command and the take stays unmarked", async () => {
  const s = store();
  const meta = await recordTake(TODAY, 3);
  // The Keep button is disabled in the preview; this is what it would run.
  await expect(
    ipc.invoke("takes_favourite", { takeId: meta.id, favourite: true }),
  ).rejects.toThrow('preview engine: unknown command "takes_favourite"');
  await s.loadTakes();
  const listed = store().takes.find((t) => t.id === meta.id);
  expect(listed).toBeDefined();
  expect(listed?.favourite).toBeUndefined();
  // So the "Favourites only" filter in Sessions shows nothing here.
  expect(store().takes.filter((t) => t.favourite)).toEqual([]);
});

it("round-trips the guitar offset through the engine, clamps it to 0..48000 samples and reads it back after a refresh", async () => {
  const s = store();
  expect(await s.setLatencySamples(240)).toBe(240);
  expect(store().latencySamples).toBe(240);
  const sampleRate = store().engineStatus?.sample_rate ?? 0;
  expect(sampleRate).toBe(48_000);
  expect(((240 * 1000) / sampleRate).toFixed(1)).toBe("5.0");

  expect(await s.setLatencySamples(48_001)).toBe(48_000);
  expect(await s.setLatencySamples(-12)).toBe(0);
  expect(await s.setLatencySamples(12.5)).toBe(13);
  expect(await s.setLatencySamples(Number.NaN)).toBe(0);
  expect(store().notices.filter((n) => n.kind === "error")).toEqual([]);

  expect(await s.setLatencySamples(960)).toBe(960);
  useEngineStore.setState({ latencySamples: 0 });
  await s.loadTakes();
  expect(store().latencySamples).toBe(960);
  expect(await engine.invoke("recorder_get_latency", {})).toBe(960);
});

it("Film in the preview: refreshing keeps the library empty without asking the engine, and saving is refused with the desktop message", async () => {
  const invoke = vi.spyOn(ipc, "invoke");
  const m = useMedia.getState();
  await m.refresh();
  expect(invoke).not.toHaveBeenCalledWith("media_list");
  expect(useMedia.getState()).toMatchObject({
    assets: [],
    projects: [],
    jobs: [],
  });

  m.edit({ title: "Evening jam film" });
  expect(useMedia.getState()).toMatchObject({
    dirty: true,
    project: { title: "Evening jam film", revision: 0 },
  });
  await expect(useMedia.getState().save()).rejects.toThrow(
    "Saving projects requires the desktop app. This preview keeps edits until reload.",
  );
  expect(invoke).not.toHaveBeenCalledWith("media_save", expect.anything());
  expect(useMedia.getState()).toMatchObject({
    dirty: true,
    project: { title: "Evening jam film", revision: 0 },
  });
  // The guard is what keeps the screen honest: the engine has no media commands.
  await expect(ipc.invoke("media_list")).rejects.toThrow(
    'preview engine: unknown command "media_list"',
  );
  await expect(
    ipc.invoke("media_save", { document: useMedia.getState().project }),
  ).rejects.toThrow('preview engine: unknown command "media_save"');
});

it("Film: \"Use take\" is refused in the preview with the command named, and the storyboard for the take's chart is fitted to the take's length", async () => {
  const s = store();
  await s.bandLoadChart("rock-song-form");
  await s.transportSetTempo(120);
  const meta = await recordTake(TODAY, 24);
  expect(meta.chartId).toBe("rock-song-form");

  // What the "Use take" button runs.
  await useMedia.getState().work("Importing recording", async () => {
    await ipc.invoke("media_from_take", { takeId: meta.id });
  });
  expect(useMedia.getState()).toMatchObject({
    busy: "",
    message: 'Error: preview engine: unknown command "media_from_take"',
  });

  // A preview take carries no song snapshot, so "Plan section cuts" falls back to
  // the chart the take names in the library.
  expect(meta.snapshot).toBeUndefined();
  const chart = store().charts.find((c) => c.id === meta.chartId);
  if (!chart) throw new Error(`chart ${meta.chartId} is not in the library`);
  const shots = shotsFromChart(chart, meta.durationSecs);
  // Intro 4 · Verse 8 · Chorus 8 · Verse 8 · Chorus 8 · Solo 8 · Chorus ×2 · Outro 4 in four-bar shots.
  expect(shots).toHaveLength(16);
  expect(shots[0].title).toBe("Intro · bars 1–4");
  expect(shots[1].title).toBe("Verse · bars 1–4");
  expect(shots[2].title).toBe("Verse · bars 5–8");
  expect(shots.at(-1)?.title).toBe("Outro · bars 1–4");
  expect(videoDuration(shots)).toBeCloseTo(24, 9);
  for (const shot of shots) expect(shot.seconds).toBeCloseTo(1.5, 9);
  expect(shots.filter((x) => /Chorus/.test(x.title))).toHaveLength(8);
  expect(shots[3].prompt).toMatch(/Open the space/);
  expect(shots[0].prompt).toMatch(/Intimate framing/);

  useMedia.getState().edit({ shots, title: "Evening jam" });
  expect(useMedia.getState().project.shots).toHaveLength(16);
  expect(useMedia.getState().dirty).toBe(true);

  // Fitting boundaries: a soundtrack over ten minutes, or a shot squeezed under 0.1 s.
  expect(() => fitShots(shots, 601)).toThrow(
    "Choose a soundtrack and valid shot durations first.",
  );
  expect(() =>
    fitShots([newShot("Tiny", 1), newShot("Long", 2000)], 10),
  ).toThrow("Add or remove shots to keep each between 0.1 and 120 seconds.");
});

it("Film: rendering saves first, so the preview never reaches media_render; the render document passes the desktop's checks", async () => {
  const invoke = vi.spyOn(ipc, "invoke");
  const m = useMedia.getState();
  m.open({
    ...newVideo(),
    title: "Evening jam",
    audioId: "asset-take-mix",
    shots: fitShots([newShot("Intro", 8), newShot("Chorus", 8)], 24),
  });
  expect(useMedia.getState().dirty).toBe(false);

  // What "Render music video" runs.
  await useMedia.getState().work("Rendering the film locally", async () => {
    await useMedia.getState().save();
    const path = await ipc.invoke<string>("media_render", {
      document: useMedia.getState().project,
    });
    useMedia.getState().edit({ lastRender: path });
    useMedia.setState({ renderPath: path });
  });
  expect(useMedia.getState()).toMatchObject({
    busy: "",
    renderPath: "",
    message:
      "Error: Saving projects requires the desktop app. This preview keeps edits until reload.",
  });
  expect(invoke).not.toHaveBeenCalledWith("media_render", expect.anything());

  // The document the desktop would validate and render.
  const doc = useMedia.getState().project;
  expect(doc).toMatchObject({
    schemaVersion: 1,
    revision: 0,
    title: "Evening jam",
    ratio: "16:9",
    audioId: "asset-take-mix",
  });
  expect(doc.id).toMatch(/^[A-Za-z0-9_-]{1,100}$/);
  expect(doc.shots).toHaveLength(2);
  expect(new Set(doc.shots.map((x) => x.id)).size).toBe(2);
  for (const shot of doc.shots) {
    expect(shot.id).toMatch(/^[A-Za-z0-9_-]{1,100}$/);
    expect(shot.seconds).toBe(12);
    expect(shot.trimStart).toBe(0);
    expect(shot.assetId).toBeNull();
  }
  expect(videoDuration(doc.shots)).toBe(24);
  expect(doc.lastRender).toBeUndefined();
  await expect(ipc.invoke("media_render", { document: doc })).rejects.toThrow(
    'preview engine: unknown command "media_render"',
  );
});
