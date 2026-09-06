/**
 * Jo's brain when a Gemini key is present: one `generateContent` call with function
 * declarations, through the Rust `provider_fetch` proxy. Pure functions for building
 * the request and reading the reply are exported so they can be tested offline.
 */

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
  currentSection: string;
  muted: { drums: boolean; bass: boolean; comp: boolean };
  styles: Array<{ id: string; name: string }>;
  charts: Array<{ id: string; name: string }>;
  reference?: {
    assetId: string;
    label: string;
    position: number;
    seconds: number;
    speed: number;
    semitones: number;
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
  return [
    `Transport: ${ctx.transportState}, ${Math.round(ctx.bpm)} BPM, bar ${ctx.bar}.`,
    `Style: ${ctx.styleName} (id ${ctx.styleId}), intensity ${Math.round(ctx.intensity * 100)}%.`,
    `Chart: ${ctx.chartName ?? "none"}; now on ${ctx.currentChord}${
      ctx.currentSection ? ` in the ${ctx.currentSection}` : ""
    }.`,
    `Muted parts: ${muted.length ? muted.join(", ") : "none"}.`,
    `Available style ids: ${ctx.styles.map((s) => `${s.id} (${s.name})`).join(", ")}.`,
    `Available chart ids: ${ctx.charts.map((c) => `${c.id} (${c.name})`).join(", ")}.`,
    `Songwriting document: ${ctx.writing ? JSON.stringify(ctx.writing) : "none"}. Use the songwriting tool for this document.`,
    `Film project: ${ctx.film ? JSON.stringify(ctx.film) : "none"}. Use edit_video_shot with these project and shot ids.`,
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
          text: `Current state of the room:\n${contextSummary(ctx)}\nUse the exact ids above in tool calls. When you call a tool, still answer with one short spoken sentence.`,
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
      ? "On it."
      : "I didn't catch that. Try 'faster', 'play some funk' or 'drop the bass'.");
  return { reply, toolCalls };
}
