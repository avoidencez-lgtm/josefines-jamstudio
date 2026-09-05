import { beforeEach, expect, it } from "vitest";
import { applyProposal, labRequest } from "../../src/lib/jo/songLab";
import {
  applyStudioEdits,
  songFingerprint,
} from "../../src/lib/jo/studioTools";
import { newOriginal, sectionBars, useWriting } from "../../src/lib/originals";
import {
  arrangedBars,
  checkWritingForm,
  deleteSection,
  duplicateSection,
  harmonyChoices,
  setSectionEnergy,
  transformPhrase,
} from "../../src/lib/writingTools";
import { useEngineStore } from "../../src/store/engine";

beforeEach(() => {
  useWriting.setState({
    song: newOriginal(),
    past: [],
    future: [],
    busy: false,
    dirty: false,
    message: "",
  });
  useEngineStore.setState({ isRecording: false });
});

it("offers playable theory choices in every key, including a resolving dominant and shared tones", () => {
  const chart = newOriginal().body.chart;
  for (const mode of ["major", "minor"] as const)
    for (let keyTonic = 0; keyTonic < 12; keyTonic++) {
      for (const family of ["key", "borrowed", "dominant"] as const) {
        const choices = harmonyChoices(
          { ...chart, mode, keyTonic },
          "C",
          family,
        );
        expect(choices.length).toBeGreaterThanOrEqual(6);
        for (const c of choices) expect(sectionBars(c.chord)).toHaveLength(1);
      }
    }
  const cMajor = { ...chart, keyTonic: 0, mode: "major" as const };
  expect(harmonyChoices(cMajor, "Am", "key")[0]).toMatchObject({
    chord: "C",
    degree: "I",
    shared: 2,
  });
  expect(harmonyChoices(cMajor, "", "borrowed")[3].chord).toBe("Fm");
  expect(harmonyChoices(cMajor, "", "dominant")[1]).toMatchObject({
    chord: "A7",
    reason: "Resolve to Dm",
  });
});

it("duplicates a section with independent lyrics and band settings, preserving phrase timing and Undo", () => {
  const w = useWriting.getState();
  w.edit((b) => {
    b.lyrics = { verse: "Keep this line" };
    b.chart.sections[0].bars = sectionBars("Am:3 G:1 | F | C | G");
    b.sections.verse.parts[1].locked = true;
  });
  const before = structuredClone(useWriting.getState().song?.body);
  w.edit((b) => {
    duplicateSection(b, "verse", "variation");
    transformPhrase(b, "variation", "rotate");
    setSectionEnergy(b, "variation", 0.9);
  });
  const changed = useWriting.getState().song?.body;
  if (!changed || !before) throw new Error("Missing test song");
  expect(changed.chart.sections[0]).toEqual(before.chart.sections[0]);
  expect(changed.chart.sections[2].bars.at(-1)).toEqual([
    { chord: "Am", beats: 3 },
    { chord: "G", beats: 1 },
  ]);
  expect(changed.lyrics?.variation).toBe("Keep this line");
  expect(changed.sections.variation.parts[1]).toEqual(
    before.sections.verse.parts[1],
  );
  expect(changed.sections.variation.parts[0].intensity).toBe(0.9);
  expect(changed.sections.verse.parts[0].intensity).toBe(0.5);
  w.undo();
  expect(useWriting.getState().song?.body).toEqual(before);
  w.redo();
  expect(useWriting.getState().song?.body).toEqual(changed);
});

it("deletes only sections outside the form, with their lyrics and settings, and Undo restores them (#58)", () => {
  const w = useWriting.getState();
  w.edit((b) => {
    duplicateSection(b, "verse", "idea");
    b.lyrics = { idea: "Spare words" };
    b.chart.arrangement = b.chart.arrangement.filter(
      (a) => a.sectionId !== "idea",
    );
  });
  const before = structuredClone(currentSong().body);
  expect(() => deleteSection(before, "verse")).toThrow(/still in the form/);
  expect(() => deleteSection(before, "missing")).toThrow(/no longer exists/);
  w.edit((b) => deleteSection(b, "idea"));
  const after = currentSong().body;
  expect(after.chart.sections.map((s) => s.id)).toEqual(["verse", "chorus"]);
  expect(after.sections.idea).toBeUndefined();
  expect(after.lyrics?.idea).toBeUndefined();
  expect(() => checkWritingForm(after)).not.toThrow();
  w.undo();
  expect(currentSong().body).toEqual(before);
  const single = structuredClone(newOriginal().body);
  single.chart.sections = [single.chart.sections[0]];
  single.chart.arrangement = [];
  expect(() => deleteSection(single, "verse")).toThrow(/at least one/);
});

