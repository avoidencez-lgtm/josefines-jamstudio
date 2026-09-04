import { z } from "zod";
import { create } from "zustand";
import { ipc } from "../../ipc/client";
import type { AppSettings, ProviderInfo } from "../../ipc/contract";
import { useEngineStore } from "../../store/engine";
import {
  ProviderError,
  providerFetch,
  summariseError,
} from "../net/providerFetch";
import {
  type GeminiResponse,
  type JoContext,
  buildRequest,
  readResponse,
} from "./gemini";
import type { JoMessage, JoToolCall } from "./persona";
import { JO_TOOLS, validateToolCall } from "./tools";

export interface BrainRequest {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tools: boolean;
}
export interface BrainReply {
  reply: string;
  toolCalls: JoToolCall[];
}
type WireReply = {
  status?: string;
  error?: unknown;
  stop_reason?: string;
  output?: {
    type: string;
    name?: string;
    arguments?: string;
    content?: { text?: string; refusal?: string }[];
  }[];
  content?: {
    type: string;
    text?: string;
    name?: string;
    input?: Record<string, unknown>;
  }[];
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string;
      tool_calls?: { function: { name: string; arguments: string } }[];
    };
  }[];
};
const argumentObject = (text: string) =>
  z.record(z.string(), z.unknown()).parse(JSON.parse(text));
const finalReply = (reply: string, toolCalls: JoToolCall[]): BrainReply => {
  if (toolCalls.length > 8)
    throw new Error("Too many requested actions. Ask for a smaller change.");
  for (const call of toolCalls) validateToolCall(call);
  if (!reply.trim() && !toolCalls.length)
    throw new Error("The provider returned no usable answer.");
  return { reply: reply.trim() || "On it.", toolCalls };
};
export function readOpenAI(raw: unknown): BrainReply {
  const r = raw as WireReply;
  if (r.status !== "completed" || r.error)
    throw new Error("OpenAI did not finish its answer. No actions applied.");
  return finalReply(
    (r.output ?? [])
      .flatMap((o) => (o.content ?? []).map((c) => c.text ?? c.refusal ?? ""))
      .join("\n"),
    (r.output ?? [])
      .filter((o) => o.type === "function_call")
      .map((o) => ({
        name: o.name ?? "",
        arguments: argumentObject(o.arguments ?? ""),
      })),
  );
}
export function readClaude(raw: unknown): BrainReply {
  const r = raw as WireReply;
  if (
    r.error ||
    !["end_turn", "tool_use", "stop_sequence", "refusal"].includes(
      r.stop_reason ?? "",
    )
  )
    throw new Error("Claude did not finish its answer. No actions applied.");
  return finalReply(
    (r.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n"),
    (r.content ?? [])
      .filter((c) => c.type === "tool_use")
      .map((c) => ({ name: c.name ?? "", arguments: c.input ?? {} })),
  );
}
export function readRouter(raw: unknown): BrainReply {
  const r = raw as WireReply;
  const choice = r.choices?.[0];
  if (r.error || !["stop", "tool_calls"].includes(choice?.finish_reason ?? ""))
    throw new Error(
      "The routed model did not finish its answer. No actions applied.",
    );
  return finalReply(
    choice?.message?.content ?? "",
    (choice?.message?.tool_calls ?? []).map((c) => ({
      name: c.function.name,
      arguments: argumentObject(c.function.arguments),
    })),
  );
}

export interface BrainEntry {
  local?: boolean;
  catalog?: {
    path: string;
    headers?: Record<string, string>;
    read: (body: unknown) => string[];
  };
  name: string;
  model: string;
  pricing: string;
  request: (
    input: BrainRequest,
    model: ModelSettings,
  ) => { path: string; body: unknown; headers?: Record<string, string> };
  read: (response: unknown) => BrainReply;
}
// One registry; all consumers use the same adapters and existing Jo tool declarations.
export const BRAINS: Record<string, BrainEntry> = {
  codex: {
    name: "Codex · installed CLI",
    model: "default",
    local: true,
    pricing: "https://developers.openai.com/codex/auth",
    request: (input) => ({ path: "agent/request", body: input }),
    read: readAgentReply,
  },
  "claude-code": {
    name: "Claude Code · installed CLI",
    model: "default",
    local: true,
    pricing:
      "https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan",
    request: (input) => ({ path: "agent/request", body: input }),
    read: readAgentReply,
  },
  gemini: {
    catalog: {
      path: "/v1beta/models?pageSize=100",
      read: (raw) =>
        z
          .object({
            models: z.array(
              z.object({
                name: z.string(),
                supportedGenerationMethods: z.array(z.string()).optional(),
              }),
            ),
          })
          .parse(raw)
          .models.filter((m) =>
            m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m) => m.name.replace(/^models\//, "")),
    },
    name: "Google Gemini",
    model: "gemini-2.5-flash",
    pricing: "https://ai.google.dev/gemini-api/docs/pricing",
    request: (r, s) => ({
      path: `/v1beta/models/${s.model}:generateContent`,
      body: {
        systemInstruction: { parts: [{ text: r.system }] },
        contents: r.messages.map((m) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }],
        })),
        ...(r.tools ? { tools: [{ functionDeclarations: JO_TOOLS }] } : {}),
        generationConfig: { maxOutputTokens: s.maxTokens },
      },
    }),
    read: (raw: unknown) => {
      const r = raw as GeminiResponse;
      if (r.candidates?.[0]?.finishReason === "MAX_TOKENS")
        throw new Error("Gemini ran out of output tokens. No actions applied.");
      const result = readResponse(r);
      return finalReply(result.reply, result.toolCalls);
    },
  },
  openai: {
    catalog: { path: "/v1/models", read: readModelIds },
    name: "OpenAI",
    model: "gpt-4.1-mini",
    pricing: "https://developers.openai.com/api/docs/pricing",
    request: (r, s) => ({
      path: "/v1/responses",
      body: {
        model: s.model,
        instructions: r.system,
        input: r.messages,
        max_output_tokens: s.maxTokens,
        store: false,
        ...(r.tools
          ? {
              tools: JO_TOOLS.map((t) => ({
                type: "function",
                ...t,
                strict: false,
              })),
              parallel_tool_calls: false,
            }
          : {}),
      },
    }),
    read: readOpenAI,
  },
  anthropic: {
    catalog: {
      path: "/v1/models?limit=100",
      headers: { "anthropic-version": "2023-06-01" },
      read: readModelIds,
    },
    name: "Anthropic Claude",
    model: "claude-sonnet-4-6",
    pricing: "https://platform.claude.com/docs/en/about-claude/pricing",
    request: (r, s) => ({
      path: "/v1/messages",
      headers: { "anthropic-version": "2023-06-01" },
      body: {
        model: s.model,
        system: r.system,
        messages: r.messages,
        max_tokens: s.maxTokens,
        ...(r.tools
          ? {
              tools: JO_TOOLS.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              })),
            }
          : {}),
      },
    }),
    read: readClaude,
  },
  openrouter: {
    catalog: {
      path: "/api/v1/models",
      read: (raw) =>
        z
          .object({
            data: z.array(
              z.object({
                id: z.string(),
                supported_parameters: z.array(z.string()).optional(),
              }),
            ),
          })
          .parse(raw)
          .data.filter((m) => m.supported_parameters?.includes("tools"))
          .map((m) => m.id),
    },
    name: "OpenRouter",
    model: "openai/gpt-4.1-mini",
    pricing: "https://openrouter.ai/models",
    request: (r, s) => ({
      path: "/api/v1/chat/completions",
      body: {
        model: s.model,
        messages: [{ role: "system", content: r.system }, ...r.messages],
        max_tokens: s.maxTokens,
        ...(r.tools
          ? {
              tools: JO_TOOLS.map((t) => ({ type: "function", function: t })),
              provider: { require_parameters: true },
            }
          : {}),
      },
    }),
    read: readRouter,
  },
};

