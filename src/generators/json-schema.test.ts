import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineSettings } from "../define-settings.js";
import { generateJsonSchema } from "./json-schema.js";

const settings = defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
    PORT: z.coerce.number().default(3000),
    DB_HOST: z.string().describe("Primary database host"),
    DB_PASSWORD: z.string(),
    SENTRY_DSN: z.string().optional().describe("Sentry DSN @secret"),
  }),
  envKey: "APP_ENV",
  defaults: {},
  perEnv: { local: {}, dev: {}, prod: {} },
  build: () => ({}),
});

describe("generateJsonSchema", () => {
  it("produces valid JSON with Draft 2020-12 $schema", () => {
    const out = generateJsonSchema(settings.envFields);
    const parsed = JSON.parse(out);
    expect(parsed.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(parsed.type).toBe("object");
    expect(parsed.title).toBe("Environment Variables");
  });

  it("maps each EnvField kind to the right JSON Schema type", () => {
    const parsed = JSON.parse(generateJsonSchema(settings.envFields));
    expect(parsed.properties.DB_HOST).toMatchObject({
      type: "string",
      description: "Primary database host",
    });
    expect(parsed.properties.PORT).toMatchObject({ type: "number" });
    expect(parsed.properties.APP_ENV).toMatchObject({
      type: "string",
      enum: ["local", "dev", "prod"],
      default: "local",
    });
  });

  it("flags secrets with format:password and x-secret:true", () => {
    const parsed = JSON.parse(generateJsonSchema(settings.envFields));
    expect(parsed.properties.DB_PASSWORD.format).toBe("password");
    expect(parsed.properties.DB_PASSWORD["x-secret"]).toBe(true);
    expect(parsed.properties.SENTRY_DSN.format).toBe("password");
  });

  it("includes required env keys in the 'required' array (sorted)", () => {
    const parsed = JSON.parse(generateJsonSchema(settings.envFields));
    expect(parsed.required).toEqual(["DB_HOST", "DB_PASSWORD"]);
  });

  it("honours $id and description options", () => {
    const out = generateJsonSchema(settings.envFields, {
      $id: "https://example.com/env.schema.json",
      description: "My service env",
      title: "MyService Env",
    });
    const parsed = JSON.parse(out);
    expect(parsed.$id).toBe("https://example.com/env.schema.json");
    expect(parsed.description).toBe("My service env");
    expect(parsed.title).toBe("MyService Env");
  });

  it("omits x-secret extension when includeXSecret is false", () => {
    const parsed = JSON.parse(
      generateJsonSchema(settings.envFields, { includeXSecret: false }),
    );
    expect(parsed.properties.DB_PASSWORD["x-secret"]).toBeUndefined();
    expect(parsed.properties.DB_PASSWORD.format).toBe("password");
  });

  it("output is stable across calls (deterministic 'required' order)", () => {
    const a = generateJsonSchema(settings.envFields);
    const b = generateJsonSchema(settings.envFields);
    expect(a).toBe(b);
  });
});
