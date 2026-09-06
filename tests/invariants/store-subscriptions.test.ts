import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

it("no React hook subscribes to the whole engine store", () => {
  const files = walk("src").filter((p) => /\.(ts|tsx)$/.test(p));
  const hits = files.flatMap((path) =>
    readFileSync(path, "utf8").includes("useEngineStore()") ? [path] : [],
  );
  expect(hits).toEqual([]);
});

it("no React hook subscribes to the whole writing store", () => {
  const files = walk("src").filter((p) => /\.(ts|tsx)$/.test(p));
  const hits = files.flatMap((path) =>
    readFileSync(path, "utf8").includes("useWriting()") ? [path] : [],
  );
  expect(hits).toEqual([]);
});

it("only live surfaces subscribe to the whole telemetry object", () => {
  const allowed = new Set([
    "src/screens/Stage.tsx",
    "src/components/TransportBar.tsx",
  ]);
  const hits = walk("src")
    .filter((p) => /\.(ts|tsx)$/.test(p))
    .filter((path) => {
      const rel = path.replaceAll("\\", "/");
      return (
        !allowed.has(rel) &&
        readFileSync(path, "utf8").includes("telemetry: s.telemetry")
      );
    });
  expect(hits).toEqual([]);
});
