import type { Chart, TakeMetadata } from "../ipc/contract";
import { resolveChart } from "./chart/text";
import { type Original, type SongBody, arrangementRanges } from "./originals";
import {
  arrangedBars,
  checkWritingForm,
  duplicateSection,
} from "./writingTools";

export function transitionRange(chart: Chart, index: number, context: number) {
  const range = arrangementRanges(chart)[index];
  if (!range || !Number.isInteger(context) || context < 1 || context > 4)
    throw new Error("Choose a section and 1–4 bars of context.");
  return {
    startBar: Math.max(1, range.startBar - context),
    endBar: Math.min(arrangedBars(chart) + 1, range.startBar + context),
  };
}

export function contrastVariation(
  source: SongBody,
  index: number,
  recipe: "lift" | "space",
  amount: number,
  id: string,
): SongBody {
  const item = source.chart.arrangement[index];
  if (!item || !Number.isFinite(amount) || amount <= 0 || amount > 0.5)
    throw new Error("Choose a section and a strength between 1 and 50%.");
  const body = structuredClone(source);
  duplicateSection(body, item.sectionId, id);
  body.chart.arrangement = source.chart.arrangement.map((a, i) => ({
    ...a,
    sectionId: i === index ? id : a.sectionId,
  }));
  const band = body.sections[id];
  for (const [i, part] of band.parts.entries()) {
    if (part.locked || part.muted || (recipe === "space" && i === 1)) continue;
    part.intensity = Math.max(
      0,
      Math.min(1, part.intensity + (recipe === "lift" ? amount : -amount)),
    );
  }
  if (JSON.stringify(band) === JSON.stringify(source.sections[item.sectionId]))
    throw new Error(
      "Parts are locked, muted or already at this level; the band would be unchanged.",
    );
  checkWritingForm(body);
  return body;
}

function performanceTimeline(body: SongBody) {
  checkWritingForm(body); // Bound expansion before reading an old recording snapshot.
  const c = body.chart;
  return JSON.stringify([
    c.defaultBpm,
    c.keyTonic,
    c.mode,
    c.timeSig,
    resolveChart(c).map((b) => b.chords),
  ]);
}

export function buildSectionComp(
  song: Original,
  take: TakeMetadata,
  index: number,
): SongBody {
  const range = arrangementRanges(song.body.chart)[index];
  if (!range) throw new Error("Choose an arranged section.");
  const snapshot = take.snapshot as Original | undefined;
  let compatible = false;
  try {
    compatible =
      snapshot?.id === song.id &&
      performanceTimeline(snapshot.body) === performanceTimeline(song.body);
  } catch {
    /* Older or malformed snapshots cannot prove compatibility. */
  }
  if (!compatible)
    throw new Error(
      "Use a recording of this original with the same tempo and chord timeline. Record a fresh full-song take if the form changed.",
    );
  const bpm = song.body.chart.defaultBpm;
  if (
    song.body.chart.timeSig.join("/") !== "4/4" ||
    !Number.isFinite(bpm) ||
    bpm < 40 ||
    bpm > 240
  )
    throw new Error("Section comping needs a 4/4 original at 40–240 BPM.");
  const trimStart = ((range.startBar - 1) * 240) / bpm;
  const trimEnd = ((range.endBar - 1) * 240) / bpm;
  if (
    !take.pathInput ||
    !Number.isFinite(take.durationSecs) ||
    take.durationSecs < trimEnd
  )
    throw new Error("The guitar recording ends before this section ends.");
  const body = structuredClone(song.body);
  const compSlot = `${range.startBar}:${range.endBar}`;
  body.clips = body.clips.filter((c) => c.compSlot !== compSlot);
  if (body.clips.length >= 16)
    throw new Error(
      "Sixteen guitar layers is the limit. Remove a layer before adding this comp.",
    );
  const name = body.chart.sections.find((s) => s.id === range.sectionId)?.name;
  body.clips.push({
    takeId: take.id,
    label: `${name} comp`.slice(0, 80),
    trimStart,
    trimEnd,
    startBar: range.startBar,
    repeats: 1,
    gain: 1,
    muted: false,
    compSlot,
  });
  return body;
}

export function finishingReview(
  body: SongBody,
  takes: TakeMetadata[],
  vocal: boolean,
) {
  const issues: { id: string; title: string; detail: string }[] = [];
  const end = arrangedBars(body.chart) + 1;
  if (!body.chart.name.trim() || body.chart.name === "New song")
    issues.push({
      id: "title",
      title: "Give this original a name",
      detail: "A working title makes takes and exports easier to recognise.",
    });
  for (const section of body.chart.sections) {
    if (!body.chart.arrangement.some((a) => a.sectionId === section.id))
      issues.push({
        id: `unused-${section.id}`,
        title: `${section.name} is outside the form`,
        detail:
          "Keep it as an idea, add it in Compose so the band plays it, or use Delete section to let it go.",
      });
    else if (vocal && !body.lyrics?.[section.id]?.trim())
      issues.push({
        id: `lyrics-${section.id}`,
        title: `${section.name} has no lyric draft`,
        detail:
          "Write a line in Lyrics, or intentionally leave this section instrumental.",
      });
  }
  // ponytail: compares settings, not perceived musical quality; listening remains the decision.
  const ranges = arrangementRanges(body.chart);
  if (
    ranges.some(
      (r, i) =>
        i > 0 &&
        r.sectionId !== ranges[i - 1].sectionId &&
        JSON.stringify(body.sections[r.sectionId]) ===
          JSON.stringify(body.sections[ranges[i - 1].sectionId]),
    )
  )
    issues.push({
      id: "contrast",
      title: "Some neighbouring sections use the same band settings",
      detail:
        "That may suit the song. Loop their transition below to decide whether a lift or more space helps.",
    });
  for (const [i, clip] of body.clips.entries()) {
    const take = takes.find((t) => t.id === clip.takeId);
    if (!take)
      issues.push({
        id: `missing-${i}`,
        title: `${clip.label}: source take is unavailable`,
        detail:
          "Refresh Sessions or restore the original take files. A listed take still needs its audio file on disk.",
      });
    if (
      !Number.isFinite(clip.trimStart) ||
      !Number.isFinite(clip.trimEnd) ||
      clip.trimStart < 0 ||
      clip.trimEnd <= clip.trimStart ||
      (take && clip.trimEnd > take.durationSecs)
    )
      issues.push({
        id: `trim-${i}`,
        title: `${clip.label}: check the trim`,
        detail: "The selected interval must fit inside its source recording.",
      });
    const clipEnd =
      clip.startBar +
      ((clip.trimEnd - clip.trimStart) * clip.repeats * body.chart.defaultBpm) /
        240;
    if (clipEnd > end + 0.000001)
      issues.push({
        id: `overflow-${i}`,
        title: `${clip.label} extends beyond the song form`,
        detail:
          "Trim it in Record & layers or extend the arrangement. Guitar clips stay at absolute bar positions when the form changes.",
      });
  }
  return issues;
}
