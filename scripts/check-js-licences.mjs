import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import satisfies from "spdx-satisfies";

/** Base policy from AGENTS.md invariant 9; JS package exceptions are below. */
const ALLOWED = [
  "Apache-2.0",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Zlib",
  "Unicode-3.0",
  "CC0-1.0",
];

/**
 * Recorded exceptions (invariant 9). Names include optional platform packages
 * so Windows/macOS CI sees the same rule as Linux.
 */
const EXCEPTIONS = {
  lightningcss: ["MPL-2.0"],
  "lightningcss-win32-x64-msvc": ["MPL-2.0"],
  "lightningcss-darwin-x64": ["MPL-2.0"],
  "lightningcss-darwin-arm64": ["MPL-2.0"],
  "lightningcss-linux-x64-gnu": ["MPL-2.0"],
  "lightningcss-linux-arm64-gnu": ["MPL-2.0"],
  "caniuse-lite": ["CC-BY-4.0"],
  "spdx-exceptions": ["CC-BY-3.0"],
  "spdx-ranges": ["CC-BY-3.0"],
};

const MIN_PACKAGES = 50;

function checkLicense(rawLicense, pkg) {
  const exceptions = Object.hasOwn(EXCEPTIONS, pkg) ? EXCEPTIONS[pkg] : [];
  try {
    return satisfies(rawLicense, [...ALLOWED, ...exceptions].join(" OR "));
  } catch {
    return false; // Invalid or unknown SPDX expressions are unverified.
  }
}

console.log("Checking JavaScript package licenses against allowlist...");

let output;
try {
  output = execSync("pnpm licenses list --json", { encoding: "utf8" });
} catch (err) {
  console.error("pnpm licenses list failed.");
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
}

let licensesData;
try {
  licensesData = JSON.parse(output);
} catch (err) {
  console.error("Failed to parse pnpm licenses output:", err.message);
  process.exit(1);
}

if (
  !licensesData ||
  typeof licensesData !== "object" ||
  Array.isArray(licensesData)
) {
  console.error("JS licence check FAILED: pnpm reported no licence table.");
  process.exit(1);
}

let count = 0;
let hasBanned = false;
for (const [license, packages] of Object.entries(licensesData)) {
  if (!Array.isArray(packages)) {
    console.error(
      `JS licence check FAILED: invalid package list for ${license}.`,
    );
    process.exit(1);
  }
  for (const pkg of packages) {
    if (
      !pkg ||
      typeof pkg !== "object" ||
      Array.isArray(pkg) ||
      typeof pkg.name !== "string" ||
      !pkg.name.trim() ||
      !Array.isArray(pkg.versions) ||
      pkg.versions.length === 0 ||
      !pkg.versions.every(
        (version) => typeof version === "string" && version.trim(),
      )
    ) {
      console.error(
        `JS licence check FAILED: invalid package record for ${license}.`,
      );
      process.exit(1);
    }
    count += 1;
    const name = pkg.name;
    if (!checkLicense(license, name)) {
      console.error(`BANNED or unverified license: ${license}`);
      console.error(`  - ${name}@${pkg.versions.join(", ")}`);
      hasBanned = true;
    }
  }
}

if (count < MIN_PACKAGES) {
  console.error(
    `JS licence check FAILED: saw ${count} packages, expected at least ${MIN_PACKAGES} (pnpm likely failed or reported nothing).`,
  );
  process.exit(1);
}

if (hasBanned) {
  console.error("JS licence check FAILED: Disallowed dependencies found.");
  process.exit(1);
}

console.log(`JS licence check PASSED: ${count} packages adhere to allowlist.`);

// Vendored C++ is outside Cargo's inventory; verify the reviewed files as well.
const vendor = new URL("../crates/jam-dsp/cxx/vendor/", import.meta.url);
const sources = JSON.parse(
  readFileSync(new URL("sources.json", vendor), "utf8"),
);
for (const source of sources) {
  if (!checkLicense(source.license, source.name))
    throw new Error(`Unapproved native vendor licence: ${source.name}`);
  for (const [file, expected] of Object.entries(source.files)) {
    const actual = createHash("sha256")
      .update(readFileSync(new URL(file, vendor)))
      .digest("hex");
    if (actual !== expected)
      throw new Error(`Native vendor hash mismatch: ${file}`);
  }
}
console.log("Native vendor licence and SHA-256 checks PASSED.");
