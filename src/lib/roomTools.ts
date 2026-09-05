import { Chord, Note } from "tonal";
import { z } from "zod";
import type {
  AudioConfig,
  AudioDevices,
  Chart,
  RigProfile,
  RigState,
} from "../ipc/contract";
import { keyName, splitChord } from "./chart/notes";
import { resolveChart } from "./chart/text";
import type { MediaShot } from "./media";
import { PARTS, type SongBody, defaultSection } from "./originals";
import {
  checkWritingForm,
  duplicateSection,
  harmonyChoices,
} from "./writingTools";

export const melodySchema = z
  .array(
    z.object({
      midi: z.number().int().min(0).max(127),
      startSeconds: z.number().finite().min(0).max(60),
      durationSeconds: z.number().finite().positive().max(60),
      confidence: z.number().finite().min(0).max(1),
    }),
  )
  .max(750);
export type MelodyNote = z.infer<typeof melodySchema>[number];

/** One line per note: pitch, start in seconds, duration in seconds. */
export function parseMelody(text: string): MelodyNote[] {
  if (text.length > 24000)
    throw new Error("Keep the melody sketch below 24,000 characters.");
  const notes = text
    .trim()
    .split(/\n/)
    .filter((s) => s.trim())
    .map((line) => {
      const [pitch, start, duration, extra] = line.trim().split(/\s+/);
      const midi = Note.midi(pitch);
      if (
        midi === null ||
        extra ||
        start === undefined ||
        duration === undefined
      )
        throw new Error(
          "Each line needs a note with octave, start and duration: A4 0 0.5",
        );
      return {
        midi,
        startSeconds: Number(start),
        durationSeconds: Number(duration),
        confidence: 1,
      };
    });
  return melodySchema.parse(notes);
}

export function melodyHarmony(chart: Chart, notes: MelodyNote[], bars: number) {
  melodySchema.parse(notes);
  if (
    chart.timeSig.join("/") !== "4/4" ||
    !Number.isFinite(chart.defaultBpm) ||
    chart.defaultBpm < 40 ||
    chart.defaultBpm > 240 ||
    !Number.isInteger(bars) ||
    bars < 1 ||
    bars > 32
  )
    throw new Error("Use 1–32 bars of a 4/4 song at 40–240 BPM.");
  if (!notes.length)
    throw new Error(
      "Add a few notes or extract a clear, single-note recording first.",
    );
  const secondsPerBar = 240 / chart.defaultBpm;
  if (!notes.some((n) => n.startSeconds < bars * secondsPerBar))
    throw new Error(
      "All notes start after this section ends. Move their start times into the selected section.",
    );
  const candidates = [
    ...harmonyChoices(chart, "", "key"),
    ...harmonyChoices(chart, "", "borrowed"),
  ].filter((v, i, a) => a.findIndex((c) => c.chord === v.chord) === i);
  return Array.from({ length: bars }, (_, bar) => {
    const overlaps = notes.map((n) => ({
      ...n,
      weight: Math.max(
        0,
        Math.min(
          n.startSeconds + n.durationSeconds,
          (bar + 1) * secondsPerBar,
        ) - Math.max(n.startSeconds, bar * secondsPerBar),
      ),
    }));
    const total = overlaps.reduce((s, n) => s + n.weight, 0);
    const choices = candidates
      .map((c) => {
        const pcs = new Set(Chord.get(c.chord).notes.map(Note.chroma));
        const covered = overlaps.reduce(
          (s, n) => s + (pcs.has(n.midi % 12) ? n.weight : 0),
          0,
        );
        return { ...c, coverage: total ? covered / total : null };
      })
      .sort((a, b) => (b.coverage ?? 0) - (a.coverage ?? 0));
    return { bar: bar + 1, choices, silent: total === 0 };
  });
}

