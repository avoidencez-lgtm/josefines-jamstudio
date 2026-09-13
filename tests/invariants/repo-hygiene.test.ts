import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = {
  contributing: "CONTRIBUTING.md",
  security: "SECURITY.md",
  codeowners: ".github/CODEOWNERS",
  prTemplate: ".github/PULL_REQUEST_TEMPLATE.md",
  toolchain: "rust-toolchain.toml",
  envExample: ".env.example",
  changelog: "CHANGELOG.md",
};

const issueTemplates = [
  ".github/ISSUE_TEMPLATE/bug.yml",
  ".github/ISSUE_TEMPLATE/feature.yml",
  ".github/ISSUE_TEMPLATE/owner-gate.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
];

const secretLine = /sk-|AIza|api[_-]?key\s*=\s*\S+/i;

describe("repo hygiene", () => {
  it("ships contributing, security, owners, templates, toolchain and changelog from disk", () => {
    const contributing = readFileSync(files.contributing, "utf8");
    expect(contributing).toContain("AGENTS.md");
    expect(contributing).toContain("corepack pnpm lint");

    const security = readFileSync(files.security, "utf8");
    expect(security).toMatch(/keychain/i);
    expect(security).toMatch(/request bodies are never logged/i);

    const codeowners = readFileSync(files.codeowners, "utf8");
    expect(codeowners).toContain("docs/adr");
    expect(codeowners).toContain("deny.toml");

    expect(readFileSync(files.prTemplate, "utf8").length).toBeGreaterThan(0);
    expect(readFileSync(files.changelog, "utf8")).toMatch(/unreleased/i);

    const envExample = readFileSync(files.envExample, "utf8");
    for (const line of envExample.split(/\r?\n/)) {
      expect(line, line).not.toMatch(secretLine);
    }
    expect(envExample).toMatch(/keychain/i);

    const toolchain = readFileSync(files.toolchain, "utf8");
    expect(toolchain).toContain('channel = "stable"');
    expect(toolchain).toContain("rustfmt");
    expect(toolchain).toContain("clippy");
    expect(readFileSync("Cargo.toml", "utf8")).toContain('rust-version = "1.88"');
  });

  it("ships GitHub issue templates", () => {
    for (const path of issueTemplates) {
      expect(existsSync(path), path).toBe(true);
    }
  });
});
