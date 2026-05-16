#!/usr/bin/env node
/**
 * Verify the built `dist/` exposes the public API surface intact.
 *
 * Run AFTER `pnpm build`. Catches breakage that the in-source vitest
 * suite can't see: wrong `package.json` exports map, missing TS->JS
 * compilation, accidentally-deleted re-exports, broken bin shim.
 *
 * Exits with a non-zero code (printing the first violation) on any
 * problem; prints a brief OK summary otherwise.
 */
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, "..");

const DIST_INDEX = resolvePath(ROOT, "dist/index.js");
const DIST_GENERATORS = resolvePath(ROOT, "dist/generators/index.js");
const DIST_CLI = resolvePath(ROOT, "dist/cli/index.js");
const DIST_BIN = resolvePath(ROOT, "dist/cli/bin.js");
const DIST_VITE = resolvePath(ROOT, "dist/vite/index.js");

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
}

for (const p of [DIST_INDEX, DIST_GENERATORS, DIST_CLI, DIST_BIN, DIST_VITE]) {
  if (!existsSync(p)) fail(`missing dist artefact: ${p}`);
}

const root = await import(DIST_INDEX);
const gen = await import(DIST_GENERATORS);
const cli = await import(DIST_CLI);
const vite = await import(DIST_VITE);

const REQUIRED_ROOT = [
  // Core
  "defineSettings",
  "defineClientEnv",
  // Errors
  "NodeSettingsError",
  // Todo sentinel
  "todo",
  "isTodo",
  "findTodos",
  "TODO_SYMBOL",
  // Introspection
  "introspectEnvSchema",
  "DEFAULT_SECRET_PATTERNS",
  // Presets
  "presets",
  "inferAppEnv",
  "inferAppEnvDetailed",
  // Loaders
  "loadNodeEnv",
  "loadViteEnv",
  "loadDotenvFile",
  "parseDotenv",
  "loadDotenvCascade",
  // Utils
  "deepMerge",
  "mergePerEnv",
  // Check
  "checkPerEnvCompleteness",
];

for (const name of REQUIRED_ROOT) {
  if (root[name] === undefined) fail(`dist/index.js missing export '${name}'`);
}

const REQUIRED_GEN = [
  "generateEnvExample",
  "generatePerEnvExamples",
  "generateMarkdownDocs",
  "generateK8sManifests",
  "generateJsonSchema",
];
for (const name of REQUIRED_GEN) {
  if (gen[name] === undefined) {
    fail(`dist/generators/index.js missing export '${name}'`);
  }
}

if (typeof cli.runCli !== "function") {
  fail("dist/cli/index.js missing function 'runCli'");
}

if (typeof vite.nodeSettings !== "function") {
  fail("dist/vite/index.js missing function 'nodeSettings'");
}
// The plugin function returns a plain object with a `name` field;
// build a dummy and assert the shape.
const dummyPlugin = vite.nodeSettings();
if (dummyPlugin.name !== "node-settings") {
  fail(`vite plugin name should be 'node-settings'; got '${dummyPlugin.name}'`);
}
for (const hook of ["config", "configResolved", "buildStart"]) {
  if (typeof dummyPlugin[hook] !== "function") {
    fail(`vite plugin missing hook '${hook}'`);
  }
}

// Verify presets is the expected namespace
const REQUIRED_PRESET_KEYS = [
  "vercel",
  "netlify",
  "cloudflarePages",
  "githubActions",
  "railway",
  "render",
  "nodeEnv",
];
for (const key of REQUIRED_PRESET_KEYS) {
  if (typeof root.presets[key] !== "function") {
    fail(`root.presets.${key} is not a function`);
  }
}

// Round-trip: build a tiny loader through the dist entrypoint and run it.
const settings = root.defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["local", "prod"]).default("local"),
    DB_HOST: z.string(),
  }),
  envKey: "APP_ENV",
  defaults: { bucket: "default" },
  perEnv: {
    local: { bucket: "local-b" },
    prod: { bucket: "prod-b" },
  },
  build: (env, config) => ({ dbHost: env.DB_HOST, bucket: config.bucket }),
});

const resolved = settings({ DB_HOST: "h", APP_ENV: "prod" });
assert.equal(resolved.dbHost, "h", "round-trip dbHost");
assert.equal(resolved.bucket, "prod-b", "round-trip bucket");
assert.ok(Object.isFrozen(resolved), "round-trip frozen");

// Exercise the error contract
const fail_with_todo = root.defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["prod"]).default("prod"),
    DB_HOST: z.string(),
  }),
  envKey: "APP_ENV",
  defaults: { bucket: root.todo("unfilled") },
  perEnv: { prod: {} },
  build: (env, config) => ({ host: env.DB_HOST, bucket: config.bucket }),
});
try {
  fail_with_todo({ DB_HOST: "h", APP_ENV: "prod" });
  fail("expected PER_ENV_TODO throw from todo() sentinel");
} catch (err) {
  if (!(err instanceof root.NodeSettingsError)) {
    fail(`expected NodeSettingsError; got ${err && err.constructor.name}`);
  }
  if (err.code !== "PER_ENV_TODO") {
    fail(`expected code=PER_ENV_TODO; got ${err.code}`);
  }
}

// defineClientEnv round-trip
const clientEnv = root.defineClientEnv({
  prefix: "VITE_",
  schema: z.object({
    VITE_API_URL: z.string().url(),
  }),
});
const resolvedClient = clientEnv({
  VITE_API_URL: "https://api.example.com",
  DATABASE_URL: "postgres://secret",
});
assert.equal(resolvedClient.VITE_API_URL, "https://api.example.com");
assert.equal(
  resolvedClient.DATABASE_URL,
  undefined,
  "server-only key must NOT leak into client env",
);
try {
  root.defineClientEnv({
    prefix: "VITE_",
    schema: z.object({ NOT_PREFIXED: z.string() }),
  });
  fail("expected CLIENT_ENV_PREFIX_VIOLATION throw");
} catch (err) {
  if (
    !(err instanceof root.NodeSettingsError) ||
    err.code !== "CLIENT_ENV_PREFIX_VIOLATION"
  ) {
    fail(
      `expected CLIENT_ENV_PREFIX_VIOLATION; got ${err && err.code}`,
    );
  }
}

console.log(`OK    dist/ exposes ${REQUIRED_ROOT.length} root + ${REQUIRED_GEN.length} generator + 1 cli + 1 vite exports`);
console.log(`OK    presets namespace has all ${REQUIRED_PRESET_KEYS.length} platforms`);
console.log("OK    runtime round-trip + NodeSettingsError contract intact");
console.log("OK    vite plugin shape (name + config/configResolved/buildStart hooks)");
console.log("OK    defineClientEnv: server-only keys filtered + prefix violation caught");
