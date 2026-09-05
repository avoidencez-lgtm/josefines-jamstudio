import { execSync } from "node:child_process";

/** Same allowlist as AGENTS.md invariant 9 / deny.toml `allow`. */
const ALLOWED = new Set([
  "Apache-2.0",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Zlib",
  "Unicode-3.0",
  "CC0-1.0",
]);

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

function allowedFor(pkg, token) {
  return ALLOWED.has(token) || (EXCEPTIONS[pkg] ?? []).includes(token);
}

function checkLicense(rawLicense, pkg) {
  const clean = rawLicense.replace(/[()]/g, "").trim();
  if (clean === "Unknown" || clean.length === 0) return false;
  if (clean.includes(" OR ")) {
    return clean.split(" OR ").some((part) => checkLicense(part.trim(), pkg));
  }
  if (clean.includes(" AND ")) {
    return clean.split(" AND ").every((part) => checkLicense(part.trim(), pkg));
  }
  return allowedFor(pkg, clean);
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

if (!licensesData || typeof licensesData !== "object") {
  console.error("JS licence check FAILED: pnpm reported no licence table.");
  process.exit(1);
}

let count = 0;
let hasBanned = false;
for (const [license, packages] of Object.entries(licensesData)) {
  if (!Array.isArray(packages)) continue;
  for (const pkg of packages) {
    count += 1;
    const name = pkg?.name ?? "";
    if (!checkLicense(license, name)) {
      console.error(`BANNED or unverified license: ${license}`);
      console.error(`  - ${name}@${pkg?.version ?? "?"} (${pkg?.path ?? ""})`);
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
