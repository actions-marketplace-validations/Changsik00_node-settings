/**
 * Sample settings — wires sample/env/ (input env vars) and
 * sample/config/ (typed config layers) together.
 *
 * Run from the repo root:
 *
 *   node-settings inspect  --config sample/settings.ts
 *   node-settings inspect  --config sample/settings.ts --env=prod
 *   node-settings generate envs --config sample/settings.ts --out-dir /tmp/envs
 *   node-settings generate docs --config sample/settings.ts --out /tmp/ENV.md
 *   node-settings generate k8s  --config sample/settings.ts --name demo --out /tmp/k8s.yaml
 *   node-settings check    --config sample/settings.ts
 */
import { z } from "zod";
import { defineSettings } from "../src/index.js";

import { defaults, type AppConfig } from "./config/defaults.js";
import { local } from "./config/local.js";
import { dev } from "./config/dev.js";
import { stage } from "./config/stage.js";
import { prod } from "./config/prod.js";

const envSchema = z.object({
  APP_ENV: z.enum(["local", "dev", "stage", "prod"]).default("local"),
  PORT: z.coerce.number().default(3000),
  DB_HOST: z.string().describe("Primary database host"),
  DB_PASSWORD: z.string().describe("Primary database password"),
  REDIS_URL: z.string().optional(),

  // CI-injected secrets live in envSchema, NOT in perEnv config.
  // Optional in local; required by your CI workflow for deployed envs
  // (enforce via a perEnv-aware check if needed, or split the schema).
  SENTRY_DSN: z.string().optional().describe("Sentry DSN @secret"),

  CONFIG_OVERRIDE_JSON: z.string().optional(),
});

const loadSettings = defineSettings({
  envSchema,
  envKey: "APP_ENV",
  overrideEnvKey: "CONFIG_OVERRIDE_JSON",
  defaults,
  perEnv: { local, dev, stage, prod },
  build: (env, config) => ({
    port: env.PORT,
    dbHost: env.DB_HOST,
    dbPassword: env.DB_PASSWORD,
    redisUrl: env.REDIS_URL,
    sentryDsn: env.SENTRY_DSN, // ← comes from env, set by CI/infra at deploy time
    bucket: config.bucket,
    region: config.region,
    cdnDomain: config.cdnDomain,
    workerConcurrency: config.workerConcurrency,
    logLevel: config.logLevel,
    featureFlags: config.featureFlags,
    rateLimits: config.rateLimits,
  }),
});

export default loadSettings;
export type Settings = ReturnType<typeof loadSettings>;
export type { AppConfig };
