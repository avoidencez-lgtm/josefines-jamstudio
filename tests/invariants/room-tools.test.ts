import fs from "node:fs";
import { afterEach, expect, it } from "vitest";
import { ROOM_TOOLS } from "../../src/components/RoomTools";
import { __setIpcForTests, ipc } from "../../src/ipc/client";
import type {
  AppSettings,
  AudioConfig,
  RigProfile,
  RigState,
} from "../../src/ipc/contract";
import { transposeChart } from "../../src/lib/chart/transpose";
import {
  applyStudioEdits,
  songFingerprint,
} from "../../src/lib/jo/studioTools";
import { validateToolCall } from "../../src/lib/jo/tools";
import { newShot } from "../../src/lib/media";
import { newOriginal, useWriting } from "../../src/lib/originals";
import { applySongIdea, saveRoomPreference } from "../../src/lib/roomActions";
import {
  audioProfileSchema,
  captureRig,
  coachSchema,
  generationBrief,
  harmonicNeighbours,
  harmonyVariation,
  melodyHarmony,
  parseBlueprint,
  parseMelody,
  referenceForm,
  setlistCue,
  setlistSchema,
  snapCuts,
  validateAudioProfile,
  validateRigSnapshot,
} from "../../src/lib/roomTools";
import { SCREENS } from "../../src/screens/registry";
import { useEngineStore } from "../../src/store/engine";

const originalIpc = { ...ipc };
afterEach(() => {
  __setIpcForTests(originalIpc);
  useEngineStore.setState({ isRecording: false });
  useWriting.setState({ busy: false });
});

it("registers one named capability for every room", () => {
  expect(Object.keys(ROOM_TOOLS).sort()).toEqual(
    SCREENS.map((s) => s.id).sort(),
  );
  expect(new Set(Object.values(ROOM_TOOLS).map((s) => s.title)).size).toBe(10);
});

it("exposes harmony and reference experiments through the existing reviewed Jo action boundary", () => {
  const song = newOriginal();
  useWriting.setState({
    song,
    busy: false,
    dirty: false,
    past: [],
    future: [],
  });
  const harmony = {
    name: "keep_harmony_variation",
    arguments: { sectionId: "verse", chords: "Am F C G" },
  };
  validateToolCall(harmony);
  applyStudioEdits([harmony], songFingerprint());
  expect(useWriting.getState().song?.body.chart.sections).toHaveLength(3);
  const blueprint = {
    name: "apply_reference_blueprint",
    arguments: {
      sectionId: "verse",
      reference: "My listening notes",
      rows: "Verse | 8 | 40\nChorus | 8 | 80",
    },
  };
  validateToolCall(blueprint);
  applyStudioEdits([blueprint], songFingerprint());
  expect(
    useWriting.getState().song?.body.referenceBlueprint?.rows,
  ).toHaveLength(2);
});

it("ranks duration-weighted melody harmony across bar boundaries without moving the arrangement", () => {
  const body = newOriginal().body;
  body.chart.defaultBpm = 120;
  const notes = parseMelody("A4 0 0.5\nC5 0.5 0.5\nE5 1 2");
  const rows = melodyHarmony(body.chart, notes, 4);
  expect(rows[0].choices[0]).toMatchObject({ chord: "Am", coverage: 1 });
  expect(rows[1].silent).toBe(false);
  expect(rows[2].silent).toBe(true);
  const next = harmonyVariation(
    body,
    "verse",
    ["Am", "C", "F", "G"],
    "melody-test",
  );
  expect(next.chart.arrangement).toEqual(body.chart.arrangement);
  expect(next.sections["melody-test"]).toEqual(body.sections.verse);
  expect(body.chart.sections).toHaveLength(2);
  expect(() => parseMelody("H4 0 1")).toThrow();
  expect(() => parseMelody("A4 -1 Infinity")).toThrow();
  expect(() => melodyHarmony(body.chart, notes, 33)).toThrow();
});

