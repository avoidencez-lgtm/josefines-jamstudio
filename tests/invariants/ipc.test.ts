import { describe, expect, it } from "vitest";
import { IPC_VERSION } from "../../src/ipc/contract";

describe("IPC Invariant", () => {
  it("locks IPC contract version", () => {
    expect(IPC_VERSION).toBe(1);
  });
});
