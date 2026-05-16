#!/usr/bin/env node
/**
 * Extract a single version's section body from CHANGELOG.md.
 *
 *   node scripts/changelog-extract.mjs v0.11.0
 *
 * Used by `release.yml` to feed `softprops/action-gh-release` so each
 * GitHub Release page mirrors the matching CHANGELOG entry.
 *
 * Exits with:
 *   0 — section found and written to stdout
 *   1 — usage error (missing argument)
 *   2 — version section not found in CHANGELOG.md
 */
import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/changelog-extract.mjs <version>");
  console.error("Example: node scripts/changelog-extract.mjs v0.11.0");
  process.exit(1);
}

const version = arg.replace(/^v/, "");
const changelog = readFileSync(
  resolvePath(ROOT, "CHANGELOG.md"),
  "utf8",
);

// Match a heading of the form: `## [X.Y.Z]` (the rest of the line is
// usually ` — DATE`, but we don't care about it for the start anchor).
const headingRe = new RegExp(
  `^## \\[${version.replace(/\./g, "\\.")}\\](?:\\s|$)`,
);
const anyVersionRe = /^## \[/;

let inSection = false;
const body = [];
for (const line of changelog.split("\n")) {
  if (!inSection) {
    if (headingRe.test(line)) {
      inSection = true;
      // Skip the heading line itself — the GitHub Release UI shows the
      // tag name as the title already.
      continue;
    }
  } else {
    if (anyVersionRe.test(line)) break;
    body.push(line);
  }
}

if (!inSection) {
  console.error(
    `[changelog-extract] section '## [${version}]' not found in CHANGELOG.md`,
  );
  process.exit(2);
}

process.stdout.write(body.join("\n").trim() + "\n");
