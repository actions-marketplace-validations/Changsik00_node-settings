#!/usr/bin/env node
/**
 * Cut a release.
 *
 *   pnpm release 0.11.0
 *
 * Refuses to run on a dirty working tree, runs `pnpm verify` first,
 * bumps `package.json`, rewrites `## [Unreleased]` -> `## [X.Y.Z] —
 * YYYY-MM-DD` in CHANGELOG.md, commits `chore: release vX.Y.Z`, tags,
 * and pushes. The release workflow on GitHub Actions does the npm
 * publish from the tag.
 *
 * See RELEASING.md for the full flow.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("Usage: pnpm release <semver>");
  console.error("Example: pnpm release 0.11.0");
  process.exit(1);
}

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
}

// 1. Working tree must be clean.
const status = execSync("git status --porcelain", { cwd: ROOT })
  .toString()
  .trim();
if (status) {
  console.error("Working tree is not clean:");
  console.error(status);
  fail("commit or stash before running release");
}

// 2. Must be on main (or a release branch). Don't auto-release feature branches.
const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT })
  .toString()
  .trim();
if (branch !== "main" && !branch.startsWith("release/") && !branch.startsWith("hotfix/")) {
  fail(`refusing to release from branch '${branch}'; expected main / release/* / hotfix/*`);
}

// 3. Tag must not already exist.
const existingTag = execSync(`git tag --list "v${version}"`, { cwd: ROOT })
  .toString()
  .trim();
if (existingTag) fail(`tag v${version} already exists`);

// 4. Run the full verify chain.
console.log("→ pnpm verify");
sh("pnpm verify");

// 5. Bump package.json version.
const pkgPath = resolvePath(ROOT, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const oldVersion = pkg.version;
if (oldVersion === version) fail(`package.json already at ${version}`);
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`→ package.json: ${oldVersion} -> ${version}`);

// 6. Rewrite CHANGELOG.md [Unreleased] -> [X.Y.Z] - DATE; add fresh [Unreleased].
const changelogPath = resolvePath(ROOT, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const today = new Date().toISOString().slice(0, 10);
if (!/^## \[Unreleased\]/m.test(changelog)) {
  fail(
    "CHANGELOG.md is missing the '## [Unreleased]' heading; cannot promote it. Add the section and retry.",
  );
}
const promoted = changelog.replace(
  /^## \[Unreleased\]\s*$/m,
  `## [Unreleased]\n\n## [${version}] — ${today}`,
);
writeFileSync(changelogPath, promoted);
console.log(`→ CHANGELOG.md: promoted [Unreleased] -> [${version}] — ${today}`);

// 7. Commit + tag + push.
sh("git add package.json CHANGELOG.md");
sh(`git commit -m "chore: release v${version}"`);
sh(`git tag v${version}`);
console.log("→ pushing commit + tag");
sh("git push");
sh("git push --tags");

console.log("");
console.log(`OK    released v${version}`);
console.log(
  "      release.yml will publish to npm once the tag arrives on GitHub.",
);