it("groups a slider drag or a run of typing into one Undo step (#38)", () => {
  const w = useWriting.getState();
  for (const value of [0.6, 0.7, 0.8])
    w.edit((b) => setSectionEnergy(b, "verse", value), "energy:verse");
  expect(useWriting.getState().past).toHaveLength(1);
  expect(currentSong().body.sections.verse.parts[0].intensity).toBe(0.8);
  // Another field starts its own step; the same field after a pause does too.
  w.edit((b) => {
    b.notes = "a";
  }, "notes");
  w.edit((b) => {
    b.notes = "ab";
  }, "notes");
  expect(useWriting.getState().past).toHaveLength(2);
  useWriting.setState({ lastEdit: { key: "notes", at: Date.now() - 5000 } });
  w.edit((b) => {
    b.notes = "abc";
  }, "notes");
  expect(useWriting.getState().past).toHaveLength(3);
  w.undo();
  expect(currentSong().body.notes).toBe("ab");
  w.undo();
  expect(currentSong().body.notes).toBe("");
  w.undo();
  expect(currentSong().body.sections.verse.parts[0].intensity).toBe(0.5);
  expect(useWriting.getState().past).toHaveLength(0);
});

it("rejects oversized and empty forms atomically without adding Undo, and counts every repeat", () => {
  const w = useWriting.getState();
  w.edit((b) => {
    b.chart.arrangement = [{ sectionId: "verse", repeats: 64 }];
  });
  const before = useWriting.getState();
  const originalSong = currentSong();
  expect(arrangedBars(originalSong.body.chart)).toBe(256);
  w.edit((b) => transformPhrase(b, "verse", "repeat"));
  expect(useWriting.getState().song).toBe(before.song);
  expect(useWriting.getState().past).toBe(before.past);
  expect(useWriting.getState().message).toContain("256");
  w.edit((b) => {
    b.chart.sections[0].bars = [];
  });
  expect(useWriting.getState().song).toBe(before.song);
  expect(() =>
    checkWritingForm({ ...originalSong.body, lyrics: { missing: "No" } }),
  ).toThrow(/Lyrics/);
});

it("restores older versions without retaining later lyric fields; redo returns those lyrics", () => {
  const w = useWriting.getState();
  w.version("Before lyrics");
  const id = currentSong().versions[0].id;
  w.edit((b) => {
    b.lyrics = { verse: "Later draft" };
  });
  w.restore(id);
  expect(currentSong().body.lyrics).toBeUndefined();
  w.undo();
  expect(currentSong().body.lyrics?.verse).toBe("Later draft");
});

it("shares section lyrics with both AI paths and applies reviewed seeds without erasing existing text", () => {
  const w = useWriting.getState();
  w.edit((b) => {
    b.lyrics = { verse: "My first line" };
  });
  const song = currentSong();
  expect(
    labRequest(song, "verse", "lyrics", "Another line").messages[0].content,
  ).toContain("My first line");
  applyProposal({
    songId: song.id,
    sectionId: "verse",
    kind: "lyrics",
    originalBody: JSON.stringify(song.body),
    source: "synthetic fixture",
    idea: {
      title: "Second line",
      summary: "A continuation",
      chords: "",
      notes: "My second line",
    },
  });
  expect(currentSong().body.lyrics?.verse).toBe(
    "My first line\n\nMy second line",
  );
  // The lyric lines live in their section; the notebook keeps only the provenance.
  expect(currentSong().body.notes).toContain("Second line (synthetic fixture)");
  expect(currentSong().body.notes).not.toContain("My second line");
  applyStudioEdits(
    [
      {
        name: "write_notes",
        arguments: { sectionId: "verse", text: "Third line" },
      },
    ],
    songFingerprint(),
  );
  expect(currentSong().body.lyrics?.verse).toContain("Third line");
  const before = songFingerprint();
  expect(() =>
    applyStudioEdits([
      { name: "write_notes", arguments: { sectionId: "missing", text: "No" } },
    ]),
  ).toThrow(/missing/i);
  expect(songFingerprint()).toBe(before);
});

function currentSong() {
  const song = useWriting.getState().song;
  if (!song) throw new Error("Missing test song");
  return song;
}
