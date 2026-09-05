import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../docs/guide/", import.meta.url);
const manual = JSON.parse(readFileSync(new URL("manual.json", root), "utf8"));
for (const language of ["en", "nb"]) {
  const title =
    language === "en"
      ? "Josefines Jamstudio — user manual"
      : "Josefines Jamstudio — brukerhåndbok";
  let text = `# ${title}\n\n${manual.chapters
    .map(
      (c) =>
        `## ${c.title[language]}\n\n${c.sections
          .map((s) => `### ${s.title[language]}\n\n${s.text[language]}\n`)
          .join("\n")}`,
    )
    .join("\n")}`;
  const shortcuts = language === "en" ? manual.shortcutsEn : manual.shortcutsNb;
  text += `\n## ${language === "en" ? "Keyboard shortcuts" : "Hurtigtaster"}\n\n${Object.entries(
    shortcuts,
  )
    .map(([key, description]) => `- **${key}**: ${description}`)
    .join("\n")}\n`;
  const target = new URL(`manual-${language}.md`, root);
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== text)
      throw new Error(
        `Regenerate manual-${language}.md with node scripts/export-manual.mjs`,
      );
  } else writeFileSync(target, text, "utf8");
}