const modelSchema = z
  .object({
    executable: z.string().max(1024).optional(),
    model: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[a-zA-Z0-9_.:/-]+$/),
    maxTokens: z.number().int().min(256).max(4096),
    inputPrice: z.number().min(0).max(10000).nullable(),
    outputPrice: z.number().min(0).max(10000).nullable(),
  })
  .passthrough();
export type ModelSettings = z.infer<typeof modelSchema>;
const preferencesSchema = z
  .object({
    schemaVersion: z.literal(1),
    selected: z.string(),
    models: z.record(z.string(), modelSchema),
  })
  .passthrough();
export type AiPreferences = z.infer<typeof preferencesSchema>;
export function readPreferences(raw: unknown): AiPreferences {
  const defaults = {
    schemaVersion: 1 as const,
    selected: "gemini",
    models: Object.fromEntries(
      Object.entries(BRAINS).map(([id, b]) => [
        id,
        {
          model: b.model,
          maxTokens: 1024,
          inputPrice: null,
          outputPrice: null,
        },
      ]),
    ),
  };
  if (raw == null) return defaults;
  const p = preferencesSchema.parse(raw);
  if (!Object.hasOwn(BRAINS, p.selected))
    throw new Error("Unknown AI provider. Choose one in Settings.");
  return { ...p, models: { ...defaults.models, ...p.models } };
}
export const useAi = create<{
  preferences: AiPreferences;
  loaded: boolean;
  load: () => Promise<void>;
  save: (p: AiPreferences) => Promise<void>;
}>((set) => ({
  preferences: readPreferences(null),
  loaded: false,
  load: async () => {
    const settings = await ipc.invoke<AppSettings>("settings_get");
    const providers = await ipc.invoke<ProviderInfo[]>("providers_list");
    useEngineStore.setState({
      keysPresent: Object.fromEntries(providers.map((p) => [p.id, p.hasKey])),
    });
    set({ preferences: readPreferences(settings.ai), loaded: true });
  },
  save: async (p) => {
    const preferences = readPreferences(p);
    const settings = await ipc.invoke<AppSettings>("settings_get");
    await ipc.invoke("settings_set", {
      settings: { ...settings, ai: preferences },
    });
    set({ preferences, loaded: true });
  },
}));

