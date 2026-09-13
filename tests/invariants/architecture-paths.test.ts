import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ARCHITECTURE = path.join(ROOT, "docs", "ARCHITECTURE.md");

function section3(markdown: string): string {
  const start = markdown.search(/^## 3\. Repository layout\s*$/m);
  expect(start, "ARCHITECTURE.md §3 heading").toBeGreaterThanOrEqual(0);
  const from = markdown.slice(start);
  const endRel = from.slice(1).search(/^## /m);
  return endRel < 0 ? from : from.slice(0, endRel + 1);
}

function citedPaths(section: string): string[] {
  const fences = [...section.matchAll(/```(?:[\w-]+)?\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
  expect(fences.length, "§3 layout fence").toBeGreaterThan(0);
  const found = new Set<string>();
  for (const line of fences.join("\n").split(/\r?\n/)) {
    const body = line.split(/\s{2,}/)[0]?.trim() ?? "";
    if (!body || body.startsWith("#")) continue;
    for (const raw of body.split(/[\s,]+/)) {
      const token = raw.replace(/^`+|`+$/g, "").replace(/[()]/g, "");
      if (
        !token ||
        token === "josefines-jamstudio" ||
        token === "josefines-jamstudio/"
      ) {
        continue;
      }
      if (token.includes("{")) continue;
      if (token.includes("/") || /\.\w[\w.-]*$/.test(token)) {
        found.add(token.replace(/\/$/, ""));
      }
    }
  }
  return [...found];
}

describe("ARCHITECTURE.md §3 paths", () => {
  it("cites only paths that exist on disk", () => {
    const markdown = readFileSync(ARCHITECTURE, "utf8");
    const paths = citedPaths(section3(markdown));
    expect(paths.length).toBeGreaterThan(20);
    for (const rel of paths) {
      expect(existsSync(path.join(ROOT, rel)), rel).toBe(true);
    }
  });
});
