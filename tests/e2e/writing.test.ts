/**
 * Writing a song end to end. Every scenario runs the Write room's own store
 * actions (`useWriting`, `useEngineStore`, `useLibraryDraft`, roomActions) through
 * the real IPC client into the simulated engine, then asserts what the screens
 * render from: the song body and Undo stack, the saved list, telemetry, settings.
 *
 * `isPreview` is switched off so the desktop-only guard in `cueSetlistItem` runs
 * against the same engine (the engine simulates every command a cue sends). The
 * engine is created without its auto-tick timer, so simulated time only moves
 * when a test calls `tick`; everything else is the code the app ships.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ipc } from "../../src/ipc/client";
import type { AppSettings } from "../../src/ipc/contract";
import { type PreviewEngine, createPreviewEngine } from "../../src/ipc/preview";
import { parseChartText } from "../../src/lib/chart/text";
import { useLibraryDraft } from "../../src/lib/libraryDraft";
import {
  COALESCE_MS,
  type Original,
  arrangementRanges,
  defaultSection,
  sectionBars,
  useWriting,
} from "../../src/lib/originals";
import { cueSetlistItem, saveRoomPreference } from "../../src/lib/roomActions";
import { setlistCue, setlistSchema } from "../../src/lib/roomTools";
import {
  arrangedBars,
  deleteSection,
  harmonyChoices,
  setSectionEnergy,
  transformPhrase,
} from "../../src/lib/writingTools";
import { useEngineStore } from "../../src/store/engine";

vi.mock("../../src/ipc/client", async (original) => ({
  ...(await original<object>()),
  isPreview: false,
}));

const HOLDER = globalThis as unknown as {
  __jamPreviewEngine?: Promise<PreviewEngine>;
};
/** One simulated frame; the preview's own timer ticks at 30 fps. */
const FRAME = 0.05;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let engine: PreviewEngine;
let stopListening: () => void;
let previousEngine: ReturnType<typeof useEngineStore.getState>;
let previousWriting: ReturnType<typeof useWriting.getState>;
let previousDraft: ReturnType<typeof useLibraryDraft.getState>;

beforeEach(async () => {
  previousEngine = useEngineStore.getState();
  previousWriting = useWriting.getState();
  previousDraft = useLibraryDraft.getState();
  engine = createPreviewEngine({ autoTick: false });
  HOLDER.__jamPreviewEngine = Promise.resolve(engine);
  // What App.tsx does on startup: subscribe to telemetry, load library and settings.
  stopListening = await useEngineStore.getState().initListeners();
});

afterEach(() => {
  stopListening();
  engine.dispose();
  vi.useRealTimers();
  useEngineStore.setState(previousEngine, true);
  useWriting.setState(previousWriting, true);
  useLibraryDraft.setState(previousDraft, true);
});

const writing = () => useWriting.getState();
function song(): Original {
  const open = useWriting.getState().song;
  if (!open) throw new Error("No song is open in Write.");
  return open;
}
const body = () => song().body;
const chords = (sectionIndex: number) =>
  body().chart.sections[sectionIndex].bars.map((bar) =>
    bar.map((c) => c.chord).join(" "),
  );
const telemetry = () => useEngineStore.getState().telemetry;
const notices = () => useEngineStore.getState().notices.map((n) => n.text);
/** Advances simulated time frame by frame, as the preview's timer would. */
function elapse(seconds: number) {
  for (let i = 0; i < Math.round(seconds / FRAME); i++) engine.tick(FRAME);
}

