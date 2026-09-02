import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Seam Manifest Invariants", () => {
  const checkDir = (dirName: string) => {
    const dir = path.resolve(process.cwd(), dirName);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const content = fs.readFileSync(fullPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed).toHaveProperty("schemaVersion");
      expect(typeof parsed.schemaVersion).toBe("number");
      expect(parsed.schemaVersion).toBeGreaterThanOrEqual(1);

      expect(parsed).toHaveProperty("id");
      expect(typeof parsed.id).toBe("string");
      expect(parsed.id.length).toBeGreaterThan(0);

      expect(parsed).toHaveProperty("name");
      expect(typeof parsed.name).toBe("string");
    }
  };

  it("validates all style manifests", () => {
    checkDir("styles");
  });

  it("validates all chart manifests", () => {
    checkDir("charts");
  });

  it("validates all rig manifests", () => {
    checkDir("rigs");
  });

  it("validates all control manifests", () => {
    checkDir("controls");
  });
});
