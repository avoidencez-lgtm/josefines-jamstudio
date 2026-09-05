import { z } from "zod";

/** The two languages the in-app manual is maintained in (ADR 0009). */
export const HELP_LANGUAGES = ["en", "nb"] as const;
export type HelpLanguage = (typeof HELP_LANGUAGES)[number];
export const helpLanguageSchema = z.enum(HELP_LANGUAGES);

/** The saved manual language; English until the reader chooses otherwise. */
export function readHelpLanguage(
  settings: Record<string, unknown> | null | undefined,
): HelpLanguage {
  const parsed = helpLanguageSchema.safeParse(settings?.helpLanguage);
  return parsed.success ? parsed.data : "en";
}
