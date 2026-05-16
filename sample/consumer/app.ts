/**
 * Runtime smoke test. Boots the loader against a minimal env that
 * satisfies the schema, exercises a couple of error paths, and prints
 * a short success line. Runs in CI as `node --experimental-strip-types`.
 */
import {
  settings,
  describe,
  fields,
  clientEnv,
  detectedMode,
  isTodo,
  NodeSettingsError,
} from "./settings.ts";
import {
  generateEnvExample,
  generateMarkdownDocs,
  generateK8sManifests,
  generateJsonSchema,
  generateTfvars,
  generateComposeFragment,
} from "@env-kit/node-settings/generators";

function fail(msg: string): never {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
}

const env = { APP_ENV: "local", DB_HOST: "h", DB_PASSWORD: "p" };
const cfg = settings(env);
if (cfg.dbHost !== "h") fail(`dbHost: expected 'h', got ${cfg.dbHost}`);
if (cfg.bucket !== "local-bucket") {
  fail(`bucket: expected 'local-bucket', got ${cfg.bucket}`);
}
if (!Object.isFrozen(cfg)) fail("returned config should be frozen");

// PER_ENV_TODO should fire when loading prod (todo() left in perEnv).
try {
  settings({ APP_ENV: "prod", DB_HOST: "h", DB_PASSWORD: "p" });
  fail("expected PER_ENV_TODO throw");
} catch (err) {
  if (!(err instanceof NodeSettingsError)) {
    fail(`expected NodeSettingsError, got ${err}`);
  }
  if (err.code !== "PER_ENV_TODO") {
    fail(`expected code=PER_ENV_TODO, got ${err.code}`);
  }
}

// describe() is the exhaustive switch over NodeSettingsErrorCode.
if (describe("PER_ENV_TODO") !== "unfilled todo() in perEnv") {
  fail("describe(PER_ENV_TODO) wrong message");
}

// Generators all return strings.
const examples = [
  generateEnvExample(fields),
  generateMarkdownDocs(fields),
  generateK8sManifests(fields, { name: "demo" }).yaml,
  generateJsonSchema(fields),
  generateTfvars(fields),
  generateComposeFragment(fields, { serviceName: "web" }),
];
for (const [i, out] of examples.entries()) {
  if (typeof out !== "string" || out.length === 0) {
    fail(`generator #${i} returned empty / non-string`);
  }
}

// defineClientEnv server-key filtering.
const clientResolved = clientEnv({
  VITE_API_URL: "https://api.example.com",
  DATABASE_URL: "secret",
});
if ("DATABASE_URL" in clientResolved) {
  fail("server-only key leaked into clientEnv");
}

// inferAppEnv returns a string.
if (typeof detectedMode !== "string") {
  fail(`inferAppEnv: expected string, got ${typeof detectedMode}`);
}

// isTodo type guard.
const probe: unknown = { reason: "x", [Symbol.for("@env-kit/node-settings:todo")]: true };
if (!isTodo(probe)) fail("isTodo failed on a real sentinel-shaped object");

console.log(
  `OK    consumer smoke: APP_ENV=${env.APP_ENV} -> bucket=${cfg.bucket}, generators OK, NodeSettingsError contract intact`,
);