export function harmonyVariation(
  source: SongBody,
  sectionId: string,
  chords: string[],
  id: string,
): SongBody {
  const original = source.chart.sections.find((s) => s.id === sectionId);
  if (
    !original ||
    chords.length !== original.bars.length ||
    chords.some((c) => Chord.get(c).empty)
  )
    throw new Error("Choose one valid chord for every bar of this section.");
  const body = structuredClone(source);
  duplicateSection(body, sectionId, id);
  // Keep the arrangement and guitar timeline intact; the new variation is an idea outside the form.
  body.chart.arrangement = structuredClone(source.chart.arrangement);
  const section = body.chart.sections.find((s) => s.id === id);
  if (!section) throw new Error("Variation could not be created.");
  section.name = `${original.name.slice(0, 50)} melody harmony`;
  section.bars = chords.map((chord) => [{ chord, beats: 4 }]);
  checkWritingForm(body);
  return body;
}

function chordMoves(chart: Chart): Set<string> {
  const count = chart.arrangement.reduce(
    (n, a) =>
      n +
      a.repeats *
        (chart.sections.find((s) => s.id === a.sectionId)?.bars.length ?? 0),
    0,
  );
  if (
    !Number.isFinite(count) ||
    count < 1 ||
    count > 4096 ||
    chart.arrangement.some(
      (a) => !Number.isInteger(a.repeats) || a.repeats < 1 || a.repeats > 4096,
    )
  )
    return new Set();
  const chords = resolveChart(chart).flatMap((b) =>
    b.chords.map((c) => splitChord(c.chord)),
  );
  const moves = new Set<string>();
  for (let i = 1; i < chords.length; i++) {
    const a = chords[i - 1];
    const b = chords[i];
    if (a && b)
      moves.add(
        `${a.quality || "major"} → ${b.quality || "major"}, +${(b.root - a.root + 12) % 12} semitones`,
      );
  }
  return moves;
}
export function harmonicNeighbours(source: Chart, library: Chart[]) {
  const moves = chordMoves(source);
  return library
    .filter(
      (c) => c.id !== source.id && c.timeSig.join() === source.timeSig.join(),
    )
    .map((chart) => {
      const shared = [...chordMoves(chart)].filter((m) => moves.has(m));
      return { chart, shared };
    })
    .filter((c) => c.shared.length)
    .sort(
      (a, b) =>
        b.shared.length - a.shared.length ||
        a.chart.name.localeCompare(b.chart.name),
    );
}

export const blueprintSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(60),
      bars: z.number().int().min(1).max(64),
      energy: z.number().finite().min(0).max(100),
    }),
  )
  .min(1)
  .max(16)
  .refine(
    (rows) => rows.reduce((n, r) => n + r.bars, 0) <= 256,
    "Keep the blueprint within 256 bars.",
  );
export type Blueprint = z.infer<typeof blueprintSchema>;
export function parseBlueprint(text: string): Blueprint {
  if (text.length > 4000) throw new Error("Blueprint is too long.");
  return blueprintSchema.parse(
    text
      .trim()
      .split("\n")
      .map((line) => {
        const [name, bars, energy, extra] = line
          .split("|")
          .map((s) => s.trim());
        if (extra !== undefined)
          throw new Error("Use Name | bars | energy on each line.");
        return { name, bars: Number(bars), energy: Number(energy) };
      }),
  );
}
export function referenceForm(
  source: SongBody,
  rows: Blueprint,
  sectionId: string,
  prefix: string,
): SongBody {
  blueprintSchema.parse(rows);
  if (source.clips.length)
    throw new Error(
      "This changes the timeline. Start from a version without guitar layers so recordings cannot move out of place.",
    );
  const phrase = source.chart.sections.find((s) => s.id === sectionId);
  if (!phrase?.bars.length)
    throw new Error("Choose your own chord phrase to develop.");
  const body = structuredClone(source);
  body.chart.arrangement = rows.map((row, i) => {
    const id = `${prefix}-${i}`;
    if (body.chart.sections.some((s) => s.id === id))
      throw new Error("Blueprint section id already exists.");
    body.chart.sections.push({
      ...structuredClone(phrase),
      id,
      name: row.name,
      bars: Array.from({ length: row.bars }, (_, b) =>
        structuredClone(phrase.bars[b % phrase.bars.length]),
      ),
    });
    const settings = structuredClone(
      source.sections[sectionId] ?? defaultSection(),
    );
    for (const p of settings.parts) {
      if (!p.locked && !p.muted) p.intensity = row.energy / 100;
    }
    body.sections[id] = settings;
    return { sectionId: id, repeats: 1 };
  });
  checkWritingForm(body);
  return body;
}

