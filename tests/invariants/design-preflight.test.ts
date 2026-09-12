import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  CHORD_MAX_PX,
  CHORD_MIN_PX,
  TEMPO_BAR_PX,
  chordSizePx,
} from "../../src/components/BigReadout";
import { JO_TOOLS } from "../../src/lib/jo/tools";
import { readReducedMotion } from "../../src/lib/reducedMotion";
import { SHORTCUTS } from "../../src/lib/shortcuts";
import { STAGE_ACTIONS } from "../../src/lib/stageActions";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function tokenSheet(): string {
  return readFileSync("src/design/tokens.css", "utf8");
}

function hexChannels(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  const full =
    n.length === 3
      ? n
          .split("")
          .map((c) => c + c)
          .join("")
      : n;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexChannels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

function tokenHex(name: string): string {
  const match = tokenSheet().match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]+)`));
  if (!match) throw new Error(`token --${name} missing`);
  return match[1].toLowerCase();
}

it("DESIGN contrast pairs meet the stated ratios", () => {
  expect(contrastRatio(tokenHex("fg-0"), tokenHex("bg-0"))).toBeGreaterThan(15);
  expect(contrastRatio(tokenHex("fg-1"), tokenHex("bg-1"))).toBeGreaterThan(7);
  expect(contrastRatio(tokenHex("accent"), tokenHex("bg-1"))).toBeGreaterThan(
    4.5,
  );
});

it("UI colours stay on the DESIGN palette", () => {
  const tokens = tokenSheet();
  const allowedHex = new Set(
    [...tokens.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((m) => m[0].toLowerCase()),
  );
  const files = walk("src").filter((p) => /\.(tsx|css)$/.test(p));
  const hits: string[] = [];
  const tw =
    /\b(?:text|bg|border|ring|from|to|via|fill|stroke|outline|shadow)-(?:red|green|blue|yellow|orange|purple|pink|violet|indigo|cyan|sky|lime|fuchsia|rose|emerald|teal|amber|slate|gray|zinc|neutral|stone)-/;
  for (const path of files) {
    if (path.replaceAll("\\", "/").endsWith("src/design/tokens.css")) continue;
    const text = readFileSync(path, "utf8");
    if (tw.test(text)) hits.push(`${path}: tailwind palette`);
    if (text.includes("--danger")) hits.push(`${path}: --danger`);
    for (const m of text.matchAll(/#([0-9a-fA-F]{3,8})/g)) {
      if (!allowedHex.has(`#${m[1].toLowerCase()}`)) {
        hits.push(`${path}: #${m[1]}`);
      }
    }
    if (/rgba?\(/.test(text)) hits.push(`${path}: raw rgb`);
  }
  expect(hits).toEqual([]);
});

it("flat elements do not use drop shadows", () => {
  const files = walk("src").filter((p) => /\.(tsx|css)$/.test(p));
  const hits = files.flatMap((path) => {
    const text = readFileSync(path, "utf8");
    const bad: string[] = [];
    if (/(?:^|[^-])shadow-(?:sm|md|lg|xl|2xl|inner)\b/.test(text)) {
      bad.push(`${path}: tailwind shadow`);
    }
    for (const line of text.split("\n")) {
      if (!/box-shadow|drop-shadow|text-shadow|shadow-\[/.test(line)) continue;
      if (line.includes("var(--shadow)") || line.includes("var(--accent)")) {
        continue;
      }
      bad.push(`${path}: ${line.trim()}`);
    }
    return bad;
  });
  expect(hits).toEqual([]);
});

it("focus rings are accent, 2 px, offset 2 px", () => {
  const css = readFileSync("src/screens/studio.css", "utf8");
  expect(css).toContain("outline: 2px solid var(--accent)");
  expect(css).toContain("outline-offset: 2px");
  expect(css).not.toContain("outline-offset: 3px");
  const hits = walk("src")
    .filter((p) => /\.(tsx|css)$/.test(p))
    .filter((path) =>
      /outline-none|outline:\s*none/.test(readFileSync(path, "utf8")),
    );
  expect(hits).toEqual([]);
});

it("UI copy has no em-dashes or purple or gradient text", () => {
  const files = walk("src").filter((p) => /\.(tsx|css)$/.test(p));
  const hits = files.flatMap((path) => {
    const text = readFileSync(path, "utf8");
    const bad: string[] = [];
    if (text.includes("\u2014")) bad.push(`${path}: em-dash`);
    if (
      path.endsWith(".css") &&
      (text.includes("linear-gradient") || text.includes("purple"))
    ) {
      bad.push(`${path}: purple or gradient`);
    }
    return bad;
  });
  expect(hits).toEqual([]);
});

it("UI source has no emoji", () => {
  const files = walk("src").filter((p) => /\.(tsx|css)$/.test(p));
  const hits = files.filter((path) =>
    /\p{Extended_Pictographic}/u.test(readFileSync(path, "utf8")),
  );
  expect(hits).toEqual([]);
});

it("Stage chord and tempo sizes follow the two-metre constraint", () => {
  expect(chordSizePx(1100)).toBeGreaterThanOrEqual(CHORD_MIN_PX);
  expect(chordSizePx(700)).toBe(CHORD_MIN_PX);
  expect(chordSizePx(1440)).toBeLessThanOrEqual(CHORD_MAX_PX);
  expect(chordSizePx(2000)).toBe(CHORD_MAX_PX);
  expect(TEMPO_BAR_PX).toBe(48);
  const readout = readFileSync("src/components/BigReadout.tsx", "utf8");
  expect(readout).toContain("clamp(${CHORD_MIN_PX}px");
  expect(readout).toContain("${CHORD_MAX_PX}px");
  const stage = readFileSync("src/screens/Stage.tsx", "utf8");
  expect(stage).toContain('kind="chord"');
  expect(stage).toContain('kind="tempo"');
  const design = readFileSync("docs/DESIGN.md", "utf8");
  expect(design).toMatch(/- \[ \] Chord now readable from two metres/);
});

it("buttons declare a 32px minimum hit target", () => {
  const button = readFileSync("src/components/Button.tsx", "utf8");
  expect(button).toContain("min-h-8");
  const css = readFileSync("src/screens/studio.css", "utf8");
  expect(css).toContain("min-height: 32px");
  expect(css).toContain(".studio-nav button");
  expect(css).toContain(".studio-content");
  expect(css).toContain('input:not([type="hidden"])');
  expect(css).toContain("header :is(button, input, select)");
  expect(css).toContain(".studio-notices button");
  const readout = readFileSync("src/components/BigReadout.tsx", "utf8");
  expect(readout).toContain('aria-live="polite"');
  expect(readout).toContain('kind === "chord"');
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Next is ${band.next_chord}",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "Next: ${band.next_chord}",
  );
  const meter = readFileSync("src/components/Meter.tsx", "utf8");
  expect(meter).toContain('aria-live="off"');
  expect(meter).toContain("aria-hidden");
});

it("reduced motion is honoured in CSS", () => {
  const css = walk("src")
    .filter((p) => p.endsWith(".css"))
    .map((p) => readFileSync(p, "utf8"))
    .join("\n");
  expect(css).toContain("prefers-reduced-motion");
  expect(css).toContain("html.reduce-motion");
  expect(css).toContain("transition-duration: 0.01ms !important");
});

it("UI radii stay on the DESIGN token scale", () => {
  const allowedTw =
    /^(?:rounded-full|rounded(?:-[tblr]{1,2})?-\[var\(--radius-[sml]\)\])$/;
  const hits: string[] = [];
  for (const path of walk("src").filter((p) => /\.(tsx|css)$/.test(p))) {
    const text = readFileSync(path, "utf8");
    if (path.endsWith(".css")) {
      for (const m of text.matchAll(/border-radius:\s*([^;]+);/g)) {
        const value = m[1].trim();
        if (
          value === "50%" ||
          value === "0" ||
          value === "0px" ||
          /^var\(--radius-[sml]\)$/.test(value)
        ) {
          continue;
        }
        hits.push(`${path}: ${value}`);
      }
    }
    for (const line of text.split("\n")) {
      if (
        !line.includes("className") &&
        !line.includes("const field =") &&
        !line.includes("const base =")
      ) {
        continue;
      }
      for (const m of line.matchAll(
        /\brounded(?:-[a-z0-9]+)*(?:-\[[^\]]+\])?/g,
      )) {
        if (!allowedTw.test(m[0])) hits.push(`${path}: ${m[0]}`);
      }
    }
  }
  expect(hits).toEqual([]);
});

it("Panels are not nested", () => {
  const hits: string[] = [];
  for (const path of walk("src").filter((p) => p.endsWith(".tsx"))) {
    const text = readFileSync(path, "utf8");
    let depth = 0;
    for (const m of text.matchAll(/<\/?Panel\b/g)) {
      if (m[0].startsWith("</")) depth -= 1;
      else {
        if (depth > 0) hits.push(path);
        depth += 1;
      }
    }
  }
  expect(hits).toEqual([]);
});

it("CSS and Tailwind motion is transform or opacity only", () => {
  const hits: string[] = [];
  for (const path of walk("src").filter((p) => /\.(tsx|css)$/.test(p))) {
    const text = readFileSync(path, "utf8");
    if (
      /\btransition-(?:colors|all|shadow|border|opacity-?no|background)\b/.test(
        text,
      )
    ) {
      hits.push(`${path}: banned transition`);
    }
    if (/\banimate-(?!pulse\b)/.test(text)) {
      hits.push(`${path}: banned animation`);
    }
    for (const m of text.matchAll(/transition(?:-property)?:\s*([^;]+);/g)) {
      const props = m[1]
        .replace(/var\(--[^)]+\)/g, "")
        .replace(/[0-9.]+m?s/g, "")
        .replace(/cubic-bezier\([^)]+\)|ease(?:-in|-out|-in-out)?|linear/g, "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (
        props.some((p) => p !== "transform" && p !== "opacity" && p !== "none")
      ) {
        hits.push(`${path}: ${m[1].trim()}`);
      }
    }
  }
  expect(hits).toEqual([]);
});

