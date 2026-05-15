import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineSettings } from "./define-settings.js";
import { checkPerEnvCompleteness } from "./check-per-env.js";

const envSchema = z.object({
  APP_ENV: z.enum(["local", "prod"]).default("local"),
  DB_HOST: z.string(),
});

describe("checkPerEnvCompleteness — secret-in-config lint", () => {
  it("flags secret-looking keys in perEnv as a warning", () => {
    const settings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { bucket: "", sentryDsn: "" },
      perEnv: {
        local: { bucket: "local", sentryDsn: "" },
        prod: { bucket: "prod", sentryDsn: "https://...@sentry.io/..." },
      },
      build: (_env, config) => config,
    });

    const report = checkPerEnvCompleteness(settings, {
      envValues: { local: { DB_HOST: "h" }, prod: { DB_HOST: "h" } },
    });
    const lint = report.issues.filter((i) => i.kind === "secret-in-config");
    expect(lint.length).toBeGreaterThan(0);
    expect(lint[0]?.severity).toBe("warning");
    expect(lint[0]?.path).toBe("sentryDsn");
    expect(lint[0]?.message).toMatch(/Move to envSchema/);
  });

  it("matches each of the default secret patterns", () => {
    const settings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: {
        dbPassword: "",
        apiToken: "",
        appSecret: "",
        privateKey: "",
        stripeApiKey: "",
        adminCredential: "",
        innocent: "",
      },
      perEnv: {
        local: {
          dbPassword: "x",
          apiToken: "x",
          appSecret: "x",
          privateKey: "x",
          stripeApiKey: "x",
          adminCredential: "x",
          innocent: "x",
        },
        prod: {
          dbPassword: "y",
          apiToken: "y",
          appSecret: "y",
          privateKey: "y",
          stripeApiKey: "y",
          adminCredential: "y",
          innocent: "y",
        },
      },
      build: (_env, config) => config,
    });

    const report = checkPerEnvCompleteness(settings, {
      envValues: { local: { DB_HOST: "h" }, prod: { DB_HOST: "h" } },
    });
    const lintPaths = new Set(
      report.issues.filter((i) => i.kind === "secret-in-config").map((i) => i.path),
    );
    expect(lintPaths.has("dbPassword")).toBe(true);
    expect(lintPaths.has("apiToken")).toBe(true);
    expect(lintPaths.has("appSecret")).toBe(true);
    expect(lintPaths.has("privateKey")).toBe(true);
    expect(lintPaths.has("stripeApiKey")).toBe(true);
    expect(lintPaths.has("adminCredential")).toBe(true);
    expect(lintPaths.has("innocent")).toBe(false);
  });

  it("walks nested keys (matches dotted leaf paths)", () => {
    const settings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { auth: { rotatingToken: "" } },
      perEnv: {
        local: { auth: { rotatingToken: "local" } },
        prod: { auth: { rotatingToken: "prod" } },
      },
      build: (_env, config) => config,
    });
    const report = checkPerEnvCompleteness(settings, {
      envValues: { local: { DB_HOST: "h" }, prod: { DB_HOST: "h" } },
    });
    const lint = report.issues.find(
      (i) => i.kind === "secret-in-config" && i.path === "auth.rotatingToken",
    );
    expect(lint).toBeDefined();
  });

  it("can be disabled via lint: false", () => {
    const settings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { dbPassword: "" },
      perEnv: {
        local: { dbPassword: "x" },
        prod: { dbPassword: "y" },
      },
      build: (_env, config) => config,
    });
    const report = checkPerEnvCompleteness(settings, {
      lint: false,
      envValues: { local: { DB_HOST: "h" }, prod: { DB_HOST: "h" } },
    });
    expect(
      report.issues.filter((i) => i.kind === "secret-in-config"),
    ).toHaveLength(0);
  });

  it("accepts custom secretKeyPatterns", () => {
    const settings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { dbPassword: "", myProjectGoo: "" },
      perEnv: {
        local: { dbPassword: "x", myProjectGoo: "x" },
        prod: { dbPassword: "y", myProjectGoo: "y" },
      },
      build: (_env, config) => config,
    });
    const report = checkPerEnvCompleteness(settings, {
      secretKeyPatterns: [/GOO/i], // custom pattern only
      envValues: { local: { DB_HOST: "h" }, prod: { DB_HOST: "h" } },
    });
    const lint = report.issues.filter((i) => i.kind === "secret-in-config");
    expect(lint.some((i) => i.path === "myProjectGoo")).toBe(true);
    expect(lint.some((i) => i.path === "dbPassword")).toBe(false);
  });

  it("warnings do not flip report.ok to false", () => {
    const settings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { sentryDsn: "" },
      perEnv: {
        local: { sentryDsn: "x" },
        prod: { sentryDsn: "y" },
      },
      build: (_env, config) => config,
    });
    const report = checkPerEnvCompleteness(settings, {
      envValues: { local: { DB_HOST: "h" }, prod: { DB_HOST: "h" } },
    });
    // The only issues should be lint warnings — report still ok.
    expect(report.issues.every((i) => i.severity === "warning")).toBe(true);
    expect(report.ok).toBe(true);
  });
});
