import { z } from "zod";

export const WRITING_HELP = {
  compose: { label: "This is Compose.", topic: "write.song-map-and-linked-sections" },
  lyrics: { label: "This is Lyrics.", topic: "lyrics.write-words-against-the-music" },
  record: { label: "This is Record & layers.", topic: "record.retrospective-capture" },
  finish: { label: "This is Finish.", topic: "finish.review-what-needs-attention" },
  versions: {
    label: "This is Versions.",
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
