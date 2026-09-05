import { describe, expect, it } from "vitest";
import { IPC_VERSION } from "../../src/ipc/contract";

describe("IPC Invariant", () => {
  it("locks IPC contract version (2 since ADR 0010 removed the M3/M4 placeholders)", () => {
    expect(IPC_VERSION).toBe(2);
  });
});