/** One coach request carries at most this much text; askBrain allows 64,000 for the whole envelope. */
export const COACH_LIMIT = 48_000;
/**
 * What the three coaches receive: the writing itself. Guitar clips, tone snapshots
 * and blueprints stay home; they are not something a coach can read anyway.
 */
export function coachBrief(body: SongBody, goal: string): string {
  checkWritingForm(body);
  const c = body.chart;
  const brief = JSON.stringify({
    goal: goal.trim().slice(0, 2000),
    song: {
      name: c.name,
      key: keyName(c.keyTonic, c.mode),
      bpm: c.defaultBpm,
      timeSig: c.timeSig.join("/"),
      form: c.arrangement.map((a) => `${a.sectionId} x${a.repeats}`),
      sections: c.sections.map((s) => ({
        id: s.id,
        name: s.name,
        bars: s.bars.map((bar) =>
          bar.map((ch) => `${ch.chord}:${ch.beats}`).join(" "),
        ),
        band: body.sections[s.id]?.parts.map(
          (p, i) =>
            `${PARTS[i]} ${p.muted ? "muted" : `${Math.round(p.intensity * 100)}%`}${p.locked ? " locked" : ""}`,
        ),
        lyrics: body.lyrics?.[s.id] ?? "",
      })),
      notes: body.notes,
    },
  });
  if (brief.length > COACH_LIMIT)
    throw new Error(
      `The song text is ${brief.length.toLocaleString("en")} characters; one coach request takes at most ${COACH_LIMIT.toLocaleString("en")}. Shorten the lyrics or notes first.`,
    );
  return brief;
}

export const coachSchema = z
  .object({
    composition: z
      .object({
        finding: z.string().min(1).max(1500),
        experiment: z.string().min(1).max(1000),
      })
      .strict(),
    arrangement: z
      .object({
        finding: z.string().min(1).max(1500),
        experiment: z.string().min(1).max(1000),
      })
      .strict(),
    performance: z
      .object({
        finding: z.string().min(1).max(1500),
        experiment: z.string().min(1).max(1000),
      })
      .strict(),
  })
  .strict();
export type Coach = z.infer<typeof coachSchema>;
export function generationBrief(
  body: SongBody,
  direction: string,
  instrumental: boolean,
): string {
  checkWritingForm(body);
  const c = body.chart;
  const form = c.arrangement.map((a) => {
    const s = c.sections.find((s) => s.id === a.sectionId);
    if (!s) throw new Error("Section is missing from this song.");
    const parts = body.sections[s.id]?.parts;
    return `${s.name}: ${s.bars.length * a.repeats} bars; chords ${s.bars.map((b) => b.map((c) => c.chord).join("/")).join(" | ")}; band intensity ${
      parts
        ?.filter((p) => !p.muted)
        .map((p) => Math.round(p.intensity * 100))
        .join("/") ?? "unspecified"
    }%${!instrumental && body.lyrics?.[s.id] ? `; lyrics: ${body.lyrics[s.id]}` : ""}.`;
  });
  const prompt = `Original song: ${c.name}. ${c.defaultBpm} BPM, ${keyName(c.keyTonic, c.mode)}, ${c.timeSig.join("/")}. ${instrumental ? "Instrumental; no vocals." : "Use the supplied original lyrics where present."}\nDirection: ${direction.trim().slice(0, 2000)}\nArrangement intent (adapt to the selected generation duration):\n${form.join("\n")}\nLeave space for the guitarist. Preserve the contrast between sections.`;
  if (prompt.length > 4000)
    throw new Error(
      "This brief exceeds 4,000 characters. Use an instrumental brief or shorten the form/lyrics first.",
    );
  return prompt;
}