it("New song opens a two-section starter in A minor; a second New song and Open song wait for a save", () => {
  const w = writing();
  w.createSong();
  const fresh = song();
  expect(fresh.id).toMatch(/^song-[0-9a-f-]{36}$/);
  expect(fresh.revision).toBe(0);
  expect(fresh.versions).toEqual([]);
  expect(fresh.body.chart).toMatchObject({
    id: fresh.id,
    name: "New song",
    keyTonic: 9,
    mode: "minor",
    timeSig: [4, 4],
    defaultBpm: 100,
  });
  expect(fresh.body.chart.sections.map((s) => [s.id, s.name])).toEqual([
    ["verse", "Verse"],
    ["chorus", "Chorus"],
  ]);
  expect(chords(0)).toEqual(["Am", "F", "C", "G"]);
  expect(chords(1)).toEqual(["F", "C", "G", "Am"]);
  expect(fresh.body.chart.arrangement).toEqual([
    { sectionId: "verse", repeats: 1 },
    { sectionId: "chorus", repeats: 1 },
  ]);
  expect(arrangementRanges(fresh.body.chart)).toEqual([
    { sectionId: "verse", startBar: 1, endBar: 5 },
    { sectionId: "chorus", startBar: 5, endBar: 9 },
  ]);
  expect(fresh.body.sections).toEqual({
    verse: defaultSection(),
    chorus: defaultSection(),
  });
  expect(fresh.body).toMatchObject({ clips: [], notes: "" });
  expect(writing()).toMatchObject({
    selected: "verse",
    dirty: true,
    past: [],
    future: [],
    message: "",
  });

  w.createSong();
  expect(writing().message).toBe(
    "Save this song and recording before starting another.",
  );
  expect(song().id).toBe(fresh.id);
  w.openSong(fresh);
  expect(writing().message).toBe("Save your current song and recording first.");
  expect(song()).toBe(fresh);
});

it("a run of typing in the title, lyrics and notebook is one Undo step each, a pause of COALESCE_MS starts a new one, and Undo/Redo restore every state exactly", () => {
  let now = Date.UTC(2026, 8, 5, 10);
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const pause = (ms: number) => {
    now += ms;
    vi.setSystemTime(now);
  };
  const w = writing();
  w.createSong();
  const start = structuredClone(body());

  for (const name of ["R", "Ri", "Riv", "River"])
    w.edit((b) => {
      b.chart.name = name;
    }, "title");
  expect(writing().past).toHaveLength(1);
  expect(body().chart.name).toBe("River");
  const titled = structuredClone(body());

  pause(200);
  for (const text of ["Down", "Down by", "Down by the river"])
    w.edit((b) => {
      b.lyrics ??= {};
      b.lyrics.verse = text;
    }, "lyrics:verse");
  expect(writing().past).toHaveLength(2);
  // One millisecond short of the window still joins the same step ...
  pause(COALESCE_MS - 1);
  w.edit((b) => {
    b.lyrics ??= {};
    b.lyrics.verse = "Down by the river\n";
  }, "lyrics:verse");
  expect(writing().past).toHaveLength(2);
  const firstVerse = structuredClone(body());
  // ... and the full window starts a new one.
  pause(COALESCE_MS);
  w.edit((b) => {
    b.lyrics ??= {};
    b.lyrics.verse = "Down by the river\nWhere the light goes";
  }, "lyrics:verse");
  expect(writing().past).toHaveLength(3);
  const secondVerse = structuredClone(body());

  w.edit((b) => {
    b.notes = "Theme: leaving town";
  }, "notes");
  expect(writing().past).toHaveLength(4);
  const final = structuredClone(body());
  expect(final).toMatchObject({
    notes: "Theme: leaving town",
    lyrics: { verse: "Down by the river\nWhere the light goes" },
  });
  expect(final.chart.name).toBe("River");

  w.undo();
  expect(body()).toEqual(secondVerse);
  w.undo();
  expect(body()).toEqual(firstVerse);
  w.undo();
  expect(body()).toEqual(titled);
  w.undo();
  expect(body()).toEqual(start);
  expect(writing()).toMatchObject({ past: [], dirty: true, lastEdit: null });
  expect(writing().future).toHaveLength(4);
  w.undo();
  expect(body()).toEqual(start);
  for (let i = 0; i < 4; i++) w.redo();
  expect(body()).toEqual(final);
  expect(writing().future).toEqual([]);
  expect(writing().past).toHaveLength(4);
  w.redo();
  expect(body()).toEqual(final);

  // Lyrics keep their ceiling and their section: 12,000 characters is fine,
  // one more or a section that does not exist is refused without an Undo entry.
  w.edit((b) => {
    b.lyrics = { verse: "x".repeat(12_000) };
  }, "lyrics:verse");
  expect(writing().past).toHaveLength(5);
  const withinLimit = writing().song;
  w.edit((b) => {
    b.lyrics = { verse: "x".repeat(12_001) };
  }, "lyrics:verse");
  expect(writing().message).toBe(
    "Error: Lyrics must belong to a song section and stay within 12,000 characters.",
  );
  expect(writing().song).toBe(withinLimit);
  w.edit((b) => {
    b.lyrics = { bridge: "No such section" };
  });
  expect(writing().message).toContain("Lyrics must belong to a song section");
  expect(writing().song).toBe(withinLimit);
  expect(writing().past).toHaveLength(5);
});

