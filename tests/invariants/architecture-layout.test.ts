import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Paths listed in ARCHITECTURE §3. One token per line; comments follow two spaces. */
function layoutBlock(markdown: string): string {
  const heading = markdown.indexOf("## 3. Repository layout");
  if (heading < 0) throw new Error("ARCHITECTURE.md is missing §3.");
  const after = markdown.slice(heading);
  const start = after.indexOf("```");
  if (start < 0) throw new Error("ARCHITECTURE §3 is missing a fenced tree.");
  const opened = after.slice(start + 3);
  const nl = opened.indexOf("\n");
  const body = opened.slice(nl + 1);
  const end = body.indexOf("```");
  if (end < 0) throw new Error("ARCHITECTURE §3 fence is unclosed.");
  return body.slice(0, end);
}

function mentionedPaths(block: string): string[] {
  const paths: string[] = [];
  const stack: { indent: number; dir: string }[] = [];
  for (const raw of block.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = raw.search(/\S/);
    let rest = raw.trim();
    const commented = rest.match(/^(\S+)(\s{2,}.*)$/);
    if (commented) rest = commented[1];
    rest = rest.replace(/\s*\([^)]*\)\s*$/, "");
    if (!rest || rest === "josefines-jamstudio/") continue;
    if (/[,{]/.test(rest)) {
      throw new Error(`ARCHITECTURE §3 token must be one path: ${raw.trim()}`);
    }
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack.at(-1)?.dir ?? "";
    const isDir = rest.endsWith("/");
    const name = rest.replace(/\/$/, "");
    if (!name || name.includes(" ")) {
      throw new Error(`ARCHITECTURE §3 token is empty: ${raw.trim()}`);
    }
    const full = parent ? `${parent}/${name}` : name;
    paths.push(isDir ? `${full}/` : full);
    if (isDir) stack.push({ indent, dir: full });
  }
  return paths;
}

describe("ARCHITECTURE §3 layout", () => {
  it("parses a nested tree into repo-relative paths", () => {
    expect(
      mentionedPaths(`
crates/
  jam-core/          types
src-tauri/
  src/
    main.rs
`),
    ).toEqual([
      "crates/",
      "crates/jam-core/",
      "src-tauri/",
      "src-tauri/src/",
      "src-tauri/src/main.rs",
    ]);
  });

  it("refuses brace or comma lists so missing files cannot hide", () => {
    expect(() => mentionedPaths("media/{songs,stems}.rs\n")).toThrow(
      /one path/,
    );
  });

  it("every listed path exists on disk", () => {
    const markdown = readFileSync("docs/ARCHITECTURE.md", "utf8");
    const listed = mentionedPaths(layoutBlock(markdown));
    expect(listed.length).toBeGreaterThan(20);
    const missing: string[] = [];
    for (const listedPath of listed) {
      const wantDir = listedPath.endsWith("/");
      const rel = listedPath.replace(/\/$/, "");
      const abs = path.resolve(rel);
      if (!existsSync(abs)) {
        missing.push(`${listedPath} (missing)`);
        continue;
      }
      const st = statSync(abs);
      if (wantDir && !st.isDirectory())
        missing.push(`${listedPath} (not a directory)`);
      if (!wantDir && !st.isFile()) missing.push(`${listedPath} (not a file)`);
    }
    expect(missing).toEqual([]);
  });
});