/** Snap internal cuts; the soundtrack length and source trims do not change. */
export function snapCuts(
  shots: MediaShot[],
  bpm: number,
  beats: number,
  offset: number,
): MediaShot[] {
  if (
    !Number.isFinite(bpm) ||
    bpm < 40 ||
    bpm > 240 ||
    ![1, 2, 3, 4, 6, 8].includes(beats) ||
    !Number.isFinite(offset) ||
    offset < 0 ||
    offset > 10 ||
    shots.length < 2 ||
    shots.length > 100 ||
    shots.some(
      (s) => !Number.isFinite(s.seconds) || s.seconds < 0.1 || s.seconds > 120,
    )
  )
    throw new Error(
      "Use at least two valid shots, 40–240 BPM, and a 0–10 second grid offset.",
    );
  const grid = (60 / bpm) * beats;
  let old = 0;
  let previous = 0;
  const total = shots.reduce((n, s) => n + s.seconds, 0);
  if (total > 600) throw new Error("Keep the film within ten minutes.");
  return shots.map((shot, i) => {
    old += shot.seconds;
    const end =
      i === shots.length - 1
        ? total
        : offset + Math.round((old - offset) / grid) * grid;
    const seconds = end - previous;
    previous = end;
    if (seconds < 0.1 - 1e-8 || seconds > 120 + 1e-8)
      throw new Error(
        "This grid collapses or overextends a shot. Choose a finer grid or adjust the short shots first.",
      );
    return { ...shot, seconds: Math.round(seconds * 1e9) / 1e9 };
  });
}

export const setlistSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(120),
        chartId: z.string().min(1).max(120),
        bpm: z.number().finite().min(40).max(240),
        countIn: z.number().int().min(0).max(4),
      })
      .passthrough(),
  )
  .max(32)
  .refine(
    (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
    "Setlist entry ids must be unique.",
  );
export type Setlist = z.infer<typeof setlistSchema>;
export const audioProfileSchema = z
  .array(
    z
      .object({
        name: z.string().trim().min(1).max(60),
        config: z
          .object({
            input_device: z.string().max(500).nullable(),
            output_device: z.string().max(500).nullable(),
            input_channel: z.number().int().min(0).max(255),
            sample_rate: z.number().int().min(8000).max(384000),
            buffer_size: z.number().int().min(16).max(8192),
          })
          .strict(),
      })
      .passthrough(),
  )
  .max(12)
  .refine(
    (rows) => new Set(rows.map((r) => r.name)).size === rows.length,
    "Audio profile names must be unique.",
  );
export function validateAudioProfile(
  config: AudioConfig,
  devices: AudioDevices,
) {
  audioProfileSchema.parse([{ name: "check", config }]);
  const input = devices.inputs.find((d) =>
    config.input_device ? d.name === config.input_device : d.is_default,
  );
  const output = devices.outputs.find((d) =>
    config.output_device ? d.name === config.output_device : d.is_default,
  );
  if (!input || !output)
    throw new Error(
      "Connect this profile's input and output devices before recalling it.",
    );
  if (config.input_channel >= input.channels)
    throw new Error("This input no longer has the saved guitar channel.");
}

export const rigSnapshotSchema = z
  .object({
    profileId: z.string().min(1).max(120),
    scene: z.number().int().min(0).max(127),
    controls: z.record(
      z.string().regex(/^\d{1,3}$/),
      z.number().int().min(0).max(127),
    ),
  })
  .strict();
export type RigSnapshot = z.infer<typeof rigSnapshotSchema>;
export function captureRig(rig: RigState): RigSnapshot {
  return rigSnapshotSchema.parse({
    profileId: rig.currentProfile.id,
    scene: rig.currentScene,
    // Scene commands may also contain bank/scene CCs. Recall those through the scene itself.
    controls: Object.fromEntries(
      Object.entries(rig.controlValues).filter(([cc]) =>
        rig.currentProfile.controls.some((c) => c.cc === Number(cc)),
      ),
    ),
  });
}
export function validateRigSnapshot(value: unknown, profiles: RigProfile[]) {
  const snap = rigSnapshotSchema.parse(value);
  const profile = profiles.find((p) => p.id === snap.profileId);
  if (!profile || !profile.scenes[snap.scene])
    throw new Error(
      "The saved profile or scene is unavailable. Load the matching rig profile first.",
    );
  for (const [cc, value] of Object.entries(snap.controls)) {
    const control = profile.controls.find((c) => c.cc === Number(cc));
    if (!control || value < control.min || value > control.max)
      throw new Error(`Saved CC ${cc} is outside this profile's controls.`);
  }
  return { snap, profile };
}
