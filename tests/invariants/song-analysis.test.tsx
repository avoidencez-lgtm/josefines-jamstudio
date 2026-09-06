import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { SongAnalysis } from "../../src/components/SongAnalysis";
import { ipc } from "../../src/ipc/client";
import { completeGeneratedAudio, useMedia } from "../../src/lib/media";
import { chordPassages, readSongAnalysis } from "../../src/lib/songAnalysis";
import { readAnalysisStatus } from "../../src/lib/songAnalysis";
import { useEngineStore } from "../../src/store/engine";
import status from "../fixtures/seams/analysis-status.json";
import fixture from "../fixtures/seams/song-analysis.json";

afterEach(() => vi.restoreAllMocks());

it("shows interrupted preparation beside preserved estimates and refuses unknown status versions", () => {
  expect(readAnalysisStatus(status)?.state).toBe("canceled");
  expect(readAnalysisStatus({ ...status, schemaVersion: 2 })).toBeNull();
  for (const value of [undefined, fixture]) {
    const html = renderToStaticMarkup(
      createElement(SongAnalysis, { value, status }),
    );
    expect(html).toContain("Audio kept; analysis did not finish");
    if (value) expect(html).toContain("90.0 BPM");
  }
  expect(
    renderToStaticMarkup(
      createElement(SongAnalysis, {
        value: undefined,
        status: { schemaVersion: 2 },
      }),
    ),
  ).toContain("status is unreadable");
});

it("opens only completed generated audio for rehearsal, preserves failure and never starts playback", async () => {
  const before = useEngineStore.getState();
  const media = useMedia.getState();
  useEngineStore.setState({ isPreview: false });
  useMedia.setState({
    assets: [
      {
        id: "song",
        kind: "audio",
        label: "Generated",
        path: "source.wav",
        seconds: 3,
      },
    ],
  });
  const invoke = vi.spyOn(ipc, "invoke").mockResolvedValue(null);
  try {
    await completeGeneratedAudio({ status: "analysis", assetId: "song" });
    expect(invoke).not.toHaveBeenCalled();
    await completeGeneratedAudio({ status: "ready", assetId: "song" });
    expect(invoke.mock.calls.map(([name]) => name)).toEqual([
      "media_reference_load",
    ]);
    expect(useEngineStore.getState().currentScreen).toBe("stage");
    useEngineStore.setState({ currentScreen: "ai-music" });
    invoke.mockRejectedValueOnce(new Error("Source unavailable"));
    await expect(
      completeGeneratedAudio({ status: "ready", assetId: "song" }),
    ).rejects.toThrow("Source unavailable");
    expect(useEngineStore.getState().currentScreen).toBe("ai-music");
  } finally {
    useEngineStore.setState(before, true);
    useMedia.setState(media, true);
  }
});

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
