/**
 * Jo's tools, declared once. The dispatcher executes them, the LLM sees them as
 * function declarations, and the offline intent parser emits the same names.
 */

import { STUDIO_TOOLS } from "./studioTools";
export interface JoToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: "string" | "number" | "boolean";
        description?: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

/** Validate at the shared execution boundary, including offline and cloud callers. */
export function validateToolCall(call: {
  name: string;
  arguments: Record<string, unknown>;
}): void {
  const tool = JO_TOOLS.find((t) => t.name === call.name);
  if (
    !tool ||
    !call.arguments ||
    typeof call.arguments !== "object" ||
    Array.isArray(call.arguments)
  )
    throw new Error("Unknown or malformed Jo action.");
  for (const name of tool.parameters.required ?? []) {
    if (!(name in call.arguments))
      throw new Error(`Missing ${name} for ${call.name}.`);
  }
  for (const [name, value] of Object.entries(call.arguments)) {
    const property = tool.parameters.properties[name];
    const actualType = typeof value;
    if (
      !property ||
      actualType !== property.type ||
      (typeof value === "number" && !Number.isFinite(value)) ||
      (property.enum && !property.enum.includes(String(value)))
    )
      throw new Error(`Invalid ${name} for ${call.name}.`);
  }
}

export const JO_TOOLS: JoToolDeclaration[] = [
  {
    name: "edit_video_shot",
    description:
      "Edit one existing music-video shot in the open Film project. Changes text and timing only; never generates media or spends API credits. User can Undo and Save video.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        shotId: { type: "string" },
        title: { type: "string" },
        prompt: { type: "string" },
        seconds: { type: "number" },
      },
      required: ["projectId", "shotId"],
    },
  },
  ...Object.values(STUDIO_TOOLS).map((t) => t.declaration),
  {
    name: "analyze_take",
    description:
      "Run local timing/dynamics/intonation analysis of a saved guitar take. Use a take ID from context. Prefer raw ms, cents, level CV and coverage counts; null means unavailable. Legacy percentage zero can also mean unavailable. Grid distance can reflect intentional syncopation; bends and accents are not necessarily errors. This is heuristic evidence, not a listening review.",
    parameters: {
      type: "object",
      properties: { takeId: { type: "string" } },
      required: ["takeId"],
    },
  },
  {
    name: "songwriting",
    description:
      "Work on the original song in Write. Keep captures, save or compare versions, select a section, lock a part, change its groove, undo or record. Changes need play to audition.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "keep",
            "save",
            "version",
            "restore",
            "undo",
            "play",
            "record",
            "select",
            "lock",
            "groove",
            "loop",
            "next",
          ],
        },
        name: { type: "string", description: "Section or version name" },
        part: { type: "string", enum: ["drums", "bass", "comp"] },
        styleId: { type: "string" },
        locked: { type: "boolean" },
      },
      required: ["action"],
    },
  },
  {
    name: "transport_control",
    description: "Start, pause or stop the band.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["play", "pause", "stop"] },
      },
      required: ["action"],
    },
  },
  {
    name: "set_reference_practice",
    description:
      "Change and save playback speed (50–150 percent) or whole-semitone transposition (-12 to +12 from the original key) for the loaded native reference and all its stems. Use its current assetId from reference context. This preserves the guitar DI, loop bounds and the other setting. Unavailable during recording or browser preview; does not edit Write song chords.",
    parameters: {
      type: "object",
      properties: {
        assetId: { type: "string" },
        speedPercent: { type: "number" },
        semitones: { type: "number" },
      },
      required: ["assetId"],
    },
  },
  {
    name: "loop_reference_section",
    description:
      "Loop one user-confirmed reference section from its downbeat. Use the loaded reference assetId and a sectionId from reference context; never invent a section. Unavailable while recording or in browser preview.",
    parameters: {
      type: "object",
      properties: {
        assetId: { type: "string" },
        sectionId: { type: "string" },
      },
      required: ["assetId", "sectionId"],
    },
  },
  {
    name: "set_tempo",
    description:
      "Set the tempo. Give an absolute bpm, or a delta in BPM for 'faster'/'slower' (default ±5).",
    parameters: {
      type: "object",
      properties: {
        bpm: { type: "number", description: "Absolute tempo, 40-300" },
        delta: { type: "number", description: "Change relative to now" },
      },
    },
  },
  {
    name: "trigger_cue",
    description:
      "Queue a band cue at the next bar: a drum fill, a crash, a stop, or the ending.",
    parameters: {
      type: "object",
      properties: {
        cue: { type: "string", enum: ["fill", "crash", "stop", "ending"] },
      },
      required: ["cue"],
    },
  },
  {
    name: "set_style",
    description:
      "Change the groove/style the band plays (takes effect at the next bar).",
    parameters: {
      type: "object",
      properties: {
        styleId: {
          type: "string",
          description: "One of the style ids listed in the context",
        },
      },
      required: ["styleId"],
    },
  },
  {
    name: "set_intensity",
    description: "How hard the band plays, 0 (sparse) to 1 (full).",
    parameters: {
      type: "object",
      properties: { intensity: { type: "number" } },
      required: ["intensity"],
    },
  },
  {
    name: "set_parts",
    description: "Mute or unmute drums, bass or the comping instrument.",
    parameters: {
      type: "object",
      properties: {
        muteDrums: { type: "boolean" },
        muteBass: { type: "boolean" },
        muteComp: { type: "boolean" },
      },
    },
  },
  {
    name: "toggle_energy_follower",
    description: "Let the band follow the guitarist's playing dynamics.",
    parameters: {
      type: "object",
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
    },
  },
  {
    name: "load_chart",
    description:
      "Load a chord chart / song form by id (see the context for ids).",
    parameters: {
      type: "object",
      properties: { chartId: { type: "string" } },
      required: ["chartId"],
    },
  },
  {
    name: "set_loop",
    description:
      "Loop a range of bars (1-based, end exclusive) or turn looping off.",
    parameters: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        startBar: { type: "number" },
        endBar: { type: "number" },
      },
      required: ["enabled"],
    },
  },
  {
    name: "record_take",
    description: "Start or stop recording a take.",
    parameters: {
      type: "object",
      properties: { action: { type: "string", enum: ["start", "stop"] } },
      required: ["action"],
    },
  },
];
