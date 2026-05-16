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
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
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

/**
 * List file paths in a .tgz tarball using pure Node (zlib + manual
 * tar header parsing). Replaces a `tar -tzf` subprocess call so the
 * script works on Windows runners where `tar` flag behaviour varies.
 *
 * Tar format (USTAR): each entry is a 512-byte header block followed
 * by data blocks padded to 512 bytes. Header layout used here:
 *   - bytes   0..99 : filename (null-terminated)
 *   - bytes 124..135: octal size (null-terminated)
 *   - bytes 156    : type flag ('0' / '\\0' for normal file, '5' for dir)
 * End-of-archive is two consecutive zero-filled blocks.
 */
function listTarballFiles(tgzPath) {
  const buf = gunzipSync(readFileSync(tgzPath));
  const files = [];
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    // End of archive marker (all zeros).
    if (header.every((b) => b === 0)) break;
    const nameRaw = header.subarray(0, 100).toString("utf8");
    const name = nameRaw.replace(/\0.*$/, "");
    const sizeRaw = header.subarray(124, 136).toString("utf8").trim();
    const size = parseInt(sizeRaw.replace(/\0.*$/, ""), 8) || 0;
    const typeFlag = String.fromCharCode(header[156]);
    // Skip directories ('5') and the special "pax" / "longlink"
    // entries that some tar implementations emit; we only want files.
    if (name && typeFlag !== "5" && typeFlag !== "L" && typeFlag !== "x") {
      files.push(name);
    }
    // Advance past header + data (rounded up to 512-byte block).
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files.sort();
}

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
  /^package\/BACKLOG\.md$/,
  /^package\/action\.yml$/,
  /^package\/llms\.txt$/,
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
  const list = listTarballFiles(join(out, tgz));

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
