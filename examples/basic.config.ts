/**
 * Example settings config for the `node-settings` CLI.
 *
 * Run from this directory:
 *
 *   node-settings validate --config examples/basic.config.ts
 *   node-settings generate env-example --config examples/basic.config.ts
 *   node-settings generate docs --config examples/basic.config.ts
 *   node-settings generate k8s  --config examples/basic.config.ts --name demo --namespace dev
 *   node-settings check --config examples/basic.config.ts
 */
import { z } from "zod";
import { defineSettings } from "../src/index.js";

const envSchema = z.object({
  APP_ENV: z.enum(["local", "dev", "stage", "prod"]).default("local"),
  PORT: z.coerce.number().default(3000),
  DB_HOST: z.string().describe("Primary database host"),
  DB_PASSWORD: z.string().describe("Primary database password"),
  REDIS_URL: z.string().optional(),
  CONFIG_OVERRIDE_JSON: z.string().optional(),
});

interface AppConfig {
  bucket: string;
  workerConcurrency: number;
  featureFlags: { newCheckout: boolean };
}

const defaults: AppConfig = {
  bucket: "",
  workerConcurrency: 1,
  featureFlags: { newCheckout: false },
};

const settings = defineSettings({
  envSchema,
  envKey: "APP_ENV",
  overrideEnvKey: "CONFIG_OVERRIDE_JSON",
  defaults,
  perEnv: {
    local: { bucket: "local-bucket" },
    dev: { bucket: "dev-bucket" },
    stage: { bucket: "stage-bucket" },
    prod: {
      bucket: "prod-bucket",
      workerConcurrency: 8,
      featureFlags: { newCheckout: true },
    },
  },
  build: (env, config) => ({
    port: env.PORT,
    dbHost: env.DB_HOST,
    dbPassword: env.DB_PASSWORD,
    redisUrl: env.REDIS_URL,
    bucket: config.bucket,
    workerConcurrency: config.workerConcurrency,
    featureFlags: config.featureFlags,
  }),
});

export default settings;
export type Settings = ReturnType<typeof settings>;