it("the bar editor and the harmony palette rewrite chords bar by bar; malformed bars and missing sections never reach the song", () => {
  const w = writing();
  w.createSong();

  // Bar editor: "Am:3 G:1" splits verse bar 1.
  const bars = sectionBars("Am:3 G:1");
  expect(bars).toHaveLength(1);
  w.edit((b) => {
    const verse = b.chart.sections.find((s) => s.id === "verse");
    if (verse) verse.bars[0] = bars[0];
  });
  expect(body().chart.sections[0].bars[0]).toEqual([
    { chord: "Am", beats: 3 },
    { chord: "G", beats: 1 },
  ]);

  // Harmony palette: the dominant that leads home replaces bar 4's G.
  const home = harmonyChoices(body().chart, "C", "dominant").find(
    (choice) => choice.reason === "Resolve to Am",
  );
  expect(home).toMatchObject({ chord: "E7", degree: "V7/i", shared: 1 });
  w.edit((b) => {
    const target = b.chart.sections[0].bars[3][0];
    target.chord = home?.chord ?? "";
  });
  expect(body().chart.sections[0].bars[3]).toEqual([{ chord: "E7", beats: 4 }]);

  // Add bar duplicates the selected bar, Remove bar takes it away again.
  w.edit((b) => {
    const verse = b.chart.sections[0];
    verse.bars.push(structuredClone(verse.bars[3]));
  });
  expect(chords(0)).toEqual(["Am G", "F", "C", "E7", "E7"]);
  expect(arrangedBars(body().chart)).toBe(9);
  w.edit((b) => {
    b.chart.sections[0].bars.splice(4, 1);
  });
  expect(chords(0)).toEqual(["Am G", "F", "C", "E7"]);
  expect(arrangedBars(body().chart)).toBe(8);
  expect(writing().past).toHaveLength(4);

  // The parser refuses what is not a bar before any edit is attempted.
  expect(() => sectionBars("Am H")).toThrow('"H" is not a chord');
  expect(() => sectionBars("Am:5")).toThrow(
    'bar "Am:5" holds 5 beats, expected 4',
  );
  expect(sectionBars("Am | F")).toHaveLength(2);

  // A phrase move on a section that does not exist leaves song and Undo alone.
  const untouched = writing();
  w.edit((b) => transformPhrase(b, "bridge", "rotate"));
  expect(writing().message).toBe("Error: Select a section first.");
  expect(writing().song).toBe(untouched.song);
  expect(writing().past).toBe(untouched.past);

  w.edit((b) => transformPhrase(b, "verse", "rotate"));
  expect(chords(0)).toEqual(["F", "C", "E7", "Am G"]);
  w.undo();
  expect(chords(0)).toEqual(["Am G", "F", "C", "E7"]);
});

it("Edit order and repeats moves, removes and repeats form entries inside 256 arranged bars and refuses the bar past it", () => {
  const w = writing();
  w.createSong();

  w.edit((b) => {
    [b.chart.arrangement[1], b.chart.arrangement[0]] = [
      b.chart.arrangement[0],
      b.chart.arrangement[1],
    ];
  });
  expect(arrangementRanges(body().chart)).toEqual([
    { sectionId: "chorus", startBar: 1, endBar: 5 },
    { sectionId: "verse", startBar: 5, endBar: 9 },
  ]);

  // Remove the chorus entry, then repeat the verse 64 times: exactly 256 bars.
  w.edit((b) => {
    b.chart.arrangement.splice(0, 1);
  });
  w.edit((b) => {
    b.chart.arrangement[0].repeats = 64;
  });
  expect(body().chart.arrangement).toEqual([
    { sectionId: "verse", repeats: 64 },
  ]);
  expect(arrangedBars(body().chart)).toBe(256);
  expect(arrangementRanges(body().chart)).toEqual([
    { sectionId: "verse", startBar: 1, endBar: 257 },
  ]);
  expect(writing().past).toHaveLength(3);

  const full = writing();
  const refused = [
    (b: Original["body"]) => {
      b.chart.arrangement.push({ sectionId: "chorus", repeats: 1 });
    },
    (b: Original["body"]) => {
      b.chart.arrangement[0].repeats = 65;
    },
    (b: Original["body"]) => {
      b.chart.arrangement[0].repeats = 0;
    },
    (b: Original["body"]) => {
      b.chart.arrangement.push({ sectionId: "bridge", repeats: 1 });
    },
    (b: Original["body"]) => {
      b.chart.arrangement.splice(0, 1);
    },
  ];
  for (const change of refused) {
    w.edit(change);
    expect(writing().message).toContain("256 arranged bars");
    expect(writing().song).toBe(full.song);
    expect(writing().past).toBe(full.past);
  }
  // The chorus left the form but is still a section the writer can come back to.
  expect(body().chart.sections.map((s) => s.id)).toEqual(["verse", "chorus"]);
  w.undo();
  expect(arrangedBars(body().chart)).toBe(4);
});

