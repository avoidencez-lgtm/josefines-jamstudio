import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Chart } from "../../src/ipc/contract";
import { transposeChart } from "../../src/lib/chart/transpose";
import { JO_TOOLS, validateToolCall } from "../../src/lib/jo/tools";

const kinds = [
  "style",
  "chart",
  "rig",
  "control",
  "jo-tool",
  "provider",
] as const;
const bundled: Record<(typeof kinds)[number], string> = {
  style: "styles",
  chart: "charts",
  rig: "rigs",
  control: "controls",
  "jo-tool": "",
  provider: "",
};

function seam<T>(kind: (typeof kinds)[number]): T {
  const file = path.resolve("tests/fixtures/seams", `extending-${kind}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function bundledIds(folder: string): string[] {
  return fs
    .readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .map(
      (name) => JSON.parse(fs.readFileSync(path.join(folder, name), "utf8")).id,
    );
}

describe("extensibility recipes execute from fixtures", () => {
  it("keeps synthetic ids out of bundled registries", () => {
    const found = new Set<string>();
    for (const kind of kinds) {
      const data = seam<{
        schemaVersion: number;
        id: string;
        name: string;
        kind: string;
      }>(kind);
      expect(data.schemaVersion).toBe(1);
      expect(data.id).toBeTruthy();
      expect(data.kind).toBe(kind);
      found.add(data.kind);
      const folder = bundled[kind];
      if (folder) expect(bundledIds(folder)).not.toContain(data.id);
    }
    expect([...found].sort()).toEqual([...kinds].sort());
  });

  it("transposes the fixture chart through twelve keys", () => {
    const chart = seam<Chart & { kind: string }>("chart");
    expect(chart.sections[0].bars).toHaveLength(4);
    const roots = new Set<number>();
    for (let semitone = 0; semitone < 12; semitone++) {
      const moved = transposeChart(chart, semitone);
      roots.add(moved.keyTonic);
      expect(moved.sections[0].bars[0][0].chord).toBeTruthy();
    }
    expect(roots.size).toBe(12);
    expect(transposeChart(chart, 2).sections[0].bars[0][0].chord).toBe("D");
  });

  it("validates the fixture control map against Jo tools", () => {
    const map = seam<{
      bindings: { action: string; arguments: Record<string, unknown> }[];
    }>("control");
    const known = new Set([...JO_TOOLS.map((tool) => tool.name), "ptt"]);
    for (const binding of map.bindings) {
      expect(known.has(binding.action)).toBe(true);
      if (binding.action !== "ptt") {
        validateToolCall({
          name: binding.action,
          arguments: binding.arguments,
        });
      }
    }
    expect(
      validateToolCall.bind(null, {
        name: "not_a_real_tool",
        arguments: {},
      }),
    ).toThrow(/Unknown/);
  });

  it("runs the fixture Jo tool without adding it to JO_TOOLS", async () => {
    const tool = seam<{
      declaration: { name: string };
      say: string;
    }>("jo-tool");
    expect(JO_TOOLS.some((entry) => entry.name === tool.declaration.name)).toBe(
      false,
    );
    const words = tool.say.trim().split(/\s+/);
    expect(words.length).toBeGreaterThan(0);
    expect(words.length).toBeLessThanOrEqual(12);
    const run = async () => tool.say;
    expect(await run()).toBe("Fixture tip ready.");
  });

  it("refuses the fixture provider until it is on the allow-list", () => {
    const provider = seam<{ id: string; baseUrl: string }>("provider");
    expect(provider.baseUrl.startsWith("https://")).toBe(true);
    const allow = fs.readFileSync("src-tauri/src/net.rs", "utf8");
    expect(allow).not.toContain(`id: "${provider.id}"`);
  });
});
