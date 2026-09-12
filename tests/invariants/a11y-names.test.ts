import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function readTag(
  source: string,
  start: number,
): { attrs: string; end: number } | null {
  if (source[start] !== "<") return null;
  let i = start + 1;
  let depth = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") i += 2;
      else {
        if (ch === quote) quote = null;
        i += 1;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === ">" && depth === 0)
      return { attrs: source.slice(start, i + 1), end: i + 1 };
    i += 1;
  }
  return null;
}

function namedInAttrs(attrs: string): boolean {
  return /aria-label=|aria-labelledby=/.test(attrs);
}

function visibleName(body: string): boolean {
  const withoutTags = body.replace(/<[^>]+>/g, " ");
  if (/["'`][^"'`\n]{1,80}["'`]/.test(withoutTags)) return true;
  const raw = withoutTags.replace(/\{([\s\S]*?)\}/g, (_, expr) =>
    /^[A-Za-z][A-Za-z0-9.]*$/.test(expr.trim()) ? " X " : " ",
  );
  return /[A-Za-z0-9]/.test(raw);
}

function wrappedBy(before: string, open: RegExp, close: string): boolean {
  const parts = before.split(open);
  if (parts.length < 2) return false;
  return !parts[parts.length - 1].includes(close);
}

/** DESIGN §9: every chrome control has an accessible name. */
function unlabeledChrome(path: string, source: string): string[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const hits: string[] = [];
  if (path.endsWith("Button.tsx")) return hits;

  for (const found of text.matchAll(
    /<(button|Button|input|select|textarea)\b/g,
  )) {
    const tag = readTag(text, found.index ?? 0);
    if (!tag) continue;
    const name = found[1];
    const selfClose =
      /\/\s*>$/.test(tag.attrs) || (name !== "button" && name !== "Button");
    let body = "";
    if (!selfClose) {
      const close = text.indexOf(`</${name}>`, tag.end);
      if (close < 0) continue;
      body = text.slice(tag.end, close);
    }
    if (namedInAttrs(tag.attrs)) continue;
    const snippet = `${tag.attrs}${body.slice(0, 48)}`
      .replace(/\s+/g, " ")
      .slice(0, 120);
    if (name === "button" || name === "Button") {
      if (visibleName(body)) continue;
      hits.push(`${path}: unnamed ${name} ${snippet}`);
      continue;
    }
    if (/type="hidden"/.test(tag.attrs)) continue;
    const before = text.slice(
      Math.max(0, (found.index ?? 0) - 800),
      found.index,
    );
    if (wrappedBy(before, /<label[\s>]/, "</label>")) continue;
    if (wrappedBy(before, /<Field\b/, "</Field>")) continue;
    if (/\bid=/.test(tag.attrs) && text.includes("htmlFor")) continue;
    hits.push(`${path}: unnamed ${name} ${snippet}`);
  }
  return hits;
}

it("flags icon-only chrome and bare fields", () => {
  expect(
    unlabeledChrome(
      "x.tsx",
      '<button type="button"><Icon weight="fill" /></button>',
    ),
  ).toEqual([expect.stringContaining("unnamed button")]);
  expect(
    unlabeledChrome(
      "x.tsx",
      '<button type="button" aria-label="Play"><Icon weight="fill" /></button>',
    ),
  ).toEqual([]);
  expect(unlabeledChrome("x.tsx", "<Button>Save</Button>")).toEqual([]);
  expect(
    unlabeledChrome("x.tsx", "<label>Name<input value={x} /></label>"),
  ).toEqual([]);
  expect(unlabeledChrome("x.tsx", "<input value={x} />")).toEqual([
    expect.stringContaining("unnamed input"),
  ]);
});

it("chrome buttons and fields have an accessible name", () => {
  const hits = walk("src")
    .filter((path) => path.endsWith(".tsx"))
    .flatMap((path) => unlabeledChrome(path, readFileSync(path, "utf8")));
  expect(hits).toEqual([]);
});

it("room-tool Status success strings are sentences with a next step", () => {
  const next =
    /Play|Save|Undo|Review|Listen|Check|Edit|Choose|Open|Apply|Use|Verify|Press|Generate|Send|Enable/;
  const hits = walk("src/components/tools")
    .filter((path) => path.endsWith(".tsx"))
    .flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return [...text.matchAll(/return "([^"]+)"/g)].flatMap((m) => {
        const s = m[1];
        const bad: string[] = [];
        if (s.includes("!") || s.includes("\u2014") || !s.endsWith(".")) {
          bad.push(`${path}: ${s}`);
        }
        if (/\b(ready|preview|cued)\b/i.test(s) && !next.test(s)) {
          bad.push(`${path}: no next step: ${s}`);
        }
        return bad;
      });
    });
  expect(hits).toEqual([]);
});
