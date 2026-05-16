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

  it("does flag empty-string when perEnv leaves a base default empty", () => {
    const s = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { bucket: "" }, // defaults to empty
      perEnv: {
        local: {},      // doesn't fill it
        dev: {},
        prod: {},
      },
      build: (env, config) => ({ host: env.DB_HOST, bucket: config.bucket }),
    });
    const report = checkPerEnvCompleteness(s, {
      envValues: {
        local: { DB_HOST: "h", DB_PASSWORD: "p" },
        dev: { DB_HOST: "h", DB_PASSWORD: "p" },
        prod: { DB_HOST: "h", DB_PASSWORD: "p" },
      },
    });
    const warnings = report.issues.filter(
      (i) => i.kind === "empty-string",
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((w) => w.severity === "warning")).toBe(true);
  });

  it("flagEmptyStrings: false suppresses the empty-string warnings", () => {
    const s = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { bucket: "" },
      perEnv: { local: {}, dev: {}, prod: {} },
      build: (env, config) => ({ host: env.DB_HOST, bucket: config.bucket }),
    });
    const report = checkPerEnvCompleteness(s, {
      flagEmptyStrings: false,
      envValues: {
        local: { DB_HOST: "h", DB_PASSWORD: "p" },
        dev: { DB_HOST: "h", DB_PASSWORD: "p" },
        prod: { DB_HOST: "h", DB_PASSWORD: "p" },
      },
    });
    expect(
      report.issues.find((i) => i.kind === "empty-string"),
    ).toBeUndefined();
  });

  it("scans nested objects for placeholder values", () => {
    const s = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { cache: { url: "" } },
      perEnv: {
        local: { cache: { url: "redis://localhost" } },
        dev: { cache: { url: "redis://localhost" } },
        prod: { cache: { url: "TODO-prod-redis-url" } },
      },
      build: (env, config) => ({ host: env.DB_HOST, cacheUrl: config.cache.url }),
    });
    const report = checkPerEnvCompleteness(s, {
      envValues: {
        local: { DB_HOST: "h", DB_PASSWORD: "p" },
        dev: { DB_HOST: "h", DB_PASSWORD: "p" },
        prod: { DB_HOST: "h", DB_PASSWORD: "p" },
      },
    });
    const issue = report.issues.find(
      (i) => i.kind === "placeholder" && i.path === "cache.url",
    );
    expect(issue).toBeDefined();
    expect(issue!.env).toBe("prod");
  });

  it("scans arrays for placeholder values (path includes index)", () => {
    const s = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { allowedOrigins: [] as string[] },
      perEnv: {
        local: { allowedOrigins: ["http://localhost"] },
        dev: { allowedOrigins: ["https://dev.example.com"] },
        prod: { allowedOrigins: ["TODO-prod-origin"] },
      },
      build: (env, config) => ({
        host: env.DB_HOST,
        origins: config.allowedOrigins,
      }),
    });
    const report = checkPerEnvCompleteness(s, {
      envValues: {
        local: { DB_HOST: "h", DB_PASSWORD: "p" },
        dev: { DB_HOST: "h", DB_PASSWORD: "p" },
        prod: { DB_HOST: "h", DB_PASSWORD: "p" },
      },
    });
    const issue = report.issues.find(
      (i) => i.kind === "placeholder" && i.env === "prod",
    );
    expect(issue).toBeDefined();
    expect(issue!.path).toMatch(/allowedOrigins\[0\]/);
  });

  it("custom placeholder patterns override the defaults", () => {
    const s = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { bucket: "DOLLAR-DOLLAR-DOLLAR" },
      perEnv: { local: {}, dev: {}, prod: {} },
      build: (env, config) => ({ host: env.DB_HOST, bucket: config.bucket }),
    });
    const report = checkPerEnvCompleteness(s, {
      placeholderPatterns: [/^DOLLAR/],
      envValues: {
        local: { DB_HOST: "h", DB_PASSWORD: "p" },
        dev: { DB_HOST: "h", DB_PASSWORD: "p" },
        prod: { DB_HOST: "h", DB_PASSWORD: "p" },
      },
    });
    expect(
      report.issues.find((i) => i.kind === "placeholder"),
    ).toBeDefined();
  });
});

describe("checkPerEnvCompleteness — missing branch", () => {
  it("flags a requested env that has no perEnv branch", () => {
    const s = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { bucket: "" },
      perEnv: { local: { bucket: "x" }, dev: { bucket: "y" }, prod: { bucket: "z" } },
      build: () => ({}),
    });
    const report = checkPerEnvCompleteness(s, {
      envs: ["local", "nonexistent"],
      envValues: {
        local: { DB_HOST: "h", DB_PASSWORD: "p" },
      },
    });
    const issue = report.issues.find(
      (i) => i.kind === "missing-branch" && i.env === "nonexistent",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");
  });
});

describe("checkPerEnvCompleteness — secret-in-config lint", () => {
  it("warns when a secret-looking key lives in perEnv", () => {
    const s = defineSettings({
      envSchema: z.object({
        APP_ENV: z.enum(["prod"]).default("prod"),
      }),
      envKey: "APP_ENV",
      defaults: {},
      perEnv: {
        prod: { DB_PASSWORD: "literal-password-leaked-to-source" },
      },
      build: () => ({}),
    });
    const report = checkPerEnvCompleteness(s);
    const issue = report.issues.find((i) => i.kind === "secret-in-config");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
    expect(issue!.path).toBe("DB_PASSWORD");
  });

  it("warns on secret-looking keys nested under arrays", () => {
    const s = defineSettings({
      envSchema: z.object({
        APP_ENV: z.enum(["prod"]).default("prod"),
      }),
      envKey: "APP_ENV",
      defaults: {},
      perEnv: {
        prod: {
          clients: [
            { apiToken: "abc" },
            { apiToken: "def" },
          ],
        },
      },
      build: () => ({}),
    });
    const report = checkPerEnvCompleteness(s);
    const issues = report.issues.filter((i) => i.kind === "secret-in-config");
    expect(issues.length).toBe(2);
    expect(issues.map((i) => i.path).sort()).toEqual([
      "clients[0].apiToken",
      "clients[1].apiToken",
    ]);
  });

  it("lint: false suppresses secret-in-config warnings", () => {
    const s = defineSettings({
      envSchema: z.object({
        APP_ENV: z.enum(["prod"]).default("prod"),
      }),
      envKey: "APP_ENV",
      defaults: {},
      perEnv: { prod: { DB_PASSWORD: "x" } },
      build: () => ({}),
    });
    const report = checkPerEnvCompleteness(s, { lint: false });
    expect(
      report.issues.find((i) => i.kind === "secret-in-config"),
    ).toBeUndefined();
  });

  it("custom secretKeyPatterns can extend the default detection", () => {
    const s = defineSettings({
      envSchema: z.object({
        APP_ENV: z.enum(["prod"]).default("prod"),
      }),
      envKey: "APP_ENV",
      defaults: {},
      perEnv: { prod: { internalSeed: "abc-123" } },
      build: () => ({}),
    });
    const report = checkPerEnvCompleteness(s, {
      secretKeyPatterns: [/SEED/i],
    });
    expect(
      report.issues.find(
        (i) => i.kind === "secret-in-config" && i.path === "internalSeed",
      ),
    ).toBeDefined();
  });
});
