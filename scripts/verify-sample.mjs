#!/usr/bin/env node
/**
 * Smoke-runs the built CLI binary against `sample/settings.ts`.
 *
 * Purpose: catch packaging regressions that the in-source tests can't
 * (wrong `bin` path in package.json, missing dist artefact, broken
 * shebang). Captures stdout and asserts the inspect output looks sane
 * — no diff against a snapshot, just structural checks so the test
 * doesn't break on cosmetic copy edits.
 *
 * Replaces the previous shell one-liner that used `> /dev/null` and
 * therefore failed on Windows CI runners.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");
const BIN = resolvePath(ROOT, "dist/cli/bin.js");
const SAMPLE = "sample/settings.ts";

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
}

function runInspect(extraArgs) {
  const result = spawnSync(
    process.execPath,
    [BIN, "inspect", "--config", SAMPLE, ...extraArgs],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.error) fail(`spawn failed: ${result.error.message}`);
  if (result.status !== 0) {
    fail(
      `inspect exited ${result.status} for args=${JSON.stringify(extraArgs)}\n` +
        `stderr: ${result.stderr}`,
    );
  }
  return result.stdout;
}

// All envs.
{
  const out = runInspect([]);
  if (!out.includes("envKey=APP_ENV")) fail("inspect: envKey line missing");
  if (!out.includes("layered config for APP_ENV=local")) {
    fail("inspect: local branch missing");
  }
  if (!out.includes("layered config for APP_ENV=prod")) {
    fail("inspect: prod branch missing");
  }
}

// Single env (prod) — exercises the --env filter path.
{
  const out = runInspect(["--env=prod"]);
  if (out.includes("layered config for APP_ENV=local")) {
    fail("inspect --env=prod: local branch leaked into output");
  }
  if (!out.includes("cdnDomain: <TODO:")) {
    fail("inspect --env=prod: expected todo() sentinel render");
  }
}

console.log("OK    verify:sample — built CLI runs against sample/");
