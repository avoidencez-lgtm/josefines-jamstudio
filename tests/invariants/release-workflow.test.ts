import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("release workflow", () => {
  it("requires green main CI and attaches checksums after every tag build", () => {
    const workflow = fs.readFileSync(".github/workflows/release.yml", "utf8");

    expect(workflow).toContain("--event push --status success");
    expect(workflow).toContain("needs: verify");
    expect(workflow).toContain("needs: build");
    expect(workflow).toContain("generateReleaseNotes: true");
    expect(workflow).toContain("SHA256SUMS.txt");
    expect(workflow).toContain("test -s ../SHA256SUMS.txt");
  });
});
