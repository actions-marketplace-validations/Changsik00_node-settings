import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineSettings } from "./define-settings.js";
import { checkPerEnvCompleteness } from "./check-per-env.js";

const envSchema = z.object({
  APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
  DB_HOST: z.string(),
  DB_PASSWORD: z.string(),
});

interface AppConfig {
  bucket: string;
  workerConcurrency: number;
}

const defaults: AppConfig = { bucket: "", workerConcurrency: 1 };

const settings = defineSettings({
  envSchema,
  envKey: "APP_ENV",
  defaults,
  perEnv: {
    local: { bucket: "local-bucket" },
    dev: { bucket: "dev-bucket" },
    prod: { bucket: "TODO-prod-bucket" },
  },
  build: (env, config) => ({
    dbHost: env.DB_HOST,
    bucket: config.bucket,
    concurrency: config.workerConcurrency,
  }),
});

describe("checkPerEnvCompleteness", () => {
  it("flags TODO- placeholders as errors", () => {
    const report = checkPerEnvCompleteness(settings, {
      envValues: {
        local: { DB_HOST: "x", DB_PASSWORD: "y" },
        dev: { DB_HOST: "x", DB_PASSWORD: "y" },
        prod: { DB_HOST: "x", DB_PASSWORD: "y" },
      },
    });
    expect(report.ok).toBe(false);
    const prodErrors = report.issues.filter(
      (i) => i.env === "prod" && i.severity === "error",
    );
    expect(prodErrors.some((i) => i.kind === "placeholder")).toBe(true);
  });

  it("flags missing required env vars per environment", () => {
    const report = checkPerEnvCompleteness(settings, {
      envs: ["dev"],
      envValues: { dev: { DB_HOST: "x" } }, // DB_PASSWORD missing
    });
    expect(report.ok).toBe(false);
    const issue = report.issues.find(
      (i) => i.kind === "missing-required-env" && i.path === "DB_PASSWORD",
    );
    expect(issue).toBeDefined();
  });

  it("returns ok=true when every branch is filled in", () => {
    const goodSettings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { bucket: "x", workerConcurrency: 1 },
      perEnv: {
        local: { bucket: "local-bucket" },
        dev: { bucket: "dev-bucket" },
        prod: { bucket: "prod-bucket" },
      },
      build: (env, config) => ({ ...env, ...config }),
    });
    const report = checkPerEnvCompleteness(goodSettings, {
      envValues: {
        local: { DB_HOST: "h", DB_PASSWORD: "p" },
        dev: { DB_HOST: "h", DB_PASSWORD: "p" },
        prod: { DB_HOST: "h", DB_PASSWORD: "p" },
      },
    });
    expect(report.ok).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("treats empty strings as warnings, not errors", () => {
    const report = checkPerEnvCompleteness(settings, {
      envs: ["local"],
      envValues: { local: { DB_HOST: "h", DB_PASSWORD: "p" } },
    });
    expect(report.ok).toBe(true);
    const warning = report.issues.find(
      (i) => i.severity === "warning" && i.kind === "empty-string",
    );
    expect(warning).toBeUndefined(); // local.bucket is filled in
  });
});