it("Add section, take it out of the form, Delete section: a version is kept, its lyrics and band settings go with it, and Undo brings it back", () => {
  const w = writing();
  w.createSong();
  const id = `section-${crypto.randomUUID()}`;
  const selected = body().chart.sections[0];
  w.edit((b) => {
    b.chart.sections.push({
      id,
      name: "New section",
      bars: structuredClone(selected.bars),
    });
    b.sections[id] = defaultSection();
    b.chart.arrangement.push({ sectionId: id, repeats: 1 });
  });
  if (writing().song?.body.sections[id]) w.select(id);
  expect(writing().selected).toBe(id);
  expect(arrangementRanges(body().chart).at(-1)).toEqual({
    sectionId: id,
    startBar: 9,
    endBar: 13,
  });
  expect(chords(2)).toEqual(["Am", "F", "C", "G"]);

  w.edit((b) => {
    b.lyrics ??= {};
    b.lyrics[id] = "Bridge words";
  }, `lyrics:${id}`);
  w.edit((b) => setSectionEnergy(b, id, 0.9), `energy:${id}`);
  expect(body().sections[id].parts.map((p) => p.intensity)).toEqual([
    0.9, 0.9, 0.9,
  ]);
  expect(body().sections.verse.parts.map((p) => p.intensity)).toEqual([
    0.5, 0.5, 0.5,
  ]);

  // Still in the form: the desk disables Delete, and the tool says why.
  const inForm = writing();
  w.edit((b) => deleteSection(b, id));
  expect(writing().message).toBe(
    "Error: New section is still in the form. Remove its form entries in Edit order and repeats first.",
  );
  expect(writing().song).toBe(inForm.song);

  w.edit((b) => {
    b.chart.arrangement.splice(2, 1);
  });
  const beforeDelete = structuredClone(body());
  w.version("Before deleting New section");
  w.edit((b) => deleteSection(b, id));
  const sections = song().body.chart.sections;
  if (!sections.some((s) => s.id === id)) w.select(sections[0].id);

  expect(body().chart.sections.map((s) => s.id)).toEqual(["verse", "chorus"]);
  expect(body().sections[id]).toBeUndefined();
  expect(body().lyrics?.[id]).toBeUndefined();
  expect(writing().selected).toBe("verse");
  expect(song().versions).toHaveLength(1);
  expect(song().versions[0].name).toBe("Before deleting New section");
  expect(song().versions[0].body).toEqual(beforeDelete);
  expect(song().versions[0].body.lyrics?.[id]).toBe("Bridge words");

  w.undo();
  expect(body()).toEqual(beforeDelete);
  w.redo();
  expect(body().chart.sections).toHaveLength(2);

  w.edit((b) => deleteSection(b, "ghost"));
  expect(writing().message).toBe("Error: Section no longer exists.");
  expect(body().chart.sections).toHaveLength(2);
});

