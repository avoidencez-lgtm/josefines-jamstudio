import defaultMap from "../../controls/default.json";
import { JO_TOOLS, validateToolCall } from "./jo/tools";
import { STAGE_ACTIONS } from "./stageActions";

export type ControlSource =
  | { kind: "key"; combo: string }
  | { kind: "midi_pc"; program: number }
  | { kind: "midi_cc"; cc: number; min?: number; max?: number };

export interface ControlBinding {
  source: ControlSource;
  action: string;
  args?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
}

export interface ControlMap {
  schemaVersion: number;
  id: string;
  name: string;
  bindings: ControlBinding[];
}

export function bindingArgs(binding: ControlBinding): Record<string, unknown> {
  return binding.args ?? binding.arguments ?? {};
}

/** Bundled Stage map. Unknown action ids fail; `ptt` is allowed. */
export function bundledControlMap(): ControlMap {
  return defaultMap as ControlMap;
}

export function validateControlMap(map: ControlMap): void {
  if (map.schemaVersion !== 1 || !map.id || !Array.isArray(map.bindings)) {
    throw new Error("Control map needs schemaVersion 1, an id and bindings.");
  }
  const known = new Set([...JO_TOOLS.map((t) => t.name), "ptt"]);
  for (const binding of map.bindings) {
    if (!known.has(binding.action)) {
      throw new Error(`Unknown control-map action ${binding.action}.`);
    }
    const src = binding.source;
    if (
      !src ||
      (src.kind !== "key" && src.kind !== "midi_pc" && src.kind !== "midi_cc")
    ) {
      throw new Error("Control-map source must be key, midi_pc or midi_cc.");
    }
    if (binding.action !== "ptt") {
      validateToolCall({
        name: binding.action,
        arguments: bindingArgs(binding),
      });
    }
  }
}

export function stageActionBinding(id: string): ControlBinding | undefined {
  const action = STAGE_ACTIONS.find((a) => a.id === id);
  if (!action) return undefined;
  return bundledControlMap().bindings.find(
    (b) =>
      b.action === action.tool &&
      JSON.stringify(bindingArgs(b)) === JSON.stringify(action.args),
  );
}
