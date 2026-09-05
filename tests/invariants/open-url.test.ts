import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("desktop opener", () => {
  it("has no target=_blank leftovers in src", () => {
    const root = path.resolve(process.cwd(), "src");
    const hits = walk(root).flatMap((file) => {
      const text = fs.readFileSync(file, "utf8");
      return text.includes('target="_blank"') ||
        text.includes("target={'_blank'}")
        ? [path.relative(root, file)]
        : [];
    });
    expect(hits).toEqual([]);
  });
});
