/**
 * Plain-text chord charts. This is how a guitarist types a tune in:
 *
 * ```
 * # Blues in A
 * key: A major
 * time: 4/4
 * bpm: 110
 * style: blues-shuffle
 *
 * [Chorus x2]
 * | A7 | A7 | A7 | A7 |
 * | D7 | D7 | A7 | A7 |
 * | E7 | D7 | A7 | E7 |
 *
 * [Tag]
 * | Dm7 G7 | Cmaj7 % |
 * ```
 *
 * Rules
 * - `# Title` (or `title:`) names the chart. The id is derived from it unless `id:` is set.
 * - `[Section]` starts a section; `[Section x3]` also plays it three times. Sections play in
 *   the order written unless an `arrangement: chorus x2, tag` line says otherwise.
 * - Bars are separated by `|`. Chords inside a bar split the beats evenly unless a chord
 *   carries an explicit count like `Dm7:3 G7:1`. `%` repeats the previous bar; `N.C.` is
 *   a rest.
 * - Blank lines and `//` comments are ignored.
 *
 * `parseChartText` never throws: it returns the chart plus a list of line-numbered
 * problems so the editor can underline them, and `chartToText` round-trips a chart back.
 */

import type {
  ArrangementItem,
  BarChord,
  Chart,
  ChartSection,
} from "../../ipc/contract";
import { keyName, parseKey, splitChord } from "./notes";

export interface ChartTextProblem {
  line: number;
  message: string;
}

export interface ParsedChartText {
  chart: Chart | null;
  problems: ChartTextProblem[];
}

const SETTING_KEYS = new Set([
  "title",
  "name",
  "id",
  "key",
  "time",
  "timesig",
  "meter",
  "bpm",
  "tempo",
  "style",
  "sectionstyle",
  "stylehere",
  "arrangement",
  "form",
]);

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "chart";
}

interface WorkingSection {
  id: string;
  name: string;
  bars: BarChord[][];
  repeats: number;
  styleOverrideId: string | null;
  line: number;
}

