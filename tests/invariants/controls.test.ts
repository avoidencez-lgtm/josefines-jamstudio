import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  bundledControlMap,
  stageActionBinding,
  validateControlMap,
} from "../../src/lib/controls";
import { JO_TOOLS, validateToolCall } from "../../src/lib/jo/tools";
import { SHORTCUTS } from "../../src/lib/shortcuts";
import { STAGE_ACTIONS } from "../../src/lib/stageActions";

it("validates bundled control maps against Jo tools", () => {
  const map = bundledControlMap();
  expect(map.id).toBe("default");
  validateControlMap(map);
  const disk = JSON.parse(readFileSync("controls/default.json", "utf8"));
  expect(disk.bindings).toHaveLength(map.bindings.length);
});

it("keeps every Stage action on a shortcut, Jo tool and default control-map binding", () => {
  const shortcutText = SHORTCUTS.map((s) => s.description).join(" ");
  const tools = new Set(JO_TOOLS.map((t) => t.name));
  for (const action of STAGE_ACTIONS) {
    expect(shortcutText, action.id).toContain(action.shortcut);
    expect(tools.has(action.tool), action.id).toBe(true);
    validateToolCall({ name: action.tool, arguments: action.args });
    expect(stageActionBinding(action.id), action.id).toBeTruthy();
  }
});

it("refuses an unknown control-map action", () => {
  expect(() =>
    validateControlMap({
      schemaVersion: 1,
      id: "bad",
      name: "Bad",
      bindings: [
        {
          source: { kind: "key", combo: "KeyX" },
          action: "not_a_real_tool",
          args: {},
        },
      ],
    }),
  ).toThrow(/Unknown control-map action/);
});
