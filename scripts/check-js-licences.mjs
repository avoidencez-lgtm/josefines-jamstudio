import { execSync } from "node:child_process";

const ALLOWED_LICENSES = new Set([
  "Apache-2.0",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Zlib",
  "Unicode-3.0",
  "Unicode-DFS-2016",
  "CC0-1.0",
  "MPL-2.0",
  "CC-BY-4.0",
  "CC-BY-3.0",
]);

console.log("Checking JavaScript package licenses against allowlist...");

let output;
try {
  output = execSync("pnpm licenses list --json", { encoding: "utf8" });
} catch (err) {
  output = err.stdout ? err.stdout.toString() : "{}";
}

let licensesData = {};
try {
  licensesData = JSON.parse(output);
} catch (err) {
  console.error("Failed to parse pnpm licenses output:", err);
  process.exit(1);
}

function checkLicense(rawLicense) {
  const clean = rawLicense.replace(/[()]/g, "").trim();

  // Single license check
  if (ALLOWED_LICENSES.has(clean)) return true;

  // OR expression: valid if ANY disjunct is allowed
  if (clean.includes(" OR ")) {
    return clean.split(" OR ").some((part) => checkLicense(part.trim()));
  }

  // AND expression: valid if ALL conjuncts are allowed
  if (clean.includes(" AND ")) {
    return clean.split(" AND ").every((part) => checkLicense(part.trim()));
  }

  return false;
}

let hasBanned = false;
for (const [license, packages] of Object.entries(licensesData)) {
  if (!checkLicense(license)) {
    console.error(`BANNED or unverified license: ${license}`);
    for (const pkg of packages) {
      console.error(`  - ${pkg.name}@${pkg.version} (${pkg.path || ""})`);
    }
    hasBanned = true;
  }
}

if (hasBanned) {
  console.error("JS licence check FAILED: Disallowed dependencies found.");
  process.exit(1);
}

console.log("JS licence check PASSED: All packages adhere to allowlist.");
