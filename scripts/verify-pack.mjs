#!/usr/bin/env node
/**
 * Verify what `pnpm pack` will publish to npm.
 *
 * Generates the tarball, lists its contents, and asserts:
 *   - every file in REQUIRED is present
 *   - no file matches any pattern in FORBIDDEN (no leaking src/, tests,
 *     snapshots, docs, sample/, lockfiles, etc.)
 *
 * Run AFTER `pnpm build`. Catches misconfigured `package.json` `files`
 * fields and `.npmignore` rules before they ship.
 */
import { execSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");

const REQUIRED = [
  "package/package.json",
  "package/README.md",
  "package/LICENSE",
  "package/AGENTS.md",
  "package/CHANGELOG.md",
  "package/dist/index.js",
  "package/dist/index.d.ts",
  "package/dist/cli/index.js",
  "package/dist/cli/bin.js",
  "package/dist/generators/index.js",
  "package/dist/generators/env-example.js",
  "package/dist/generators/k8s.js",
  "package/dist/generators/markdown.js",
  "package/dist/loaders/dotenv-cascade.js",
  "package/dist/loaders/dotenv-file.js",
  "package/dist/loaders/node-env.js",
  "package/dist/utils/deep-merge.js",
  "package/dist/utils/merge-per-env.js",
  "package/dist/define-settings.js",
  "package/dist/introspect.js",
  "package/dist/check-per-env.js",
  "package/dist/errors.js",
  "package/dist/presets.js",
  "package/dist/todo.js",
  "package/dist/validate-options.js",
];

const FORBIDDEN = [
  /\.test\.[tj]s$/,
  /__snapshots__/,
  /^package\/src\//,
  /^package\/sample\//,
  /^package\/docs\//,
  /^package\/scripts\//,
  /^package\/examples\//,
  /^package\/api-surface\//,
  /^package\/coverage\//,
  /^package\/\.doc-check-tmp\//,
  /^package\/RELEASING\.md$/,
  /^package\/\.github\//,
  /^package\/\.git\//,
  /pnpm-lock\.yaml$/,
  /^package\/tsconfig.*\.json$/,
  /^package\/vitest\.config/,
  /^package\/node_modules\//,
  /\.tsbuildinfo$/,
];

const out = mkdtempSync(join(tmpdir(), "node-settings-pack-"));
try {
  execSync(`pnpm pack --pack-destination ${out}`, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const tgz = readdirSync(out).find((f) => f.endsWith(".tgz"));
  if (!tgz) {
    console.error("FAIL  pnpm pack produced no .tgz");
    process.exit(1);
  }
  const list = execSync(`tar -tzf ${join(out, tgz)}`, { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !p.endsWith("/"))
    .sort();

  const missing = REQUIRED.filter((req) => !list.includes(req));
  if (missing.length > 0) {
    console.error("FAIL  missing from tarball:");
    for (const m of missing) console.error(`  ${m}`);
    console.error("\nactual contents:");
    for (const p of list) console.error(`  ${p}`);
    process.exit(1);
  }

  const violations = list.filter((p) => FORBIDDEN.some((re) => re.test(p)));
  if (violations.length > 0) {
    console.error("FAIL  forbidden files in tarball:");
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
  }

  // Sanity: every dist .js should also have a corresponding .d.ts
  const jsFiles = list.filter(
    (p) => p.startsWith("package/dist/") && p.endsWith(".js"),
  );
  for (const js of jsFiles) {
    const dts = js.replace(/\.js$/, ".d.ts");
    if (!list.includes(dts)) {
      console.error(`FAIL  ${js} has no matching ${dts}`);
      process.exit(1);
    }
  }

  console.log(`OK    tarball: ${tgz}`);
  console.log(`OK    ${list.length} files, all required present, no forbidden leaks`);
  console.log(`OK    every .js has a paired .d.ts`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
