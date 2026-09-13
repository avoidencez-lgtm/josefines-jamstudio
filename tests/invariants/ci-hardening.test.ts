import fs from "node:fs";
import { describe, expect, it } from "vitest";

const workflows = [
  ".github/workflows/ci.yml",
  ".github/workflows/dependency-audit.yml",
  ".github/workflows/release.yml",
];

describe("CI hardening", () => {
  it("pins every third-party action to a commit", () => {
    for (const path of workflows) {
      const workflow = fs.readFileSync(path, "utf8");
      const refs = [...workflow.matchAll(/\buses:\s+[^@\s]+@([^\s#]+)/g)].map(
        ([, ref]) => ref,
      );

      expect(refs.length, path).toBeGreaterThan(0);
      for (const ref of refs) expect(ref, path).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("cancels superseded CI and checks the declared Rust version", () => {
    const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain('toolchain: "1.88"');
    expect(workflow).toContain(
      "cargo check --workspace --all-targets --locked",
    );
    expect(workflow.match(/timeout-minutes:/g)?.length).toBe(5);
  });

  it("ships CSP form-action none and only the two event capabilities", () => {
    const conf = JSON.parse(
      fs.readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ) as {
      app: { security: { csp: string; devCsp: string } };
    };
    expect(conf.app.security.csp).toMatch(/form-action 'none'/);
    expect(conf.app.security.devCsp).toMatch(/form-action 'none'/);

    const files = fs
      .readdirSync("src-tauri/capabilities")
      .filter((name) => name.endsWith(".json"))
      .sort();
    expect(files).toEqual(["default.json"]);
    const caps = JSON.parse(
      fs.readFileSync("src-tauri/capabilities/default.json", "utf8"),
    ) as { permissions: string[] };
    expect(caps.permissions).toEqual([
      "core:event:allow-listen",
      "core:event:allow-unlisten",
    ]);
  });

  it("registers the single-instance plugin without widening capabilities", () => {
    expect(fs.readFileSync("src-tauri/Cargo.toml", "utf8")).toContain(
      "tauri-plugin-single-instance",
    );
    expect(fs.readFileSync("src-tauri/src/lib.rs", "utf8")).toContain(
      "single_instance",
    );
  });

  it("schedules dependency audits and configures all package ecosystems", () => {
    const audit = fs.readFileSync(
      ".github/workflows/dependency-audit.yml",
      "utf8",
    );
    const dependabot = fs.readFileSync(".github/dependabot.yml", "utf8");

    expect(audit).toContain("cargo deny check advisories");
    expect(audit).toContain("pnpm audit --prod --audit-level high");
    for (const ecosystem of ["cargo", "npm", "github-actions"])
      expect(dependabot).toContain(`package-ecosystem: "${ecosystem}"`);
  });
});
