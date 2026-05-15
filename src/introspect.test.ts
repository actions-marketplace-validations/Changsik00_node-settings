import { describe, expect, it } from "vitest";
import { z } from "zod";
import { introspectEnvSchema } from "./introspect.js";

describe("introspectEnvSchema", () => {
  it("extracts type, required, default, and description", () => {
    const schema = z.object({
      DB_HOST: z.string().describe("primary db"),
      DB_PORT: z.coerce.number().default(3306),
      APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
      VERBOSE: z.coerce.boolean().optional(),
    });
    const fields = introspectEnvSchema(schema);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

    expect(byKey.DB_HOST?.required).toBe(true);
    expect(byKey.DB_HOST?.type).toBe("string");
    expect(byKey.DB_HOST?.description).toBe("primary db");
    expect(byKey.DB_HOST?.secret).toBe(false);

    expect(byKey.DB_PORT?.required).toBe(false);
    expect(byKey.DB_PORT?.defaultValue).toBe(3306);
    expect(byKey.DB_PORT?.type).toBe("number");

    expect(byKey.APP_ENV?.type).toBe("enum");
    expect(byKey.APP_ENV?.enumValues).toEqual(["local", "dev", "prod"]);
    expect(byKey.APP_ENV?.defaultValue).toBe("local");

    expect(byKey.VERBOSE?.required).toBe(false);
    expect(byKey.VERBOSE?.type).toBe("boolean");
  });

  it("auto-detects secrets by name pattern", () => {
    const schema = z.object({
      DB_PASSWORD: z.string(),
      API_TOKEN: z.string(),
      GITHUB_API_KEY: z.string(),
      USERNAME: z.string(),
    });
    const fields = introspectEnvSchema(schema);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.DB_PASSWORD?.secret).toBe(true);
    expect(byKey.API_TOKEN?.secret).toBe(true);
    expect(byKey.GITHUB_API_KEY?.secret).toBe(true);
    expect(byKey.USERNAME?.secret).toBe(false);
  });

  it("honors @secret / @public tags in the description", () => {
    const schema = z.object({
      LICENSE_BLOB: z.string().describe("license string @secret"),
      DB_TOKEN: z.string().describe("connection identifier — @public"),
    });
    const fields = introspectEnvSchema(schema);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.LICENSE_BLOB?.secret).toBe(true);
    expect(byKey.LICENSE_BLOB?.description).toBe("license string");
    expect(byKey.DB_TOKEN?.secret).toBe(false);
    expect(byKey.DB_TOKEN?.description).toBe("connection identifier —");
  });

  it("supports a custom secretPatterns array", () => {
    const schema = z.object({
      DB_PASSWORD: z.string(), // would be a secret by default
      MY_HUSH_HUSH: z.string(),
    });
    const fields = introspectEnvSchema(schema, {
      secretPatterns: [/HUSH/],
    });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.DB_PASSWORD?.secret).toBe(false);
    expect(byKey.MY_HUSH_HUSH?.secret).toBe(true);
  });
});