it("finds shared chord movements after transposition and bounds malformed library forms", () => {
  const source = newOriginal().body.chart;
  const moved = {
    ...transposeChart(source, 3),
    id: "transposed",
    name: "Another key",
  };
  const otherMeter = {
    ...moved,
    id: "waltz",
    timeSig: [3, 4] as [number, number],
  };
  const broken = {
    ...moved,
    id: "broken",
    arrangement: [{ sectionId: "verse", repeats: Number.MAX_SAFE_INTEGER }],
  };
  const matches = harmonicNeighbours(source, [
    source,
    moved,
    otherMeter,
    broken,
  ]);
  expect(matches.map((m) => m.chart.id)).toEqual(["transposed"]);
  expect(matches[0].shared.length).toBeGreaterThan(2);
});

it("builds a reference form from the artist's own chords, preserving locked parts and original sections", () => {
  const body = newOriginal().body;
  body.sections.verse.parts[0].locked = true;
  body.lyrics = { verse: "My original words" };
  const rows = parseBlueprint("Verse | 8 | 20\nChorus | 4 | 90");
  const next = referenceForm(body, rows, "verse", "blueprint");
  expect(next.chart.arrangement).toEqual([
    { sectionId: "blueprint-0", repeats: 1 },
    { sectionId: "blueprint-1", repeats: 1 },
  ]);
  expect(next.chart.sections[2].bars[4]).toEqual(
    body.chart.sections[0].bars[0],
  );
  expect(next.sections["blueprint-1"].parts[0]).toEqual(
    body.sections.verse.parts[0],
  );
  expect(next.sections["blueprint-1"].parts[1].intensity).toBe(0.9);
  expect(next.lyrics).toEqual(body.lyrics);
  expect(() => parseBlueprint("Oops | 300 | 10")).toThrow();
  expect(() =>
    referenceForm(
      { ...body, clips: [{ takeId: "x" } as never] },
      rows,
      "verse",
      "unsafe",
    ),
  ).toThrow(/timeline/);
});

it("requires all three bounded coach perspectives and forbids executable actions", () => {
  const advice = {
    finding: "The chorus repeats the verse groove.",
    experiment: "Try a sparser verse.",
  };
  const good = {
    composition: advice,
    arrangement: advice,
    performance: advice,
  };
  expect(coachSchema.parse(good)).toEqual(good);
  expect(coachSchema.safeParse({ composition: advice }).success).toBe(false);
  expect(
    coachSchema.safeParse({ ...good, actions: [{ name: "delete_song" }] })
      .success,
  ).toBe(false);
});

it("writes an arrangement brief locally, including lyrics only on request and enforcing length", () => {
  const body = newOriginal().body;
  body.lyrics = { verse: "These are my words" };
  const prompt = generationBrief(body, "Quiet verse, wide chorus", false);
  expect(prompt).toContain("100 BPM");
  expect(prompt).toContain("Verse: 4 bars");
  expect(prompt).toContain("These are my words");
  expect(generationBrief(body, "Backing", true)).not.toContain(
    "These are my words",
  );
  body.lyrics.verse = "x".repeat(5000);
  expect(() => generationBrief(body, "Backing", false)).toThrow(/4,000/);
});

it("snaps internal film cuts to an offset grid, preserves duration/trims and rejects collapsed shots", () => {
  const shots = [newShot("A", 2.3), newShot("B", 2.6), newShot("C", 3.1)];
  shots[1].trimStart = 12;
  const snapped = snapCuts(shots, 120, 4, 0.25);
  expect(snapped.map((s) => s.seconds)).toEqual([2.25, 2, 3.75]);
  expect(snapped[1].trimStart).toBe(12);
  expect(snapped.reduce((n, s) => n + s.seconds, 0)).toBe(8);
  expect(shots[0].seconds).toBe(2.3);
  expect(() =>
    snapCuts([newShot("short", 0.1), newShot("long", 3)], 100, 4, 0),
  ).toThrow(/collapses/);
  expect(() => snapCuts(shots, Number.NaN, 4, 0)).toThrow();
});