export function parseChartText(
  text: string,
  opts: { id?: string } = {},
): ParsedChartText {
  const problems: ChartTextProblem[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  let title: string | null = null;
  let id: string | null = opts.id ?? null;
  let keyTonic = 0;
  let mode: "major" | "minor" = "major";
  let timeSig: [number, number] = [4, 4];
  let bpm = 120;
  let styleId: string | null = null;
  let arrangementSpec: string | null = null;
  let arrangementLine = 0;

  const sections: WorkingSection[] = [];
  let current: WorkingSection | null = null;
  let previousBar: BarChord[] | null = null;

  const ensureSection = (lineNo: number): WorkingSection => {
    if (!current) {
      current = {
        id: "main",
        name: "Main",
        bars: [],
        repeats: 1,
        styleOverrideId: null,
        line: lineNo,
      };
      sections.push(current);
    }
    return current;
  };

  lines.forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (line.length === 0) return;

    if (line.startsWith("#")) {
      title = line.replace(/^#+\s*/, "").trim();
      return;
    }

    const header = /^\[(.+?)\]$/.exec(line);
    if (header) {
      const inner = header[1].trim();
      const rep = /^(.*?)\s*[xX×]\s*(\d+)$/.exec(inner);
      const name = (rep ? rep[1] : inner).trim();
      const repeats = rep ? Math.max(1, Number.parseInt(rep[2], 10)) : 1;
      if (name.length === 0) {
        problems.push({ line: lineNo, message: "section needs a name" });
        return;
      }
      let sid = slugify(name);
      if (sections.some((s) => s.id === sid)) {
        let n = 2;
        while (sections.some((s) => s.id === `${sid}-${n}`)) n++;
        sid = `${sid}-${n}`;
      }
      current = {
        id: sid,
        name,
        bars: [],
        repeats,
        styleOverrideId: null,
        line: lineNo,
      };
      sections.push(current);
      return;
    }

    const kv = /^([A-Za-z][A-Za-z _-]*?)\s*:\s*(.+)$/.exec(line);
    const key = kv
      ? kv[1]
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, "")
      : "";
    if (kv && !line.includes("|") && SETTING_KEYS.has(key)) {
      const value = kv[2].trim();
      switch (key) {
        case "title":
        case "name":
          title = value;
          break;
        case "id":
          id = slugify(value);
          break;
        case "key": {
          const k = parseKey(value);
          if (k) {
            keyTonic = k.keyTonic;
            mode = k.mode;
          } else {
            problems.push({
              line: lineNo,
              message: `cannot read key "${value}"`,
            });
          }
          break;
        }
        case "time":
        case "timesig":
        case "meter": {
          const m = /^(\d+)\s*\/\s*(\d+)$/.exec(value);
          if (m) {
            const num = Number.parseInt(m[1], 10);
            const den = Number.parseInt(m[2], 10);
            if (num > 0 && [1, 2, 4, 8, 16].includes(den)) {
              timeSig = [num, den];
            } else {
              problems.push({
                line: lineNo,
                message: `unsupported time signature ${value}`,
              });
            }
          } else {
            problems.push({
              line: lineNo,
              message: `cannot read time signature "${value}"`,
            });
          }
          break;
        }
        case "bpm":
        case "tempo": {
          const v = Number.parseFloat(value);
          if (Number.isFinite(v) && v >= 20 && v <= 300) {
            bpm = v;
          } else {
            problems.push({
              line: lineNo,
              message: `tempo must be 20..300, got "${value}"`,
            });
          }
          break;
        }
        case "style":
          styleId = value;
          break;
        case "sectionstyle":
        case "stylehere":
          ensureSection(lineNo).styleOverrideId = value;
          break;
        case "arrangement":
        case "form":
          arrangementSpec = value;
          arrangementLine = lineNo;
          break;
      }
      return;
    }

    // Bar line. Leading/trailing pipes are optional.
    const section = ensureSection(lineNo);
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(
        (c, i, arr) => !(c.length === 0 && (i === 0 || i === arr.length - 1)),
      );
    const beatsPerBar = timeSig[0];
    for (const cell of cells) {
      if (cell.length === 0) {
        problems.push({ line: lineNo, message: "empty bar" });
        continue;
      }
      if (cell === "%" || cell === "./.") {
        if (!previousBar) {
          problems.push({
            line: lineNo,
            message: "% has no previous bar to repeat",
          });
          continue;
        }
        section.bars.push(previousBar.map((c) => ({ ...c })));
        continue;
      }
      const bar = parseBar(cell, beatsPerBar, lineNo, problems);
      if (bar) {
        section.bars.push(bar);
        previousBar = bar;
      }
    }
  });

  for (const s of sections) {
    if (s.bars.length === 0) {
      problems.push({
        line: s.line,
        message: `section "${s.name}" has no bars`,
      });
    }
  }

  const name = title ?? (sections.length > 0 ? "Untitled chart" : "");
  if (sections.length === 0) {
    problems.push({ line: 1, message: "no bars found" });
  }

  const arrangement = buildArrangement(
    sections,
    arrangementSpec,
    arrangementLine,
    problems,
  );

  const fatal =
    sections.length === 0 ||
    arrangement.length === 0 ||
    sections.some((s) => s.bars.length === 0);
  if (fatal) return { chart: null, problems };

  const chartSections: ChartSection[] = sections.map((s) => ({
    id: s.id,
    name: s.name,
    bars: s.bars,
    styleOverrideId: s.styleOverrideId,
  }));

  return {
    chart: {
      schemaVersion: 1,
      id: id ?? slugify(name),
      name,
      keyTonic,
      mode,
      timeSig,
      defaultBpm: bpm,
      defaultStyleId: styleId,
      sections: chartSections,
      arrangement,
    },
    problems,
  };
}

function parseBar(
  cell: string,
  beatsPerBar: number,
  lineNo: number,
  problems: ChartTextProblem[],
): BarChord[] | null {
  const tokens = cell.split(/\s+/).filter((t) => t.length > 0);
  const parsed: { chord: string; beats: number | null }[] = [];
  for (const tok of tokens) {
    const m = /^(.+?)(?::(\d+(?:\.\d+)?))?$/.exec(tok);
    if (!m) continue;
    const chord = m[1];
    const beats = m[2] !== undefined ? Number.parseFloat(m[2]) : null;
    if (!isChordToken(chord)) {
      problems.push({ line: lineNo, message: `"${chord}" is not a chord` });
      return null;
    }
    if (beats !== null && !(beats > 0)) {
      problems.push({
        line: lineNo,
        message: `"${tok}" needs a positive beat count`,
      });
      return null;
    }
    parsed.push({ chord, beats });
  }
  if (parsed.length === 0) return null;

  const explicit = parsed.reduce((sum, c) => sum + (c.beats ?? 0), 0);
  const free = parsed.filter((c) => c.beats === null).length;
  const remaining = beatsPerBar - explicit;
  if (free > 0 && remaining <= 0) {
    problems.push({
      line: lineNo,
      message: `bar "${cell}" has more than ${beatsPerBar} beats`,
    });
    return null;
  }
  if (free === 0 && Math.abs(remaining) > 1e-6) {
    problems.push({
      line: lineNo,
      message: `bar "${cell}" holds ${explicit} beats, expected ${beatsPerBar}`,
    });
    return null;
  }
  const share = free > 0 ? remaining / free : 0;
  return parsed.map((c) => ({ chord: c.chord, beats: c.beats ?? share }));
}

