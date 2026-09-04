import { z } from "zod";
import { useEngineStore } from "../../store/engine";
import { transposeChart } from "../chart/transpose";
import {
  type SongBody,
  defaultSection,
  sectionBars,
  useWriting,
} from "../originals";
import { checkWritingForm } from "../writingTools";
import type { JoToolCall } from "./persona";
import type { JoToolDeclaration } from "./tools";

const text = (max: number) => z.string().trim().min(1).max(max);
const sectionOf = (body: SongBody, id: string) => {
  const section = body.chart.sections.find((s) => s.id === id);
  if (!section) throw new Error("Section missing. Use its current ID.");
  return section;
};
interface StudioTool {
  declaration: JoToolDeclaration;
  edit: (body: SongBody, args: Record<string, unknown>) => void;
}
export const STUDIO_TOOLS: Record<string, StudioTool> = {
  edit_song: {
    declaration: {
      name: "edit_song",
      description:
        "Change the original song title, tempo or transpose the band's chords. Recorded guitar is never pitch-shifted. Use this instead of stage tempo for Write songs.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          bpm: { type: "number" },
          semitones: {
            type: "number",
            description: "Integer -12 to 12; band only",
          },
        },
      },
    },
    edit: (b, raw) => {
      const a = z
        .object({
          title: text(120).optional(),
          bpm: z.number().min(40).max(240).optional(),
          semitones: z.number().int().min(-12).max(12).optional(),
        })
        .strict()
        .parse(raw);
      if (!Object.keys(a).length)
        throw new Error("Specify a title, tempo or transposition.");
      if (a.title !== undefined) b.chart.name = a.title;
      if (a.bpm !== undefined) b.chart.defaultBpm = a.bpm;
      if (a.semitones !== undefined)
        b.chart = transposeChart(b.chart, a.semitones);
    },
  },
  write_section: {
    declaration: {
      name: "write_section",
      description:
        "Write 1–16 bars of 4/4 chords. Supply sectionId to replace that section; omit to add a new section at the end. Existing section parts and locks remain.",
      parameters: {
        type: "object",
        properties: {
          sectionId: { type: "string" },
          name: { type: "string" },
          chords: { type: "string", description: "Example Am | F | C G | Am" },
        },
        required: ["name", "chords"],
      },
    },
    edit: (b, raw) => {
      const a = z
        .object({
          sectionId: text(100).optional(),
          name: text(80),
          chords: text(2000),
        })
        .strict()
        .parse(raw);
      const bars = sectionBars(a.chords);
      if (!bars.length || bars.length > 16)
        throw new Error("Use 1–16 bars per section.");
      if (
        b.chart.sections.some(
          (s) =>
            s.name.toLowerCase() === a.name.toLowerCase() &&
            s.id !== a.sectionId,
        )
      )
        throw new Error("Choose a unique section name.");
      if (a.sectionId) {
        const s = sectionOf(b, a.sectionId);
        s.name = a.name;
        s.bars = bars;
      } else {
        const id = `section-${crypto.randomUUID()}`;
        b.chart.sections.push({ id, name: a.name, bars });
        b.sections[id] = defaultSection();
        b.chart.arrangement.push({ sectionId: id, repeats: 1 });
      }
    },
  },
  arrange_song: {
    declaration: {
      name: "arrange_song",
      description:
        "Replace the song form with a comma-separated sequence of existing section IDs. Repeat with *N, for example verse*2,chorus,verse,chorus*2. Does not delete any section or guitar layer.",
      parameters: {
        type: "object",
        properties: { order: { type: "string" } },
        required: ["order"],
      },
    },
    edit: (b, raw) => {
      const { order } = z
        .object({ order: text(6000) })
        .strict()
        .parse(raw);
      b.chart.arrangement = order.split(",").map((entry) => {
        const [id, repeats = "1", extra] = entry.trim().split("*");
        if (extra !== undefined || !/^\d+$/.test(repeats))
          throw new Error("Use sectionId or sectionId*repeatCount.");
        const n = z.number().int().min(1).max(16).parse(Number(repeats));
        sectionOf(b, id.trim());
        return { sectionId: id.trim(), repeats: n };
      });
    },
  },
  shape_part: {
    declaration: {
      name: "shape_part",
      description:
        "Set one original-song section's drums, bass or comp volume/intensity/mute/groove. Respects groove locks: locked parts refuse all AI changes. Gain and intensity use 0–1.",
      parameters: {
        type: "object",
        properties: {
          sectionId: { type: "string" },
          part: { type: "string", enum: ["drums", "bass", "comp"] },
          gain: { type: "number" },
          intensity: { type: "number" },
          muted: { type: "boolean" },
          styleId: { type: "string" },
        },
        required: ["sectionId", "part"],
      },
    },
    edit: (b, raw) => {
      const a = z
        .object({
          sectionId: text(100),
          part: z.enum(["drums", "bass", "comp"]),
          gain: z.number().min(0).max(1).optional(),
          intensity: z.number().min(0).max(1).optional(),
          muted: z.boolean().optional(),
          styleId: text(100).optional(),
        })
        .strict()
        .parse(raw);
      sectionOf(b, a.sectionId);
      const part =
        b.sections[a.sectionId].parts[
          ["drums", "bass", "comp"].indexOf(a.part)
        ];
      if (part.locked)
        throw new Error(
          "That part is locked. Unlock it in Write before asking AI to change it.",
        );
      if (
        a.styleId &&
        !useEngineStore.getState().styles.some((s) => s.id === a.styleId)
      )
        throw new Error("Choose an available groove ID.");
      const { sectionId: _, part: __, ...patch } = a;
      if (!Object.keys(patch).length) throw new Error("Specify a part change.");
      Object.assign(part, patch);
    },
  },
  write_notes: {
    declaration: {
      name: "write_notes",
      description:
        "Append text to song notes, or supply sectionId to append original lyrics to that section's lyric sheet. Never erase existing writing.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" }, sectionId: { type: "string" } },
        required: ["text"],
      },
    },
    edit: (b, raw) => {
      const a = z
        .object({ text: text(6000), sectionId: text(100).optional() })
        .strict()
        .parse(raw);
      if (a.sectionId) {
        sectionOf(b, a.sectionId);
        b.lyrics ??= {};
        const next = `${b.lyrics[a.sectionId] ?? ""}\n\n${a.text}`.trim();
        if (next.length > 12000)
          throw new Error(
            "Section lyrics exceed 12,000 characters. Shorten them first.",
          );
        b.lyrics[a.sectionId] = next;
        return;
      }
      b.notes = `${b.notes}\n\n${a.text}`.trim();
      if (b.notes.length > 32000)
        throw new Error(
          "Song notes exceed 32,000 characters. Shorten them first.",
        );
    },
  },
};