it("DESIGN empty and error copy exists on each listed screen", () => {
  const stage = readFileSync("src/screens/Stage.tsx", "utf8");
  expect(stage).toContain("Pick a chart or a song. Or hold PTT and tell Jo.");
  expect(stage).toContain("Go to this Library.");
  expect(stage).toContain("Open these Songs.");
  expect(stage).toContain("Open this First run.");
  expect(stage).toContain("Audio device lost.");
  expect(stage).toContain("Provider off");
  expect(stage).toContain("Open these AI settings.");
  expect(stage).toContain("Sample packs are missing");
  expect(stage).not.toContain("Loading…");
  expect(stage).toContain("The charts are loading.");
  expect(stage).not.toContain('? "Follows your playing"');
  expect(stage).toContain("This follows your playing.");
  expect(stage).not.toContain(': "Fixed intensity"}');
  expect(stage).toContain("This is fixed intensity.");
  expect(stage).not.toContain("Follows your playing: ON");
  expect(stage).not.toContain("Next bar:");
  expect(stage).toContain("Next bar is");
  expect(stage).not.toContain("play a single note");
  expect(stage).toContain("Play a single note.");
  expect(stage).not.toContain("Press play:");
  expect(stage).toContain("Press play. The band starts");
  expect(stage).not.toContain("click a bar to jump");
  expect(stage).toContain("Click a bar to jump.");
  expect(stage).not.toContain("[Muted]");
  expect(stage).toContain("Drums are muted.");
  expect(stage).toContain("Bass is muted.");
  expect(stage).toContain("Comp is muted.");
  expect(stage).not.toContain('aria-label="Drums"');
  expect(stage).toContain(
    'band.mute_drums ? "Drums are muted." : "Drums are playing."',
  );
  expect(stage).not.toContain('aria-label="Bass"');
  expect(stage).toContain(
    'band.mute_bass ? "Bass is muted." : "Bass is playing."',
  );
  expect(stage).not.toContain('aria-label="Comp"');
  expect(stage).toContain(
    'band.mute_comp ? "Comp is muted." : "Comp is playing."',
  );
  expect(stage).not.toContain("DI Dynamics");
  expect(stage).toContain("DI dynamics.");
  expect(stage).not.toContain("Form{");
  expect(stage).toContain("The form is ${band.current_section}.");
  expect(stage).toContain("The form has no current section.");
  const songs = readFileSync("src/screens/Songs.tsx", "utf8");
  expect(songs).toContain("Drop an audio file here");
  expect(songs).not.toContain("audio · analysis");
  expect(songs).toContain("Audio. Analysis is");
  expect(songs).not.toContain("plays as saved");
  expect(songs).toContain("Plays as saved.");
  expect(songs).not.toContain('? "Clear search"');
  expect(songs).toContain('? "Clear this search."');
  const library = readFileSync("src/screens/Library.tsx", "utf8");
  expect(library).toContain(
    "No charts match. Try another search or collection.",
  );
  expect(library).not.toContain("\n                    Clear search\n");
  expect(library).toContain("Clear this search.");
  const analysis = readFileSync("src/components/SongAnalysis.tsx", "utf8");
  expect(analysis).toContain("Analysis failed.");
  expect(analysis).toContain("Retry from Songs.");
  const sessions = readFileSync("src/screens/Sessions.tsx", "utf8");
  expect(sessions).toContain("Your first take will appear here");
  expect(sessions).toContain("This is the progress.");
  expect(sessions).toContain("Export failed.");
  expect(sessions).toContain("disk is full");
  expect(sessions).toContain("No takes match this search");
  expect(sessions).not.toContain("\n                Clear search\n");
  expect(sessions).toContain("Clear this search.");
  expect(sessions).not.toContain("Suggested drill:");
  expect(sessions).not.toContain("This week:");
  expect(sessions).not.toContain("All files:");
  expect(sessions).toContain("This week has");
  expect(sessions).not.toContain("timing not enough evidence");
  expect(sessions).toContain("timing does not have enough evidence");
  expect(sessions).toContain("Your first take will appear here.");
  expect(sessions).not.toContain("No waveform available");
  expect(sessions).toContain("No waveform is available.");
  expect(sessions).toContain("Open an original song in Write first.");
  expect(sessions).not.toContain("Practice streak:");
  expect(sessions).toContain("Practice streak has no days yet.");
  expect(sessions).toContain("Practice streak is");
  expect(sessions).not.toContain("none yet");
  expect(sessions).not.toContain("Recorded jam time:");
  expect(sessions).toContain("Recorded jam time is");
  expect(sessions).not.toContain(" · est.");
  expect(sessions).not.toContain(" Estimated.");
  expect(sessions).toContain(" This is estimated.");
  expect(sessions).not.toContain(">Guitar offset<");
  expect(sessions).toContain("Enter the guitar offset.");
  expect(sessions).not.toContain("or type a DAW measurement.");
  expect(sessions).toContain("or enter the guitar offset.");
  expect(sessions).not.toContain("smp ·");
  expect(sessions).toContain("{latencySamples} samples.");
  expect(sessions).not.toContain('{" · "}');
  expect(sessions).toContain('.{" "}');
  expect(sessions).not.toContain(">Local take analysis<");
  expect(sessions).toContain("This is the local take analysis.");
  expect(sessions).not.toContain('placeholder="Song, style');
  expect(sessions).toContain(
    'placeholder="Search song, style, tempo or notes."',
  );
  expect(sessions).not.toContain('aria-label="Search takes"');
  expect(sessions).toContain('aria-label="Find a take."');
  expect(sessions).not.toContain('? "Recorded waveform"');
  expect(sessions).toContain('? "This is the recorded waveform."');
  expect(sessions).not.toContain('aria-label="Take measurements"');
  expect(sessions).toContain('aria-label="These are the take measurements."');
  expect(sessions).not.toContain("\n          Find a take\n");
  expect(sessions).toContain("Find a take.");
  expect(sessions).not.toContain("Recording Take");
  expect(sessions).toContain("Recording a take.");
  expect(sessions).not.toContain(': "Idle"');
  expect(sessions).not.toContain('"Idle."');
  expect(sessions).toContain('"This is idle."');
  expect(sessions).not.toContain("Sessions, Takes & DAW Export");
  expect(sessions).toContain("These are sessions, takes and DAW export.");
  expect(sessions).not.toContain('title="Progress"');
  expect(sessions).not.toContain("Recorded takes (${");
  expect(sessions).toContain(
    "These are ${visibleTakes.length} of ${takes.length} recorded takes.",
  );
  const measurements = readFileSync("src/lib/sessions/stats.ts", "utf8");
  expect(measurements).not.toContain('["Detected attacks"');
  expect(measurements).toContain(
    "The take has ${a.detectedTransients} detected attacks.",
  );
  expect(measurements).not.toContain('["Quarter-note grid distance"');
  expect(measurements).toContain("Quarter-note grid distance is");
  expect(measurements).not.toContain("Grid bias (+ late / − early)");
  expect(measurements).toContain("Grid bias does not have enough evidence.");
  expect(measurements).toContain("Attack-level variation is");
  expect(measurements).toContain("Pitched frames are");
  const originals = readFileSync("src/screens/Originals.tsx", "utf8");
  expect(originals).not.toContain("Loaded in band:");
  expect(originals).toContain("is loaded in the band");
  expect(originals).not.toContain("Capture armed:");
  expect(originals).toContain("Capture is armed for the last");
  expect(originals).not.toContain("Export incomplete:");
  expect(originals).toContain("Export is incomplete.");
  expect(originals).toContain("stems are missing.");
  expect(
    readFileSync("src/components/tools/CoachTool.tsx", "utf8"),
  ).not.toContain("Try:");
  expect(
    readFileSync("src/components/tools/CoachTool.tsx", "utf8"),
  ).not.toContain("Propose changes for review:");
  expect(readFileSync("src/components/tools/CoachTool.tsx", "utf8")).toContain(
    "Propose changes for review.",
  );
  expect(
    readFileSync("src/components/tools/CoachTool.tsx", "utf8"),
  ).not.toContain("Ask three perspectives");
  expect(readFileSync("src/components/tools/CoachTool.tsx", "utf8")).toContain(
    "Ask these three perspectives.",
  );
  expect(
    readFileSync("src/components/tools/CoachTool.tsx", "utf8"),
  ).not.toContain("Draft in Jo");
  expect(readFileSync("src/components/tools/CoachTool.tsx", "utf8")).toContain(
    "Draft this in Jo.",
  );
  expect(
    readFileSync("src/components/tools/CoachTool.tsx", "utf8"),
  ).not.toContain("Keep in song notes");
  expect(readFileSync("src/components/tools/CoachTool.tsx", "utf8")).toContain(
    "Keep this in the song notes.",
  );
  expect(library).not.toContain("Your charts:");
  expect(library).toContain("Charts live in");
  expect(library).not.toContain("line {p.line}:");
  expect(library).toContain("Line {p.line}.");
  const solo = readFileSync("src/components/SoloHelper.tsx", "utf8");
  expect(solo).not.toContain("Whole tune:");
  expect(solo).toContain("for the whole tune");
  expect(solo).not.toContain("Guide tone:");
  expect(solo).not.toContain("Highlighted:");
  expect(solo).not.toContain("next:");
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("Now:");
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("Reference speed ·");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Reference speed is",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("Stop ramp ·");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Stop ramp. Hold speed.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("Local estimates ·");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Local estimates. Low confidence.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("Seek to (seconds)");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Seek to a time in seconds.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("Loop start (seconds)");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Loop start is in seconds.",
  );
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Loop end is in seconds.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Provider task:",
  );
  const rig = readFileSync("src/screens/Rig.tsx", "utf8");
  expect(rig).not.toContain("Live:");
  expect(rig).toContain("Open on");
  expect(rig).toContain("No MIDI output found. Plug in the interface.");
  expect(rig).toContain("MIDI port disappeared.");
  expect(rig).not.toContain("Loading rig profile...");
  expect(rig).toContain("The rig profile is loading.");
  expect(rig).toContain("refreshMidiPorts");
  expect(rig).not.toContain("Preview only ·");
  expect(rig).toContain("Preview only. Messages are logged.");
  expect(rig).not.toContain(" · messages are logged");
  expect(rig).toContain(
    "Messages are logged in the monitor below until a port is opened.",
  );
  const engine = readFileSync("src/store/engine.ts", "utf8");
  expect(engine).not.toContain("${label}: ${errorText(e)}");
  expect(engine).toContain("${label} failed. ${errorText(e)}");
  expect(engine).not.toContain("MIDI out:");
  expect(engine).toContain("MIDI output is ${state.port}.");
  expect(engine).not.toContain("`Rig: ${text}`");
  expect(engine).toContain("The rig reported a problem.");
  expect(engine).not.toContain("Live updates unavailable:");
  expect(engine).toContain("Live updates are unavailable.");
  const app = readFileSync("src/App.tsx", "utf8");
  expect(app).not.toContain("Close guard:");
  expect(app).toContain("Could not watch the close request.");
  expect(app).not.toContain("Quit guard:");
  expect(app).toContain("Could not watch the quit request.");
  expect(app).not.toContain("Startup: ${");
  expect(app).toContain("Could not start the studio.");
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "File drop unavailable:",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "File drop is unavailable.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Not applied:",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "The change was not applied.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    " · chord symbols",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Chord symbols and beats.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Section energy ·",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Section energy is",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "notes are shared.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Add section",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Add this section.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Make variation",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Make this variation.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Delete section",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Delete this section.",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).not.toContain(
    "Delete section",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).not.toContain(
    "Delete this section.",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).toContain(
    "or use Delete this section to let it go.",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).not.toContain(
    "${clip.label}: source take is unavailable",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).toContain(
    "${clip.label} is missing its source take.",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).not.toContain(
    "${clip.label}: check the trim",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).toContain(
    "${clip.label} needs its trim checked.",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).not.toContain(
    'title: "Give this original a name"',
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).toContain(
    'title: "Give this original a name."',
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).not.toContain(
    "${section.name} is outside the form`",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).toContain(
    "${section.name} is outside the form.",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).not.toContain(
    "${section.name} has no lyric draft`",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).toContain(
    "${section.name} has no lyric draft.",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).not.toContain(
    'title: "Some neighbouring sections use the same band settings"',
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).toContain(
    'title: "Some neighbouring sections use the same band settings."',
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).not.toContain(
    "${clip.label} extends beyond the song form`",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).toContain(
    "${clip.label} extends beyond the song form.",
  );
  expect(readFileSync("src/lib/jo/voice.ts", "utf8")).not.toContain(
    "Could not stop voice:",
  );
  expect(readFileSync("src/lib/jo/voice.ts", "utf8")).toContain(
    "Could not stop voice.",
  );
  expect(readFileSync("src/lib/roomActions.ts", "utf8")).not.toContain(
    "Rig recall stopped:",
  );
  expect(readFileSync("src/lib/roomActions.ts", "utf8")).toContain(
    "Could not finish recalling the rig.",
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).not.toContain(
    "Proposal set aside:",
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).toContain(
    "The proposal was set aside.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "Browser preview:",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "This browser preview keeps the chart",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    " · editing",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    " Editing.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    " This is editing.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    " · yours",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    " Yours.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    " This is yours.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    " · swung",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    " Swung.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    " This is swung.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Browser preview:",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This browser preview cannot import",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Generate song ·",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Generate song. Uses API credits.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Clip start ·",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Clip start is in seconds.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "jobs. Saved across restarts.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain("Browser preview:");
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain(" · working");
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain(" Working.");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    " This is working.",
  );
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "This browser preview cannot send agent",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "Browser preview:",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).toContain(
    "This browser preview is a simulated engine.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Unknown tool:",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "The tool ${call.name} is unknown.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Undo edit is available in Film",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Undo this edit. is available",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "Undo this edit is available in Film.",
  );
  expect(readFileSync("src/components/Workspace.tsx", "utf8")).not.toContain(
    "Unknown studio room:",
  );
  expect(readFileSync("src/components/Workspace.tsx", "utf8")).toContain(
    "The studio room ${screen} is unknown.",
  );
  expect(readFileSync("src/components/Workspace.tsx", "utf8")).not.toContain(
    'aria-label="Workspace view"',
  );
  expect(readFileSync("src/components/Workspace.tsx", "utf8")).toContain(
    'aria-label="These are the workspace views."',
  );
  const brief = readFileSync("src/components/tools/BriefTool.tsx", "utf8");
  expect(brief).not.toContain("Faithful backing:");
  expect(brief).not.toContain("Stripped:");
  expect(brief).not.toContain("Reimagine:");
  expect(brief).toContain("Faithful backing. Support");
  expect(
    readFileSync("src/components/tools/RigSnapshotTool.tsx", "utf8"),
  ).not.toContain("CC ${cc}:");
  expect(
    readFileSync("src/components/tools/RigSnapshotTool.tsx", "utf8"),
  ).toContain("CC ${cc} is ${value}");
  expect(
    readFileSync("src/components/tools/RigSnapshotTool.tsx", "utf8"),
  ).not.toContain(" · ${profile.scenes");
  expect(
    readFileSync("src/components/tools/RigSnapshotTool.tsx", "utf8"),
  ).toContain("${profile.name}. ${profile.scenes[snap.scene].name}.");
  expect(
    readFileSync("src/components/tools/RigSnapshotTool.tsx", "utf8"),
  ).not.toContain('|| "scene defaults"');
  expect(
    readFileSync("src/components/tools/RigSnapshotTool.tsx", "utf8"),
  ).toContain("These are the scene defaults");
  expect(
    readFileSync("src/components/tools/RigSnapshotTool.tsx", "utf8"),
  ).not.toContain("Capture current tone");
  expect(
    readFileSync("src/components/tools/RigSnapshotTool.tsx", "utf8"),
  ).toContain("Capture this current tone.");
  expect(
    readFileSync("src/components/tools/RigSnapshotTool.tsx", "utf8"),
  ).not.toContain("Recall snapshot to rig");
  expect(
    readFileSync("src/components/tools/RigSnapshotTool.tsx", "utf8"),
  ).toContain("Recall this snapshot to the rig.");
  expect(readFileSync("src/App.tsx", "utf8")).not.toContain(
    "${s.label} · ${s.description}",
  );
  expect(readFileSync("src/App.tsx", "utf8")).not.toContain(
    "${s.label}. ${s.description}.",
  );
  expect(readFileSync("src/App.tsx", "utf8")).toContain(
    "title={`${s.label}. ${s.description}`}",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    " · {m.toolResults[idx]}",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "{m.toolResults[idx]}.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain('.join(" · ")');
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    '.join(". ")',
  );
  expect(readFileSync("src/lib/net/providerFetch.ts", "utf8")).not.toContain(
    "returned ${res.status}:",
  );
  expect(readFileSync("src/lib/net/providerFetch.ts", "utf8")).toContain(
    "returned ${res.status}.",
  );
  const soloWhy = readFileSync("src/lib/theory/solo.ts", "utf8");
  expect(soloWhy).not.toContain("Ionian:");
  expect(soloWhy).toContain("Ionian is the chord's own scale.");
  expect(soloWhy).not.toContain("Natural minor:");
  expect(soloWhy).toContain("Natural minor is the darker");
  expect(soloWhy).not.toContain("Key-centre scale:");
  expect(soloWhy).toContain("The key-centre scale works");
  expect(soloWhy).not.toContain("The home scale for a dominant 7th:");
  expect(soloWhy).toContain("The home scale for a dominant 7th is");
  expect(soloWhy).not.toContain("Whole-half diminished:");
  expect(soloWhy).toContain("Whole-half diminished is symmetric.");
  expect(soloWhy).not.toContain("Power chords are ambiguous:");
  expect(soloWhy).toContain("Power chords are ambiguous.");
  const gemini = readFileSync("src/lib/jo/gemini.ts", "utf8");
  expect(gemini).not.toContain("Transport: ${");
  expect(gemini).toContain("Transport is ${");
  expect(gemini).not.toContain("Style: ${");
  expect(gemini).toContain("Style is ${");
  expect(gemini).not.toContain("Chart: ${");
  expect(gemini).toContain("Chart is ${");
  expect(gemini).toContain("No chart is loaded.");
  expect(gemini).not.toContain('?? "none"');
  expect(gemini).not.toContain("Muted parts: ${");
  expect(gemini).toContain("Muted parts are ${");
  expect(gemini).toContain("No parts are muted.");
  expect(gemini).not.toContain(': "none"}.');
  expect(gemini).not.toContain("Film project: ${");
  expect(gemini).toContain("Film project is ${");
  expect(gemini).not.toContain(': "none"}. Use edit_video_shot');
  expect(gemini).toContain("No Film project is open.");
  expect(gemini).not.toContain(': "none"}. Use the songwriting tool');
  expect(gemini).toContain("No songwriting document is open.");
  expect(gemini).not.toContain("Current state of the room:");
  expect(gemini).toContain("This is the current state of the room.");
  const briefSrc = readFileSync("src/lib/roomTools.ts", "utf8");
  expect(briefSrc).not.toContain("Original song:");
  expect(briefSrc).toContain("The original song is");
  expect(briefSrc).not.toContain("Arrangement intent,");
  expect(briefSrc).toContain(
    "The arrangement intent is adapted to the selected generation duration.",
  );
  expect(briefSrc).not.toContain("${c.name}. ${c.defaultBpm} BPM,");
  expect(briefSrc).toContain("The tempo is ${c.defaultBpm} BPM,");
  expect(briefSrc).not.toContain("Instrumental; no vocals.");
  expect(briefSrc).toContain("This is instrumental with no vocals.");
  expect(briefSrc).not.toContain("Direction: ${");
  expect(briefSrc).toContain("The direction is");
  expect(briefSrc).not.toContain("${s.name}:");
  expect(briefSrc).toContain("${s.name} has");
  expect(briefSrc).not.toContain("; lyrics:");
  expect(briefSrc).not.toContain("; lyrics are");
  expect(briefSrc).toContain(" Lyrics are ${body.lyrics[s.id]}.");
  expect(readFileSync("src/lib/jo/studioTools.ts", "utf8")).not.toContain(
    "One section per line:",
  );
  expect(readFileSync("src/lib/jo/studioTools.ts", "utf8")).toContain(
    "Write one section per line as",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain("Current state:");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "This is the current state.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain("${k}: ${String(v)}");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "${k} is ${String(v)}",
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    "Learned:",
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    "This pedal is assigned to",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "Cost unknown:",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Cost is unknown.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "Song Lab ·",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Song Lab. Explore another direction.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain(" · locked");
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain(" · muted");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    " is locked.",
  );
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    " is muted.",
  );
  expect(
    readFileSync("src/components/tools/DiscoveryTool.tsx", "utf8"),
  ).not.toContain(" · open one in Write");
  expect(
    readFileSync("src/components/tools/DiscoveryTool.tsx", "utf8"),
  ).toContain("Open one in Write.");
  expect(
    readFileSync("src/components/tools/DiscoveryTool.tsx", "utf8"),
  ).not.toContain("Current original");
  expect(
    readFileSync("src/components/tools/DiscoveryTool.tsx", "utf8"),
  ).toContain("This current original is");
  expect(
    readFileSync("src/components/tools/DiscoveryTool.tsx", "utf8"),
  ).toContain("This is the current original. Open one in Write.");
  expect(
    readFileSync("src/components/tools/DiscoveryTool.tsx", "utf8"),
  ).not.toContain("Study in Stage");
  expect(
    readFileSync("src/components/tools/DiscoveryTool.tsx", "utf8"),
  ).toContain("Study this in Stage.");
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain(" · bars ");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    ". Bars {r.startBar}–{r.endBar - 1}.",
  );
  const melody = readFileSync("src/components/tools/MelodyTool.tsx", "utf8");
  expect(melody).not.toContain(" · desktop");
  expect(melody).not.toContain("Extract notes");
  expect(melody).toContain("Extract these notes.");
  expect(melody).toContain('" Desktop only."');
  expect(melody).toContain('aria-label="Extract these notes."');
  expect(melody).not.toContain("Preview chord choices");
  expect(melody).toContain("Preview these chord choices.");
  expect(melody).not.toContain("Keep as a section variation");
  expect(melody).toContain("Keep this as a section variation.");
  expect(melody).not.toContain("Editable melody ·");
  expect(melody).toContain(
    "Editable melody. Note, start seconds, and duration seconds.",
  );
  expect(melody).not.toContain(" · no notes");
  expect(melody).toContain(". No notes.");
  expect(melody).toContain("Start is in seconds.");
  expect(melody).toContain("Length is in seconds.");
  expect(melody).not.toContain('label="Melody recording"');
  expect(melody).toContain("Choose a melody recording.");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).not.toContain(" · channel");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).toContain("Channel is");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).not.toContain("Setup name");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).toContain("Name this setup.");
  expect(
    readFileSync("src/components/tools/BriefTool.tsx", "utf8"),
  ).not.toContain("Editable musical direction");
  expect(readFileSync("src/components/tools/BriefTool.tsx", "utf8")).toContain(
    "This musical direction is editable.",
  );
  expect(
    readFileSync("src/components/tools/BriefTool.tsx", "utf8"),
  ).not.toContain("Review and edit generation prompt");
  expect(readFileSync("src/components/tools/BriefTool.tsx", "utf8")).toContain(
    "Review and edit the generation prompt.",
  );
  expect(
    readFileSync("src/components/tools/BriefTool.tsx", "utf8"),
  ).not.toContain("Instrumental brief");
  expect(readFileSync("src/components/tools/BriefTool.tsx", "utf8")).toContain(
    "This brief is instrumental.",
  );
  expect(
    readFileSync("src/components/tools/BriefTool.tsx", "utf8"),
  ).not.toContain("Build arrangement brief");
  expect(readFileSync("src/components/tools/BriefTool.tsx", "utf8")).toContain(
    "Build this arrangement brief.",
  );
  expect(
    readFileSync("src/components/tools/BriefTool.tsx", "utf8"),
  ).not.toContain("Use prompt in AI Music");
  expect(readFileSync("src/components/tools/BriefTool.tsx", "utf8")).toContain(
    "Use this prompt in AI Music.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Build arrangement brief compiles",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Build this arrangement brief. compiles",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Build this arrangement brief compiles the current original’s key, tempo, meter, form, chords and band intensity locally.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Build this arrangement brief. setter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Build this arrangement brief setter sammen toneart, tempo, taktart, form, akkorder og bandintensitet fra den åpne låten lokalt.",
  );
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("Count-in bars");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("Count-in is in bars.");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("Entry BPM");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("Entry tempo is in BPM.");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain('label="Chart">');
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("Chart for this entry.");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain('label="Groove">');
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("Groove for this entry.");
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Landscape ·",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Landscape is 16:9.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Portrait is 9:16.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "720p ·",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "720p. 30 fps.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose the frame.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Name this project.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose a project.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Project title",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Studio take",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose a studio take.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Shot name",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Name this shot.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Timeline seconds",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Timeline length is in seconds.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Saved soundtrack",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose a saved soundtrack.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Music model",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose a music model.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Video model",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose a video model.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Requested seconds",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Requested length is in seconds.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Generate seconds",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Generate length is in seconds.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Footage for this shot",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose footage for this shot.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Enter the model ID.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Editable model ID",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This model ID is editable.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Describe the song.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Prompt node ID",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Enter the prompt node ID.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Prompt input name",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Enter the prompt input name.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Save output node ID",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Enter the save-output node ID.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Full local file path",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Enter the full local file path.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Preview position",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Set the preview position.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Edit the proposed shot descriptions.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "\n              Instrumental\n",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This track is instrumental.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "New unsaved project",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is a new unsaved project.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Workflow documentation",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Open the workflow documentation.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Provider documentation",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Open the provider documentation.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Import your audio or footage.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Song generator",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Generate a song.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Start from an idea.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Choose audio…",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose audio.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Choose a recording…",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose a recording.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Creative direction",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Set the creative direction.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Look, subject & AI director",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Look, subject and the AI director.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Look, subject and recurring details",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Describe the look, subject and recurring details.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Director’s proposal",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Review the director’s proposal.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Model ID & API details",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Open the model ID and API details.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Choose generated or imported footage…",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose generated or imported footage.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "YOUR SHOT GOES HERE",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Your shot goes here.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "\n            Show jobs\n",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Show these jobs.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    ">All jobs<",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Show all jobs.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Generated lyrics / structure",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Open the generated lyrics and structure.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Generation library",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Open the generation library.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Generated lyrics & structure",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Open the generated lyrics and structure.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Checking local media tools…",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Checking local media tools.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Choose the song"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Choose the song.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "shots assigned",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "shots are assigned.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Rendered locally"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Rendered locally.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is rendered locally.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Duration matches"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Duration matches.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This duration matches.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Fit the cuts to your song"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Fit the cuts to your song.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Project settings",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Open the project settings.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "API settings",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Open these AI settings.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Undo edit",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Undo this edit.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Save project",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Save this project.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "\n            New project\n",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Start this new project.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "\n            Get FFmpeg\n",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Get this FFmpeg.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "\n                Dismiss\n",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Dismiss this proposal.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Use take",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Use this take.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Import soundtrack",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Import this soundtrack.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Import clip for this shot",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Import this clip for this shot.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Apply to storyboard",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Apply this to the storyboard.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Render music video",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Render this music video.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Open audio library",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Open this audio library.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Cancel local work",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Cancel this local work.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Play film with sound",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Play this film with sound.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Add shot",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Add this shot.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save project keeps it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this project. keeps",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this project keeps it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this project. beholder",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this project beholder den.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "or Use take from",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "or Use this take. from",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "or Use this take from a saved studio take.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Use this take. fra",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "eller Use this take fra et lagret studioopptak.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Use this take. builds",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Use this take builds a clean starting mix",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Use this take. lager",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Use this take lager en ren startmiks",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Fit all these cuts to the song length. scales",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Fit all these cuts to the song length scales durations proportionally.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Fit all these cuts to the song length. skalerer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Fit all these cuts to the song length skalerer klipplengder proporsjonalt.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Render this music video. requires",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Render this music video requires all clips and a matching timeline.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Render this music video. krever",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Render this music video krever alle klipp og en tidslinje som passer.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play this film with sound. opens",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Play this film with sound opens the native player.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play this film with sound. åpner",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Play this film with sound åpner systemets spiller.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Build these cuts from the song sections. uses",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Build these cuts from the song sections uses the take’s saved chart, or the open Write song, then fits four-bar shots to the soundtrack length.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Build these cuts from the song sections. bruker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Build these cuts from the song sections bruker opptakets lagrede skjema eller åpen Write-låt, og tilpasser firetakters klipp til lydsporets lengde.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Let the selected brain direct this. returns",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Let the selected brain direct this returns editable shot descriptions from text/timing only.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Let the selected brain direct this. gir",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Let the selected brain direct this gir redigerbare klippbeskrivelser fra tekst/tid alene.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Preview these aligned cuts. rounds",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Preview these aligned cuts rounds internal cut positions to that grid.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Preview these aligned cuts. flytter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Preview these aligned cuts flytter indre klippepunkter til nærmeste punkt i rutenettet.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Use Analyze again. for",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Use Analyze again for older results.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Analyze again. for eldre",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Analyze again for eldre resultater.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this take. waits",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this take waits briefly for queued audio before closing the files.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this take. venter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this take venter kort på lyd som allerede ligger i kø før filene lukkes.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "01 / Soundtrack",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Step 1 is the soundtrack.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "02 / Footage",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Step 2 is the footage.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "03 / Export",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Step 3 is the export.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Unsaved edits"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Unsaved edits.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "These are unsaved edits.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Saved locally"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Saved locally.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is saved locally.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is a new project.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "01 / SOUNDTRACK",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This section is the soundtrack.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "02 / CREATIVE DIRECTION",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This section is the creative direction.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "03 / STORYBOARD",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This section is the storyboard.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "04 / THE FILM",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This section is the film.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Paste the full path to a mix or video clip"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Paste the full path to a mix or video clip.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Clip assigned",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "A clip is assigned.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Needs footage",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This shot needs footage.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Assigned"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This clip is assigned.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Needs clip",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This shot needs a clip.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Lyria · MiniMax",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Models include Lyria, MiniMax, Eleven and local.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Acoustic sketch",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Start from an acoustic sketch.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Cinematic build",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Start from a cinematic build.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Practice backing",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Start from a practice backing.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Local file",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "This is the local file.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Speed ·",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Speed is {speed}%.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n                    Transpose\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Choose the transpose.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Vorbis · mono",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Vorbis. Mono or stereo.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "{n} semitones\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "{n} semitones.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Import a finished mix or reference\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Import a finished mix or reference.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    ">Stored on your computer<",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Stored on your computer.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    '"Find a mix or reference"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Find a mix or reference.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n          Search\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Search the library.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    'aria-label="Search songs"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    'aria-label="Search the library."',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    'aria-label="Audio library"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    'aria-label="This is the audio library."',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    'aria-label="Practice speed"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "`Speed is ${speed}%.`",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "</strong>audio files",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "audio files.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain("minutes.");
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    '"No matching songs"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "No matching songs.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Analyze tempo & chords",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Analyze tempo and chords.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    '"Analyze again"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Analyze again.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain("Analyze tempo & chords");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "Analyze tempo and chords first.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    ">All charts<",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "Show all charts.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    ">Your charts<",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "Show your charts.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    ">Bundled charts<",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "Show bundled charts.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "\n          Search\n",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "Search the library.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'aria-label="Search charts and grooves"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'aria-label="Search the library."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'aria-label="Chart collection"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'aria-label="Choose the chart collection."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'aria-label="Chart editor"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'aria-label="This is the chart editor."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('aria-label="Reference player"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    'aria-label="This is the reference player."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('aria-label="Confirmed reference sections"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    'aria-label="These are the bars and sections."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('aria-label="Current chord estimate"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    'aria-label="This is the current chord estimate."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('aria-label="Live reference practice"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    'aria-label="Practice the speed and key."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('aria-label="Reference practice ramp"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    'aria-label="Build up the speed."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    '"Title, key, genre or tempo"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "Title, key, genre or tempo.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("Contrast strength ·");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Contrast strength is {strength}%.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("Transition lab");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "This is the transition lab.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("\n            Section appearance\n");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Choose the section appearance.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("Context on each side");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Choose the context on each side.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("Include lyric reminders\n");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Include lyric reminders.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain('"No structural issues found"');
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "No structural issues found.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("Why some takes cannot be used<");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Why some takes cannot be used.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("{c.take.timestamp} · {c.take.id.slice(-8)}");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "{c.take.timestamp}. {c.take.id.slice(-8)}.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("\n            Performance\n");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Choose the performance.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain(">Choose a compatible recording<");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Choose a compatible recording.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "} s · {t.tempo.toFixed(1)} BPM",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "} s. {t.tempo.toFixed(1)} BPM.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Transform phrase",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Transform this phrase.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "<h2>Song map</h2>",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "This is the song map.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Phrase reference",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "This is the phrase reference.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Words for this section",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Write words for this section.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "\n          Song notebook\n",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "This is the song notebook.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Edit order and repeats",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Edit the order and repeats.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Find the next colour.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    ">Always reduce<",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "Always reduce motion.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    ">Never reduce<",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "Never reduce motion.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    ">Match the OS<",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "Match the OS.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    'aria-label="Reduced motion"',
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    'aria-label="Choose the reduced motion."',
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    ">System default output<",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "Use the system default output.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    ">System default input<",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "Use the system default input.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    "Output Device",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "Choose the output device.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    "Input Device (guitar DI)",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "Choose the guitar DI input.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    "\n                  Input Channel\n",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "Choose the input channel.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    "\n                  Sample Rate\n",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "Choose the sample rate.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    "\n                  Buffer Size\n",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "Choose the buffer size.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    ">Voice setup<",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Open the voice setup.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    'aria-label="Jo voice"',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    'aria-label="This is the Jo voice."',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Scribe v2 ·",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Scribe v2 is priced in USD per hour.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Flash v2.5 ·",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Flash v2.5 is priced in USD per 1,000 characters.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "\n            Microphone\n",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Choose the microphone.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    ">System default microphone<",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Use the system default microphone.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "ElevenLabs voice ID\n",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Enter the ElevenLabs voice ID.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Band ducking (dB)",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Band ducking is in dB.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Global hold shortcut",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Enter the global hold shortcut.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "` · ${lastReleaseToFirstAudioMs} ms`",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "` ${lastReleaseToFirstAudioMs} ms.`",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    'idle: "Ready",',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    'idle: "Ready.",',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    'idle: "This is ready.",',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Opening microphone…",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "The microphone is opening.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Listening, release to send",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Listening. Release this to send.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "This is listening. Release this to send.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    '? "Release to send" : "Hold to talk"',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    '? "Release this to send."',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    ': "Hold this to talk."',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Set up Jo voice",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Open the voice setup.",
  );
  expect(readFileSync("src-tauri/src/voice.rs", "utf8")).not.toContain(
    "Hold to talk, speak",
  );
  expect(readFileSync("src-tauri/src/voice.rs", "utf8")).toContain(
    "Hold this to talk., speak",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Hold to talk with the pointer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Hold this to talk. with the pointer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Hold this to talk with the pointer",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    'speaking: "Jo is speaking",',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Jo is speaking.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    '"Voice requires the desktop app"',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    '"Voice requires the desktop app."',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    '"Add an ElevenLabs key to enable voice"',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    '"Add an ElevenLabs key to enable voice."',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Load voices",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Load these voices.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Cancel voice",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Cancel this voice.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Check ElevenLabs prices",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Check these ElevenLabs prices.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "\n            Save voice setup\n",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Save this voice setup.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Optional estimates:",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "and Save voice setup.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "These are optional estimates; enter your account's rates and Save this",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Save voice setup to remember",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Save this voice setup to remember",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "API key settings",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Open these AI settings.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Enable shortcut for this session",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Enable this shortcut for this session.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Disable global shortcut",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Disable this global shortcut.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Enable shortcut for this session",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Enable this shortcut for this session.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Enable this shortcut for this session registers it until disabled",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "(or Load voices)",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "(or Load these voices.)",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).not.toContain(
    "Hands-free controls ·",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).toContain(
    'Hands-free controls are {c.enabled ? "enabled" : "off"}.',
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).not.toContain(
    "\n          MIDI input\n",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).toContain(
    "Choose the MIDI input.",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).not.toContain(
    ">Disconnected<",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).toContain(
    "This input is disconnected.",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).not.toContain(
    "Enable pedal actions\n",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).toContain(
    "Enable pedal actions.",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).not.toContain(
    '"Unassigned"',
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).toContain(
    "This pedal is unassigned.",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).not.toContain(
    "\n          Rescan inputs\n",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).toContain(
    "Rescan these inputs.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Your account price · USD per minute (optional)",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Your account price is in USD per minute. This is optional.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    ">Not identified<",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "This guitar track is not identified.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "\n          Guitar track\n",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Choose the guitar track.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    ">Reference tracks<",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "These are the reference tracks.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "{stem.label} · {Math.round(stem.gain * 100)}%",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "{stem.label} is {Math.round(stem.gain * 100)}%.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Mute {stem.label}\n",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Mute {stem.label}.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Separate instruments / import stems",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Separate instruments or import stems.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "\n          Separation provider\n",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Choose the separation provider.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "\n          Local stem ZIP path\n",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Enter the local stem ZIP path.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Estimated charge:",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "The estimated charge is $",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "\n          Explore\n",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Choose what to explore.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "\n        Your direction\n",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Write your direction.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "{BRAINS[preferences.selected].name} · {model.model} ·",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "{BRAINS[preferences.selected].name}. {model.model}.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "Tweak the chords before applying\n",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Tweak the chords before applying.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "Tweak the notes or lyrics\n",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Tweak the notes or lyrics.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "Keep in song notes",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Keep this in the song notes.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "Generate an idea",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Generate this idea.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "Add bridge & keep original version",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Add this bridge and keep the original version.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "Apply chords & keep original version",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Apply these chords and keep the original version.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "Add to section lyrics",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Add this to the section lyrics.",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    "\n              Dismiss\n",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Dismiss this proposal.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    ">Edit section<",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Edit this section.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                    Section name\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Name this section.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    ">Guitar layers<",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "These are the guitar layers.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Tone on section entry",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Choose the tone on section entry.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'label="Bars in trimmed riff"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "How many bars are in the trimmed riff.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                    Layer name\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Name this layer.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "<h2>Versions</h2>",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "These are the saved versions.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                    Version name\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Name this version.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'placeholder="Chorus with space"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    'placeholder="A chorus with space."',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "<h2>{section.name} lyrics</h2>",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "These are the {section.name} lyrics.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "<h2>{section.name} chords</h2>",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "These are the {section.name} chords.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    ">Borrow from the parallel key</option>",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Borrow from the parallel key.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    ">Dominants that lead somewhere</option>",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Dominants that lead somewhere.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Rest / no chord",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "This is a rest or no chord.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Use ${choice.chord}:",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Use ${choice.chord}. ${choice.reason}.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Use ${choice.chord}. ${choice.reason}",
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).not.toContain(
    '"Pull toward home"',
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).toContain(
    '"This pulls toward home."',
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).not.toContain(
    '"In your key"',
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).toContain(
    '"This is in your key."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    'work("Planning section cuts"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    'work("Planning these section cuts."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    'work("Opening generated song"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    'work("Opening this generated song."',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    'work("Refreshing audio library"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    'work("Refreshing this audio library."',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    'work("Analyzing song locally"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    'work("Analyzing this song locally."',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    'work("Checking guitar residual"',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    'work("Checking this guitar residual."',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    'work("Separating stems"',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    'work("Separating these stems."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Fit all cuts to song length",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Fit all these cuts to the song length.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Let {brain.name} direct\n",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Let {brain.name} direct this.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain('"Make the chorus lift"');
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    '"Make the chorus lift."',
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain('"Add an eight-bar bridge"');
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    '"Add an eight-bar bridge."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '? "Save your current video first"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    '? "Save your current video first."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    ': "Start a new video"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    ': "Start a new video."',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    '? "Remove this section\'s form entries first"',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    '? "Remove this section\'s form entries first."',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    ': "Delete this unused section with its lyrics and band settings"',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    ': "Delete this unused section with its lyrics and band settings."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '? "soundtrack"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    '? "Use this soundtrack."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    ': "for this shot"}',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    ': "Use this for this shot."}',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('? "No analysed beat at this position"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '? "No analysed beat at this position."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('?? "Key unknown"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '"This key is unknown."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('?? "Outside named sections"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '?? "This is outside named sections."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('% ${song.state === "playing" ? "heard" : "set"}');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '% is ${song.state === "playing" ? "heard" : "set"}',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("100%. Original key.");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Reset to 100% and the original key.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('?? "unknown"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    ': "This chord is unknown."',
  );
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    ': "Next is unknown."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('? "estimated" : "confirmed"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '? "Section loops start at the estimated downbeat."',
  );
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    ': "Section loops start at the confirmed downbeat."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("Reference in Jamstudio is {song.state}.");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '"This reference is playing."',
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).not.toContain(
    'rotate: "Rotate bars"',
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).toContain(
    'rotate: "Rotate these bars."',
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).not.toContain(
    'reverse: "Reverse bars"',
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).toContain(
    'reverse: "Reverse these bars."',
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).not.toContain(
    'repeat: "Repeat phrase"',
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).toContain(
    'repeat: "Repeat this phrase."',
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).not.toContain(
    "} variation ${body.chart.sections.length + 1}`",
  );
  expect(readFileSync("src/lib/writingTools.ts", "utf8")).toContain(
    "This is ${source.name.slice(0, 60)} variation ${body.chart.sections.length + 1}.",
  );
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).not.toContain('?? "Default input"');
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).toContain(': "This is the default input."');
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).not.toContain('?? "Default output"');
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).toContain(': "This is the default output."');
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    'name: "New section"',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    'name: "This is a new section."',
  );
  expect(readFileSync("src/lib/jo/songLab.ts", "utf8")).not.toContain(
    'chords: "Alternative chords"',
  );
  expect(readFileSync("src/lib/jo/songLab.ts", "utf8")).toContain(
    'chords: "These are alternative chords."',
  );
  expect(readFileSync("src/lib/jo/songLab.ts", "utf8")).not.toContain(
    'feedback: "Arrangement feedback"',
  );
  expect(readFileSync("src/lib/jo/songLab.ts", "utf8")).toContain(
    'feedback: "This is arrangement feedback."',
  );
  expect(readFileSync("src/lib/jo/songLab.ts", "utf8")).not.toContain(
    'bridge: "A contrasting bridge"',
  );
  expect(readFileSync("src/lib/jo/songLab.ts", "utf8")).toContain(
    'bridge: "This is a contrasting bridge."',
  );
  expect(readFileSync("src/lib/jo/songLab.ts", "utf8")).not.toContain(
    'lyrics: "A lyric seed"',
  );
  expect(readFileSync("src/lib/jo/songLab.ts", "utf8")).toContain(
    'lyrics: "This is a lyric seed."',
  );
  expect(readFileSync("src/screens/registry.ts", "utf8")).not.toContain(
    'description: "Generate music"',
  );
  expect(readFileSync("src/screens/registry.ts", "utf8")).toContain(
    'description: "Generate this music."',
  );
  expect(readFileSync("src/screens/registry.ts", "utf8")).not.toContain(
    'description: "Compose & arrange"',
  );
  expect(readFileSync("src/screens/registry.ts", "utf8")).toContain(
    'description: "Compose and arrange this."',
  );
  expect(readFileSync("src/lib/originals.ts", "utf8")).not.toContain(
    "`Version ${song.versions.length + 1}`",
  );
  expect(readFileSync("src/lib/originals.ts", "utf8")).toContain(
    "`This is version ${song.versions.length + 1}.`",
  );
  expect(readFileSync("src/lib/originals.ts", "utf8")).not.toContain(
    "`Guitar ${b.clips.length + 1}`",
  );
  expect(readFileSync("src/lib/originals.ts", "utf8")).toContain(
    "`This is guitar ${b.clips.length + 1}.`",
  );
  expect(readFileSync("src/lib/chart/text.ts", "utf8")).not.toContain(
    '"Untitled chart"',
  );
  expect(readFileSync("src/lib/chart/text.ts", "utf8")).toContain(
    '"This is an untitled chart."',
  );
  expect(
    readFileSync("src/components/EngineStatusPill.tsx", "utf8"),
  ).not.toContain('?? "Audio"');
  expect(readFileSync("src/components/EngineStatusPill.tsx", "utf8")).toContain(
    '"This audio is unnamed."',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Click volume"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The click volume"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Band volume"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The band volume"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'title="Click volume."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'title="Choose the click volume."',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Tone"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The tone"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Tuner"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The tuner"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Count-in"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The count-in"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Time signature"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The time signature"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Loop"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Loop"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The loop"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Style"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Style"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The style"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Intensity"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The intensity"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Cue"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The cue"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Load chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The load chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Band"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The band"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Lyria"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The Lyria"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Lyria stop"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The Lyria stop"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Styles"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Styles"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The styles"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Charts"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Charts"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The charts"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Library"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Library"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The library"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Save chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Save chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The save chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Delete chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'runOk("Delete chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'runOk("The delete chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Play chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'runOk("Play chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'runOk("The play chart"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Transpose song"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'runOk("Transpose song"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The transpose song"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Record"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The record"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Stop recording"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The stop recording"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Latency offset"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Latency offset"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The latency offset"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Takes"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Takes"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The takes"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Delete take"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'runOk("Delete take"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'runOk("The delete take"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Rig profiles"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Rig profiles"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The rig profiles"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Rig state"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Rig state"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The rig state"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Rig profile"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Rig profile",',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The rig profile"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Rig scene"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Rig scene"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The rig scene"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Rig mapping"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Rig mapping"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The rig mapping"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Rig follow"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Rig follow"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The rig follow"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Rig control"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Rig control"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The rig control"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Rig program"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Rig program"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The rig program"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Rig monitor"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Rig monitor"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The rig monitor"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("MIDI port"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("MIDI port"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The MIDI port"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Virtual MIDI"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The virtual MIDI"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Sample packs"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The sample packs"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Log export"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The log export"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    '"MIDI port closed"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    '"The MIDI port is closed."',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Analyze take"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Analyze take"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The analyze take"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Take review"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Take review"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The take review"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Export take"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Export take"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The export take"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Audio devices"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Audio devices"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The audio devices"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Settings"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Settings",',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The settings"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Settings recovery"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Settings recovery"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The settings recovery"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Engine status"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Engine status"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The engine status"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Restart audio"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'run("Restart audio"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'run("The restart audio"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    "`Audio running at",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    "`Audio is running at ${status.sample_rate} Hz.`",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    "`Exported ${stems} stem(s)",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    "`This exported ${stems} stem(s) and the tempo map to ${report.dir}. ${missing} stem file(s) were missing on disk.`",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    "`Exported ${stems} stems + tempo map",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    "`This exported ${stems} stems and the tempo map",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    "`Saved ${chart.name}",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    "`This saved ${chart.name}.`",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "`Shot ${",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "`This is shot ${project.shots.length + 1}.`",
  );
  expect(readFileSync("src/lib/roomActions.ts", "utf8")).not.toContain(
    "`Before ${label}`",
  );
  expect(readFileSync("src/lib/roomActions.ts", "utf8")).toContain(
    "`This is before ${label}.`",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("`Before ${label}`");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "`This is before ${label}.`",
  );
  expect(readFileSync("src/lib/jo/songLab.ts", "utf8")).not.toContain(
    "`Before ${idea.title}`",
  );
  expect(readFileSync("src/lib/jo/songLab.ts", "utf8")).toContain(
    "`This is before ${idea.title}.`",
  );
  expect(readFileSync("src/components/ChordStrip.tsx", "utf8")).not.toContain(
    "click to jump",
  );
  expect(readFileSync("src/components/ChordStrip.tsx", "utf8")).toContain(
    "`This is bar ${bar.barIndex} (${bar.sectionName}). Click it to jump. Shift-click it to loop.`",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    'title = "Opening"',
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    'title = "This is the opening."',
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(" · bars ");
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "`This is ${section.name}, bars ${bar + 1}–${Math.min(bar + 4, section.bars.length)}.`",
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    " · channel ",
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    "`${p.kind.toUpperCase()} ${p.number} is on channel ${p.channel}.`",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    " bars · ",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "This song is {total} bars and {Math.floor(seconds / 60)}:",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "% band intensity",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Band intensity is {energy}%.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    " lines · ",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "This section has {lines.length} lines and",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    " · ×",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "`Bars ${ranges[i].startBar}–${ranges[i].endBar - 1}, repeated ${a.repeats} times.`",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    'notes.join(" · ")',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    '`These tones are ${notes.join(", ")}.`',
  );
  expect(readFileSync("src/lib/roomTools.ts", "utf8")).not.toContain(
    "band intensity ${",
  );
  expect(readFileSync("src/lib/roomTools.ts", "utf8")).toContain(
    "Band intensity is ${",
  );
  expect(readFileSync("src/lib/roomTools.ts", "utf8")).not.toContain(
    "Arrangement intent,",
  );
  expect(readFileSync("src/lib/roomTools.ts", "utf8")).toContain(
    "The arrangement intent is adapted to the selected generation duration.",
  );
  expect(readFileSync("src/lib/roomTools.ts", "utf8")).not.toContain(
    "${c.name}. ${c.defaultBpm} BPM,",
  );
  expect(readFileSync("src/lib/roomTools.ts", "utf8")).toContain(
    "The tempo is ${c.defaultBpm} BPM,",
  );
  expect(readFileSync("src/lib/roomTools.ts", "utf8")).not.toContain(
    "Instrumental; no vocals.",
  );
  expect(readFileSync("src/lib/roomTools.ts", "utf8")).toContain(
    "This is instrumental with no vocals.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    "Single continuous music-video shot for",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "This is a single continuous music-video shot for",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    "Open the space, bold camera movement",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "This opens the space with bold camera movement and an emotional lift.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    "Intimate framing, a slow camera move",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "This uses intimate framing, a slow camera move, and attentive performance detail.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    "A single continuous shot.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "This is a single continuous shot.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    "Intimate live-performance film.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "This is an intimate live-performance film.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    "A guitarist alone in a warm rehearsal room",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "This is a guitarist alone in a warm rehearsal room, with a close-up of hands, then a slow reveal of the room.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    "Warm tungsten light, deep shadows",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "This uses warm tungsten light, deep shadows, and subtle film grain.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "A soulful original guitar song.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is a soulful original guitar song.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "An intimate original acoustic guitar song.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is an intimate original acoustic guitar song.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Intimate verse, soaring chorus",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is an intimate verse, a soaring chorus, and a short instrumental bridge.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Original instrumental guitar music.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is original instrumental guitar music.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Warm live-room sound.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is warm live-room sound.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "An original guitar-free backing track:",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is an original guitar-free backing track.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Fingerpicked verses, a warm melodic chorus",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This has fingerpicked verses, a warm melodic chorus, and a short instrumental ending.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Warm electric bass, tight drums",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This uses warm electric bass, tight drums, and understated organ.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Natural room sound, human dynamics.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is natural room sound and human dynamics.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Clear verse and chorus, no lead melody",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This has a clear verse and chorus, with no lead melody or vocals.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    "No titles or dialogue.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "This has no titles or dialogue.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    "No dialogue or on-screen text.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "This has no dialogue or on-screen text.",
  );
  expect(readFileSync("src/App.tsx", "utf8")).not.toContain(
    "to save them before closing.",
  );
  expect(readFileSync("src/App.tsx", "utf8")).toContain("Keep these edits");
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Release this to send. up to 20",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "Release this to send up",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "and pick a microphone",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "Open Jo. Open the voice setup and choose a microphone, or add an ElevenLabs key in Settings.",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Retry after the OS",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Retry after the OS",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Pick a scene",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Pick a scene",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Use a CC",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Use a CC",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Pick a listed rig",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Pick a listed rig",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Pick a listed chart",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Pick a listed chart",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Open Rig, then Rescan",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Open Rig, then Rescan",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Open Settings → Audio devices",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Open Settings → Audio devices",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Open Library;",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Open Library;",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Start a take first.",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Start a take first.",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Stop the current take first.",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Stop the current take first.",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Free disk space",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Free disk space",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Check ~/JosefinesJamstudio",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Check ~/JosefinesJamstudio",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Open Settings → AI & models.",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Open Settings → AI & models.",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Fix the file or move it aside.",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Fix the file or move it aside.",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).not.toContain(
    "${t} Open Settings → First run",
  );
  expect(readFileSync("src/lib/loudError.ts", "utf8")).toContain(
    "${t}. Open Settings → First run",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Unsaved edits.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "These are unsaved edits.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("Ramp off, or waiting for updated output.");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "This ramp is off, or waiting for updated output.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Saved locally.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is saved locally.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Rendered locally.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This is rendered locally.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Duration matches.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "This duration matches.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("complete bars.");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "bars are complete.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("Ramp is armed.");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "This ramp is armed.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("Target reached.");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "This target is reached.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("estimates. {song.grid.beats_per_bar} beats per");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "This has {song.grid.beats_per_bar}",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("source seconds.");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "This is {song.position.toFixed(1)} / {song.seconds.toFixed(1)} seconds",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    "Video saved.",
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    "This video is saved.",
  );
  expect(readFileSync("src/lib/originals.ts", "utf8")).not.toContain(
    "Song saved.",
  );
  expect(readFileSync("src/lib/originals.ts", "utf8")).toContain(
    "This song is saved.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Song saved.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "This song is saved.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Unsaved changes.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "These are unsaved changes.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '"Saved."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    '"This is saved."',
  );
  expect(readFileSync("src/lib/originals.ts", "utf8")).not.toContain(
    "Idea saved.",
  );
  expect(readFileSync("src/lib/originals.ts", "utf8")).toContain(
    "This idea is saved.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Idea saved.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "This idea is saved.",
  );
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("Setlist saved.");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("This setlist is saved.");
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Recording updated.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "This recording is updated.",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    "Logged only.",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    "This is logged only.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    "Offline commands.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "These are offline commands.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    "to check key access.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "This checks key access.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "Key removed.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "This key is removed.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "AI settings saved.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "These AI settings are saved.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Voice settings saved.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "These voice settings are saved.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    "Tempo, cues, styles and recording.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "These cover tempo, cues, styles and recording.",
  );
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).not.toContain("Audio setup profile saved.");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).toContain("This audio setup profile is saved.");
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    "Text commands and optional ElevenLabs voice.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "These are text commands and optional ElevenLabs voice.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Mix applied and saved.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "This mix is applied and saved.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Section selected.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "This section is selected.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Part lock updated.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "This part lock is updated.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Last edit undone.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "This last edit is undone.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Rhythm section updated.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "This rhythm section is updated.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Started playback.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "This playback is started.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Paused playback.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "This playback is paused.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Stopped playback.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "This playback is stopped.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Tuner on.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "The tuner is on.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Tuner off.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "The tuner is off.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).not.toContain(
    "Tuner on.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).toContain(
    "The tuner is on.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).not.toContain(
    "Tuner off.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).toContain(
    "The tuner is off.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Looping.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "The loop is on.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).not.toContain(
    "Stopping playback.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).toContain(
    "This playback is stopping.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Loop is off.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "The loop is off.",
  );
  expect(readFileSync("src/lib/jo/tools.ts", "utf8")).not.toContain(
    "Lyria prompts updated.",
  );
  expect(readFileSync("src/lib/jo/tools.ts", "utf8")).toContain(
    "These Lyria prompts are updated.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Count-in is off.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "The count-in is off.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).not.toContain(
    "Muting drums.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).toContain(
    "This is muting the drums.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).not.toContain(
    "Drums back in.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).toContain(
    "This is bringing the drums back in.",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    "Count-in is off.",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    "The count-in is off.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).not.toContain(
    "Tapping tempo.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).toContain(
    "This is tapping the tempo.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).not.toContain(
    "Let's roll.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).toContain(
    "This is rolling.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).not.toContain("Got it.");
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).not.toContain(
    "This is understood.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).toContain(
    "I didn't catch that.",
  );
  expect(readFileSync("src/lib/jo/gemini.ts", "utf8")).not.toContain("On it.");
  expect(readFileSync("src/lib/jo/gemini.ts", "utf8")).toContain(
    "This is underway.",
  );
  expect(readFileSync("src/lib/jo/providers.ts", "utf8")).not.toContain(
    "On it.",
  );
  expect(readFileSync("src/lib/jo/providers.ts", "utf8")).toContain(
    "This is underway.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "Recording stopped.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "This recording is stopped.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    '"Idle."',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    '"This is idle."',
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    '"Hardware."',
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    '"This is hardware."',
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    '"Stopped."',
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    '"This is stopped."',
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    "Headless. No audio device.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "This is headless. This has no audio device.",
  );
  expect(
    readFileSync("src/components/ShortcutsHelp.tsx", "utf8"),
  ).not.toContain("No matches.");
  expect(readFileSync("src/components/ShortcutsHelp.tsx", "utf8")).toContain(
    "This has no matches.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).not.toContain(
    "Driving straight 8th rock groove.",
  );
  expect(readFileSync("src/lib/jo/intent.ts", "utf8")).toContain(
    "This is switching to",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain('"Ready."');
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    '"This is ready."',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    '"Ready."',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    '"This is ready."',
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Transcribing.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "This is transcribing.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Listening. Release this to send.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "This is listening. Release this to send.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    "Estimated.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "This is estimated.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "Estimated.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "This is estimated.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain("Working.");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "This is working.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    " Editing.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "This is editing.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    " Yours.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "This is yours.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    " Swung.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "This is swung.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Unknown.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    'placeholder="The price is unknown."',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    "Disconnected.",
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    "This is disconnected.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain("Applied.");
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "This is applied.",
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).not.toContain(
    "Review.",
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).toContain(
    "This is a review.",
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).not.toContain(
    'timestamp: "Jo.",',
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).toContain(
    'timestamp: "This is Jo.",',
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).not.toContain(
    "Talk or send this to Jo. uses",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).toContain(
    "This uses one press to start listening and another",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).not.toContain(
    "Open the voice setup. in Jo AI",
  );
  expect(readFileSync("src/components/FootControls.tsx", "utf8")).toContain(
    "Open the voice setup in Jo AI.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Talk or send this to Jo. for",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "In Write → Hands-free controls, learn the",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "Analyze this take. for",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Analyze this take for timing and pitch trends.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "Record a new take., then",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Hit Record a new take, then",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "Record a new take.</strong> to",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Hit <strong>Record a new take</strong> to record multi-track",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "Analyze again. to",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Analyze again to refresh the measurements.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    "Analyze again. to replace it.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    "Saved analysis is unreadable or from another version.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Create this new song. then",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Create this new song, then use Record & layers to capture a riff.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Play this song. loads",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    ". Play this song loads your current draft; Space resumes the loaded arrangement.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Arm this capture. before",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Arm this capture before playing.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "H works.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Keep that take. H is the shortcut.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "variation. for",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "variation for an independent edit.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Delete this section. removes",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Delete this section removes a",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Make this variation. creates",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "this variation creates a separate draft.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Add this bar. for",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Use Add this bar for a longer phrase.",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).not.toContain(
    "Delete this section. to",
  );
  expect(readFileSync("src/lib/finishing.ts", "utf8")).toContain(
    "or use Delete this section to let it go.",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).not.toContain(
    "Undo this edit. is available",
  );
  expect(readFileSync("src/lib/jo/dispatcher.ts", "utf8")).toContain(
    "Undo this edit is available in Film.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "Cancel this local work. keeps",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Cancel this local work keeps any received",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Load this in Jamstudio. to",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Load this in Jamstudio to play it.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Load this in Jamstudio. plays",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Load this in Jamstudio plays the reference through the native audio",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Load this minus-guitar mix. plays",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "minus-guitar mix plays minus-guitar.wav after Check this guitar residual",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Load this minus-guitar mix. stays",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Load this minus-guitar mix stays not configured until a pass.",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).not.toContain(
    "Check this guitar residual.,",
  );
  expect(readFileSync("src/screens/Settings.tsx", "utf8")).toContain(
    "then Load this minus-guitar mix.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Listen in the media player. to",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Choose Listen in the media player to hear it.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Play the reference. or",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Use Play the reference or the top transport to start.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Choose an audio file. or",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Use Choose an audio file or paste its path.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "Test this model. before",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "use Test this model before relying on one.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Play this song. or",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Loop this section. auditions",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "song or Loop this section auditions the band.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "Load this original mix. then",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "Load this original mix then apply valid speed and transpose settings.",
  );
  expect(readFileSync("crates/jam-band/src/kit.rs", "utf8")).not.toContain(
    "Check these sample packs. with",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "Check these sample packs. with",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    "Check these sample packs. with",
  );
  expect(readFileSync("crates/jam-band/src/kit.rs", "utf8")).toContain(
    "Run Settings → Check these sample packs with JAM_LIVE=1.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "Check this guitar residual. again",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "Run Check this guitar residual again after the check has passed.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this in Jamstudio. to use",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen in the media player. opens",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this in Jamstudio to use the native player. Listen in the media player opens the saved file in the system player.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this in Jamstudio. for å",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen in the media player. åpner",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this in Jamstudio for å bruke den innebygde spilleren. Listen in the media player åpner den lagrede filen i systemets spiller.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Make this practice copy. creates",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Make this practice copy creates a new 48 kHz stereo WAV.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Make this practice copy. lager",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Make this practice copy lager en ny stereo-WAV på 48 kHz.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen in the media player. to",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "use Listen in the media player to hear it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen in the media player. for å",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "trykk Listen in the media player for å høre den.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Cancel this current operation. stops preparation",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Cancel this current operation stops preparation and removes the incomplete output.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Cancel this current operation. stopper klargjøringen",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Cancel this current operation stopper klargjøringen og fjerner uferdig resultat.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Cancel this current operation. stops local work",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Cancel this current operation stops local work;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Cancel this current operation. stopper lokalt",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Cancel this current operation stopper lokalt arbeid;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Check this guitar residual. measures",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Check this guitar residual measures leak of a marked guitar stem into the other tracks, writes minus-guitar.wav next to the song, and is not configured without those stems.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Check this guitar residual. måler",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Check this guitar residual måler lekkasje fra et merket gitarspor inn i de andre sporene, skriver minus-guitar.wav ved låten, og er ikke konfigurert uten slike stems.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this minus-guitar mix. plays",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this minus-guitar mix plays that WAV in the native engine after the check passes;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this minus-guitar mix. spiller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this minus-guitar mix spiller den WAV-filen i den innebygde motoren etter at sjekken er godkjent;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this in Jamstudio. reloads",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this in Jamstudio reloads the saved stem set.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "laster Load this in Jamstudio. det",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "laster Load this in Jamstudio det lagrede stem-settet på nytt.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this original mix. plays",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this original mix plays the original stereo file while keeping the saved stems, including when a stem is damaged.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this original mix. spiller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this original mix spiller originalens stereofil og beholder stem-settet, også hvis et stem er skadet.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Apply and save this mix. or",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "then Apply and save this mix or Minus this guitar.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Apply and save this mix. eller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "trykker Apply and save this mix eller Minus this guitar.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Restore this guitar. unmutes",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Restore this guitar unmutes the identified track.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Restore this guitar. slår",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Restore this guitar slår på det valgte gitarsporet igjen.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Import this stem ZIP. is local",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Import this stem ZIP is local and free of provider calls.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Import this stem ZIP. er lokal",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Import this stem ZIP er lokal og gjør ingen leverandørkall.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play this song. to",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Press Play this song to load this draft into the band.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play this song. laster dette",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Play this song laster dette utkastet inn i bandet.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open help and guides. opens",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open help and guides opens this searchable manual without discarding the room you were using.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open help and guides. åpner",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open help and guides åpner denne søkbare håndboken uten å forkaste rommet du jobbet i.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Add this section. copies",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Add this section copies the selected chords with default band settings.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Add this section. kopierer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Add this section kopierer de valgte akkordene med standard bandinnstillinger.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Edit the order and repeats. moves",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Edit the order and repeats moves, removes or repeats form entries;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Edit the order and repeats. flytter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Edit the order and repeats flytter, fjerner eller gjentar ledd i formen;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this song. writes to disk without",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this song writes to disk without changing playback.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this song. lagrer til disk uten",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this song lagrer til disk uten å endre avspillingen.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this song. writes the current document",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this song writes the current document and its versions to disk.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this song. skriver",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this song skriver gjeldende dokument og versjonene til disk.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Loop this section. and",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Loop this section and Record also load the draft.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Loop this section. og",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Loop this section og Record laster også inn utkastet.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Add this bar. copies",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Add this bar copies the selected bar;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Add this bar. kopierer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Add this bar kopierer valgt takt;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Remove this bar. keeps",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Remove this bar keeps at least one.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Remove this bar. beholder",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Remove this bar beholder minst én.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Transform this phrase. rotates",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Transform this phrase rotates, reverses or repeats the bars.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Transform this phrase. roterer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Transform this phrase roterer, snur eller gjentar taktene.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Find the next colour. offers",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Find the next colour offers in-key chords, borrowed parallel-key chords and secondary dominants.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Find the next colour. foreslår",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Find the next colour foreslår akkorder i tonearten, lånte akkorder fra parallelltonearten og sekundærdominanter.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play this song. reloads your draft",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Play this song reloads your draft;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play this song. laster utkastet",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Play this song laster utkastet på nytt;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play this song. reloads and validates",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Play this song reloads and validates it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play this song. laster og validerer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Play this song laster og validerer den på nytt.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep the current tone. That sends nothing.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep the current tone sends nothing.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep the current tone. Det sender",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep the current tone sender ingenting.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Bar ${i + 1}, chord ${j + 1}:",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Bar ${i + 1}, chord ${j + 1} is ${c.chord} for ${c.beats} beats.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This turns melody into harmony. at",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open This turns melody into harmony at the top of Write.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Dette gjør melodi om til harmonier. øverst",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Åpne Dette gjør melodi om til harmonier øverst i Write.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Extract these notes. in",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "then Extract these notes in the desktop app.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Extract these notes. i",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "trykk Extract these notes i skrivebordsappen.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep this as a section variation. creates",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep this as a section variation creates an idea outside the form, preserving the current arrangement and guitar timeline.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep this as a section variation. lager",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep this as a section variation lager en idé utenfor låtformen og bevarer arrangementet og gitarens tidslinje.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Write words for this section. stores",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Write words for this section stores up to 12,000 UTF-16 characters with the section;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Write words for this section. lagrer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Write words for this section lagrer inntil 12 000 UTF-16-tegn sammen med seksjonen;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the phrase reference. shows",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "the adjacent This is the phrase reference shows its chords.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the phrase reference. ved",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This is the phrase reference ved siden av viser akkordene.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the song notebook. holds",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This is the song notebook holds shared ideas, images and performance notes.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the song notebook. samler",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This is the song notebook samler ideer, bilder og fremføringsnotater.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Make this variation. separates",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Make this variation separates them.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Make this variation. skiller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Make this variation skiller dem.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this song. persists",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this song persists both, and Undo/Versions include them.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this song. lagrer begge",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this song lagrer begge, og Undo/Versions tar dem med.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "These are alternative chords., This is a contrasting",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is a lyric seed. or This is arrangement feedback.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Choose These are alternative chords, This is a contrasting bridge, This is a lyric seed or This is arrangement feedback.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Velg These are alternative chords, This is a contrasting bridge, This is a lyric seed or This is arrangement feedback.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Generate this idea. uses",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Generate this idea uses the selected AI connection.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Generate this idea. bruker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Generate this idea bruker valgt AI-tilkobling.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen to this trim. auditions",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Listen to this trim auditions it once through the native engine;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen to this trim. spiller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Listen to this trim spiller utsnittet én gang gjennom den native motoren;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Fit the tempo to this riff. uses",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Fit the tempo to this riff uses the selected bar count and trimmed duration to change the band tempo.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Fit the tempo to this riff. bruker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Fit the tempo to this riff bruker valgt antall takter og utsnittets lengde til å endre bandtempoet.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Record this take. in",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Record this take in Write saves and loads the song,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Record this take. i Write",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Record this take i Write lagrer og laster låten,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this take. finishes",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this take finishes it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this take. avslutter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this take avslutter.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Preview this lift. increases",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Preview this lift increases the intensity of audible, unlocked drums, bass and comp.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Preview this lift. øker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Preview this lift øker intensiteten til hørbare, ulåste trommer, bass og komp.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Preview more of this space. lowers",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Preview more of this space lowers drums and comp intensity, leaving the bass steady.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Preview more of this space. senker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Preview more of this space senker intensiteten til trommer og komp, mens bassen står uendret.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep this variation. creates",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep this variation creates a separate section for that form entry,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep this variation. oppretter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep this variation oppretter en egen seksjon for den forekomsten i formen,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen to this selection. then",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Listen to this selection then Use this performance.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen to this selection. og",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Listen to this selection og deretter Use this performance.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this copy. to",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "use Save this copy to preserve your draft,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save this copy. for",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "bruk Save this copy for å bevare utkastet",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep these edits. lets",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep these edits lets you save",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep these edits. lar",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep these edits lar deg lagre",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Discard these edits and close. abandons",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Discard these edits and close abandons unsaved edits.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Discard these edits and close. forkaster",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Discard these edits and close forkaster ulagrede endringer.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Go to this Library. and",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Go to this Library and Open these Songs",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Go to this Library. og",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Go to this Library og Open these Songs",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open these Songs. open",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open these Songs open those rooms.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open these Songs. åpner",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open these Songs åpner de rommene.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "The charts are loading. appears",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "The charts are loading appears while charts are fetched.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "The charts are loading. vises",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "The charts are loading vises mens skjemaer hentes.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Exit this loop. returns",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Exit this loop returns to the full form.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Exit this loop. går",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Exit this loop går tilbake til hele formen.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "There is no audio. or",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "There is no audio or a headless status means",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "There is no audio. eller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "There is no audio eller headless betyr",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the rehearsal setlist. at",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open This is the rehearsal setlist at the top of Stage.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the rehearsal setlist. øverst",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Åpne This is the rehearsal setlist øverst i Stage.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Edit this entry. loads",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Edit this entry loads an entry into the controls",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Edit this entry. henter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Edit this entry henter en oppføring til kontrollene",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Update this entry. saves",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Update this entry saves its new chart,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Update this entry. lagrer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Update this entry lagrer nytt skjema,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Move this up. and",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Move this up and Remove this entry",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Move this up. og",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Move this up og Remove this entry",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Remove this entry. change",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Remove this entry change the order.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Remove this entry. endrer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Remove this entry endrer rekkefølgen.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Cue the next entry. to",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "or Cue the next entry to prepare the following entry.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Cue the next entry. for",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "eller Cue the next entry for neste oppføring.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Create this new chart. starts",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Create this new chart starts a template.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Create this new chart. starter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Create this new chart starter en mal.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play this chart. loads",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Play this chart loads the edited chart for the band.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play this chart. laster",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Play this chart laster det redigerte skjemaet inn i bandet.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Study this in Stage. cues",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Study this in Stage cues a matching chart without starting it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Study this in Stage. klargjør",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Study this in Stage klargjør et treff uten å starte avspilling.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open the voice setup. is",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open the voice setup is separate from the guitar input.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open the voice setup., choose",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open Jo AI → Open the voice setup, choose a microphone,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open the voice setup., velg",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Åpne Jo AI → Open the voice setup, velg mikrofon,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Hold this to talk. with",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Hold this to talk with the pointer,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Hold this to talk. med",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Hold this to talk med pekeren,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Type a command. disclosure",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "has a Type a command disclosure.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Type a command. for",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "har Type a command for tekstkommandoer.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open the conversation and voice setup. opens",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open the conversation and voice setup opens Jo AI",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open the conversation and voice setup. åpner",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open the conversation and voice setup åpner Jo AI",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open the voice setup. also",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open the voice setup also accepts a global shortcut",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open the voice setup. har",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open the voice setup har også en global hurtigtast",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Enable this shortcut for this session. registers",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Enable this shortcut for this session registers it until disabled",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Enable this shortcut for this session. registrerer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Enable this shortcut for this session registrerer den til du deaktiverer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open the voice setup., enter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open the voice setup, enter your Scribe v2",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open the voice setup. angir",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open the voice setup angir du Scribe v2",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Scribe v2 is priced in USD per hour. and",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Scribe v2 is priced in USD per hour and",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Scribe v2 is priced in USD per hour. og",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Scribe v2 is priced in USD per hour og",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Flash v2.5 is priced in USD per 1,000 characters., then",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Flash v2.5 is priced in USD per 1,000 characters, then Save voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Flash v2.5 is priced in USD per 1,000 characters, then Save this voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Flash v2.5 is priced in USD per 1,000 characters., og",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Flash v2.5 is priced in USD per 1,000 characters, og trykker Save voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Flash v2.5 is priced in USD per 1,000 characters, og trykker Save this voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "and Save voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "and Save this voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "og trykk Save voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "og trykk Save this voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "then Save voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "then Save this voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "og trykker Save voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "og trykker Save this voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save voice setup remembers",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this voice setup remembers",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save voice setup husker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save this voice setup husker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "and Clear search empties",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "and Clear this search empties",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "og Tøm søket tømmer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "og Tøm dette søket tømmer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Clear search resets",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Clear this search resets",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Clear search tømmer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Clear this search tømmer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "offers Clear search",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "offers Clear this search",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "tilbyr Clear search",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "tilbyr Clear this search",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load these provider models. fetches",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load these provider models fetches a catalog",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load these provider models. henter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load these provider models henter en katalog",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Test this model. sends",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Test this model sends a small billable request only when pressed.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Test this model. sender",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Test this model sender en liten fakturerbar forespørsel bare når du trykker.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Detect this installed agent. or",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Detect this installed agent or provide its full executable path.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Detect this installed agent. eller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Detect this installed agent eller oppgi hele filbanen.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Test this agent. or",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Test this agent or send a request from Assistant.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Test this agent. eller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Test this agent eller send fra Assistant.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Draft this in Jo. places",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Draft this in Jo places one experiment in the conversation input for your review",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Draft this in Jo. legger",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Draft this in Jo legger ett eksperiment i samtalefeltet for gjennomgang",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep this in the song notes. appends",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep this in the song notes appends one suggestion with version and Undo protection.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep this in the song notes. legger",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep this in the song notes legger til ett forslag med versjons- og angrebeskyttelse.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Use this in Film. sets",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Use this in Film sets the selected asset as the current film soundtrack.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Use this in Film. velger",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Use this in Film velger filen som lydspor i gjeldende film.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Practice the speed and key. in",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Practice the speed and key in Songs or Stage.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Practice the speed and key. i",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Practice the speed and key i Songs eller Stage.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this original mix. bypasses",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this original mix bypasses saved stems and processing without deleting their settings.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this original mix. laster",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this original mix laster originalmiksen uten lagrede stems eller behandling, men beholder innstillingene.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the local file. in",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This is the local file in Songs",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the local file. i",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This is the local file i Songs",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Preview this new form. shows",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Preview this new form shows the result before applying it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Preview this new form. viser",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Preview this new form viser resultatet før det brukes.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save these AI settings. persists",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save these AI settings persists the chosen model/limits.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Save these AI settings. lagrer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Save these AI settings lagrer valgt modell/grenser.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "The keychain is unavailable. means",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "The keychain is unavailable means the saved key could not be checked, not that it is missing.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "The keychain is unavailable. betyr",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "The keychain is unavailable betyr at den lagrede nøkkelen ikke kunne kontrolleres, ikke at den mangler.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Check this key status. under",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "then use Check this key status under API keys.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "og bruk Check this key status under API keys.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Test this key. stays",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Test this key stays not configured and does not call a cheapest provider endpoint.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Test this key. er ikke konfigurert og kaller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Test this key er ikke konfigurert og kaller ikke et billigste endepunkt.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Analyze tempo and chords. stays",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "local Analyze tempo and chords stays available.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Analyze tempo and chords. er fortsatt",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "lokal Analyze tempo and chords er fortsatt tilgjengelig.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Analyze tempo and chords. or",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "choose Analyze tempo and chords or Analyze again.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Analyze tempo and chords. eller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "trykker Analyze tempo and chords eller Analyze again.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Apply these Music.ai estimates. writes",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Apply these Music.ai estimates writes unverified fixture results only when JAM_MUSICAI_FIXTURE=1;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Apply these Music.ai estimates. lagrer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Apply these Music.ai estimates lagrer bare uverifiserte fiksturresultater når JAM_MUSICAI_FIXTURE=1;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Analyze again. replaces",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Analyze again replaces only its analysis metadata, retaining unknown fields.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Analyze again. erstatter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Analyze again erstatter bare analysefeltene og bevarer ukjente metadata.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Analyze tempo and chords., then",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Analyze tempo and chords, then open Confirm these bars and sections",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Analyze tempo and chords., og",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Kjør Analyze tempo and chords, og åpne Confirm these bars and sections",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Confirm these bars and sections. in",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Confirm these bars and sections in Songs.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Confirm these bars and sections. i",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Confirm these bars and sections i Songs.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This section starts at this bar. is",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This section starts at this bar is included",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This section starts at this bar. tas",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This section starts at this bar tas med",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This section ends before this bar. is",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This section ends before this bar is excluded",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This section ends before this bar. ikke",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This section ends before this bar ikke tas med",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Review the numbers. writes",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Review the numbers writes a recorded coaching note from the analysis figures only;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Review the numbers. lagrer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Review the numbers lagrer et innspilt øvingsnotat fra analysetallene;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen to the guitar. auditions",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Listen to the guitar auditions the selected input without the band.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen to the guitar. spiller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Listen to the guitar spiller valgt inngang uten bandet.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Evidence and exercise. and",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "open Evidence and exercise and use Analyze again.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Evidence and exercise. og",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "åpne Evidence and exercise og bruk Analyze again.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Evidence and exercise. opens",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Evidence and exercise opens the local summary and practice suggestion.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Evidence and exercise. viser",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Evidence and exercise viser det lokale sammendraget og øvelsesforslaget.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open analysis help. beside",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Use Open analysis help beside the take to open this explanation.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open analysis help. ved",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Bruk Open analysis help ved opptaket for å åpne denne forklaringen.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Sample this idle CPU. reads",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Sample this idle CPU reads this process;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Sample this idle CPU. leser",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Sample this idle CPU leser denne prosessen;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Export these logs. writes",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Export these logs writes to ~/JosefinesJamstudio/logs.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Export these logs. skriver",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Export these logs skriver til ~/JosefinesJamstudio/logs.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Match the OS., Always",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Always reduce motion. or",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Always reduce motion. eller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Reduced motion is Match the OS, Always reduce motion or Never reduce motion.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Reduced motion er Match the OS, Always reduce motion eller Never reduce motion.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Match the OS. follows",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Match the OS follows prefers-reduced-motion.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Match the OS. følger",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Match the OS følger prefers-reduced-motion.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Always reduce motion. stops",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Always reduce motion stops CSS motion except meters and the playhead",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Always reduce motion. stopper",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Always reduce motion stopper CSS-bevegelse unntatt målere og spillehodet",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Never reduce motion. keeps",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Never reduce motion keeps CSS motion even when the OS asks to reduce it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Never reduce motion. beholder",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Never reduce motion beholder CSS-bevegelse selv om operativsystemet ber om mindre bevegelse.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Remove this profile. deletes",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Remove this profile deletes only the profile, not the active setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Remove this profile. sletter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Remove this profile sletter bare profilen, ikke aktivt oppsett.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Talk or send this to Jo. and",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "learn Talk or send this to Jo and enable pedal actions.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Talk or send this to Jo. i",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Lær Talk or send this to Jo i Write → Hands-free controls, og aktiver pedalhandlinger.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this minus-guitar mix.,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this minus-guitar mix, Sessions Progress",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this minus-guitar mix. i",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Load this minus-guitar mix i Songs",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Check this key status. ser",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Check this key status ser bare i operativsystemets nøkkelring.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Check this key status. This looks only in the OS keychain.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Check this key status looks only in the OS keychain.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Test this key. er ikke konfigurert;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Test this key er ikke konfigurert;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Test this key. This stays not configured;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Test this key stays not configured;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play the reference., Pause",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Pause the reference. and",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Pause the reference. og",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Stop the reference.,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "use Play the reference, Pause the reference and Stop the reference,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "bruker du Play the reference, Pause the reference og Stop the reference,",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Return to the band. stops",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Return to the band stops the reference and restores the chart band;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Return to the band. stopper",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Return to the band stopper referansen",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "then Loop this range.;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "then Loop this range; Loop off disables it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "trykk Loop this range.;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "trykk Loop this range; Loop off slår av gjentakelsen.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "use Restart this audio.;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "use Restart this audio; the refusal clears after a matching restart.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "bruk Restart this audio.;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "bruk Restart this audio; sperren fjernes etter en omstart med samsvarende frekvenser.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Loop off. disables",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Loop off disables it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Loop off. slår",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Loop off slår av gjentakelsen.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the reference volume. uses",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This is the reference volume uses the shared band volume.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the reference volume. bruker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This is the reference volume bruker samme volum som bandet.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Build up the speed. in",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Build up the speed in Songs or Stage increases",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Build up the speed. i Songs",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Build up the speed i Songs eller Stage øker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Start the ramp. arms",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Start the ramp arms the settings;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Start the ramp. klargjør",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Start the ramp klargjør innstillingene",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Toggle this reference practice ramp. pedal",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Toggle this reference practice ramp pedal use",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Toggle this reference practice ramp. pedalen",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Toggle this reference practice ramp pedalen bruker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Hold Hold this to talk",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Play"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The play"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    'command("Pause"',
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    'command("The pause"',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    'aria-label="Section energy"',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "`Section energy is ${amount}%.`",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "`Repeats for form entry ${i + 1}`",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "`Repeats for form entry ${i + 1}.`",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "`Move form entry ${i + 1} earlier`",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "`Move form entry ${i + 1} earlier.`",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "`Move form entry ${i + 1} later`",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "`Move form entry ${i + 1} later.`",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    'aria-label="Song arrangement"',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    'aria-label="This is the song arrangement."',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    'aria-label="Chord grid"',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    'aria-label="This is the chord grid."',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    'aria-label="Harmony explorer"',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    'aria-label="This is the harmony explorer."',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    'aria-label="Section lyrics"',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    'aria-label="These are the section lyrics."',
  );
  expect(readFileSync("src/components/ChordShapes.tsx", "utf8")).not.toContain(
    "`Shape ${i + 1}:",
  );
  expect(readFileSync("src/components/ChordShapes.tsx", "utf8")).toContain(
    "`Shape ${i + 1} is ${shape.shape}.`",
  );
  expect(readFileSync("src/components/ChordShapes.tsx", "utf8")).not.toContain(
    "Shapes for {now}</legend>",
  );
  expect(readFileSync("src/components/ChordShapes.tsx", "utf8")).toContain(
    "These are shapes for {now}.</legend>",
  );
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("`Edit entry ${i + 1}`");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("`Edit this entry ${i + 1}.`");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("`Move entry ${i + 1} up`");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("`Move this entry ${i + 1} up.`");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("`Remove entry ${i + 1}`");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("`Remove this entry ${i + 1}.`");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).not.toContain("`Remove profile ${p.name}`");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).toContain("`Remove this profile ${p.name}.`");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).not.toContain("Recall {p.name}");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).toContain("Recall this {p.name}.");
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    "aria-label={`${sec} scene`}",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    "aria-label={`This is the ${sec} scene.`}",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    'aria-label="Program number"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    'aria-label="This is the program number."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    "Send PC {programInput}",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    "Send this PC {programInput}.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Theme, images, rhyme ideas",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Start with the theme, images, rhyme ideas, or the line to return to.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n            File path\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Enter the audio file path.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    'aria-label="Audio file path"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    'aria-label="Enter the audio file path."',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    'placeholder="Full path to WAV, MP3, FLAC, M4A, AIFF or OGG"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    'placeholder="Paste the full path to a WAV, MP3, FLAC, M4A, AIFF or OGG file."',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    'placeholder="Full path to stems.zip"',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    'placeholder="Paste the full path to stems.zip."',
  );
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).not.toContain('placeholder="Home studio"');
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).toContain('placeholder="A home studio."');
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "<h2>Start with your own idea</h2>",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "<h2>Start with your own idea.</h2>",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '? "Unsaved changes" : "Saved"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '? "Unsaved changes." : "Saved."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '? "These are unsaved changes." : "Saved."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    '? "These are unsaved changes." : "This is saved."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "<strong>Keep what you just played</strong>",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "<strong>Keep what you just played.</strong>",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '<option value="">Choose a saved song</option>',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    '<option value="">Choose a saved song.</option>',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "\n          Add an existing section\n",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Add an existing section.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    '<option value="">Choose a section</option>',
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    '<option value="">Choose a section.</option>',
  );
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).not.toContain(
    '<option value="">Choose a section</option>',
  );
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).toContain(
    '<option value="">Choose a section.</option>',
  );
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).not.toContain(
    '<option value="">Choose a recording</option>',
  );
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).toContain(
    '<option value="">Choose a recording.</option>',
  );
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain('<option value="">Choose a chart</option>');
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain('<option value="">Choose a chart.</option>');
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain('<option value="">Chart\'s default groove</option>');
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain('<option value="">Use the chart\'s default groove.</option>');
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "<h2>Edit shot {project.shots.indexOf(shot) + 1}</h2>",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "<h2>Edit shot {project.shots.indexOf(shot) + 1}.</h2>",
  );
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).not.toContain('<option value="">Use a named reference</option>');
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).toContain('<option value="">Use a named reference.</option>');
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    "\n              MIDI out\n",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    "Choose the MIDI output.",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    '<option value="">Not connected</option>',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    '<option value="">Not connected.</option>',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    '<option value="">no change</option>',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    '<option value="">Leave this scene unchanged.</option>',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    'title="Hardware profile"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    'title="This is the hardware profile."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    'title="Program Change"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    'title="Send a Program Change."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    'title="Section automation"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    'title="This is section automation."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    'title="MIDI monitor"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    'title="This is the MIDI monitor."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    'title={`Scenes (${profile?.name ?? "..."})`}',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    'title={`These are the ${profile?.name ?? "..."} scenes.`}',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    ': "Program Change"}',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    ': "Uses Program Change."}',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    "title={`Knobs (${profile.name})`}",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    "title={`These are the ${profile.name} knobs.`}",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    'label="Follow sections"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    'label="Follow the chart sections."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    '"No MIDI port open"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    '"No MIDI port is open."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    "\n                Rig control over MIDI\n",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    "Control the rig over MIDI.",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    '? "sent to the port" : "logged only"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    '? "Sent to the port." : "Logged only."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    '? "Sent to the port." : "This is logged only."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    "`Open on ${rigState?.port}`",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    "`Open on ${rigState?.port}.`",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    "on MIDI channel ${profile.midiChannel + 1}`",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    "on MIDI channel ${profile.midiChannel + 1}.`",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'label="Trim start (s)"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Trim start is in seconds.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'label="Trim end (s)"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Trim end is in seconds.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'label="First bar"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "This layer starts at this bar.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'label="Repeats"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "How many times this layer repeats.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'label="Volume (%)"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Layer volume is a percent.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                Song notes\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Write the song notes.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n              Song name\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Name this song.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n            Open song\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Open a saved song.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'label="Tempo (BPM)"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Tempo is in BPM.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                Key\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Choose the key.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                Mode\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Choose the mode.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                    History\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Choose the capture length.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "<h2>Takes and ideas</h2>",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "These are the takes and ideas.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                    Try a groove\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Choose a groove to try.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'aria-label="Help with loaded arrangement"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    'aria-label="Help with this loaded arrangement."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'aria-label="Writing views"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    'aria-label="These are the writing views."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'aria-label="Try a groove for unlocked parts"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    'aria-label="Choose a groove to try."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'aria-label="Retrospective capture"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    'aria-label="This is the retrospective capture."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'aria-label="Capture length"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    'aria-label="Choose the capture length."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '"Arm capture"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Arm this capture.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '"Disarm capture"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Disarm this capture.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Keep that (H)",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "H works.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Keep that take. H is the shortcut.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '"Save take"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    '"Save this take."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    ': "Record"}',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    ': "Record this take."}',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Starts at bar 1, playing guitar layers while recording a new take",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "This starts at bar 1 and records a new take while guitar layers play.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Load the current song edits and play from the beginning",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "This loads the current song edits and plays from the beginning.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Help with {WRITING_HELP[w.view].label}",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Help with ${WRITING_HELP[w.view].label}",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Open help for {WRITING_HELP[w.view].label}.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    ">Song settings</legend>",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    ">These are the song settings.</legend>",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '? "This song"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    '? "This is from this song."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '? "Captured idea"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    '? "This is a captured idea."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    ': "Take"}',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    ': "This is a take."}',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'label: "Preview"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    'label: "This is a preview."',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    'label: "Preview"',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    'label: "This is a preview."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'title="Open in the editor"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'title="Open this chart in the editor."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'title="Load into the band (adopts its tempo and style)"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'title="Load this into the band. This adopts its tempo and style."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'title="Preview of the form"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'title="This is a preview of this form."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'title="Down a semitone"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'title="Transpose this down a semitone."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'title="Up a semitone"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'title="Transpose this up a semitone."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'label="Not playable yet"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'label="This chart is not playable yet."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    ": `${parsed.problems.length} note",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    ": `This chart has ${parsed.problems.length} note",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "\n                    unsaved\n",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "This is unsaved.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'title="Ctrl/Cmd+Enter"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'title="Play this with Ctrl/Cmd+Enter."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    'title="Ctrl/Cmd+S"',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    'title="Save this with Ctrl/Cmd+S."',
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "title={`Charts (${visibleCharts.length} of ${charts.length})`}",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "title={`These are ${visibleCharts.length} of ${charts.length} charts.`}",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "title={`Styles (${grooves.length})`}",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "title={`These are ${grooves.length} styles.`}",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "or Record to start an overdub",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "or Record this take. to start an overdub",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "or Record this take to start an overdub",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Record this take. to",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Record this take. for å",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Record this take for å spille inn et nytt lag fra takt 1.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    '"Save partial take"',
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Finish with Save take.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Finish with Save this take.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep that, H, or a learned pedal",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep that take. H works. or a learned pedal",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep that take. H is the shortcut. or",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep that take. H is the shortcut or a learned pedal saves the recent buffer as a take.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep that take. H is the shortcut. eller",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep that take. H is the shortcut eller en innlært pedal lagrer den siste bufferen som et opptak.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Loop these bars {start}–{end}. to hear",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Loop these bars {start}–{end} to hear the lead-in and arrival.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Loop these bars {start}–{end}. for å",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Loop these bars {start}–{end} for å høre opptakten og ankomsten.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "then Arm capture before playing",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "then Arm this capture. before playing",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "then Arm this capture before playing",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    'label="Swing (%)"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Swing is a percent.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                          Groove\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Choose the groove.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Intensity {Math.round(p.intensity * 100)}%",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Intensity is {Math.round(p.intensity * 100)}%.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Volume {Math.round(p.gain * 100)}%",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Volume is {Math.round(p.gain * 100)}%.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                          Mute\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Mute this part.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Lock groove",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Lock this groove.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                    Mute\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Mute this layer.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Let this song change my rig tones\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Let this song change my rig tones.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    ">Change unlocked parts<",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Change unlocked parts.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    ">Keep current tone<",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Keep the current tone.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    " · MIDI output is selected in Rig.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    ". MIDI output is selected in Rig.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "\n          Explore harmony\n",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Explore the harmony.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    ">Estimated harmony<",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    "This is the estimated harmony.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    'aria-label="Saved song analysis"',
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    'aria-label="This is the estimated harmony."',
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    'aria-label="Estimated chord passages"',
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    'aria-label="These are the estimated chord passages."',
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    '"Tempo not found"',
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    "Tempo was not found.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    '"Key not found"',
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    "The key was not found.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    " · {analysis.key ??",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    "This is a local estimate with low confidence.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    '"Unknown chord"',
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    "This chord is unknown.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'subValue="BPM · 20–300"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "BPM. The range is 20–300.",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    "Reference · {reference.position.toFixed(1)}",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    "The reference is at {reference.position.toFixed(1)} of",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    'title="Open reference player"',
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    "Open the reference player.",
  );
  expect(
    readFileSync("src/components/EngineStatusPill.tsx", "utf8"),
  ).not.toContain('?? "Audio"} · ${status.sample_rate / 1000} kHz');
  expect(
    readFileSync("src/components/EngineStatusPill.tsx", "utf8"),
  ).not.toContain('?? "Audio"');
  expect(readFileSync("src/components/EngineStatusPill.tsx", "utf8")).toContain(
    '"This audio is unnamed."',
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    "Loop {transport.loop_start_bar}-",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    "Loop bars {transport.loop_start_bar} to",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    'title="Toggle Loop (L)"',
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    "Toggle the loop (L).",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    '"Count-in off"',
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    "Count-in is off.",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    "The count-in is off.",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    "`Count-in ${transport.count_in_bars} bar",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    "Count-in is ${transport.count_in_bars} bar",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain(">Bars & sections<");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "These are the bars and sections.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "Chart & band settings",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "These are the chart and band settings.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "} · {band.style_name}",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    '?? "Choose a chart"}. {band.style_name}.',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    '?? "Choose this chart"}. {band.style_name}.',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    ">Rehearse a section<",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Rehearse this section.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "Bars {p.start}–{p.end - 1}",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Bars {p.start} to {p.end - 1}.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n                Source\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Choose the source.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n                Chart\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Choose the chart.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'aria-label="Chart"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'aria-label="Choose the chart."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'aria-label="Transpose down"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'aria-label="Transpose this down."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'aria-label="Transpose up"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'aria-label="Transpose this up."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'title="Transpose down ([)"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'title="Transpose this down a semitone with [."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'title="Transpose up (])"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'title="Transpose this up a semitone with ]."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'title="Tap on the beat (T)"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'title="Tap on the beat with T."',
  );
  expect(readFileSync("src/lib/stageActions.ts", "utf8")).not.toContain(
    'shortcut: "Jump to bar"',
  );
  expect(readFileSync("src/lib/stageActions.ts", "utf8")).toContain(
    'shortcut: "Jump to this bar."',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    '"Jump to bar 1–9 (start of the form)"',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    '"Jump to this bar. The range is 1–9 from the start of the form."',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    'description: "Toggle loop"',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    'description: "Toggle this loop."',
  );
  expect(readFileSync("src/lib/stageActions.ts", "utf8")).not.toContain(
    'shortcut: "Toggle loop"',
  );
  expect(readFileSync("src/lib/stageActions.ts", "utf8")).toContain(
    'shortcut: "Toggle this loop."',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    'description: "Play / pause"',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    'description: "Play or pause this."',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    'description: "Start / stop recording a take"',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    'description: "Start or stop recording a take."',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    'description: "Cue a fill / a crash at the next bar"',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    'description: "Cue a fill or a crash at the next bar."',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    'description: "Cue a stop / the ending"',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    'description: "Cue a stop or the ending."',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    'description: "Mute drums / bass / comp"',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    'description: "Mute drums, bass or comp."',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    'description: "Intensity +5% / −5%"',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    'description: "Intensity rises or falls by 5%."',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    'description: "Keep the recent guitar idea (capture must be armed)"',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    'description: "Keep this recent guitar idea. Capture must be armed."',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    '"Toggle reference practice ramp using the current session settings"',
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    "Toggle this reference practice ramp using the current session settings.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'aria-label="Band style"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'aria-label="Choose the style."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'aria-label="Band intensity"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'aria-label="Choose the intensity."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'aria-label="Band volume"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'aria-label="Choose the band volume."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'aria-label="Click volume"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'aria-label="Choose the click volume."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    'aria-label="Film readiness"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    'aria-label="This is the film readiness."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    'aria-label="Music prompt starters"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    'aria-label="These are the music prompt starters."',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    'aria-label="Stem mixer"',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    'aria-label="This is the stem mixer."',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Track levels and mutes</legend>",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "These are the track levels and mutes.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Apply & save mix",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Apply and save this mix.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    '"Minus guitar"',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Minus this guitar.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    '"Restore guitar"',
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Restore this guitar.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Apply & save mix",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Apply and save this mix.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "then Apply and save this mix or Minus this guitar.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n                Style\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Choose the style.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n                Intensity\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Choose the intensity.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n                Band\n              </span>",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Choose the band volume.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n                Click\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Choose the click volume.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Tuner"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Hear the tuner.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Tone"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Hear the reference tone.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Start"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Choose the start tempo.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Target"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Choose the target tempo.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Step"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Choose the tempo step.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Every"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Change every this many bars.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    '? "On" : "Off"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "The trainer is on.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "The trainer is off.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n            Soloing Helper\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "This is the soloing helper.",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).not.toContain(
    'title="Soloing Helper"',
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).toContain(
    'title="This is the soloing helper."',
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).not.toContain(
    "\n              Chord tones\n",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).toContain(
    "These are the chord tones.",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).not.toContain(
    "Scales that fit",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).toContain(
    "These scales fit.",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).not.toContain(
    "\n                Handle with care\n",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).toContain(
    "Handle these with care.",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).not.toContain(
    "Aim for {nextChord} next\n",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).toContain(
    "Aim for {nextChord} next.",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).not.toContain(
    "\n                root\n",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).toContain(
    "This is the root.",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).not.toContain(
    "\n                guide tone\n",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).toContain(
    "This is a guide tone.",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).not.toContain(
    "\n                chord tone\n",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).toContain(
    "This is a chord tone.",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).not.toContain(
    "\n                scale note\n",
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).toContain(
    "This is a scale note.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'title="Tempo Trainer"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'title="This is the tempo trainer."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Count-In (Get Ready)"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "This is the count-in. Get ready.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    '"Active Chord"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "This is the active chord.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "Band stopped (S to resume)",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "The band is stopped. Press S to resume.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Guitar Tuner (DI Input)"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "This is the guitar tuner. The input is the DI.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Tempo"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'label="This is the tempo."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Bar"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'label="This is the bar."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "${transport.bar} : ${transport.beat}",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "${transport.bar} · ${transport.beat}",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    "{transport.bar} : {transport.beat}",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    "{transport.bar} · {transport.beat}",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'title="Signal">',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'title="This is the signal."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'title="Signal Telemetry"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'title="This is the signal telemetry."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Input (Guitar DI)"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "This is the guitar input. The source is the DI.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'label="Master Output"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "This is the master output.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    '"Lyria (not live)"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Lyria is not live.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    '"Jam Band"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "This is the jam band.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    '? "Song"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "This is the song.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n              Parts\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "These are the parts.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    'aria-label="Drums"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    'band.mute_drums ? "Drums are muted." : "Drums are playing."',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    ': "Drums"}',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Drums are playing.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    ': "Bass"}',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Bass is playing.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    ': "Comp"}',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Comp is playing.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "(unsaved)",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "{currentChart.name} is unsaved.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n              Cues\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "These are the cues.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    '? "Hide" : "Show"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Hide the helper.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Show the helper.",
  );
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).not.toContain("One section per line ·");
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).toContain("Write one section per line as Name | bars | energy 0–100.");
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).not.toContain("Reference audio (optional)");
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).toContain("Reference audio is optional.");
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).not.toContain("Reference / inspiration");
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).toContain("Reference or inspiration.");
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).not.toContain("Preview new form");
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).toContain("Preview this new form.");
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).not.toContain("Apply blueprint to original");
  expect(
    readFileSync("src/components/tools/BlueprintTool.tsx", "utf8"),
  ).toContain("Apply this blueprint to the original.");
  expect(
    readFileSync("src/components/tools/DiscoveryTool.tsx", "utf8"),
  ).not.toContain('label="Find movements related to">');
  expect(
    readFileSync("src/components/tools/DiscoveryTool.tsx", "utf8"),
  ).toContain("Find movements related to this source.");
  expect(
    readFileSync("src/components/tools/BeatCutsTool.tsx", "utf8"),
  ).not.toContain("Soundtrack BPM");
  expect(
    readFileSync("src/components/tools/BeatCutsTool.tsx", "utf8"),
  ).toContain("Soundtrack tempo is in BPM.");
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "{t.timestamp} · {time(t.durationSecs)}",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "{t.timestamp}. {time(t.durationSecs)}.",
  );
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).not.toContain("Excerpt start (seconds)");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain("Excerpt start is in seconds.");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).not.toContain('label="First take"');
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain("Choose the first take.");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain("Choose the second take.");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain("Excerpt length is in seconds.");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).not.toContain(" · {id}");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain(". {id}.");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).not.toContain("<h3>Take {");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain('This is take {i === 0 ? "A" : "B"}.');
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).not.toContain("Recording unavailable");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain("The recording is unavailable");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).not.toContain("Reveal identities");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain("Reveal these identities.");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).not.toContain("New comparison");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain("Start this new comparison.");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).not.toContain("Start blind comparison");
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain("Start this blind comparison.");
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "and Start blind comparison.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "and Start this blind comparison.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Reveal identities shows",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Reveal these identities. shows",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Reveal these identities shows which recording was which.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Reveal these identities. viser",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Reveal these identities viser hvilket opptak som var hvilket.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Start this new comparison. resets",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Start this new comparison resets the round.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Start this new comparison. starter",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Start this new comparison starter en ny runde.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Check this virtual MIDI. sends",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Check this virtual MIDI sends two program changes",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Check this virtual MIDI. sender",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Check this virtual MIDI sender to programendringer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Capture this current tone. stores",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Capture this current tone stores the current profile ID, scene and controller values in that song.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Capture this current tone. profil-ID",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Capture this current tone profil-ID, scene og kontrollerverdier i låten.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Recall this snapshot to the rig. validates",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Recall this snapshot to the rig validates the saved values",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Recall this snapshot to the rig. kontrollerer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Recall this snapshot to the rig kontrollerer verdiene",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the song map. viser",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "This is the song map viser avspillingsrekkefølgen",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "This is the song map. Write words",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "in This is the song map Write words for this section stores",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "i This is the song map Write words for this section lagrer",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Load this original mix. hvis",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Velg Load this original mix hvis lagrede innstillinger er ugyldige.",
  );
  expect(
    readFileSync("src/components/ProviderEstimates.tsx", "utf8"),
  ).not.toContain(">Music.ai estimates<");
  expect(
    readFileSync("src/components/ProviderEstimates.tsx", "utf8"),
  ).toContain("These are the Music.ai estimates.");
  expect(
    readFileSync("src/components/ProviderEstimates.tsx", "utf8"),
  ).not.toContain('aria-label="Music.ai estimates"');
  expect(
    readFileSync("src/components/ProviderEstimates.tsx", "utf8"),
  ).toContain('aria-label="These are the Music.ai estimates."');
  expect(
    readFileSync("src/components/ProviderEstimates.tsx", "utf8"),
  ).not.toContain("\n        Apply Music.ai estimates\n");
  expect(
    readFileSync("src/components/ProviderEstimates.tsx", "utf8"),
  ).toContain("Apply these Music.ai estimates.");
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Apply Music.ai estimates writes",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Apply these Music.ai estimates. writes",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Apply these Music.ai estimates writes unverified fixture results only when JAM_MUSICAI_FIXTURE=1;",
  );
  expect(
    readFileSync("src/components/ProviderEstimates.tsx", "utf8"),
  ).not.toContain(" · ${saved.bpm} BPM");
  expect(
    readFileSync("src/components/ProviderEstimates.tsx", "utf8"),
  ).toContain(" ${saved.bpm} BPM.");
  expect(
    readFileSync("src/components/tools/BeatCutsTool.tsx", "utf8"),
  ).not.toContain("Cut grid (beats)");
  expect(
    readFileSync("src/components/tools/BeatCutsTool.tsx", "utf8"),
  ).toContain("Cut grid is in beats.");
  expect(
    readFileSync("src/components/tools/BeatCutsTool.tsx", "utf8"),
  ).toContain("First beat is in seconds.");
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).not.toContain(
    " · {s.bars.length} bars",
  );
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).toContain(
    "{s.name}. {s.bars.length} bars.",
  );
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).not.toContain(
    " · {t.durationSecs.toFixed(1)}s · ",
  );
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).toContain(
    "{t.timestamp}. {t.durationSecs.toFixed(1)} s. {t.id.slice(-6)}.",
  );
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).not.toContain(
    'label="Source section">',
  );
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).toContain(
    "Choose a source section.",
  );
  const help = readFileSync("src/components/ShortcutsHelp.tsx", "utf8");
  expect(help).not.toContain('{nb ? "Søk i håndboken" : "Search the manual"}');
  expect(help).toContain('{nb ? "Søk i håndboken." : "Search the manual."}');
  expect(help).not.toContain(
    '<h3>{nb ? "Hurtigtaster" : "Keyboard shortcuts"}</h3>',
  );
  expect(help).toContain('"Dette er hurtigtastene."');
  expect(help).toContain('"These are the keyboard shortcuts."');
  expect(help).not.toContain('{nb ? "Ingen treff" : "No matches"}');
  expect(help).not.toContain('{nb ? "Ingen treff." : "No matches."}');
  expect(help).toContain(
    '{nb ? "Dette har ingen treff." : "This has no matches."}',
  );
  expect(help).not.toContain('{nb ? "Språk" : "Language"}');
  expect(help).toContain('{nb ? "Velg språk." : "Choose the language."}');
  expect(help).not.toContain('"Close help"');
  expect(help).toContain('"Close this help."');
  expect(help).not.toContain('"Lukk hjelp"');
  expect(help).toContain('"Lukk denne hjelpen."');
  expect(help).not.toContain(
    'htmlFor="manual-chapter">{nb ? "Kapittel" : "Chapter"}',
  );
  expect(help).toContain('htmlFor="manual-chapter"');
  expect(help).toContain('{nb ? "Velg et kapittel." : "Choose a chapter."}');
  expect(help).toContain("No matching chapters. Try a different search.");
  expect(help).not.toContain('"Clear search"');
  expect(help).toContain('"Clear this search."');
  expect(help).not.toContain('"Tøm søket"');
  expect(help).toContain('"Tøm dette søket."');
  expect(help).not.toContain('Chapter"}:');
  expect(help).toContain('Chapter"} ${chapter.title[language]}.');
  expect(help).not.toContain('aria-label="Topics in this chapter"');
  expect(help).not.toContain(
    'nb ? "Emner i kapitlet" : "Topics in this chapter"',
  );
  expect(help).toContain('"Dette er emnene i kapitlet."');
  expect(help).toContain('"These are the topics in this chapter."');
  expect(help).not.toContain("Help language:");
  expect(help).toContain("Could not save the help language.");
  expect(rig).not.toContain("{p.number}: {p.name}");
  expect(rig).toContain("Program {p.number} is {p.name}.");
  const beatCuts = readFileSync(
    "src/components/tools/BeatCutsTool.tsx",
    "utf8",
  );
  expect(beatCuts).not.toContain("{s.title}:");
  expect(beatCuts).toContain("goes from");
  expect(beatCuts).not.toContain("Preview aligned cuts");
  expect(beatCuts).toContain("Preview these aligned cuts.");
  expect(beatCuts).not.toContain("Apply aligned cuts");
  expect(beatCuts).toContain("Apply these aligned cuts.");
  const settings = readFileSync("src/screens/Settings.tsx", "utf8");
  expect(settings).not.toContain('title="First-run checklist"');
  expect(settings).toContain('title="This is the first-run checklist."');
  expect(settings).not.toContain("Waiting for the engine…");
  expect(settings).toContain("Waiting for the engine.");
  expect(settings).not.toContain('title="Sample packs"');
  expect(settings).toContain('title="These are the sample packs."');
  expect(settings).not.toContain('title="Audio Engine"');
  expect(settings).toContain('title="This is the audio engine."');
  expect(settings).not.toContain('title="Diagnostics"');
  expect(settings).toContain('title="These are the diagnostics."');
  expect(settings).not.toContain('title="Audio Devices"');
  expect(settings).toContain('title="These are the audio devices."');
  expect(settings).not.toContain('title="Guitar alignment"');
  expect(settings).toContain('title="This is guitar alignment."');
  expect(settings).not.toContain('title="Network usage log"');
  expect(settings).toContain('title="This is the network usage log."');
  expect(settings).not.toContain("Diagnostics:");
  expect(settings).toContain("These are the diagnostics. Reduced motion");
  expect(settings).not.toContain(
    "Test key is not configured. Check key status only looks in the",
  );
  expect(settings).not.toContain(
    "Test this key. is not configured. Check this key status. only",
  );
  expect(settings).not.toContain("only looks in the keychain.");
  expect(settings).not.toContain("Test this key. is not configured.");
  expect(settings).not.toContain("is not configured.");
  expect(settings).not.toContain("Test this key. This stays not configured.");
  expect(settings).toContain(
    "Test this key stays not configured. Check this key status looks",
  );
  expect(settings).toContain("only in the keychain.");
  expect(settings).not.toContain(
    "Check this key status. This looks only in the keychain.",
  );
  expect(settings).not.toContain("Check guitar residual,");
  expect(settings).not.toContain("Check this guitar residual.,");
  expect(settings).toContain("then Load this minus-guitar mix.");
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "\n        Check guitar residual\n",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Check this guitar residual.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "then Check guitar residual.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "Check this guitar residual. Load this mix",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).toContain(
    "then Check this guitar residual, then Load this mix only after that check passes.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "then Check guitar residual.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "Check this guitar residual. Load this mix",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "then Check this guitar residual, then Load this mix only after that check passes.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "after Check guitar residual passes",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "after Check this guitar residual. passes",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "after Check this guitar residual",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n                  Load minus-guitar mix\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Load this minus-guitar mix.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Load minus-guitar mix\n        plays",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Load this minus-guitar mix. plays",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "minus-guitar mix plays minus-guitar.wav after Check this guitar residual",
  );
  expect(settings).not.toContain("then Load minus-guitar mix.");
  expect(settings).toContain("then Load this minus-guitar mix.");
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Use Load minus-guitar mix.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Use Load this minus-guitar mix.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Load minus-guitar mix stays",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "Load this minus-guitar mix. stays",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Load this minus-guitar mix stays not configured until a pass.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n                    Load original mix\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Load this original mix.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "Listen in media player",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Listen in the media player to hear it.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n                  Load in Jamstudio\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Load this in Jamstudio.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "Load original mix, then apply",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "Load this original mix. then apply",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "Load this original mix then apply valid speed and transpose settings.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n                  Make a practice copy\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Make this practice copy.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n            Choose audio file\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Choose an audio file.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n                    Create practice copy\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Create this practice copy.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n                  Keep song files together\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Keep these song files together.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n          Refresh library\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Refresh this library.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    " /> Import audio\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Import this audio.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    "\n          Cancel current operation\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Cancel this current operation.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    " /> Use in Film\n",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    "Use this in Film.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    ">Choose AI & model<",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "Choose this AI and model.",
  );
  expect(readFileSync("src/App.tsx", "utf8")).not.toContain(">Keep editing<");
  expect(readFileSync("src/App.tsx", "utf8")).toContain("Keep these edits.");
  expect(readFileSync("src/App.tsx", "utf8")).not.toContain(
    "Keep editing to save",
  );
  expect(readFileSync("src/App.tsx", "utf8")).not.toContain(
    "Keep these edits. to save them before closing.",
  );
  expect(readFileSync("src/App.tsx", "utf8")).not.toContain(
    "to save them before closing.",
  );
  expect(readFileSync("src/App.tsx", "utf8")).toContain("Keep these edits");
  expect(readFileSync("src/App.tsx", "utf8")).not.toContain(
    "\n              Discard and close\n",
  );
  expect(readFileSync("src/App.tsx", "utf8")).toContain(
    "Discard these edits and close.",
  );
  expect(readFileSync("src/App.tsx", "utf8")).not.toContain("Help & guides");
  expect(readFileSync("src/App.tsx", "utf8")).toContain(
    "Open help and guides.",
  );
  expect(readFileSync("src/App.tsx", "utf8")).not.toContain(
    'aria-label="Studio rooms"',
  );
  expect(readFileSync("src/App.tsx", "utf8")).toContain(
    'aria-label="These are the studio rooms."',
  );
  expect(
    readFileSync("src/components/ShortcutsHelp.tsx", "utf8"),
  ).not.toContain("Help & guides");
  expect(readFileSync("src/components/ShortcutsHelp.tsx", "utf8")).toContain(
    "Open help and guides.",
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).not.toContain(
    "Open Help & guides",
  );
  expect(readFileSync("src/lib/shortcuts.ts", "utf8")).toContain(
    "Open help and guides.",
  );
  expect(readFileSync("README.md", "utf8")).not.toContain("Help & guides");
  expect(readFileSync("README.md", "utf8")).toContain("Open help and guides.");
  expect(readFileSync("docs/QUICKSTART.md", "utf8")).not.toContain(
    "Help & guides",
  );
  expect(readFileSync("docs/QUICKSTART.md", "utf8")).toContain(
    "Open help and guides.",
  );
  expect(readFileSync("docs/QUICKSTART.md", "utf8")).not.toContain(
    "then Use in Film.",
  );
  expect(readFileSync("docs/QUICKSTART.md", "utf8")).toContain(
    "then Use this in Film.",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).not.toContain(
    "Expand API keys,",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).toContain(
    "Expand API keys. Stored in the OS keychain., paste",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).not.toContain(
    "**Save AI settings**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).toContain(
    "**Save these AI settings.**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).not.toContain(
    "Test model\n(API request)",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).toContain(
    "**Test this model.**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).not.toContain(
    "**Load provider models**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).toContain(
    "**Load these provider models.**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).not.toContain(
    "**Detect installed\nagent**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).toContain(
    "**Detect this installed agent.**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).not.toContain(
    "**Test agent (uses account)**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).toContain(
    "**Test this agent.**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).not.toContain(
    "**Response limits and cost estimate**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).toContain(
    "**These are the response limits and cost estimate.**",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).not.toContain(
    "run Test model,",
  );
  expect(readFileSync("docs/guide/api-options.md", "utf8")).toContain(
    "run Test this model.,",
  );
  expect(
    readFileSync("docs/reviews/studio-verification-2026-09-05.md", "utf8"),
  ).not.toContain("searchable in Help & guides");
  expect(
    readFileSync("docs/reviews/studio-verification-2026-09-05.md", "utf8"),
  ).toContain("searchable in Open help and guides.");
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).not.toContain(
    ">AI settings<",
  );
  expect(readFileSync("src/components/SongLab.tsx", "utf8")).toContain(
    "Open these AI settings.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain("\n                AI settings\n");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "Open these AI settings.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n                Open AI settings\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Open these AI settings.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "\n            Save AI settings\n",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "Save these AI settings.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "\n              Load provider models\n",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "Load these provider models.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    '"Test model (API request)"',
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "Test this model.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    '"Test agent (uses account)"',
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "Test this agent.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "\n              Detect installed agent\n",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "Detect this installed agent.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "\n              Account and subscription documentation\n",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "Open the account and subscription documentation.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "\n                  Check current pricing\n",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "Check the current pricing.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "Open API keys",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "keys below to retry the check.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "use Test model before relying on one.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).not.toContain(
    "use Test this model. before relying on one.",
  );
  expect(readFileSync("src/components/AiSettings.tsx", "utf8")).toContain(
    "use Test this model before relying on one.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n              Go to Library\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Go to this Library.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n              Open Songs\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Open these Songs.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n            Open First run\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Open this First run.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n            Audio devices\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Open these audio devices.",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    "\n              Exit loop\n",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    "Exit this loop.",
  );
  expect(settings).not.toContain("\n          Restart audio\n");
  expect(settings).toContain("Restart this audio.");
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    "\n                Apply proposed edits\n",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "Apply these proposed edits.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    "\n                Dismiss proposal\n",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "Dismiss this proposal.",
  );
  expect(settings).not.toContain("\n              Check sample packs\n");
  expect(settings).not.toContain("\n            Check sample packs\n");
  expect(settings).toContain("Check these sample packs.");
  expect(settings).not.toContain("\n              Export logs\n");
  expect(settings).toContain("Export these logs.");
  expect(settings).not.toContain("\n                Rescan devices\n");
  expect(settings).toContain("Rescan these devices.");
  expect(settings).not.toContain("\n              Sample idle CPU\n");
  expect(settings).toContain("Sample this idle CPU.");
  expect(settings).not.toContain("\n              Rig ports\n");
  expect(settings).toContain("Open these Rig ports.");
  expect(settings).not.toContain("\n              API keys\n");
  expect(settings).toContain("Open these API keys.");
  expect(settings).not.toContain("then Check virtual MIDI.");
  expect(settings).toContain("then Check this virtual");
  expect(readFileSync("docs/guide/setup.md", "utf8")).not.toContain(
    "then Check virtual MIDI.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).toContain(
    "then Check this virtual MIDI.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).not.toContain(
    "Test key is not configured. Check key status only looks in the keychain.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).not.toContain(
    "Test this key. is not configured. Check this key status. only looks in the keychain.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).not.toContain(
    "Test this key. is not configured. Check this key status. This looks only in the keychain.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).not.toContain(
    "Test this key. This stays not configured.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).not.toContain(
    "Check this key status. This looks only in the keychain.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).toContain(
    "Test this key stays not configured. Check this key status looks only in the keychain.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).not.toContain(
    "Sample idle CPU is not a DESIGN 3 % pass.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).toContain(
    "Sample this idle CPU. is not a DESIGN 3 % pass.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).not.toContain(
    "type Guitar offset.",
  );
  expect(readFileSync("docs/guide/setup.md", "utf8")).toContain(
    "enter the guitar offset.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Guitar offset is the round-trip sample delay.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Enter the guitar offset. is",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Enter the guitar offset is the round-trip sample delay.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Guitar offset er rundturen i sampler.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Enter the guitar offset. er",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Enter the guitar offset er rundturen i sampler.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "You can still type a DAW measurement.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "You can still Enter the guitar offset.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "or type a DAW measurement.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "or enter the guitar offset.",
  );
  expect(readFileSync("docs/guide/studio-rooms.md", "utf8")).not.toContain(
    "edit and Play this |",
  );
  expect(readFileSync("docs/guide/studio-rooms.md", "utf8")).toContain(
    "edit and Play this chart.",
  );
  expect(readFileSync("docs/guide/studio-rooms.md", "utf8")).not.toContain(
    "Exit loop returns",
  );
  expect(readFileSync("docs/guide/studio-rooms.md", "utf8")).not.toContain(
    "Exit this loop. returns",
  );
  expect(readFileSync("docs/guide/studio-rooms.md", "utf8")).toContain(
    "Exit this loop returns to the full form.",
  );
  expect(readFileSync("docs/guide/studio-rooms.md", "utf8")).not.toContain(
    "Use in Film",
  );
  expect(readFileSync("docs/guide/studio-rooms.md", "utf8")).toContain(
    "Use this in Film.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "Settings → Check sample packs",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "Settings → Check these sample packs.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).toContain(
    "Settings → Check these sample packs with JAM_LIVE=1.",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    "Settings → Check sample packs",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).not.toContain(
    "Settings → Check these sample packs.",
  );
  expect(readFileSync("src/store/engine.ts", "utf8")).toContain(
    "Settings → Check these sample packs with JAM_LIVE=1.",
  );
  expect(readFileSync("crates/jam-band/src/kit.rs", "utf8")).not.toContain(
    "Settings → Check sample packs",
  );
  expect(readFileSync("crates/jam-band/src/kit.rs", "utf8")).not.toContain(
    "Settings → Check these sample packs.",
  );
  expect(readFileSync("crates/jam-band/src/kit.rs", "utf8")).toContain(
    "Settings → Check these sample packs with JAM_LIVE=1.",
  );
  expect(settings).not.toContain("Check sample packs.");
  expect(settings).not.toContain("Check these sample packs. After unpack");
  expect(settings).toContain(
    "Check these sample packs After unpack, the band plays",
  );
  expect(settings).not.toContain("\n          Refresh\n");
  expect(settings).toContain("Refresh this usage.");
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    "\n              Check virtual MIDI\n",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    "Check this virtual MIDI.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "\n          Upload & separate stems\n",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Upload and separate these stems.",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).not.toContain(
    "\n          Import stem ZIP\n",
  );
  expect(readFileSync("src/components/Stems.tsx", "utf8")).toContain(
    "Import this stem ZIP.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "\n          Go to Stage\n",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "Go to this Stage.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "\n            Discard draft changes\n",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "Discard these draft changes.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "\n                New chart\n",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "Create this new chart.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "\n                Reload folder\n",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "Reload this folder.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "\n                  Play this\n",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "Play this chart.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "\n                  Chart editor\n",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "This is the chart editor.",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).not.toContain(
    "\n                How to write a chart\n",
  );
  expect(readFileSync("src/screens/Library.tsx", "utf8")).toContain(
    "How to write this chart.",
  );
  expect(settings).not.toContain('? "Running"');
  expect(settings).toContain('? "The engine is running."');
  expect(settings).not.toContain('"Running with warnings"');
  expect(settings).toContain('"The engine is running with warnings."');
  expect(settings).not.toContain('"No audio"');
  expect(settings).toContain('"There is no audio."');
  expect(settings).not.toContain('["Stream",');
  expect(settings).toContain("These are the stream errors.");
  expect(settings).not.toContain('["Gaps",');
  expect(settings).toContain("These are the input gaps.");
  expect(settings).not.toContain('"Measuring…"');
  expect(settings).toContain('"Measuring the loopback."');
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    '"Measuring…"',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    '"Measuring the loopback."',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    '"Stop Recording"',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    '"Stop recording."',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "\n              Record New Take\n",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Record a new take.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    ': "Analyze Take"',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    ': "Analyze this take."',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "\n            Analyze again\n",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "Analyze again. to",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Analyze again to refresh the measurements.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Analyze again.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    "Analyze again\n            to replace",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    "Analyze again. to replace it.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    "Saved analysis is unreadable or from another version.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    "Previous passages",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    "Show these previous passages.",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).not.toContain(
    "Next passages",
  );
  expect(readFileSync("src/components/SongAnalysis.tsx", "utf8")).toContain(
    "Show these next passages.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Analyze again. replaces",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Analyze again replaces only its analysis metadata, retaining unknown fields.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    '? "Favourite" : "Keep"',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    '? "This is a favourite." : "Keep this take."',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "\n            Layer in Write\n",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Layer this in Write.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    '? "Favourites only" : "All takes"',
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    '? "Show favourites only." : "Show all takes."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    '? "Favourite" : "Mark favourite"',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    '? "This is a favourite." : "Mark this favourite."',
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "New song",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Create this new song.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Create a song",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Save copy",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Save this copy.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Save song",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Save this song.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Play song",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Play this song.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Loop section",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Loop this section.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Loop section auditions the band.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "Loop this section. auditions the band.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "song or Loop this section auditions the band.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Next section",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Loop this next section.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "Refresh takes",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Refresh these takes.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "press Save song.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "press Save this song.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    " /> Listen to guitar\n",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    " /> Listen to the guitar.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "Evidence & exercise",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Evidence and exercise.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    " /> Analysis help\n",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    " /> Open analysis help.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "Export stems",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Export the stems.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "\n            Review numbers\n",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Review the numbers.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                Listen to guitar\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Listen to the guitar.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "\n                Delete take\n",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Delete this take.",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).not.toContain(
    "\n              Delete…\n",
  );
  expect(readFileSync("src/screens/Sessions.tsx", "utf8")).toContain(
    "Delete this take…",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                Add guitar layer\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Add a guitar layer.",
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).not.toContain(
    '"Open recorded takes"',
  );
  expect(readFileSync("src/screens/Songs.tsx", "utf8")).toContain(
    '"Open recorded takes."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain(">Build up speed</h3>");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    ">Build up the speed.</h3>",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain(">Practice speed & key</h3>");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    ">Practice the speed and key.</h3>",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('"Start speed (%)"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '"Start speed is in percent."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('"Increase (percentage points)"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '"Increase is in percentage points."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('"Target speed (%)"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '"Target speed is in percent."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('"Complete bars per step"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '"Use this many complete bars per step."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('"Apply & save speed/key"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '"Apply and save the speed and key."',
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain(">Make this song land</h2>");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    ">Make this song land.</h2>",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain(">Build your guitar performance</h2>");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    ">Build your guitar performance.</h2>",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("Keep variation");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Keep this variation.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("Discard preview");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Discard this preview.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("Use performance");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Use this performance.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain("Listen to selection");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "Listen to this selection.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen to selection, then",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Listen to this selection. then",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Listen to this selection then",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "then Keep variation or Discard preview.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "then Keep this variation. or Discard this preview.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep this variation. or Discard this preview.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "then Keep this variation or Discard this preview.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep this variation. eller Discard this preview.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Keep this variation eller Discard this preview.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain(">Make the next move</h2>");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    ">Make the next move.</h2>",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain("\n              Assistant connection\n");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "Choose the assistant connection.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain("\n              Ask your studio assistant\n");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "Ask your studio assistant.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain('aria-label="Studio assistant"');
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    'aria-label="This is the studio assistant."',
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain('"Hide studio assistant"');
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "Hide this studio assistant.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain("\n                        Tweak proposed action values\n");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "Tweak the proposed action values.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain("\n                        Action JSON\n");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "This is the action JSON.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain("\n                      Apply proposed actions\n");
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "Apply the proposed actions.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain(".model} ·");
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain('"Agent account limits apply"');
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "Agent account limits apply.",
  );
  expect(
    readFileSync("src/components/StudioAssistant.tsx", "utf8"),
  ).not.toContain('"API billing applies"');
  expect(readFileSync("src/components/StudioAssistant.tsx", "utf8")).toContain(
    "API billing applies.",
  );
  expect(
    readFileSync("src/components/EngineStatusPill.tsx", "utf8"),
  ).not.toContain('"Waiting for audio"');
  expect(readFileSync("src/components/EngineStatusPill.tsx", "utf8")).toContain(
    '"Waiting for the audio."',
  );
  expect(
    readFileSync("src/components/EngineStatusPill.tsx", "utf8"),
  ).not.toContain('"Preview has no audio"');
  expect(readFileSync("src/components/EngineStatusPill.tsx", "utf8")).toContain(
    '"This preview has no audio."',
  );
  expect(
    readFileSync("src/components/EngineStatusPill.tsx", "utf8"),
  ).not.toContain('"Audio has a warning"');
  expect(readFileSync("src/components/EngineStatusPill.tsx", "utf8")).toContain(
    '"Audio has a warning."',
  );
  expect(
    readFileSync("src/components/EngineStatusPill.tsx", "utf8"),
  ).not.toContain('"No audio device"');
  expect(readFileSync("src/components/EngineStatusPill.tsx", "utf8")).toContain(
    '"There is no audio device."',
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    '"Record a take"',
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    '"Record a new take."',
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    '"Stop recording"',
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    '"Stop recording."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("\n            Reference transpose\n");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Reference transpose is in semitones.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("\n          Reference volume\n");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "This is the reference volume.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('"Play reference"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '"Play the reference."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain('"Pause reference"');
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    '"Pause the reference."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("\n          Stop reference\n");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Stop the reference.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("\n          Return to band\n");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Return to the band.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("\n          Loop this range\n");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Loop this range.",
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("\n          Loop off\n");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "\n          Loop off.\n",
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).not.toContain(
    'title="Meter follows the loaded chart"',
  );
  expect(readFileSync("src/components/TransportBar.tsx", "utf8")).toContain(
    'title="Meter follows the loaded chart."',
  );
  expect(
    readFileSync("src/components/ReferencePlayer.tsx", "utf8"),
  ).not.toContain("\n            Start ramp\n");
  expect(readFileSync("src/components/ReferencePlayer.tsx", "utf8")).toContain(
    "Start the ramp.",
  );
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain('"Add to setlist"');
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain('"Add this to the setlist."');
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain('"Update entry"');
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain('"Update this entry."');
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain(">Cancel edit</Button>");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain(">Cancel this edit.</Button>");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("\n                Move up\n");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("Move this up.");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("\n          Cue next\n");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("Cue the next entry.");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("\n                Remove\n");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("Remove this entry.");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("Cue {i + 1}");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("Cue entry {i + 1}.");
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "\n                    Move up\n",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Move this up.",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    "\n                    Remove\n",
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    "Remove this shot.",
  );
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain("\n                Edit\n");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain("Edit this entry.");
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).not.toContain('"Missing chart"');
  expect(
    readFileSync("src/components/tools/SetlistTool.tsx", "utf8"),
  ).toContain('"This chart is missing."');
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).not.toContain("\n                Remove\n");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).toContain("Remove this profile.");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).not.toContain("Save current setup");
  expect(
    readFileSync("src/components/tools/AudioProfilesTool.tsx", "utf8"),
  ).toContain("Save this current setup.");
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "\n            Remove bar\n",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Remove this bar.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    " Add bar\n",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Add this bar.",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).not.toContain(
    "\n              Remove\n",
  );
  expect(readFileSync("src/components/WritingDesk.tsx", "utf8")).toContain(
    "Remove this section.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                    Remove layer\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Remove this layer.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                      Remove version\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Remove this version.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain("Remove section {index + 1}\n");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "Remove this section {index + 1}.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain("\n            Add section\n");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "Add this section.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain("\n                Start bar\n");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "This section starts at this bar.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain("\n                End before bar\n");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "This section ends before this bar.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain("Confirm bars & sections");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "Confirm these bars and sections.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain('aria-label="Confirm reference bars and sections"');
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    'aria-label="Confirm these bars and sections."',
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain(">Reference map confirmation</legend>");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    ">Confirm these bars and sections.</legend>",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain('"Saving confirmed reference map"');
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    '"Saving this confirmed reference map."',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    'keep: "Keep that riff"',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    'keep: "Keep this riff."',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    'record: "Record / save take"',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    'record: "Record or save this take."',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    'play: "Play / stop"',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    'play: "Play or stop this."',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    'loop: "Loop selected section"',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    'loop: "Loop this selected section."',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    'next: "Next section loop"',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    'next: "Loop this next section."',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    'version: "Keep a version"',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    'version: "Keep this version."',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    'voice: "Talk / send to Jo"',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    'voice: "Talk or send this to Jo."',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).not.toContain(
    'ramp: "Toggle reference practice ramp"',
  );
  expect(readFileSync("src/lib/controller.ts", "utf8")).toContain(
    'ramp: "Toggle this reference practice ramp."',
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Actions include Keep that riff, Record/save take",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Actions include Keep this riff. Record or save this take.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Keep this riff. Record",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Play or stop this. Loop",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Loop this selected section. Loop this next section.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Actions include Keep this riff, Record or save this take, Play or stop this, Loop this selected section, Loop this next section and Keep this version.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "velge Keep this riff, Record or save this take, Play or stop this, Loop this selected section, Loop this next section og Keep this version.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "learn Talk / send to Jo",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "learn Talk or send this to Jo.",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).not.toContain(
    "Talk or send this to Jo. for",
  );
  expect(readFileSync("src/components/JoVoice.tsx", "utf8")).toContain(
    "In Write → Hands-free controls, learn the",
  );
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).not.toContain('label: "Blind comparison"');
  expect(
    readFileSync("src/components/tools/ComparisonTool.tsx", "utf8"),
  ).toContain('label: "This is a blind comparison."');
  expect(readFileSync("src/components/RoomTools.tsx", "utf8")).not.toContain(
    'title: "Blind take comparison"',
  );
  expect(readFileSync("src/components/RoomTools.tsx", "utf8")).toContain(
    'title: "This is a blind take comparison."',
  );
  expect(readFileSync("src/components/RoomTools.tsx", "utf8")).not.toContain(
    'title: "Song tone snapshot"',
  );
  expect(readFileSync("src/components/RoomTools.tsx", "utf8")).toContain(
    'title: "This is a song tone snapshot."',
  );
  expect(readFileSync("src/components/RoomTools.tsx", "utf8")).not.toContain(
    'title: "Audio setup profiles"',
  );
  expect(readFileSync("src/components/RoomTools.tsx", "utf8")).toContain(
    'title: "These are the audio setup profiles."',
  );
  expect(readFileSync("src/components/RoomTools.tsx", "utf8")).not.toContain(
    'title: "Melody → harmony"',
  );
  expect(readFileSync("src/components/RoomTools.tsx", "utf8")).toContain(
    'title: "This turns melody into harmony."',
  );
  expect(readFileSync("src/components/RoomTools.tsx", "utf8")).not.toContain(
    'title: "Rehearsal setlist"',
  );
  expect(readFileSync("src/components/RoomTools.tsx", "utf8")).toContain(
    'title: "This is the rehearsal setlist."',
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    '"en": "Blind take comparison"',
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    '"en": "This is a blind take comparison."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    'label="Silent shot preview"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    'label="This is a silent shot preview."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    'label="Silent rendered film preview"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    'label="This is a silent rendered film preview."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Pause preview"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    '"Pause this preview."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Play silent preview"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    '"Play this silent preview."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Refresh job"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    '"Refresh this job."',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).not.toContain(
    '"Retry local analysis"',
  );
  expect(readFileSync("src/screens/MusicVideo.tsx", "utf8")).toContain(
    '"Retry this local analysis."',
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Refresh job polls an existing task",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Refresh this job. polls",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Refresh this job polls an existing task and never resubmits it.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Refresh this job. sjekker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Refresh this job sjekker en eksisterende jobb",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Refresh this job. completes",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Refresh this job completes a saved request.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Refresh this job. fullfører",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Refresh this job fullfører en lagret forespørsel.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Retry this local analysis. uses",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Retry this local analysis uses the same song ID and makes no new generation request.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Retry this local analysis. bruker",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Retry this local analysis bruker samme sang-ID uten ny genereringsforespørsel.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Cancel this local work. stops",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Cancel this local work stops preparation;",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Cancel this local work. stopper",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Cancel this local work stopper klargjøringen;",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain(">Proposed intensity changes</caption>");
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    "These are the proposed intensity changes.",
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain('"Preview a lift"');
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    '"Preview this lift."',
  );
  expect(
    readFileSync("src/components/FinishingDesk.tsx", "utf8"),
  ).not.toContain('"Preview more space"');
  expect(readFileSync("src/components/FinishingDesk.tsx", "utf8")).toContain(
    '"Preview more of this space."',
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Preview a lift increases the intensity",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Preview this lift. increases the intensity",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Preview this lift increases the intensity",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    '?? "Choose a profile"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    '?? "Choose this profile."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    '"MIDI disconnected"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    '"This MIDI is disconnected."',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    '"Sending control messages"',
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).toContain(
    '"Sending these control messages."',
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain("\n              Estimated beats per bar\n");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "These are the estimated beats per bar.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain("Section {index + 1} name");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "This is the name of section {index + 1}.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain("Save confirmed map");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "Save this confirmed map.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                    Fit tempo to riff\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Fit the tempo to this riff.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                    Listen to trim\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Listen to this trim.",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).not.toContain(
    "\n                    Keep version\n",
  );
  expect(readFileSync("src/screens/Originals.tsx", "utf8")).toContain(
    "Keep this version.",
  );
  expect(settings).not.toContain("{t.provider}: {t.calls}");
  expect(settings).toContain("{t.provider} has {t.calls}");
  expect(settings).not.toContain(" · est. $");
  expect(settings).toContain("Estimated cost is $");
  expect(settings).not.toContain(" · estimate");
  expect(settings).not.toContain(" Estimated.");
  expect(settings).toContain(" This is estimated.");
  expect(settings).not.toContain("Stream errors");
  expect(settings).toContain("The stream has ${status.stream_errors} errors.");
  expect(settings).not.toContain("Input gaps");
  expect(settings).toContain("The input has ${status.input_gaps} gaps.");
  expect(settings).not.toContain("Headless (no audio device)");
  expect(settings).not.toContain("Headless. No audio device.");
  expect(settings).toContain("This is headless. This has no audio device.");
  expect(settings).not.toContain('"none"');
  expect(settings).toContain("No output device.");
  expect(settings).not.toContain("none (tuner and recording are silent)");
  expect(settings).toContain(
    "No input device. Tuner and recording are silent.",
  );
  expect(settings).not.toContain('\n      "Output",');
  expect(settings).toContain("This is the output.");
  expect(settings).not.toContain('\n      "Input",');
  expect(settings).toContain("This is the input.");
  expect(settings).not.toContain('\n      "Mode",');
  expect(settings).toContain("This is the mode.");
  expect(settings).not.toContain('\n      "Clock",');
  expect(settings).toContain("This is the clock.");
  expect(settings).not.toContain("} ch · ${status.output.sample_format}");
  expect(settings).toContain(
    "${status.output.device_name}. ${status.output.channels} channels. ${status.output.sample_format}.",
  );
  expect(settings).not.toContain("Hz · driver buffer");
  expect(settings).toContain(
    'Hz. The driver buffer is ${status.output?.buffer_frames ?? "default"} frames.',
  );
  expect(settings).not.toContain('} ·{" "}');
  expect(settings).toContain('.{" "}');
  expect(settings).not.toContain("out / {formatBytes(t.bytesIn)} in");
  expect(settings).toContain("out. {formatBytes(t.bytesIn)} in.");
  expect(settings).not.toContain("calls with unknown cost");
  expect(settings).toContain("calls have unknown cost.");
  expect(settings).not.toContain('"cost unknown"');
  expect(settings).toContain("Cost is unknown.");
  expect(settings).not.toContain("est. $");
  expect(settings).not.toContain(" ms · {formatBytes(e.bytesOut)}");
  expect(settings).toContain(
    "{e.durationMs} ms. {formatBytes(e.bytesOut)} sent.",
  );
  expect(settings).not.toContain("type Guitar offset");
  expect(settings).toContain("enter the guitar offset");
  expect(settings).not.toContain("smp ·");
  expect(settings).toContain("{latencySamples} samples.");
  const pill = readFileSync("src/components/EngineStatusPill.tsx", "utf8");
  expect(pill).not.toContain("Output:");
  expect(pill).toContain("Output is");
  expect(pill).not.toContain('?? "none"');
  expect(pill).not.toContain('?? "not connected"');
  expect(pill).toContain("This input is not connected.");
  expect(pill).not.toContain('?? "driver default"');
  expect(pill).toContain("This buffer is the driver default.");
  expect(pill).not.toContain("Preview: no audio");
  expect(pill).not.toContain("Audio: …");
  expect(pill).not.toContain("Audio: warning");
  const keys = readFileSync("src/components/AiSettings.tsx", "utf8");
  expect(keys).toContain("Key rejected by provider.");
  expect(keys).not.toContain("responded:");
  expect(keys).toContain("responded.");
  expect(keys).not.toContain("API keys ·");
  expect(keys).toContain("API keys. Stored in the OS keychain.");
  expect(keys).not.toContain('} ·{" "}');
  expect(keys).toContain('}.{" "}');
  expect(keys).not.toContain('"Keychain unavailable"');
  expect(keys).toContain("The keychain is unavailable.");
  expect(keys).not.toContain('"Key saved"');
  expect(keys).toContain("A key is saved.");
  expect(keys).not.toContain('"No key"');
  expect(keys).toContain("No key is saved.");
  expect(keys).not.toContain("\n            Find a connection\n");
  expect(keys).toContain("Find a connection.");
  expect(keys).not.toContain('placeholder="Unknown"');
  expect(keys).toContain('placeholder="The price is unknown."');
  expect(keys).not.toContain('placeholder="Provider name"');
  expect(keys).toContain('placeholder="Enter a provider name."');
  expect(keys).not.toContain('placeholder="Auto-detect from PATH"');
  expect(keys).toContain('placeholder="Detect this from PATH."');
  expect(keys).not.toContain('placeholder="Paste a key to save or replace"');
  expect(keys).toContain('placeholder="Paste a key to save or replace."');
  expect(keys).not.toContain("\n            Provider\n");
  expect(keys).toContain("Choose the provider.");
  expect(keys).not.toContain("\n            Model ID\n");
  expect(keys).toContain("Enter the model ID.");
  expect(keys).not.toContain("Agent executable path (optional)");
  expect(keys).toContain("The agent executable path is optional.");
  expect(keys).not.toContain("Maximum output tokens");
  expect(keys).toContain("Maximum output is in tokens.");
  expect(keys).not.toContain("Input USD / million tokens");
  expect(keys).toContain("Input is priced in USD per million tokens.");
  expect(keys).not.toContain("Output USD / million tokens");
  expect(keys).toContain("Output is priced in USD per million tokens.");
  expect(keys).not.toContain("\n                    Remove\n");
  expect(keys).toContain("Remove this key.");
  expect(keys).not.toContain("\n                    Save key\n");
  expect(keys).toContain("Save this key.");
  expect(keys).not.toContain("\n                    Check key status\n");
  expect(keys).toContain("Check this key status.");
  expect(keys).not.toContain("\n                    Test key\n");
  expect(keys).toContain("Test this key.");
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "Check key status only looks in the OS keychain.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "Check this key status. only looks in the OS keychain.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "Check this key status. This looks only in the OS keychain.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).toContain(
    "Check this key status looks only in the OS keychain.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Check key status only looks in the OS keychain.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Check this key status. only looks in the OS keychain.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Check this key status. This looks only in the OS keychain.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "Check this key status looks only in the OS keychain.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    '"Keychain unavailable"',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "The keychain is unavailable.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    '"Open AI settings to check key access"',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    "Open AI settings to check key access.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    "Open these AI settings. to check key access.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    "to check key access.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "Open these AI settings. This checks key access.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    'busy ? "Thinking"',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    'busy ? "Jo is thinking."',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    ': "Ready"}',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    ': "Ready."}',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    ': "This is ready."}',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    ">Review studio changes<",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    "Review these studio changes.",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    'timestamp: "Applied",',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    'timestamp: "Applied.",',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    'timestamp: "This is applied.",',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    "e.g. 'faster'",
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    'placeholder="Type a command. Examples are faster, drop the bass, or record a take."',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    'aria-label="Message Jo"',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    'aria-label="Type a message for Jo."',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    'aria-label="Suggested prompts"',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    'aria-label="These are the suggested prompts."',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    '"Drop the bass"',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    '"Drop the bass."',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    '"Play a fill"',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    '"Play a fill."',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    '"Set tempo to 100"',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    '"Set tempo to 100."',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    '"Suggest a stronger chorus for my song"',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    '"Suggest a stronger chorus for my song."',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    'aria-label="Proposed studio edits"',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    'aria-label="Review these studio changes."',
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).not.toContain(
    ">Type a command<",
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).toContain(
    "Type a command.",
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).not.toContain(
    "Conversation & voice setup",
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).toContain(
    "Open the conversation and voice setup.",
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).not.toContain(
    "Review Jo's proposed edits",
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).toContain(
    "Review these studio changes.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Conversation & voice setup",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Open the conversation and voice setup.",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Open the conversation and voice setup opens Jo AI",
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).not.toContain(
    'aria-label="Jo on Stage"',
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).toContain(
    'aria-label="This is Jo on Stage."',
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).not.toContain(
    "You: ",
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).not.toContain(
    '? "You." : "Jo."}',
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).toContain(
    '? "You" : "Jo"}',
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).not.toContain(
    "\n            Message Jo\n",
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).toContain(
    "Message Jo.",
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).not.toContain(
    'placeholder="Set tempo to 100"',
  );
  expect(readFileSync("src/components/JoStage.tsx", "utf8")).toContain(
    'placeholder="Set tempo to 100."',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).not.toContain(
    '? "You." : "Jo."}',
  );
  expect(readFileSync("src/screens/Jo.tsx", "utf8")).toContain(
    '? "You" : "Jo"',
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).not.toContain(
    'timestamp: "Jo",',
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).not.toContain(
    'timestamp: "Jo.",',
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).toContain(
    'timestamp: "This is Jo.",',
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).not.toContain(
    'timestamp: "Review",',
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).not.toContain(
    'timestamp: "Review.",',
  );
  expect(readFileSync("src/lib/jo/conversation.ts", "utf8")).toContain(
    'timestamp: "This is a review.",',
  );
  expect(readFileSync("src/lib/jo/loadSong.ts", "utf8")).not.toContain(
    "exact ID:",
  );
  expect(readFileSync("src/lib/jo/loadSong.ts", "utf8")).toContain("exact ID.");
  expect(readFileSync("src/lib/openUrl.ts", "utf8")).not.toContain("browser:");
  expect(readFileSync("src/lib/openUrl.ts", "utf8")).toContain(
    "Copy it into your browser.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "Analysis needs the desktop app:",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).toContain(
    "Analysis needs the desktop app.",
  );
  expect(readFileSync("src/components/tools/shared.tsx", "utf8")).toContain(
    "withNextStep",
  );
  expect(
    readFileSync("crates/jam-audio/src/recorder.rs", "utf8"),
  ).not.toContain("Recording interrupted:");
  expect(readFileSync("crates/jam-audio/src/recorder.rs", "utf8")).toContain(
    "Recording was interrupted.",
  );
  expect(readFileSync("crates/jam-audio/src/engine.rs", "utf8")).not.toContain(
    "Cannot record:",
  );
  expect(readFileSync("crates/jam-audio/src/engine.rs", "utf8")).toContain(
    "Cannot record.",
  );
  expect(readFileSync("crates/jam-audio/src/import.rs", "utf8")).not.toContain(
    "Damaged audio:",
  );
  expect(readFileSync("crates/jam-audio/src/import.rs", "utf8")).toContain(
    "The audio is damaged.",
  );
  expect(
    readFileSync("crates/jam-audio/src/reaper_import.lua", "utf8"),
  ).not.toContain("Import stopped:");
  expect(readFileSync("crates/jam-rig/src/midi.rs", "utf8")).not.toContain(
    "MIDI output unavailable:",
  );
  expect(readFileSync("crates/jam-rig/src/midi.rs", "utf8")).toContain(
    "MIDI output is unavailable.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Unknown cue:",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "The cue {cue} is unknown.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Take index unavailable:",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "The take index is unavailable.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "Video project:",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "The video project is invalid.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "Media tool could not start:",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "The media tool could not start.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Cannot create session folder:",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "Cannot create the session folder.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Invalid reference timing:",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "The reference timing is invalid.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Cannot write session.json:",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "Cannot write session.json.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Cannot read session.json:",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "Cannot read session.json.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "session.json is not JSON:",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "session.json is not JSON.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Could not save the usage log:",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "Could not save the usage log.",
  );
  expect(readFileSync("src-tauri/src/media/stems.rs", "utf8")).not.toContain(
    "Could not save paid stem ZIP:",
  );
  expect(readFileSync("src-tauri/src/media/stems.rs", "utf8")).toContain(
    "Could not save the paid stem ZIP.",
  );
  expect(
    readFileSync("src-tauri/src/platform/voice_shortcut.rs", "utf8"),
  ).not.toContain("Could not disable voice shortcut:");
  expect(
    readFileSync("src-tauri/src/platform/voice_shortcut.rs", "utf8"),
  ).toContain("Could not disable the voice shortcut.");
  expect(readFileSync("src-tauri/src/media/songs.rs", "utf8")).not.toContain(
    "Could not publish song folder:",
  );
  expect(readFileSync("src-tauri/src/media/songs.rs", "utf8")).toContain(
    "Could not publish the song folder.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Cannot save take analysis beside",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "Cannot save the take analysis beside",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "Cannot save take review beside",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "Cannot save the take review beside",
  );
  expect(readFileSync("src-tauri/src/settings.rs", "utf8")).not.toContain(
    "Cannot read {}: {e}",
  );
  expect(readFileSync("src-tauri/src/settings.rs", "utf8")).toContain(
    "Cannot read {}. {e}",
  );
  expect(readFileSync("src-tauri/src/settings.rs", "utf8")).not.toContain(
    "Cannot recover {}: {e}",
  );
  expect(readFileSync("src-tauri/src/settings.rs", "utf8")).toContain(
    "Cannot recover {}. {e}",
  );
  expect(readFileSync("src-tauri/src/media/songs.rs", "utf8")).not.toContain(
    "Song {id}:",
  );
  expect(readFileSync("src-tauri/src/media/songs.rs", "utf8")).toContain(
    "The song {id} is invalid.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "{}: {e} File left intact.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "The file {} is invalid. {e} File left intact.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "Cannot read media document {}: {e}",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "Cannot read media document {}. {e}",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "Invalid media document {}: {e}",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "Invalid media document {}. {e}",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "Cannot write media document {}: {e}",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "Cannot write media document {}. {e}",
  );
  expect(readFileSync("src-tauri/src/media/analysis.rs", "utf8")).not.toContain(
    "analysis did not finish:",
  );
  expect(readFileSync("src-tauri/src/media/analysis.rs", "utf8")).toContain(
    "analysis did not finish.",
  );
  expect(readFileSync("src-tauri/src/media/analysis.rs", "utf8")).not.toContain(
    "analysis status could not be saved:",
  );
  expect(readFileSync("src-tauri/src/media/analysis.rs", "utf8")).toContain(
    "analysis status could not be saved.",
  );
  expect(readFileSync("src-tauri/src/originals.rs", "utf8")).not.toContain(
    "Cannot read {}: {e}",
  );
  expect(readFileSync("src-tauri/src/originals.rs", "utf8")).toContain(
    "Cannot read {}. {e}",
  );
  expect(readFileSync("src-tauri/src/originals.rs", "utf8")).not.toContain(
    "Cannot read take {} at {}: {e}",
  );
  expect(readFileSync("src-tauri/src/originals.rs", "utf8")).toContain(
    "Cannot read take {} at {}. {e}",
  );
  expect(readFileSync("src-tauri/src/assets.rs", "utf8")).not.toContain(
    "Cannot read {}: {e}",
  );
  expect(readFileSync("src-tauri/src/assets.rs", "utf8")).toContain(
    "Cannot read {}. {e}",
  );
  expect(readFileSync("src-tauri/src/clips.rs", "utf8")).not.toContain(
    "cannot read {}: {e}",
  );
  expect(readFileSync("src-tauri/src/clips.rs", "utf8")).toContain(
    "Cannot read {}. {e}",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).not.toContain(
    "bundled styles:",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).toContain(
    "The bundled styles could not load.",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).not.toContain(
    "bundled charts:",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).toContain(
    "The bundled charts could not load.",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).not.toContain(
    "bundled rigs:",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).toContain(
    "The bundled rigs could not load.",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).not.toContain(
    "chart {}: {e}",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).toContain(
    "Chart {} is invalid.",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).not.toContain(
    "rig: {e}",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).toContain(
    "The rig is invalid.",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).not.toContain(
    'format!("{}: {e}", path.display())',
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).not.toContain(
    'format!("{}: {e}", dir.display())',
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).not.toContain(
    'format!("{}: {e}", temp.display())',
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).not.toContain(
    'format!("{}: {e}", file.display())',
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).toContain(
    "Cannot read {}. {e}",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).toContain(
    "Cannot create {}. {e}",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).toContain(
    "Cannot write {}. {e}",
  );
  expect(readFileSync("src-tauri/src/library.rs", "utf8")).toContain(
    "Cannot delete {}. {e}",
  );
  expect(readFileSync("crates/jam-core/src/registry.rs", "utf8")).not.toContain(
    'format!("{}: {e}", p.display())',
  );
  expect(readFileSync("crates/jam-core/src/registry.rs", "utf8")).toContain(
    "Cannot read {}. {e}",
  );
  expect(readFileSync("crates/jam-band/src/kit.rs", "utf8")).not.toContain(
    "Cannot read {}: {e}",
  );
  expect(readFileSync("crates/jam-band/src/kit.rs", "utf8")).toContain(
    "Cannot read {}. {e}",
  );
  expect(readFileSync("crates/jam-band/src/kit.rs", "utf8")).not.toContain(
    "kit.json is invalid:",
  );
  expect(readFileSync("crates/jam-band/src/kit.rs", "utf8")).toContain(
    "kit.json is invalid.",
  );
  expect(
    readFileSync("crates/jam-band/src/instruments.rs", "utf8"),
  ).not.toContain("Cannot read {}: {e}");
  expect(readFileSync("crates/jam-band/src/instruments.rs", "utf8")).toContain(
    "Cannot read {}. {e}",
  );
  expect(
    readFileSync("crates/jam-band/src/instruments.rs", "utf8"),
  ).not.toContain("Cannot start {}: {e}");
  expect(readFileSync("crates/jam-band/src/instruments.rs", "utf8")).toContain(
    "Cannot start {}. {e}",
  );
  expect(
    readFileSync("crates/jam-audio/src/recorder.rs", "utf8"),
  ).not.toContain("Cannot create {}: {e}");
  expect(readFileSync("crates/jam-audio/src/recorder.rs", "utf8")).toContain(
    "Cannot create {}. {e}",
  );
  expect(
    readFileSync("crates/jam-audio/src/recorder.rs", "utf8"),
  ).not.toContain("Cannot save {}: {e}");
  expect(readFileSync("crates/jam-audio/src/recorder.rs", "utf8")).toContain(
    "Cannot save {}. {e}",
  );
  expect(
    readFileSync("crates/jam-audio/src/recorder.rs", "utf8"),
  ).not.toContain("cannot open {}: {e}");
  expect(readFileSync("crates/jam-audio/src/recorder.rs", "utf8")).toContain(
    "Cannot open {}. {e}",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).not.toContain(
    "cannot open output stream:",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).toContain(
    "Cannot open the output stream.",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).not.toContain(
    "cannot open input stream:",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).toContain(
    "Cannot open the input stream.",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).not.toContain(
    "cannot enumerate {kind} devices:",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).toContain(
    "Cannot enumerate {kind} devices.",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).not.toContain(
    "cannot start stream:",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).toContain(
    "Cannot start the audio stream.",
  );
  expect(readFileSync("crates/jam-audio/src/engine.rs", "utf8")).not.toContain(
    "output: {e}; running headless",
  );
  expect(readFileSync("crates/jam-audio/src/engine.rs", "utf8")).toContain(
    "The output audio device failed.",
  );
  expect(readFileSync("crates/jam-audio/src/engine.rs", "utf8")).not.toContain(
    "input: {e}; tuner and recording input are silent",
  );
  expect(readFileSync("crates/jam-audio/src/engine.rs", "utf8")).toContain(
    "The input audio device failed.",
  );
  expect(readFileSync("crates/jam-audio/src/engine.rs", "utf8")).not.toContain(
    "JAM_FAKE_INPUT {path}:",
  );
  expect(readFileSync("crates/jam-audio/src/engine.rs", "utf8")).toContain(
    "JAM_FAKE_INPUT {path} failed.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "could not delete take {take_id}:",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "Could not delete take {take_id}.",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toContain(
    "could not inspect take {take_id}:",
  );
  expect(readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
    "Could not inspect take {take_id}.",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).not.toContain(
    "no default {kind} device",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).toContain(
    "No default {kind} device.",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).not.toContain(
    "no default output config:",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).toContain(
    "has no default output config.",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).not.toContain(
    "no default input config:",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).toContain(
    "has no default input config.",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).not.toContain(
    'format!("{}: {e}", parent.display())',
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).not.toContain(
    'format!("{}: {e}", self.path.display())',
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).not.toContain(
    'format!("{}: {e}", entry.id)',
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).toContain(
    "Cannot create {}. {e}",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).toContain(
    "Cannot write {}. {e}",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).toContain(
    "The {} request failed.",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).not.toContain(
    "path must start with a single '/':",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).toContain(
    "The path must start with a single '/'.",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).not.toContain(
    "path may not point outside the provider:",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).toContain(
    "The path may not point outside the provider.",
  );
  expect(readFileSync("src-tauri/src/keys.rs", "utf8")).not.toContain(
    "keychain unavailable: {reason}",
  );
  expect(readFileSync("src-tauri/src/keys.rs", "utf8")).toContain(
    "The keychain is unavailable ({reason}).",
  );
  expect(readFileSync("src-tauri/src/keys.rs", "utf8")).not.toContain(
    'no API key for \\"{provider}\\":',
  );
  expect(readFileSync("src-tauri/src/keys.rs", "utf8")).toContain(
    'No API key for \\"{provider}\\".',
  );
  expect(readFileSync("crates/jam-rig/src/midi.rs", "utf8")).not.toContain(
    "could not open MIDI port",
  );
  expect(readFileSync("crates/jam-rig/src/midi.rs", "utf8")).toContain(
    "Could not open MIDI port",
  );
  expect(readFileSync("crates/jam-rig/src/midi.rs", "utf8")).not.toContain(
    "failed: {e}",
  );
  expect(readFileSync("crates/jam-rig/src/midi.rs", "utf8")).toContain(
    "failed. {e}",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).not.toContain(
    "unsupported output sample format:",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).toContain(
    "The output sample format {other:?} is not supported.",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).not.toContain(
    "unsupported input sample format:",
  );
  expect(readFileSync("crates/jam-audio/src/io.rs", "utf8")).toContain(
    "The input sample format {other:?} is not supported.",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).not.toContain(
    "preparation failed:",
  );
  expect(readFileSync("src-tauri/src/media.rs", "utf8")).toContain(
    "Song {} was imported and kept. Preparation failed.",
  );
  expect(readFileSync("src-tauri/src/store.rs", "utf8")).not.toContain(
    "take index row {}: {e}",
  );
  expect(readFileSync("src-tauri/src/store.rs", "utf8")).toContain(
    "Skipped unreadable take index row {}. {e}.",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).not.toContain(
    'provider \\"{}\\" is not on the allow-list"',
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).toContain(
    'Provider \\"{}\\" is not on the allow-list.',
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).not.toContain(
    '"path contains whitespace or control characters"',
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).toContain(
    "The path contains whitespace or control characters.",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).not.toContain(
    "method {m} is not allowed",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).toContain(
    "Method {m} is not allowed.",
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).not.toContain(
    'header \\"{k}\\" is set by the app, not by the caller"',
  );
  expect(readFileSync("src-tauri/src/net.rs", "utf8")).toContain(
    'Header \\"{k}\\" is set by the app, not by the caller.',
  );
  expect(
    readFileSync("crates/jam-audio/src/analysis.rs", "utf8"),
  ).not.toContain("Mean distance to the quarter-note grid:");
  expect(readFileSync("crates/jam-audio/src/analysis.rs", "utf8")).toContain(
    "Mean distance to the quarter-note grid is",
  );
  expect(
    readFileSync("crates/jam-audio/src/analysis.rs", "utf8"),
  ).not.toContain("Attack-level variation:");
  expect(readFileSync("crates/jam-audio/src/analysis.rs", "utf8")).toContain(
    "Attack-level variation is",
  );
  expect(readFileSync("src-tauri/src/platform/mod.rs", "utf8")).not.toContain(
    "open-in-browser list:",
  );
  expect(readFileSync("src-tauri/src/platform/mod.rs", "utf8")).toContain(
    "This host is not on the open-in-browser list. {host}",
  );
  expect(readFileSync("src-tauri/src/media/stems.rs", "utf8")).not.toContain(
    "Stem recovery folder:",
  );
  expect(readFileSync("src-tauri/src/media/stems.rs", "utf8")).toContain(
    "The stem recovery folder is {}.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "browser preview:",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).toContain(
    "No MIDI port is open. Browser preview only logs messages.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).toContain(
    "is open in browser preview. Nothing is sent.",
  );
  expect(readFileSync("src/screens/Rig.tsx", "utf8")).not.toContain(
    " · browser preview",
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    '|| "none"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).not.toContain(
    '|| "No chord"',
  );
  expect(readFileSync("src/screens/Stage.tsx", "utf8")).toContain(
    '|| "This is a rest or no chord."',
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).not.toContain(
    'title: "Untitled music video"',
  );
  expect(readFileSync("src/lib/media.ts", "utf8")).toContain(
    'title: "This is an untitled music video."',
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).not.toContain(
    '|| "none"',
  );
  expect(readFileSync("src/components/SoloHelper.tsx", "utf8")).toContain(
    "No guide tones.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain('?? "none"');
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "No beat time.",
  );
  expect(
    readFileSync("src/components/ReferenceGrid.tsx", "utf8"),
  ).not.toContain("First downbeat ·");
  expect(readFileSync("src/components/ReferenceGrid.tsx", "utf8")).toContain(
    "First downbeat is the estimated beat number.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    'now: "none"',
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain('?? "none"');
  expect(readFileSync("crates/jam-rig/src/midi.rs", "utf8")).not.toContain(
    "no MIDI port open (messages are only logged)",
  );
  expect(readFileSync("crates/jam-rig/src/midi.rs", "utf8")).toContain(
    "No MIDI port is open. Messages are only logged.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).not.toContain(
    "(simulated)",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).toContain(
    "Preview Input is simulated.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).toContain(
    "Preview Output is simulated.",
  );
  expect(readFileSync("src/ipc/preview.ts", "utf8")).toContain(
    "Preview MIDI Out is simulated.",
  );
  expect(readFileSync("src-tauri/src/originals.rs", "utf8")).not.toContain(
    "Song: {e}",
  );
  expect(readFileSync("src-tauri/src/originals.rs", "utf8")).toContain(
    "The song is invalid.",
  );
  const shortcuts = readFileSync("src/lib/shortcuts.ts", "utf8");
  expect(shortcuts).not.toContain("Count-in:");
  expect(shortcuts).toContain("Count-in cycles off, 1 bar, or 2 bars");
  expect(shortcuts).not.toContain("Shift:");
  expect(shortcuts).toContain("Shift changes it by 5.");
  expect(readFileSync("docs/guide/manual.json", "utf8")).not.toContain(
    "Opptelling:",
  );
  expect(readFileSync("docs/guide/manual.json", "utf8")).toContain(
    "Opptelling veksler mellom av, 1 takt og 2 takter",
  );
  expect(
    readFileSync("src/components/tools/CoachTool.tsx", "utf8"),
  ).not.toContain("three song coaches:");
  expect(readFileSync("src/components/tools/CoachTool.tsx", "utf8")).toContain(
    "three song coaches for",
  );
  expect(
    readFileSync("src/components/tools/CoachTool.tsx", "utf8"),
  ).not.toContain("Return only JSON:");
  expect(readFileSync("src/components/tools/CoachTool.tsx", "utf8")).toContain(
    "Return only this JSON.",
  );
  const design = readFileSync("docs/DESIGN.md", "utf8");
  expect(design).toMatch(
    /- \[ \] Every screen shows designed empty, loading and error states/,
  );
});

