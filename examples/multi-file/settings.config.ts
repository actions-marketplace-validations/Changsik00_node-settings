/**
 * Example: configuration split across multiple files.
 *
 * One settings.config.ts at the root assembles everything:
 *   - envSchema           — defines the env contract (zod)
 *   - defaults + perEnv   — imported from `./config/*.ts`
 *   - build               — maps env + layered config into the final
 *                           settings shape consumed by the app
 *
 * Use this layout when `perEnv` grows past 10–20 lines per branch,
 * when you want git-blame to point at one file per env, or when
 * different teams own different environments.
 *
 * Try the inspect command:
 *   node-settings inspect --config examples/multi-file/settings.config.ts
 *   node-settings inspect --config examples/multi-file/settings.config.ts --env=prod
 */
import { z } from "zod";
import { defineSettings } from "../../src/index.js";

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
  CONFIG_OVERRIDE_JSON: z.string().optional(),
});

const settings = defineSettings({
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
    bucket: config.bucket,
    workerConcurrency: config.workerConcurrency,
    logLevel: config.logLevel,
    featureFlags: config.featureFlags,
    rateLimits: config.rateLimits,
  }),
});

export default settings;
export type Settings = ReturnType<typeof settings>;
export type { AppConfig };
