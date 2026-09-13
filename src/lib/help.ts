import { z } from "zod";

export const WRITING_HELP = {
  compose: { label: "Compose", topic: "write.song-map-and-linked-sections" },
  lyrics: { label: "Lyrics", topic: "lyrics.write-words-against-the-music" },
  record: { label: "Record & layers", topic: "record.retrospective-capture" },
  finish: { label: "Finish", topic: "finish.review-what-needs-attention" },
  versions: {
    label: "Versions",
    topic: "versions.three-different-safety-nets",
  },
} as const;

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

export type StudioKeyRoute = "close-help" | "ignore" | "shortcuts";

/**
 * Escape closes help from anywhere while it is open. Musical shortcuts stay
 * suspended until help is dismissed. The close dialog still owns its own keys.
 */
export function routeStudioKey(
  e: { key: string; defaultPrevented: boolean },
  opts: { helpOpen: boolean; closeOpen: boolean },
): StudioKeyRoute {
  if (opts.closeOpen) return "ignore";
  if (opts.helpOpen) {
    if (e.key === "Escape" && !e.defaultPrevented) return "close-help";
    return "ignore";
  }
  return "shortcuts";
}
