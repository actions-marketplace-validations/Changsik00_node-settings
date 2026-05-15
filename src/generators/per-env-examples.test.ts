import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineSettings } from "../define-settings.js";
import {
  generateEnvExample,
  generatePerEnvExamples,
} from "./env-example.js";

describe("generateEnvExample — values option", () => {
  it("uses provided values instead of schema defaults", () => {
    const schema = z.object({
      APP_ENV: z.enum(["local", "dev"]).default("local"),
      DB_HOST: z.string(),
    });
    const settings = defineSettings({
      envSchema: schema,
      envKey: "APP_ENV",
      defaults: {},
      perEnv: { local: {}, dev: {} },
      build: (env) => env,
    });
    const out = generateEnvExample(settings.envFields, {
      values: { APP_ENV: "dev", DB_HOST: "dev-db.internal" },
    });
    expect(out).toContain("APP_ENV=dev");
    expect(out).toContain("DB_HOST=dev-db.internal");
  });
});

describe("generatePerEnvExamples", () => {
  const settings = defineSettings({
    envSchema: z.object({
      APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
      DB_HOST: z.string(),
      DB_PASSWORD: z.string(),
    }),
    envKey: "APP_ENV",
    defaults: { bucket: "", workerConcurrency: 1 },
    perEnv: {
      local: { bucket: "local-b" },
      dev: { bucket: "dev-b" },
      prod: { bucket: "prod-b", workerConcurrency: 8 },
    },
    build: (env, config) => ({ ...env, ...config }),
  });

  it("emits one file per perEnv branch with the envKey pre-filled", () => {
    const examples = generatePerEnvExamples(settings);
    expect(Object.keys(examples).sort()).toEqual(["dev", "local", "prod"]);
    expect(examples.local).toContain("APP_ENV=local");
    expect(examples.dev).toContain("APP_ENV=dev");
    expect(examples.prod).toContain("APP_ENV=prod");
  });

  it("includes a header that names the target env", () => {
    const examples = generatePerEnvExamples(settings);
    expect(examples.prod).toMatch(/# \.env example for APP_ENV=prod/);
  });

  it("includes a config summary by default", () => {
    const examples = generatePerEnvExamples(settings);
    expect(examples.prod).toContain("# When this env loads");
    expect(examples.prod).toContain("bucket: \"prod-b\"");
    expect(examples.prod).toContain("workerConcurrency: 8");
  });

  it("omits the config summary when includeConfigSummary is false", () => {
    const examples = generatePerEnvExamples(settings, {
      includeConfigSummary: false,
    });
    expect(examples.prod).not.toContain("When this env loads");
  });

  it("can restrict to a subset of envs", () => {
    const examples = generatePerEnvExamples(settings, {
      envs: ["prod"],
    });
    expect(Object.keys(examples)).toEqual(["prod"]);
  });
});