it("ui.reducedMotion reads system, on and off", () => {
  expect(readReducedMotion(null)).toBe("system");
  expect(readReducedMotion({ ui: { reducedMotion: "on" } })).toBe("on");
  expect(readReducedMotion({ ui: { reducedMotion: "off" } })).toBe("off");
  expect(readReducedMotion({ ui: { reducedMotion: "system" } })).toBe("system");
  expect(readReducedMotion({ ui: { reducedMotion: "maybe" } })).toBe("system");
});

it("meters paint on canvas and Settings idle sample stays unproven", () => {
  const meter = readFileSync("src/components/Meter.tsx", "utf8");
  expect(meter).toContain("useCanvasRaf");
  expect(meter).toContain('getContext("2d")');
  const strip = readFileSync("src/components/ChordStrip.tsx", "utf8");
  expect(strip).toContain("useCanvasRaf");
  expect(strip).toContain('getContext("2d")');
  expect(strip).toContain("paintPlayhead");
  const raf = readFileSync("src/lib/useCanvasRaf.ts", "utf8");
  expect(raf).toContain("requestAnimationFrame");
  expect(raf).toContain("document.hidden");
  const rules = readFileSync("src/lib/meterFps.ts", "utf8");
  expect(rules).toContain("canvasRafShouldRun");
  expect(rules).toContain("transportClockLive");
  const settings = readFileSync("src/screens/Settings.tsx", "utf8");
  expect(settings).toContain("Idle CPU is not proven");
  expect(settings).toContain("Sample this idle CPU.");
  expect(settings).toContain("DESIGN 60 fps is not proven");
  expect(settings).toContain("Playhead fps");
  const design = readFileSync("docs/DESIGN.md", "utf8");
  expect(design).toMatch(/- \[ \] Meters and playhead at 60 fps/);
  expect(design).toMatch(/- \[x\] App idle CPU under 3 %/);
  expect(design).toMatch(/- \[ \] Copy self-audit/);
});

it("Stage transport and cues have a shortcut and a Jo tool", () => {
  const shortcutText = SHORTCUTS.map((s) => s.description).join(" ");
  for (const action of STAGE_ACTIONS) {
    expect(shortcutText).toContain(action.shortcut);
    expect(JO_TOOLS.some((t) => t.name === action.tool)).toBe(true);
  }
  expect(JO_TOOLS.map((t) => t.name)).toEqual(
    expect.arrayContaining([
      "trigger_cue",
      "set_tempo",
      "lyria_vibe",
      "generate_track",
    ]),
  );
});
