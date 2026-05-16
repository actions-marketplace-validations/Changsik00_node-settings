/**
 * settings.ts — exercises the *root* entry of @env-kit/node-settings
 * exactly the way a real consumer would. Covers:
 *   - defineSettings + perEnv + defaults
 *   - todo() sentinel
 *   - presets.* + inferAppEnv
 *   - loadDotenvCascade
 *   - defineClientEnv (a separate, client-side loader)
 *   - NodeSettingsError shape
 *
 * Compiled with `skipLibCheck: false` so any d.ts breakage in the
 * published package surfaces here, even when it doesn't in our own
 * repo's relaxed config.
 */
import { z } from "zod";
import {
  defineSettings,
  defineClientEnv,
  todo,
  isTodo,
  findTodos,
  NodeSettingsError,
  loadDotenvCascade,
  inferAppEnv,
  presets,
  introspectEnvSchema,
  type EnvField,
  type NodeSettingsErrorCode,
} from "@env-kit/node-settings";

const envSchema = z.object({
  APP_ENV: z.enum(["local", "prod"]).default("local"),
  DB_HOST: z.string(),
  DB_PASSWORD: z.string(),
});

export const settings = defineSettings({
  envSchema,
  envKey: "APP_ENV",
  defaults: { bucket: "" },
  perEnv: {
    local: { bucket: "local-bucket" },
    prod: { bucket: todo("set the prod bucket name before deploy") },
  },
  build: (env, config) => ({
    dbHost: env.DB_HOST,
    dbPassword: env.DB_PASSWORD,
    bucket: config.bucket,
  }),
});

// The loader's return type must be inferable from the build()
// function — that's the consumer-facing contract.
export type Settings = ReturnType<typeof settings>;

// Spot-check a couple of inferred fields so a regression in dist/.d.ts
// (e.g. `any`-leaking generics) surfaces here, not silently.
type _ExpectStringBucket = Settings["bucket"] extends string ? true : never;
const _expectStringBucket: _ExpectStringBucket = true;
void _expectStringBucket;

// EnvField type must round-trip.
export const fields: readonly EnvField[] = introspectEnvSchema(envSchema);

// Error code type must be a string literal union the consumer can switch on.
export function describe(code: NodeSettingsErrorCode): string {
  switch (code) {
    case "PER_ENV_TODO":
      return "unfilled todo() in perEnv";
    case "ENV_VALIDATION_FAILED":
      return "zod validation failed";
    case "CLIENT_ENV_PREFIX_VIOLATION":
      return "schema key without the declared prefix";
    default:
      // Force exhaustiveness — if the published union changes, this
      // produces a clear "Type 'X' is not assignable to never" error.
      return `other: ${code}`;
  }
}

// Vite-style client env (no Vite dep needed; we just type-check).
export const clientEnv = defineClientEnv({
  prefix: "VITE_",
  schema: z.object({
    VITE_API_URL: z.string().url().default("https://api.example.com"),
  }),
});

// Cascade loader — make sure the option types are exposed.
const { env: cascadeEnv, mode } = loadDotenvCascade({
  cwd: process.cwd(),
  appEnvKey: "APP_ENV",
  appEnvPresets: [presets.vercel(), presets.nodeEnv()],
});

export const detectedMode = inferAppEnv({
  source: process.env,
  presets: [presets.vercel(), presets.nodeEnv()],
  default: "local",
});

export { cascadeEnv, mode };

// Re-export the helpers so app.ts can use them.
export { isTodo, findTodos, NodeSettingsError };
