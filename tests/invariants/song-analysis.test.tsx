import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SongAnalysis } from "../../src/components/SongAnalysis";
import { chordPassages, readSongAnalysis } from "../../src/lib/songAnalysis";
import fixture from "../fixtures/seams/song-analysis.json";

it("validates saved local measurements, groups passages without rewriting evidence and explains missing estimates", () => {
  const analysis = readSongAnalysis(fixture);
  expect(analysis).not.toBeNull();
  if (!analysis) throw new Error("Invalid fixture");
  expect(chordPassages(analysis).map((c) => c.chord)).toEqual([
    "C",
    "F",
    "G",
    null,
  ]);
  expect(analysis.chords).toHaveLength(6);
  const html = renderToStaticMarkup(
    createElement(SongAnalysis, { value: analysis }),
  );
  expect(html).toContain("90.0 BPM");
  expect(html).toContain("C major");
  expect(html).toContain("low confidence");
  expect(html).toContain("Unknown chord");
  for (const patch of [
    { schemaVersion: 2 },
    { beats: [1, 0] },
    { bpm: Number.NaN },
    { chords: [{ start: 3, end: 2, chord: "C" }] },
  ])
    expect(readSongAnalysis({ ...fixture, ...patch })).toBeNull();
  expect(
    renderToStaticMarkup(
      createElement(SongAnalysis, {
        value: { ...analysis, bpm: null, key: null },
      }),
    ),
  ).toContain("Tempo not found");
  expect(
    renderToStaticMarkup(createElement(SongAnalysis, { value: {} })),
  ).toContain("Analyze again");
});
