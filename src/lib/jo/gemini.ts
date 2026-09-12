/**
 * Jo's brain when a Gemini key is present: one `generateContent` call with function
 * declarations, through the Rust `provider_fetch` proxy. Pure functions for building
 * the request and reading the reply are exported so they can be tested offline.
 */

import type { ReferenceState } from "../../ipc/contract";
import { JO_SYSTEM_PROMPT, type JoMessage, type JoToolCall } from "./persona";
import { JO_TOOLS } from "./tools";

/** What Jo needs to know about the room right now. */
export interface JoContext {
  transportState: string;
  bpm: number;
  bar: number;
  styleId: string;
  styleName: string;
  intensity: number;
  chartName: string | null;
  currentChord: string;
  nextChord?: string | null;
  currentSection: string;
  muted: { drums: boolean; bass: boolean; comp: boolean };
  styles: Array<{ id: string; name: string }>;
  charts: Array<{ id: string; name: string }>;
  reference?: {
    assetId: string;
    label: string;
    position: number;
    seconds: number;
    loopEnabled: boolean;
    loopStart: number;
    loopEnd: number;
    speed: number;
    semitones: number;
    ramp?: ReferenceState["ramp"];
    confirmedBars?: number;
    key?: string | null;
    analysisError?: string | null;
    gridError?: string | null;
    processingError?: string | null;
    stems?: ReferenceState["stems"];
    gridOrigin?: "confirmed-local" | "estimated-local" | null;
    beatsPerBar?: number | null;
    beat?: number | null;
    analysisBeat?: number | null;
    analysisBeatCount?: number | null;
    confidence?: "low" | null;
    analysisBpm?: number | null;
    sections?: Array<{ id: string; label: string }>;
  };
  writing?: {
    name: string;
    selected: string;
    sections: unknown;
    versions: string[];
    chart?: unknown;
    notes?: string;
    lyrics?: Record<string, string>;
  };
  /** The open Film project, so edit_video_shot can name real shot ids from the Jo room. */
  film?: {
    id: string;
    title: string;
    shots: { id: string; title: string; seconds: number }[];
  };
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiRequest {
  systemInstruction: { parts: GeminiPart[] };
  contents: GeminiContent[];
  tools: Array<{ functionDeclarations: typeof JO_TOOLS }>;
  generationConfig: { temperature: number; maxOutputTokens: number };
}

export interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

export function contextSummary(ctx: JoContext): string {
  const muted = Object.entries(ctx.muted)
    .filter(([, m]) => m)
    .map(([k]) => k);
  const at = `${ctx.currentChord}${
    ctx.currentSection ? ` in the ${ctx.currentSection}` : ""
  }`;
  return [
    `Transport is ${ctx.transportState} at ${Math.round(ctx.bpm)} BPM, bar ${ctx.bar}.`,
    `Style is ${ctx.styleName} (id ${ctx.styleId}) at ${Math.round(ctx.intensity * 100)}% intensity.`,
    ...(ctx.reference
      ? [
          `Reference is ${ctx.reference.label} (id ${ctx.reference.assetId}) at ${Math.round(ctx.reference.speed * 100)}% and ${ctx.reference.semitones} semitones; now on ${at}.`,
          ctx.reference.sections?.length
            ? `Confirmed reference section ids are ${ctx.reference.sections
                .map((section) => `${section.id} (${section.label})`)
                .join(", ")}.`
            : "No confirmed reference sections are present.",
          ctx.reference.ramp
            ? `${ctx.reference.ramp.active ? "This ramp is armed" : "This ramp is inactive"} from ${ctx.reference.ramp.config.startPercent} to ${ctx.reference.ramp.config.targetPercent} by ${ctx.reference.ramp.config.stepPercent} every ${ctx.reference.ramp.config.barsPerStep} bars.`
            : "No reference ramp is active.",
          ctx.reference.confirmedBars
            ? `Confirmed reference bars are ${ctx.reference.confirmedBars}.`
            : "No confirmed reference bars are present.",
          ctx.reference.loopEnabled
            ? `Reference loop is ${ctx.reference.loopStart.toFixed(1)} to ${ctx.reference.loopEnd.toFixed(1)} s.`
            : "Reference looping is off.",
          `The reference is at ${ctx.reference.position.toFixed(1)} of ${ctx.reference.seconds.toFixed(1)} s.`,
          ctx.nextChord
            ? `Next is ${ctx.nextChord}.`
            : "No next chord is present.",
          ctx.reference.key
            ? `The key is ${ctx.reference.key}.`
            : "No reference key is known.",
          ctx.reference.analysisError
            ? ctx.reference.analysisError
            : "Reference analysis has no error.",
          ctx.reference.gridError
            ? ctx.reference.gridError
            : "Reference grid has no error.",
          ctx.reference.processingError
            ? ctx.reference.processingError
            : "Reference processing has no error.",
          ctx.reference.stems?.length
            ? `Reference stem ids are ${ctx.reference.stems
                .map((stem) => {
                  const parts = [
                    `${Math.round(stem.gain * 100)}%`,
                    stem.muted ? "muted" : "playing",
                  ];
                  if (stem.guitar) parts.push("guitar");
                  return `${stem.id} (${stem.label}, ${parts.join(", ")})`;
                })
                .join(", ")}.`
            : "No reference stems are loaded.",
          ctx.reference.gridOrigin
            ? `Reference grid origin is ${ctx.reference.gridOrigin}.`
            : "No reference grid is present.",
          ctx.reference.beatsPerBar
            ? `Reference beats per bar are ${ctx.reference.beatsPerBar}.`
            : "No reference beats per bar are known.",
          ctx.reference.beat != null
            ? `Reference beat is ${ctx.reference.beat}.`
            : "No reference beat is known.",
          ctx.reference.analysisBeat != null &&
          ctx.reference.analysisBeatCount != null
            ? `Beat ${ctx.reference.analysisBeat} of ${ctx.reference.analysisBeatCount}.`
            : "No analysed beat at this position.",
          ctx.reference.confidence
            ? "Local estimates. Low confidence."
            : "No analysis confidence is known.",
          ctx.reference.analysisBpm != null
            ? `The analysed tempo is ${ctx.reference.analysisBpm.toFixed(1)} BPM.`
            : "No analysed tempo is known.",
        ]
      : [
          ctx.chartName
            ? `Chart is ${ctx.chartName}; now on ${at}.`
            : `No chart is loaded. Now on ${at}.`,
        ]),
    muted.length
      ? `Muted parts are ${muted.join(", ")}.`
      : "No parts are muted.",
    `Available style ids are ${ctx.styles.map((s) => `${s.id} (${s.name})`).join(", ")}.`,
    `Available chart ids are ${ctx.charts.map((c) => `${c.id} (${c.name})`).join(", ")}.`,
    ctx.writing
      ? `Songwriting document is ${JSON.stringify(ctx.writing)}. Use the songwriting tool for this document.`
      : "No songwriting document is open.",
    ctx.film
      ? `Film project is ${JSON.stringify(ctx.film)}. Use edit_video_shot with these project and shot ids.`
      : "No Film project is open.",
  ].join("\n");
}

/** The last few turns, oldest first, as Gemini contents. */
export function buildRequest(
  history: JoMessage[],
  userText: string,
  ctx: JoContext,
): GeminiRequest {
  const turns: GeminiContent[] = history
    .filter((m) => m.id !== "welcome")
    .slice(-8)
    .map((m) => ({
      role: m.sender === "user" ? "user" : "model",
      parts: [{ text: m.text }],
    }));
  while (turns[0]?.role === "model") turns.shift();
  turns.push({ role: "user", parts: [{ text: userText }] });
  return {
    systemInstruction: {
      parts: [
        { text: JO_SYSTEM_PROMPT },
        {
          text: `This is the current state of the room.\n${contextSummary(ctx)}\nUse the exact ids above in tool calls. When you call a tool, still answer with one short spoken sentence.`,
        },
      ],
    },
    contents: turns,
    tools: [{ functionDeclarations: JO_TOOLS }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 200 },
  };
}

export function readResponse(res: GeminiResponse): {
  reply: string;
  toolCalls: JoToolCall[];
} {
  if (res.promptFeedback?.blockReason) {
    return {
      reply: `I can't go there (${res.promptFeedback.blockReason.toLowerCase()}).`,
      toolCalls: [],
    };
  }
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const toolCalls: JoToolCall[] = [];
  const texts: string[] = [];
  for (const p of parts) {
    if (p.functionCall?.name) {
      toolCalls.push({
        name: p.functionCall.name,
        arguments: p.functionCall.args ?? {},
      });
    } else if (p.text?.trim()) {
      texts.push(p.text.trim());
    }
  }
  const reply =
    texts.join(" ") ||
    (toolCalls.length > 0
      ? "This is underway."
      : "I didn't catch that. Try 'faster', 'play some funk' or 'drop the bass'.");
  return { reply, toolCalls };
}
