import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Chart } from "../../src/ipc/contract";
import { transposeChord } from "../../src/lib/chart/notes";
import {
  chartToText,
  isRestSymbol,
  parseChartText,
  resolveChart,
} from "../../src/lib/chart/text";
import { transposeChart } from "../../src/lib/chart/transpose";

const BLUES = `# Blues in A
key: A major
time: 4/4
bpm: 110
style: blues-shuffle

[Chorus x2]
| A7 | A7 | A7 | A7 |
| D7 | D7 | A7 | A7 |
| E7 | D7 | A7 | E7 |
`;

describe("chart text parser", () => {
  it("parses a plain blues", () => {
    const { chart, problems } = parseChartText(BLUES);
    expect(problems).toEqual([]);
    expect(chart).not.toBeNull();
    expect(chart?.id).toBe("blues-in-a");
    expect(chart?.keyTonic).toBe(9);
    expect(chart?.mode).toBe("major");
    expect(chart?.defaultBpm).toBe(110);
    expect(chart?.defaultStyleId).toBe("blues-shuffle");
    expect(chart?.sections).toHaveLength(1);
    expect(chart?.sections[0].bars).toHaveLength(12);
    expect(chart?.arrangement).toEqual([{ sectionId: "chorus", repeats: 2 }]);
    expect(resolveChart(chart as Chart)).toHaveLength(24);
  });

  it("treats N.C., rest and - as playable rest bars (#130)", () => {
    for (const tok of [
      "N.C.",
      "N.C",
      "NC",
      "NC.",
      "n.c.",
      "rest",
      "REST",
      "-",
    ]) {
      expect(isRestSymbol(tok)).toBe(true);
    }
    expect(isRestSymbol("A7")).toBe(false);
    expect(isRestSymbol("Am")).toBe(false);
    const { chart, problems } = parseChartText("[A]\n| A7 | N.C. | rest | - |");
    expect(problems).toEqual([]);
    expect(chart?.sections[0].bars.map((b) => b[0].chord)).toEqual([
      "A7",
      "N.C.",
      "rest",
      "-",
    ]);
  });

  it("splits bars evenly, honours explicit beats and % repeats", () => {
    const { chart, problems } = parseChartText(
      "time: 4/4\n[A]\n| Dm7 G7 | Cmaj7 | % | Am7:3 D7:1 | % |",
    );
    expect(problems).toEqual([]);
    const bars = chart?.sections[0].bars ?? [];
    expect(bars).toHaveLength(5);
    expect(bars[0]).toEqual([
      { chord: "Dm7", beats: 2 },
      { chord: "G7", beats: 2 },
    ]);
    expect(bars[1]).toEqual([{ chord: "Cmaj7", beats: 4 }]);
    expect(bars[2]).toEqual([{ chord: "Cmaj7", beats: 4 }]);
    expect(bars[3]).toEqual([
      { chord: "Am7", beats: 3 },
      { chord: "D7", beats: 1 },
    ]);
    expect(bars[4]).toEqual(bars[3]);
  });

  it("mixes explicit and free chords in one bar", () => {
    const { chart } = parseChartText("[A]\n| C:1 F G |");
    expect(chart?.sections[0].bars[0]).toEqual([
      { chord: "C", beats: 1 },
      { chord: "F", beats: 1.5 },
      { chord: "G", beats: 1.5 },
    ]);
  });

  it("reports problems with line numbers instead of throwing", () => {
    const { chart, problems } = parseChartText(
      "[A]\n| C | Xyz |\n| Dm7:3 G7:3 |\n| % |\nkey: H minor",
    );
    expect(problems.map((p) => p.line)).toEqual([2, 3, 5]);
    expect(problems[0].message).toContain("Xyz");
    expect(problems[1].message).toContain("6 beats");
    expect(problems[2].message).toContain("cannot read key");
    // Still playable: the bad bars were dropped, the good ones kept.
    expect(chart?.sections[0].bars).toHaveLength(2);
  });

  it("supports an explicit arrangement and section style overrides", () => {
    const text = `# Form
[Verse]
| Am | G |
section style: rock-straight
[Chorus]
| C | F |
arrangement: chorus, verse x2, chorus
`;
    const { chart, problems } = parseChartText(text);
    expect(problems).toEqual([]);
    expect(chart?.sections[0].styleOverrideId).toBe("rock-straight");
    expect(chart?.arrangement).toEqual([
      { sectionId: "chorus", repeats: 1 },
      { sectionId: "verse", repeats: 2 },
      { sectionId: "chorus", repeats: 1 },
    ]);
    expect(resolveChart(chart as Chart).map((b) => b.sectionId)).toEqual([
      "chorus",
      "chorus",
      "verse",
      "verse",
      "verse",
      "verse",
      "chorus",
      "chorus",
    ]);
  });

  it("keeps Mix/Box/Remix names and still honours Chorus x2", () => {
    const { chart, problems } = parseChartText(`# Form
[Mix 2]
| C | G |
[Box 3]
| Am | F |
[Remix 1]
| Dm | E |
[Chorus x2]
| G | C |
[Verse 2]
| D | A |
[Bridge x 2]
| Em | B |
arrangement: mix 2, chorus x2, verse 2
`);
    expect(problems).toEqual([]);
    expect(chart?.sections.map((s) => [s.id, s.name])).toEqual([
      ["mix-2", "Mix 2"],
      ["box-3", "Box 3"],
      ["remix-1", "Remix 1"],
      ["chorus", "Chorus"],
      ["verse-2", "Verse 2"],
      ["bridge", "Bridge"],
    ]);
    expect(chart?.arrangement).toEqual([
      { sectionId: "mix-2", repeats: 1 },
      { sectionId: "chorus", repeats: 2 },
      { sectionId: "verse-2", repeats: 1 },
    ]);
    const implicit = parseChartText("[Mix 2]\n| C |\n[Chorus x2]\n| G |");
    expect(implicit.problems).toEqual([]);
    expect(implicit.chart?.arrangement).toEqual([
      { sectionId: "mix-2", repeats: 1 },
      { sectionId: "chorus", repeats: 2 },
    ]);
    expect(chartToText(implicit.chart as Chart)).toMatch(/\[Mix 2\]/);
    expect(chartToText(implicit.chart as Chart)).toMatch(/\[Chorus x2\]/);
  });

  it("handles 6/8 and comments", () => {
    const { chart, problems } = parseChartText(
      "time: 6/8 // slow\n[A]\n| Em | C:3 D:3 |",
    );
    expect(problems).toEqual([]);
    expect(chart?.timeSig).toEqual([6, 8]);
    expect(chart?.sections[0].bars[0]).toEqual([{ chord: "Em", beats: 6 }]);
  });

  it("returns no chart when nothing is playable", () => {
    const { chart, problems } = parseChartText("# Empty\nkey: C");
    expect(chart).toBeNull();
    expect(problems.length).toBeGreaterThan(0);
  });

  it("round-trips every bundled chart through text", () => {
    const dir = path.resolve(process.cwd(), "charts");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const original = JSON.parse(
        fs.readFileSync(path.join(dir, file), "utf-8"),
      ) as Chart;
      const text = chartToText(original);
      const { chart, problems } = parseChartText(text);
      expect(problems, file).toEqual([]);
      expect(chart, file).not.toBeNull();
      expect(chart?.id, file).toBe(original.id);
      expect(chart?.name, file).toBe(original.name);
      expect(chart?.keyTonic, file).toBe(original.keyTonic);
      expect(chart?.timeSig, file).toEqual(original.timeSig);
      expect(chart?.defaultBpm, file).toBe(original.defaultBpm);
      expect(
        resolveChart(chart as Chart).map((b) => b.chords),
        file,
      ).toEqual(resolveChart(original).map((b) => b.chords));
    }
  });
});

describe("transposition", () => {
  it("moves chords and key, spelling with flats when the key wants them", () => {
    const { chart } = parseChartText(
      "key: A major\n[A]\n| A7 D7 | E7 F#m7/A |",
    );
    const up = transposeChart(chart as Chart, -4); // A -> F
    expect(up.keyTonic).toBe(5);
    expect(up.sections[0].bars[0].map((c) => c.chord)).toEqual(["F7", "Bb7"]);
    expect(up.sections[0].bars[1].map((c) => c.chord)).toEqual(["C7", "Dm7/F"]);
    const sharp = transposeChart(chart as Chart, 2); // A -> B
    expect(sharp.sections[0].bars[1].map((c) => c.chord)).toEqual([
      "F#7",
      "G#m7/B",
    ]);
  });

  it("keeps quality slashes that are not a bass note", () => {
    expect(transposeChord("C6/9", 2, false)).toBe("D6/9");
    expect(transposeChord("C/9", 2, false)).toBe("D/9");
    expect(transposeChord("Cmaj7/E", 2, false)).toBe("Dmaj7/F#");
    expect(transposeChord("Cm7/Bb", 2, true)).toBe("Dm7/C");
  });
});