function isChordToken(tok: string): boolean {
  if (/^(n\.?c\.?|rest|-)$/i.test(tok)) return true;
  return splitChord(tok) !== null;
}

function buildArrangement(
  sections: WorkingSection[],
  spec: string | null,
  line: number,
  problems: ChartTextProblem[],
): ArrangementItem[] {
  if (!spec) {
    return sections.map((s) => ({ sectionId: s.id, repeats: s.repeats }));
  }
  const items: ArrangementItem[] = [];
  for (const part of spec
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    const m = /^(.*?)\s*(?:[xX×]\s*(\d+))?$/.exec(part);
    if (!m) continue;
    const ref = m[1].trim();
    const repeats = m[2] ? Math.max(1, Number.parseInt(m[2], 10)) : 1;
    const target =
      sections.find((s) => s.id === slugify(ref)) ??
      sections.find((s) => s.name.toLowerCase() === ref.toLowerCase());
    if (!target) {
      problems.push({
        line,
        message: `arrangement names unknown section "${ref}"`,
      });
      continue;
    }
    items.push({ sectionId: target.id, repeats });
  }
  return items;
}

/** Renders a chart as editable text (inverse of `parseChartText`). */
export function chartToText(chart: Chart): string {
  const out: string[] = [];
  out.push(`# ${chart.name}`);
  out.push(`id: ${chart.id}`);
  out.push(`key: ${keyName(chart.keyTonic, chart.mode)}`);
  out.push(`time: ${chart.timeSig[0]}/${chart.timeSig[1]}`);
  out.push(`bpm: ${formatNumber(chart.defaultBpm)}`);
  if (chart.defaultStyleId) out.push(`style: ${chart.defaultStyleId}`);

  const inOrder =
    chart.arrangement.length === chart.sections.length &&
    chart.arrangement.every((a, i) => a.sectionId === chart.sections[i]?.id);
  if (!inOrder) {
    out.push(
      `arrangement: ${chart.arrangement
        .map((a) =>
          a.repeats > 1 ? `${a.sectionId} x${a.repeats}` : a.sectionId,
        )
        .join(", ")}`,
    );
  }

  const beatsPerBar = chart.timeSig[0];
  for (const section of chart.sections) {
    out.push("");
    const repeats = inOrder
      ? (chart.arrangement.find((a) => a.sectionId === section.id)?.repeats ??
        1)
      : 1;
    out.push(
      repeats > 1 ? `[${section.name} x${repeats}]` : `[${section.name}]`,
    );
    if (section.styleOverrideId)
      out.push(`section style: ${section.styleOverrideId}`);
    for (let i = 0; i < section.bars.length; i += 4) {
      const row = section.bars
        .slice(i, i + 4)
        .map((bar) => formatBar(bar, beatsPerBar));
      out.push(`| ${row.join(" | ")} |`);
    }
  }
  return `${out.join("\n")}\n`;
}

function formatBar(bar: BarChord[], beatsPerBar: number): string {
  const even = bar.every(
    (c) => Math.abs(c.beats - beatsPerBar / bar.length) < 1e-6,
  );
  return bar
    .map((c) => (even ? c.chord : `${c.chord}:${formatNumber(c.beats)}`))
    .join(" ");
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export interface FlatBar {
  /** 1-indexed position in the resolved song. */
  barIndex: number;
  sectionId: string;
  sectionName: string;
  chords: BarChord[];
}

/** Expands the arrangement into the bar list the band actually plays (mirrors `Chart::resolve`). */
export function resolveChart(chart: Chart): FlatBar[] {
  const out: FlatBar[] = [];
  for (const item of chart.arrangement) {
    const section = chart.sections.find((s) => s.id === item.sectionId);
    if (!section) continue;
    for (let r = 0; r < Math.max(1, item.repeats); r++) {
      for (const bar of section.bars) {
        out.push({
          barIndex: out.length + 1,
          sectionId: section.id,
          sectionName: section.name,
          chords: bar,
        });
      }
    }
  }
  return out;
}
