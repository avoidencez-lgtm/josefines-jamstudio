import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toTauriEventName } from "../../src/ipc/client";
import { IPC_VERSION } from "../../src/ipc/contract";

describe("IPC Invariant", () => {
  it("locks IPC contract version (2 since ADR 0010 removed the M3/M4 placeholders)", () => {
    expect(IPC_VERSION).toBe(2);
  });

  it("maps controller.press onto the backend controller:press emit", () => {
    const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
    const controller = readFileSync("src/lib/controller.ts", "utf8");
    expect(controller).toContain('"controller.press"');
    expect(backend).toContain('emit("controller:press"');
    expect(toTauriEventName("controller.press")).toBe("controller:press");
  });
});
