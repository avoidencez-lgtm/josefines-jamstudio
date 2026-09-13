import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** ARCHITECTURE §9.3: no key-like strings in dist/. Also scan src so `pnpm test` is not a skip. */
const KEY_LIKE =
  /(?:sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|xai-[a-zA-Z0-9]{20,})/;
const TEXT = /\.(?:js|mjs|cjs|css|html|json|map|svg|txt|ts|tsx)$/;

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (TEXT.test(name)) files.push(p);
  }
  return files;
}

function hits(root: string): string[] {
  return walk(root).flatMap((file) =>
    KEY_LIKE.test(readFileSync(file, "utf8"))
      ? [path.relative(process.cwd(), file)]
      : [],
  );
}

describe("bundle-scan", () => {
  it("recognises a key-like token", () => {
    expect(KEY_LIKE.test(`sk-${"a".repeat(24)}`)).toBe(true);
    expect(KEY_LIKE.test("not-a-key")).toBe(false);
  });

  it("keeps key-like strings out of src and dist", () => {
    const found = hits(path.resolve("src"));
    if (existsSync(path.resolve("dist")))
      found.push(...hits(path.resolve("dist")));
    expect(found).toEqual([]);
  });

  it("keeps WebView audio APIs out of src except muted video in MusicVideo", () => {
    const banned = /<audio\b|new Audio\(|AudioContext|speechSynthesis/;
    const root = path.resolve("src");
    const found: string[] = [];
    for (const file of walk(root)) {
      if (!/\.(?:ts|tsx)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file).replaceAll("\\", "/");
      if (banned.test(text)) found.push(`${rel}: audio playback API`);
      if (/<video\b/.test(text)) {
        if (rel !== "src/screens/MusicVideo.tsx") found.push(`${rel}: <video>`);
        else if (!/<video\b[\s\S]*?\bmuted\b/.test(text))
          found.push(`${rel}: <video> is not muted`);
      }
    }
    expect(found).toEqual([]);
  });
});
