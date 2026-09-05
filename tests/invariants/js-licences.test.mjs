import { execSync } from "node:child_process";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execSync: vi.fn() }));

const packages = Array.from({ length: 50 }, (_, i) => ({
  name: `package-${i}`,
  versions: ["1.0.0"],
}));

beforeEach(() => {
  vi.resetModules();
  vi.mocked(execSync).mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit ${code}`);
  });
});
afterEach(() => vi.restoreAllMocks());

it.each([
  [
    "mandatory GPL conjunct",
    { "(MIT OR GPL-3.0-only) AND GPL-3.0-only": packages },
  ],
  ["malformed group beside valid packages", { MIT: packages, ISC: {} }],
  ["null package records", { MIT: Array(50).fill(null) }],
  ["missing version", { MIT: packages.map(({ name }) => ({ name })) }],
  ["empty versions", { MIT: packages.map((p) => ({ ...p, versions: [] })) }],
  [
    "malformed version",
    { MIT: packages.map((p) => ({ ...p, versions: [null] })) },
  ],
  ["blank name", { MIT: packages.map((p) => ({ ...p, name: " " })) }],
  ["empty output table", {}],
  ["array instead of table", []],
  ["null instead of table", null],
  ["unexpectedly incomplete inventory", { MIT: packages.slice(0, 1) }],
  ["invalid SPDX", { "MIT OR (": packages }],
  ["unknown licence", { Unknown: packages }],
  ["unrecorded SPDX exception", { "MIT WITH LLVM-exception": packages }],
  ["exception for the wrong package", { "MPL-2.0": packages }],
])("fails closed for %s", async (_name, table) => {
  vi.mocked(execSync).mockReturnValue(JSON.stringify(table));
  await expect(import("../../scripts/check-js-licences.mjs")).rejects.toThrow(
    "exit 1",
  );
  expect(console.log).not.toHaveBeenCalledWith(
    expect.stringContaining("PASSED"),
  );
});

it.each(["", "not json"])(
  "rejects malformed command output %j",
  async (output) => {
    vi.mocked(execSync).mockReturnValue(output);
    await expect(import("../../scripts/check-js-licences.mjs")).rejects.toThrow(
      "exit 1",
    );
  },
);

it("fails when pnpm exits unsuccessfully", async () => {
  vi.mocked(execSync).mockImplementation(() => {
    throw new Error("pnpm unavailable");
  });
  await expect(import("../../scripts/check-js-licences.mjs")).rejects.toThrow(
    "exit 1",
  );
});

it("accepts compound permitted choices and only the recorded package exceptions", async () => {
  vi.mocked(execSync).mockReturnValue(
    JSON.stringify({
      "(MIT OR GPL-3.0-only) AND ISC": packages,
      "MPL-2.0": [{ name: "lightningcss", versions: ["1.0.0"] }],
      "CC-BY-4.0": [{ name: "caniuse-lite", versions: ["1.0.0"] }],
      "CC-BY-3.0": [{ name: "spdx-exceptions", versions: ["1.0.0"] }],
    }),
  );
  await import("../../scripts/check-js-licences.mjs");
  expect(process.exit).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining("PASSED: 53 packages"),
  );
});