it("Save song stores it in the engine and lists it; each save bumps the revision without adding a version; a stale revision is refused", async () => {
  const w = writing();
  w.createSong();
  w.edit((b) => {
    b.chart.name = "River Song";
  }, "title");
  const id = song().id;

  await w.action(w.save);
  expect(writing()).toMatchObject({
    busy: false,
    dirty: false,
    message: "Song saved.",
  });
  expect(song().revision).toBe(1);
  expect(song().versions).toEqual([]);
  expect(writing().saved.map((s) => s.id)).toEqual([id]);
  expect(writing().saved[0]).toEqual(song());
  expect(await ipc.invoke<Original[]>("originals_list")).toEqual([song()]);

  w.edit((b) => {
    b.notes = "Second pass";
  }, "notes");
  expect(writing().dirty).toBe(true);
  await w.action(w.save);
  expect(song().revision).toBe(2);
  expect(song().versions).toEqual([]);
  expect(writing().saved[0]).toMatchObject({
    revision: 2,
    body: { notes: "Second pass", chart: { name: "River Song" } },
  });

  // Another window saves the same song first.
  const other = await ipc.invoke<Original>("originals_save", {
    document: { ...song(), body: { ...song().body, notes: "Another window" } },
  });
  expect(other.revision).toBe(3);
  w.edit((b) => {
    b.notes = "Third pass";
  }, "notes");
  await w.action(w.save);
  expect(writing().message).toBe(
    "Error: This song changed in another window. Use Save copy to keep your edits.",
  );
  expect(writing().dirty).toBe(true);
  expect(song().revision).toBe(2);
  expect(body().notes).toBe("Third pass");
  expect(notices()).toContain(
    "Error: This song changed in another window. Use Save copy to keep your edits.",
  );
  const listed = await ipc.invoke<Original[]>("originals_list");
  expect(listed.map((s) => [s.id, s.revision, s.body.notes])).toEqual([
    [id, 3, "Another window"],
  ]);

  await w.action(w.saveCopy);
  expect(writing()).toMatchObject({
    dirty: false,
    message: "Copy saved. Original kept.",
  });
  expect(body().notes).toBe("Third pass");
  expect(song().id).not.toBe(id);
  const afterCopy = await ipc.invoke<Original[]>("originals_list");
  expect(afterCopy).toHaveLength(2);
  expect(afterCopy.find((s) => s.id === id)).toMatchObject({
    revision: 3,
    body: { notes: "Another window" },
  });
  expect(afterCopy.find((s) => s.id === song().id)).toMatchObject({
    revision: 1,
    body: { notes: "Third pass" },
  });
});

it("Save copy writes a second song under a new id and leaves the original in the list as it was saved", async () => {
  const w = writing();
  w.createSong();
  w.edit((b) => {
    b.chart.name = "Blue";
  });
  await w.action(w.save);
  const originalId = song().id;
  w.edit((b) => {
    b.lyrics = { verse: "New words" };
  });

  await w.action(w.saveCopy);
  const copy = song();
  expect(copy.id).not.toBe(originalId);
  expect(copy.id).toMatch(/^song-[0-9a-f-]{36}$/);
  expect(copy.revision).toBe(1);
  expect(copy.body.chart.id).toBe(copy.id);
  expect(copy.body.chart.name).toBe("Blue (copy)");
  expect(copy.body.lyrics).toEqual({ verse: "New words" });
  expect(writing()).toMatchObject({
    dirty: false,
    message: "Copy saved. Original kept.",
  });

  const listed = await ipc.invoke<Original[]>("originals_list");
  expect(
    listed.map((s) => [s.id, s.body.chart.name, s.revision, s.body.lyrics]),
  ).toEqual([
    [originalId, "Blue", 1, undefined],
    [copy.id, "Blue (copy)", 1, { verse: "New words" }],
  ]);
  expect(writing().saved).toEqual(listed);

  w.openSong(listed[0]);
  expect(song().id).toBe(originalId);
  expect(body().chart.name).toBe("Blue");
  expect(body().lyrics).toBeUndefined();
});

