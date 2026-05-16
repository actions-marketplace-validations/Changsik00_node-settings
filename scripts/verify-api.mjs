#!/usr/bin/env node
/**
 * Track the public API surface by snapshotting the entrypoint .d.ts
 * files. On every CI run, the live `dist/*.d.ts` is compared against
 * the committed reference in `api-surface/`. Any drift fails the build
 * and is visible in the PR diff.
 *
 * Run AFTER `pnpm build`.
 *
 * Modes:
 *   node scripts/verify-api.mjs           — compare; exit 1 on diff
 *   node scripts/verify-api.mjs --update  — write reference files
 *
 * Catches API-level regressions the runtime checks can't see:
 *   - accidentally removed `export type Foo`
 *   - new `export ... ` leaked into the public surface
 *   - parameter / return type changes on public functions
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");
const UPDATE = process.argv.includes("--update");

const TARGETS = [
  { dts: "dist/index.d.ts", ref: "api-surface/root.d.ts" },
  { dts: "dist/generators/index.d.ts", ref: "api-surface/generators.d.ts" },
  { dts: "dist/cli/index.d.ts", ref: "api-surface/cli.d.ts" },
  { dts: "dist/vite/index.d.ts", ref: "api-surface/vite.d.ts" },
  { dts: "dist/next/index.d.ts", ref: "api-surface/next.d.ts" },
  { dts: "dist/esbuild/index.d.ts", ref: "api-surface/esbuild.d.ts" },
];

const HEADER = [
  "// AUTO-GENERATED SNAPSHOT — verify-api.mjs",
  "// Diff is intentional: regenerate via `node scripts/verify-api.mjs --update`",
  "// after a deliberate public-API change.",
  "",
].join("\n");

/** Strip line-noise (sourcemap URLs, CRLF, trailing whitespace) before
 *  comparing. tsc emits CRLF on Windows; committed snapshots are LF.
 *  git autocrlf can also flip newlines on Windows checkouts. */
function normalize(content) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/^\/\/# sourceMappingURL=.*$/gm, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/\n+$/u, "\n");
}

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
}

let drifted = 0;
for (const { dts, ref } of TARGETS) {
  const dtsPath = join(ROOT, dts);
  const refPath = join(ROOT, ref);
  if (!existsSync(dtsPath)) {
    fail(`missing ${dts}; run 'pnpm build' first`);
  }
  const actual = normalize(readFileSync(dtsPath, "utf8"));
  const stored = HEADER + actual;

  if (UPDATE) {
    mkdirSync(dirname(refPath), { recursive: true });
    writeFileSync(refPath, stored);
    console.log(`wrote ${ref}`);
    continue;
  }

  if (!existsSync(refPath)) {
    fail(
      `missing reference ${ref}; bootstrap with: node scripts/verify-api.mjs --update`,
    );
  }
  const expected = normalize(readFileSync(refPath, "utf8"));
  if (expected !== stored) {
    drifted += 1;
    const diff = simpleDiff(expected, stored);
    console.error(`DRIFT  ${dts} differs from ${ref}`);
    if (diff) console.error(diff);
    console.error("");
  }
}

if (drifted > 0) {
  console.error(
    `${drifted} entry point(s) drifted. If the change is intentional, accept it via:\n  node scripts/verify-api.mjs --update\nThen commit the updated files under api-surface/.`,
  );
  process.exit(1);
}

console.log(
  UPDATE
    ? `OK    snapshot${TARGETS.length === 1 ? "" : "s"} updated (${TARGETS.length} files)`
    : `OK    public API surface stable across ${TARGETS.length} entry points`,
);

function simpleDiff(a, b) {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const max = Math.max(aLines.length, bLines.length);
  const out = [];
  for (let i = 0; i < max; i += 1) {
    if (aLines[i] === bLines[i]) continue;
    if (aLines[i] !== undefined) out.push(`- ${aLines[i]}`);
    if (bLines[i] !== undefined) out.push(`+ ${bLines[i]}`);
    if (out.length > 60) {
      out.push(`... (truncated; ${max - i} more lines differ)`);
      break;
    }
  }
  return out.join("\n");
}
