/**
 * Snapshot tests for every generator output.
 *
 * Unit tests elsewhere use `.toContain(...)` which is robust to format
 * changes but invisible in PR diffs. These snapshots lock the exact
 * output — any whitespace, banner, or ordering change shows up as a
 * snapshot diff and forces a deliberate decision to accept.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineSettings } from "../define-settings.js";
import {
  generateEnvExample,
  generateJsonSchema,
  generateK8sManifests,
  generateMarkdownDocs,
  generatePerEnvExamples,
} from "./index.js";

const settings = defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
    PORT: z.coerce.number().default(3000),
    DB_HOST: z.string().describe("Primary database host"),
    DB_PASSWORD: z.string().describe("Primary database password"),
    SENTRY_DSN: z.string().optional().describe("Sentry DSN @secret"),
  }),
  envKey: "APP_ENV",
  defaults: {
    bucket: "",
    region: "us-east-1",
    workerConcurrency: 1,
  },
  perEnv: {
    local: { bucket: "local-bucket" },
    dev: { bucket: "dev-bucket" },
    prod: { bucket: "prod-bucket", workerConcurrency: 8 },
  },
  build: (env, config) => ({
    port: env.PORT,
    dbHost: env.DB_HOST,
    dbPassword: env.DB_PASSWORD,
    sentryDsn: env.SENTRY_DSN,
    bucket: config.bucket,
    region: config.region,
    workerConcurrency: config.workerConcurrency,
  }),
});

describe("generator snapshots", () => {
  it("generateEnvExample", () => {
    expect(generateEnvExample(settings.envFields)).toMatchSnapshot();
  });

  it("generateEnvExample — unmasked secret defaults", () => {
    expect(
      generateEnvExample(settings.envFields, { maskSecretDefaults: false }),
    ).toMatchSnapshot();
  });

  it("generateMarkdownDocs — default title", () => {
    expect(generateMarkdownDocs(settings.envFields)).toMatchSnapshot();
  });

  it("generateMarkdownDocs — custom title + intro", () => {
    expect(
      generateMarkdownDocs(settings.envFields, {
        title: "demo-service env",
        intro: "Owned by team-platform.",
      }),
    ).toMatchSnapshot();
  });

  it("generateK8sManifests — default (stringData secret)", () => {
    expect(
      generateK8sManifests(settings.envFields, {
        name: "demo",
        namespace: "prod",
        labels: { app: "demo" },
      }),
    ).toMatchSnapshot();
  });

  it("generateK8sManifests — inlineSecretValues (base64 data)", () => {
    expect(
      generateK8sManifests(settings.envFields, {
        name: "demo",
        values: { DB_PASSWORD: "supersecret", SENTRY_DSN: "https://x@y.io/1" },
        inlineSecretValues: true,
      }),
    ).toMatchSnapshot();
  });

  it("generatePerEnvExamples — every branch", () => {
    expect(generatePerEnvExamples(settings)).toMatchSnapshot();
  });

  it("generatePerEnvExamples — without config summary", () => {
    expect(
      generatePerEnvExamples(settings, { includeConfigSummary: false }),
    ).toMatchSnapshot();
  });

  it("generateJsonSchema — defaults", () => {
    expect(generateJsonSchema(settings.envFields)).toMatchSnapshot();
  });

  it("generateJsonSchema — with $id, title, description", () => {
    expect(
      generateJsonSchema(settings.envFields, {
        $id: "https://example.com/demo.schema.json",
        title: "demo-service env",
        description: "Owned by team-platform.",
      }),
    ).toMatchSnapshot();
  });
});
