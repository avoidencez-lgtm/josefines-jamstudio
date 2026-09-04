/**
 * Jo's tools, declared once. The dispatcher executes them, the LLM sees them as
 * function declarations, and the offline intent parser emits the same names.
 */

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

export const JO_TOOLS: JoToolDeclaration[] = [
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