it("validates setlists and audio profiles without capturing secrets, and rejects missing hardware", async () => {
  const config: AudioConfig = {
    input_device: "Guitar",
    output_device: "Phones",
    input_channel: 1,
    sample_rate: 48000,
    buffer_size: 256,
  };
  expect(() =>
    validateAudioProfile(config, { inputs: [], outputs: [] }),
  ).toThrow(/Connect/);
  const devices = {
    inputs: [
      {
        name: "Guitar",
        is_default: true,
        channels: 2,
        supported_sample_rates: [48000],
      },
    ],
    outputs: [
      {
        name: "Phones",
        is_default: true,
        channels: 2,
        supported_sample_rates: [48000],
      },
    ],
  };
  expect(() => validateAudioProfile(config, devices)).not.toThrow();
  expect(() =>
    validateAudioProfile({ ...config, input_channel: 2 }, devices),
  ).toThrow(/channel/);
  expect(
    audioProfileSchema.safeParse([
      { name: "Home", config: { ...config, apiKey: "bad" } },
    ]).success,
  ).toBe(false);
  expect(
    setlistSchema.safeParse([{ id: "a", chartId: "song", bpm: 0, countIn: 1 }])
      .success,
  ).toBe(false);
  const settings = { schemaVersion: 1, futureField: { keep: true }, ...config };
  let saved: AppSettings | undefined;
  __setIpcForTests({
    invoke: async <T>(cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "settings_get") return settings as T;
      saved = args?.settings as AppSettings;
      return null as T;
    },
    listen: async () => () => {},
  });
  await saveRoomPreference("audioProfiles", [{ name: "Home", config }]);
  expect(saved?.futureField).toEqual({ keep: true });
  expect(saved?.audioProfiles).toEqual([{ name: "Home", config }]);
});

it("cues a setlist entry's own groove only when it plays the chart's meter (#64)", () => {
  const chart = newOriginal().body.chart;
  const styles = [
    { id: "rock-straight", name: "Rock", feel: { timeSig: [4, 4] } },
    { id: "ballad-68", name: "Ballad", feel: { timeSig: [6, 8] } },
  ] as never;
  const entry = { id: "a", chartId: chart.id, bpm: 100, countIn: 1 };
  expect(setlistCue(entry, [chart], styles).styleId).toBeNull();
  expect(
    setlistCue({ ...entry, styleId: "rock-straight" }, [chart], styles).styleId,
  ).toBe("rock-straight");
  expect(() =>
    setlistCue({ ...entry, styleId: "ballad-68" }, [chart], styles),
  ).toThrow(/6\/8/);
  expect(() =>
    setlistCue({ ...entry, styleId: "gone" }, [chart], styles),
  ).toThrow(/groove/);
  expect(() => setlistCue(entry, [], styles)).toThrow(/missing/);
  expect(
    setlistSchema.safeParse([{ ...entry, styleId: "rock-straight" }]).success,
  ).toBe(true);
});

it("validates rig snapshot ranges against the installed profile before recall", () => {
  const profile = JSON.parse(
    fs.readFileSync("rigs/black-spirit-200.json", "utf8"),
  ) as RigProfile;
  const control = profile.controls[0];
  const snap = {
    profileId: profile.id,
    scene: 0,
    controls: { [control.cc]: control.default },
  };
  expect(validateRigSnapshot(snap, [profile]).snap).toEqual(snap);
  expect(
    captureRig({
      currentProfile: profile,
      currentScene: 0,
      controlValues: { ...snap.controls, 200: 10 },
    } as unknown as RigState).controls,
  ).toEqual(snap.controls);
  expect(() =>
    validateRigSnapshot({ ...snap, controls: { 200: 1 } }, [profile]),
  ).toThrow();
  expect(() => validateRigSnapshot(snap, [])).toThrow(/unavailable/);
});

it("keeps versions and undo, rejecting stale proposals and recording-time mutations", () => {
  const song = newOriginal();
  useWriting.setState({
    song,
    busy: false,
    dirty: false,
    past: [],
    future: [],
  });
  useEngineStore.setState({ isRecording: false });
  const base = songFingerprint();
  const next = structuredClone(song.body);
  next.notes = "Keep this experiment";
  applySongIdea(next, base, "experiment");
  expect(useWriting.getState().song?.versions).toHaveLength(1);
  expect(useWriting.getState().past[0]).toEqual(song.body);
  expect(() => applySongIdea(next, base, "stale")).toThrow(/changed/);
  useEngineStore.setState({ isRecording: true });
  expect(() => applySongIdea(next, songFingerprint(), "recording")).toThrow(
    /operation/,
  );
});