it("a saved song reopens from the list; Play needs the desktop engine, and the same chart played inline reaches telemetry chord by chord", async () => {
  const w = writing();
  w.createSong();
  await w.action(w.save);
  const saved = writing().saved[0];

  w.openSong(saved);
  expect(song()).toEqual(saved);
  expect(song()).not.toBe(saved);
  expect(writing()).toMatchObject({ selected: "verse", past: [], future: [] });

  await w.action(w.play);
  expect(writing().message).toBe("Error: Playback requires the desktop app.");
  expect(notices()).toContain("Error: Playback requires the desktop app.");
  expect(telemetry().transport.state).toBe("stopped");

  // The chart itself drives the preview band (what Library's Play this does).
  const e = useEngineStore.getState();
  expect(await e.playChartInline(song().body.chart)).toBe(true);
  expect(useEngineStore.getState().currentChart?.id).toBe(song().id);
  await e.transportSetCountIn(0);
  await e.transportSetTempo(120);
  await e.transportPlay();
  engine.tick(FRAME);
  expect(telemetry().transport).toMatchObject({
    state: "playing",
    bar: 1,
    bpm: 120,
    count_in_bars: 0,
  });
  expect(telemetry().band).toMatchObject({
    current_chord: "Am",
    next_chord: "F",
    current_section: "Verse",
  });
  const heard: string[] = [];
  for (let bar = 1; bar <= 8; bar++) {
    const { transport, band } = telemetry();
    heard.push(
      `${transport.bar} ${band.current_section} ${band.current_chord}`,
    );
    elapse(2);
  }
  expect(heard).toEqual([
    "1 Verse Am",
    "2 Verse F",
    "3 Verse C",
    "4 Verse G",
    "5 Chorus F",
    "6 Chorus C",
    "7 Chorus G",
    "8 Chorus Am",
  ]);
  await e.transportStop();
  engine.tick(FRAME);
  expect(telemetry().transport).toMatchObject({ state: "stopped", bar: 1 });
  expect(telemetry().band.current_chord).toBe("Am");
});

it("Loop section checks the range and the section against the form before any engine command, and nothing edits during a recording", async () => {
  const w = writing();
  w.createSong();
  const invoke = vi.spyOn(ipc, "invoke");
  try {
    for (const [start, end] of [
      [1, 99],
      [0, 2],
      [3, 3],
      [1.5, 3],
    ])
      await expect(w.loopRange(start, end)).rejects.toThrow(
        "Choose a loop inside the song form.",
      );
    w.select("bridge");
    await expect(w.rehearse()).rejects.toThrow(
      "Add this section to the song form first.",
    );
    expect(invoke).not.toHaveBeenCalled();

    // The whole form is a valid loop; the preview engine cannot play originals.
    await expect(w.loopRange(1, 9)).rejects.toThrow(
      "Playback requires the desktop app.",
    );
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(["originals_load"]);
    expect(invoke.mock.calls[0][1]).toEqual({ document: song() });

    w.select("chorus");
    await w.action(() => w.rehearse());
    expect(writing().message).toBe("Error: Playback requires the desktop app.");
  } finally {
    invoke.mockRestore();
  }

  useEngineStore.setState({ isRecording: true });
  await expect(w.loopRange(1, 5)).rejects.toThrow(
    "Save the take before changing its timeline.",
  );
  const frozen = writing().song;
  w.edit((b) => {
    b.notes = "not while the take runs";
  });
  expect(writing().message).toBe("Save the take before editing the song.");
  expect(writing().song).toBe(frozen);
});

it("Keep version names default in order, Restore is an ordinary Undo step, and the twentieth version is the last", () => {
  const w = writing();
  w.createSong();
  const original = structuredClone(body());

  w.version("   ");
  expect(song().versions.map((v) => v.name)).toEqual(["Version 1"]);
  expect(song().versions[0].id).toMatch(UUID);
  expect(song().versions[0].body).toEqual(original);
  expect(song().versions[0].body).not.toBe(body());

  w.edit((b) => {
    b.chart.name = "Second";
  });
  w.version("Second title");
  w.edit((b) => {
    b.chart.name = "Third";
  });
  const third = structuredClone(body());
  expect(song().versions.map((v) => v.name)).toEqual([
    "Version 1",
    "Second title",
  ]);
  expect(song().versions[1].body.chart.name).toBe("Second");

  w.restore(song().versions[0].id);
  expect(body()).toEqual(original);
  expect(writing().past).toHaveLength(3);
  w.undo();
  expect(body()).toEqual(third);
  const untouched = writing();
  w.restore("missing");
  expect(writing().song).toBe(untouched.song);
  expect(writing().past).toBe(untouched.past);

  while (song().versions.length < 20) w.version();
  expect(song().versions.at(-1)?.name).toBe("Version 20");
  w.version("One too many");
  expect(song().versions).toHaveLength(20);
  expect(writing().message).toBe(
    "Twenty versions saved. Remove an unused version before adding another.",
  );
  // Removing a version (the desk's Remove button) makes room again.
  useWriting.setState({
    song: { ...song(), versions: song().versions.slice(1) },
    dirty: true,
  });
  w.version("Room again");
  expect(song().versions).toHaveLength(20);
  expect(song().versions.at(-1)?.name).toBe("Room again");
});