export function estimateRequest(
  input: BrainRequest,
  settings: ModelSettings,
): number | null {
  if (settings.inputPrice === null || settings.outputPrice === null)
    return null;
  // ponytail: chars/4 is an approximate text-token estimate, never a billing ceiling.
  const inputTokens = Math.ceil(
    (JSON.stringify(input).length +
      (input.tools ? JSON.stringify(JO_TOOLS).length : 0)) /
      4,
  );
  return (
    (inputTokens * settings.inputPrice +
      settings.maxTokens * settings.outputPrice) /
    1_000_000
  );
}
export async function askBrain(
  input: BrainRequest,
  preferences = useAi.getState().preferences,
): Promise<BrainReply> {
  const engine = useEngineStore.getState();
  if (engine.isPreview) throw new Error("AI requests require the desktop app.");
  const p = readPreferences(preferences);
  if (!BRAINS[p.selected].local && !engine.keysPresent[p.selected])
    throw new Error(`Add a ${BRAINS[p.selected].name} API key in Settings.`);
  if (JSON.stringify(input).length > 64_000)
    throw new Error(
      "This request is too long. Shorten the prompt or song notes.",
    );
  const settings = p.models[p.selected];
  if (BRAINS[p.selected].local) {
    const raw = await ipc.invoke("agent_request", {
      request: {
        provider: p.selected,
        model: settings.model,
        executable: settings.executable ?? "",
        prompt: JSON.stringify({
          instruction:
            "You are the user's studio assistant inside Jamstudio. Do not use shell, files or external tools. Return the requested structured envelope: reply and toolCalls. Each toolCall has name and argumentsJson, which is a JSON-encoded argument object. These are proposals, not actions already performed. Only use the supplied Jamstudio tools. If tools is empty, toolCalls must be empty and reply must contain the entire requested answer (including JSON when requested).",
          request: input,
          tools: input.tools ? JO_TOOLS : [],
        }),
      },
    });
    const result = readAgentReply(raw);
    if (!input.tools && result.toolCalls.length)
      throw new Error("Unexpected actions in an ideas-only response.");
    return result;
  }
  const wire = BRAINS[p.selected].request(input, settings);
  const response = await providerFetch({
    provider: p.selected,
    path: wire.path,
    headers: wire.headers,
    body: JSON.stringify(wire.body),
    model: settings.model,
    estimatedCostUsd: estimateRequest(input, settings),
  });
  if (response.status < 200 || response.status >= 300)
    throw new ProviderError(
      p.selected,
      response.status,
      summariseError(response.body),
    );
  const result = BRAINS[p.selected].read(JSON.parse(response.body));
  if (!input.tools && result.toolCalls.length)
    throw new Error("Unexpected actions in an ideas-only response.");
  return result;
}

function readAgentReply(raw: unknown): BrainReply {
  const value = z
    .object({
      reply: z.string().max(32000),
      toolCalls: z
        .array(
          z.object({ name: z.string(), argumentsJson: z.string().max(16000) }),
        )
        .max(8),
    })
    .parse(raw);
  return finalReply(
    value.reply,
    value.toolCalls.map((c) => ({
      name: c.name,
      arguments: argumentObject(c.argumentsJson),
    })),
  );
}
function readModelIds(raw: unknown): string[] {
  return z
    .object({ data: z.array(z.object({ id: z.string() })) })
    .parse(raw)
    .data.map((m) => m.id);
}
export async function listModels(provider: string): Promise<string[]> {
  const entry = BRAINS[provider];
  if (!entry?.catalog) return ["default"];
  const response = await providerFetch({
    provider,
    path: entry.catalog.path,
    method: "GET",
    headers: entry.catalog.headers ?? {},
  });
  if (response.status < 200 || response.status >= 300)
    throw new Error(summariseError(response.body));
  return entry.catalog.read(JSON.parse(response.body)).sort();
}
export function joRequest(
  history: JoMessage[],
  text: string,
  context: JoContext,
): BrainRequest {
  const r = buildRequest(history, text, context);
  return {
    system: r.systemInstruction.parts.map((p) => p.text ?? "").join("\n"),
    messages: r.contents.map((c) => ({
      role: c.role === "user" ? "user" : "assistant",
      content: c.parts.map((p) => p.text ?? "").join("\n"),
    })),
    tools: true,
  };
}
