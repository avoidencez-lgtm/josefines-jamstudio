import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toTauriEventName } from "../../src/ipc/client";
import { IPC_VERSION } from "../../src/ipc/contract";

describe("IPC Invariant", () => {
  it("locks IPC contract version (2 since ADR 0010 removed the M3/M4 placeholders)", () => {
    expect(IPC_VERSION).toBe(2);
  });

  it("keeps the Rust IPC_VERSION constant equal to the TypeScript export", () => {
    const rust = readFileSync("src-tauri/src/lib.rs", "utf8");
    const match = rust.match(/pub const IPC_VERSION:\s*u32\s*=\s*(\d+)\s*;/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(IPC_VERSION);
  });

  it("maps controller.press onto the backend controller:press emit", () => {
    const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
    const controller = readFileSync("src/lib/controller.ts", "utf8");
    expect(controller).toContain('"controller.press"');
    expect(backend).toContain('emit("controller:press"');
    expect(toTauriEventName("controller.press")).toBe("controller:press");
  });

  it("maps rig.state onto the backend rig:state emit", () => {
    const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
    const engine = readFileSync("src/store/engine.ts", "utf8");
    expect(engine).toContain('"rig.state"');
    expect(backend).toContain('emit("rig:state"');
    expect(toTauriEventName("rig.state")).toBe("rig:state");
  });
});