it("Library: a chart typed as text stays as a draft across rooms, saves as a user chart, loads into the band, and can be deleted", async () => {
  const e = useEngineStore.getState();
  const text =
    "# River Tune\nkey: A minor\nbpm: 96\nstyle: funk-16\n\n[Verse x2]\n| Am | F | C | G |\n";
  // The editor's onChange.
  useLibraryDraft.setState({ text, dirty: true, editingId: null });
  const parsed = parseChartText(text);
  expect(parsed.problems).toEqual([]);
  const draft = parsed.chart;
  if (!draft) throw new Error("The typed chart did not parse.");
  expect(draft).toMatchObject({
    id: "river-tune",
    name: "River Tune",
    defaultBpm: 96,
    defaultStyleId: "funk-16",
    arrangement: [{ sectionId: "verse", repeats: 2 }],
  });

  // Leaving for Stage and coming back keeps the draft.
  e.setScreen("stage");
  e.setScreen("library");
  expect(useLibraryDraft.getState()).toMatchObject({
    text,
    dirty: true,
    editingId: null,
  });

  // Save (Ctrl+S).
  expect(await e.saveChart(draft)).toBe(
    "(preview) ~/JosefinesJamstudio/charts/river-tune.json",
  );
  useLibraryDraft.setState((current) => ({
    baseline: text,
    dirty: current.text !== text,
    editingId: draft.id,
  }));
  expect(useLibraryDraft.getState()).toMatchObject({
    text,
    baseline: text,
    dirty: false,
    editingId: "river-tune",
  });
  expect(notices()).toContain("Saved River Tune");
  expect(useEngineStore.getState().libraryInfo?.userChartIds).toEqual([
    "river-tune",
  ]);
  expect(useEngineStore.getState().charts.map((c) => c.id)).toContain(
    "river-tune",
  );

  // Load: the band adopts the chart's tempo and groove and plays its chords.
  await e.bandLoadChart("river-tune");
  expect(useEngineStore.getState().currentChart?.id).toBe("river-tune");
  await e.transportSetCountIn(0);
  await e.transportPlay();
  engine.tick(FRAME);
  expect(telemetry().transport).toMatchObject({ state: "playing", bpm: 96 });
  expect(telemetry().band).toMatchObject({
    style_id: "funk-16",
    style_name: "Funk 16th Groove",
    current_chord: "Am",
    next_chord: "F",
    current_section: "Verse",
  });
  await e.transportStop();

  // Edit again, then Discard draft changes returns to the saved text.
  useLibraryDraft.setState({ text: `${text}| E7 |\n`, dirty: true });
  useLibraryDraft.setState({
    text: useLibraryDraft.getState().baseline,
    dirty: false,
  });
  expect(useLibraryDraft.getState().text).toBe(text);

  // Delete removes the user chart; bundled charts are protected.
  await e.deleteUserChart("river-tune");
  expect(useEngineStore.getState().charts.map((c) => c.id)).not.toContain(
    "river-tune",
  );
  expect(useEngineStore.getState().libraryInfo?.userChartIds).toEqual([]);
  await e.deleteUserChart("blues-12-bar");
  expect(notices()).toContain(
    'Delete chart: "blues-12-bar" is not a user chart',
  );
  expect(useEngineStore.getState().charts.map((c) => c.id)).toContain(
    "blues-12-bar",
  );

  // Problems are listed by line, and Save stays disabled while any remain.
  expect(parseChartText("# Broken\n| Am | H |").problems).toEqual([
    { line: 2, message: '"H" is not a chord' },
  ]);
});