export function songFingerprint(): string {
  const s = useWriting.getState().song;
  return JSON.stringify(s ? { id: s.id, body: s.body } : null);
}
/** Prepare everything before mutating the store: a bad second action cannot leave half an edit. */
export function applyStudioEdits(
  calls: JoToolCall[],
  expected?: string,
): string {
  const w = useWriting.getState();
  if (!w.song) throw new Error("Create or open a song in Write first.");
  if (w.busy || useEngineStore.getState().isRecording)
    throw new Error("Finish the current action or recording first.");
  if (expected !== undefined && expected !== songFingerprint())
    throw new Error(
      "The song changed. Ask again before applying this proposal.",
    );
  if (w.song.versions.length >= 20)
    throw new Error("Remove an unused version before applying AI edits.");
  if (!calls.length || calls.length > 8)
    throw new Error("Choose 1–8 studio actions.");
  const body = structuredClone(w.song.body);
  for (const c of calls) {
    if (!Object.hasOwn(STUDIO_TOOLS, c.name))
      throw new Error("Unknown studio edit.");
    STUDIO_TOOLS[c.name].edit(body, c.arguments);
  }
  checkWritingForm(body);
  w.version("Before assistant edits");
  w.edit((b) => Object.assign(b, body));
  return "Song updated; previous version kept. Save to keep it, Play to hear it. Guitar layers keep their bar positions and recorded pitch.";
}
