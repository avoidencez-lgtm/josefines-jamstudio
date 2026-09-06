import { ZodError, type ZodType } from "zod";

/** Field-specific next steps for Zod paths the UI actually edits. */
const FIELD_HINTS: Record<string, string> = {
  maxTokens: "Set Maximum output tokens between 256 and 4096, then save.",
  model: "Enter a model ID using letters, numbers, and . : / - _ only.",
  inputPrice:
    "Enter an input price of 0–10000 USD per million tokens, or leave it blank.",
  outputPrice:
    "Enter an output price of 0–10000 USD per million tokens, or leave it blank.",
  executable: "Shorten the agent executable path to 1024 characters or fewer.",
  schemaVersion:
    "AI settings must be schema version 1. Open Settings and save again.",
  selected: "Choose an AI provider in Settings.",
  title: "Give the title 1–100 characters.",
  prompt: "Write a prompt of 1–3000 characters.",
  summary: "Keep the summary between 1 and 1500 characters.",
  chords: "Keep the chord line under 2000 characters.",
  notes: "Keep notes under 6000 characters.",
  finding: "Each coach finding must be 1–1500 characters.",
  experiment: "Each coach experiment must be 1–1000 characters.",
};

function explainZod(error: ZodError): string {
  const hints = [
    ...new Set(
      error.issues.map((issue) => {
        const key = [...issue.path]
          .reverse()
          .find((part): part is string => typeof part === "string");
        return (key && FIELD_HINTS[key]) || "";
      }),
    ),
  ].filter(Boolean);
  if (hints.length) return hints.join(" ");
  return "A value is outside the allowed range. Check the field and try again.";
}

/** One sentence the guitarist can act on. Never a Zod or Syntax dump. */
export function userFacingError(error: unknown): string {
  if (error instanceof ZodError) return explainZod(error);
  if (error instanceof SyntaxError)
    return "That text is not valid JSON. Check the brackets and quotes, then try again.";
  if (error instanceof Error) {
    const text = error.message.replace(/^Error:\s*/, "").trim();
    return text || "Something failed. Check the field and try again.";
  }
  const text = String(error)
    .replace(/^Error:\s*/, "")
    .trim();
  return text || "Something failed. Check the field and try again.";
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(userFacingError(error));
  }
}

export function parseSchema<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new Error(userFacingError(error));
  }
}