it("a setlist entry with its own groove is saved with the settings and Cue sets the band up without starting playback", async () => {
  const e = useEngineStore.getState();
  const entry = {
    id: "opener",
    chartId: "rock-song-form",
    styleId: "funk-16",
    bpm: 132,
    countIn: 2,
  };
  await saveRoomPreference("rehearsalSetlist", [entry]);
  const settings = useEngineStore.getState().settings;
  expect(settings).toMatchObject({
    schemaVersion: 1,
    sample_rate: 48_000,
    buffer_size: 256,
    rehearsalSetlist: [entry],
  });
  expect(
    (await ipc.invoke<AppSettings>("settings_get")).rehearsalSetlist,
  ).toEqual([entry]);

  // The Setlist tool reads the saved list back and checks the cue before sending it.
  const list = setlistSchema.parse(settings?.rehearsalSetlist);
  const state = useEngineStore.getState();
  const cue = setlistCue(list[0], state.charts, state.styles);
  expect(cue).toMatchObject({ styleId: "funk-16", bpm: 132, countIn: 2 });
  expect(cue.chart.name).toBe("Rock Song Form (Verse / Chorus / Solo)");

  // The band is mid-blues with the tempo trainer on when the cue arrives.
  e.setTempoTrainer({ enabled: true });
  await e.transportSetCountIn(0);
  await e.transportPlay();
  elapse(1);
  expect(telemetry().transport).toMatchObject({ state: "playing", bpm: 80 });
  expect(telemetry().band.current_chord).toBe("A7");

  await cueSetlistItem(list[0]);
  engine.tick(FRAME);
  expect(useEngineStore.getState().currentChart?.id).toBe("rock-song-form");
  expect(telemetry().transport).toMatchObject({
    state: "stopped",
    bar: 1,
    bpm: 132,
    count_in_bars: 2,
    loop_enabled: false,
    time_signature: [4, 4],
  });
  expect(telemetry().band).toMatchObject({
    style_id: "funk-16",
    style_name: "Funk 16th Groove",
    current_chord: "A",
    current_section: "Intro",
  });
  expect(useEngineStore.getState().tempoTrainer.enabled).toBe(false);

  // Play when ready: two bars of count-in, then the intro on A.
  await e.transportPlay();
  engine.tick(FRAME);
  expect(telemetry().transport.state).toBe("counting_in");
  elapse((2 * 4 * 60) / 132 + 0.2);
  expect(telemetry().transport).toMatchObject({ state: "playing", bar: 1 });
  expect(telemetry().band).toMatchObject({
    style_id: "funk-16",
    current_chord: "A",
    current_section: "Intro",
  });
  await e.transportStop();
});

it("Cue refuses a missing chart, a groove in another meter, an invalid entry and a cue during recording, leaving the band as it plays", async () => {
  const e = useEngineStore.getState();
  const entry = {
    id: "opener",
    chartId: "rock-song-form",
    styleId: "funk-16",
    bpm: 132,
    countIn: 0,
  };
  await cueSetlistItem(entry);
  await e.transportPlay();
  elapse(0.5);
  expect(telemetry().transport).toMatchObject({ state: "playing", bpm: 132 });

  await expect(
    cueSetlistItem({ ...entry, id: "waltz", styleId: "ballad-68" }),
  ).rejects.toThrow(
    "Slow 6/8 Ballad is in 6/8; Rock Song Form (Verse / Chorus / Solo) is in 4/4. Choose a groove in the chart's meter.",
  );
  await expect(
    cueSetlistItem({ ...entry, id: "gone", chartId: "not-a-chart" }),
  ).rejects.toThrow(
    "This chart is missing. Restore it in Library or remove the setlist entry.",
  );
  await expect(
    cueSetlistItem({ ...entry, id: "lost", styleId: "not-a-style" }),
  ).rejects.toThrow(
    "This entry's groove is no longer installed. Edit the entry and choose another groove.",
  );
  await expect(cueSetlistItem({ ...entry, bpm: 300 })).rejects.toThrow(
    /less than or equal to 240/,
  );
  await expect(
    saveRoomPreference("rehearsalSetlist", [entry, { ...entry }]),
  ).rejects.toThrow("Setlist entry ids must be unique.");
  await expect(
    saveRoomPreference("rehearsalSetlist", [{ ...entry, countIn: 5 }]),
  ).rejects.toThrow(/less than or equal to 4/);
  expect(useEngineStore.getState().settings?.rehearsalSetlist).toBeUndefined();
  expect(
    (await ipc.invoke<AppSettings>("settings_get")).rehearsalSetlist,
  ).toBeUndefined();

  useEngineStore.setState({ isRecording: true });
  await expect(cueSetlistItem(entry)).rejects.toThrow(
    "Save the recording before changing the setlist song.",
  );

  engine.tick(FRAME);
  expect(useEngineStore.getState().currentChart?.id).toBe("rock-song-form");
  expect(telemetry().transport).toMatchObject({ state: "playing", bpm: 132 });
  expect(telemetry().band.style_id).toBe("funk-16");
  await e.transportStop();
});
