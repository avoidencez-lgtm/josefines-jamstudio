import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReferenceGridEditor } from "../../src/components/ReferenceGrid";
import { ReferencePlayer } from "../../src/components/ReferencePlayer";
import { TransportBar } from "../../src/components/TransportBar";
import type { ReferenceState } from "../../src/ipc/contract";
import { useMedia } from "../../src/lib/media";
import { Songs } from "../../src/screens/Songs";
import { useEngineStore } from "../../src/store/engine";
import referenceGrid from "../fixtures/seams/reference-grid.json";
import analysis from "../fixtures/seams/song-analysis.json";

it("offers bounded practice controls beside a real library selection and keeps preview disabled", () => {
  const initial = useMedia.getInitialState();
  const assets = initial.assets;
  initial.assets = [
    {
      id: "reference",
      kind: "audio",
      label: "Synthetic reference",
      path: "reference.wav",
      seconds: 2,
    },
  ];
  try {
    const html = renderToStaticMarkup(createElement(Songs));
    expect(html).toContain("Make a practice copy");
    expect(html).toContain('aria-label="Practice speed"');
    expect(html).toContain('min="50" max="150"');
    expect(html).toContain('value="-12"');
    expect(html).toContain('value="12"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Create practice copy/);
    expect(html).not.toContain("<audio");
    expect(html).toContain(
      "I agree to upload this song and pay the provider charge.",
    );
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Upload &amp; separate stems/,
    );
    expect(html).toContain("Import stem ZIP");
  } finally {
    initial.assets = assets;
  }
});

it("offers a native reference seconds loop without suggesting an analysed chord grid", () => {
  const html = renderToStaticMarkup(
    createElement(ReferencePlayer, {
      song: {
        asset_id: "reference",
        label: "Synthetic reference",
        seconds: 4,
        position: 1,
        state: "paused",
        loop_start: 0.5,
        loop_end: 2,
        loop_enabled: true,
      },
    }),
  );
  expect(html).toContain('aria-label="Reference player"');
  expect(html).toContain("Seek to (seconds)");
  expect(html).toContain('aria-label="Live reference practice"');
  expect(html).toContain("Reference speed · 100%");
  expect(html).toContain("Reference transpose");
  expect(html).toMatch(
    /<button[^>]*disabled=""[^>]*>Apply &amp; save speed\/key/,
  );
  expect(html).toContain("Loop this range");
  expect(html).toContain("beat-grid loops are not available yet");
  expect(html).toMatch(/<button[^>]*type="button"[^>]*>Loop off/);
  expect(html).not.toContain("<audio");
});

it("requires explicit grid confirmation and displays only the native consumed section position", () => {
  const html = renderToStaticMarkup(
    createElement(ReferenceGridEditor, {
      song: {
        id: "fixture",
        kind: "audio",
        label: "Fixture",
        path: "fixture.wav",
        seconds: 5,
        songAnalysis: { ...analysis, seconds: 5, beats: referenceGrid.beats },
        referenceGrid,
      },
      locked: false,
    }),
  );
  expect(html).toContain("First downbeat");
  expect(html).toContain("2 complete bars available");
  expect(html).toContain("End before bar");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save confirmed map/);
  expect(html).toContain("not automatic detections");
  const player = renderToStaticMarkup(
    createElement(ReferencePlayer, {
      song: {
        asset_id: "fixture",
        label: "Fixture",
        seconds: 5,
        position: 2.5,
        state: "playing",
        loop_enabled: true,
        loop_start: 2.2,
        loop_end: 4.6,
        grid: {
          origin: "confirmed-local",
          beats_per_bar: 4,
          bars: 2,
          sections: referenceGrid.sections,
          position: {
            bar: 2,
            beat: 1.5,
            bpm: 75,
            section_id: "chorus",
            section_label: "Chorus",
          },
        },
      },
    }),
  );
  expect(player).toContain("Bar 2 · beat 1.5 · 75.0 BPM · Chorus");
  expect(player).toContain("Loop Chorus");
  expect(player).not.toContain("beat-grid loops are not available yet");
  expect(player).not.toContain("<audio");
});

it("keeps the chart meter readout in band mode and uses seconds for references", () => {
  const initial = useEngineStore.getInitialState();
  const telemetry = initial.telemetry;
  try {
    const band = renderToStaticMarkup(createElement(TransportBar));
    expect(band).toContain("Meter follows the loaded chart");
    expect(band).not.toContain("<select");
    initial.telemetry = {
      ...telemetry,
      reference: {
        asset_id: "reference",
        label: "Synthetic reference",
        seconds: 4,
        position: 1,
        state: "paused",
        loop_start: 0,
        loop_end: 4,
        loop_enabled: false,
      },
    };
    const reference = renderToStaticMarkup(createElement(TransportBar));
    expect(reference).toContain("Reference · 1.0 / 4.0 s");
    expect(reference).not.toContain("Meter follows the loaded chart");
    expect(reference).not.toContain("Count-in");
  } finally {
    initial.telemetry = telemetry;
  }
});

it("shows native audible chord estimates and explicit stale or unknown analysis", () => {
  const song: ReferenceState = {
    asset_id: "reference",
    label: "Synthetic reference",
    seconds: 4,
    position: 1,
    state: "playing",
    loop_start: 0,
    loop_end: 4,
    loop_enabled: false,
    analysis: {
      confidence: "low",
      bpm: 90,
      key: "C major",
      chord: "C",
      next_chord: "F",
      beat: 2,
      beat_count: 6,
    },
  };
  const render = () =>
    renderToStaticMarkup(createElement(ReferencePlayer, { song }));
  const html = render();
  expect(html).toContain("Now: C");
  expect(html).toContain("Next: F");
  expect(html).toContain("Beat 2 of 6");
  expect(html).toContain("low confidence");
  expect(html).not.toContain("<audio");
  if (!song.analysis) throw new Error("Missing fixture analysis");
  song.analysis = {
    ...song.analysis,
    chord: null,
    next_chord: null,
    beat: null,
  };
  expect(render()).toContain("Now: Unknown");
  song.analysis = null;
  song.analysis_error =
    "Audio has changed since analysis. Analyze it again in Songs.";
  expect(render()).toContain(song.analysis_error);
  expect(render()).not.toContain("Now:");
});

it("shows explicit guitar selection, saved mute state and safe preview stem controls", () => {
  const song: ReferenceState = {
    asset_id: "reference",
    label: "Synthetic reference",
    seconds: 4,
    position: 0,
    state: "stopped",
    loop_start: 0,
    loop_end: 4,
    loop_enabled: false,
    stems: [
      {
        id: "track-1",
        label: "Track one",
        gain: 1,
        muted: false,
        guitar: false,
      },
      {
        id: "track-2",
        label: "Track two",
        gain: 0.5,
        muted: false,
        guitar: false,
      },
    ],
  };
  const render = () =>
    renderToStaticMarkup(createElement(ReferencePlayer, { song }));
  const html = render();
  expect(html).toContain('aria-label="Stem mixer"');
  expect(html).toContain("Not identified");
  expect(html).toContain("Track two · 50%");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Minus guitar/);
  expect(html).not.toContain("<audio");
  if (!song.stems) throw new Error("Missing test stems");
  song.stems[0].guitar = true;
  song.stems[0].muted = true;
  expect(render()).toContain("Restore guitar");
});
