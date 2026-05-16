import { describe, expect, it } from "vitest";
import { z } from "zod";
import { introspectEnvSchema } from "../introspect.js";
import { generateTfvars } from "./tfvars.js";

const SCHEMA = z.object({
  APP_ENV: z.enum(["local", "prod"]).default("local"),
  DB_HOST: z.string().describe("Primary database host"),
  DB_PASSWORD: z.string().describe("Primary database password"),
  CACHE_TTL_S: z.coerce.number().default(30),
});

const FIELDS = introspectEnvSchema(SCHEMA);

describe("generateTfvars", () => {
  it("emits HCL key = value lines for every field", () => {
    const out = generateTfvars(FIELDS);
    expect(out).toMatch(/DB_HOST\s*=\s*"REPLACE_ME"/);
    expect(out).toMatch(/APP_ENV\s*=\s*"local"/);
  });

  it("includes the field description as a comment", () => {
    const out = generateTfvars(FIELDS);
    expect(out).toContain("# Primary database host");
    expect(out).toContain("# Primary database password");
  });

  it("groups secrets under a divider when groupSecrets=true (default)", () => {
    const out = generateTfvars(FIELDS);
    const secretsIdx = out.indexOf("# --- Secrets ---");
    const dbPwdIdx = out.indexOf("DB_PASSWORD");
    const dbHostIdx = out.indexOf("DB_HOST");
    expect(secretsIdx).toBeGreaterThan(-1);
    expect(secretsIdx).toBeLessThan(dbPwdIdx);
    expect(dbHostIdx).toBeLessThan(secretsIdx);
  });

  it("secret defaults are masked with REPLACE_ME", () => {
    const out = generateTfvars(FIELDS);
    expect(out).toMatch(/DB_PASSWORD\s*=\s*"REPLACE_ME"/);
  });

  it("uses the schema default for non-secret optional fields", () => {
    const out = generateTfvars(FIELDS);
    expect(out).toMatch(/CACHE_TTL_S\s*=\s*30\b/); // numeric, unquoted
  });

  it("emits boolean values as bare true/false", () => {
    const schema = z.object({
      DEBUG: z.coerce.boolean().default(false),
    });
    const fields = introspectEnvSchema(schema);
    const out = generateTfvars(fields);
    expect(out).toMatch(/DEBUG\s*=\s*false\b/);
  });

  it("respects an explicit values override", () => {
    const out = generateTfvars(FIELDS, {
      values: { DB_HOST: "prod-db.example.com" },
    });
    expect(out).toMatch(/DB_HOST\s*=\s*"prod-db\.example\.com"/);
    // Other keys unchanged
    expect(out).toMatch(/DB_PASSWORD\s*=\s*"REPLACE_ME"/);
  });

  it("respects groupSecrets=false (no divider)", () => {
    const out = generateTfvars(FIELDS, { groupSecrets: false });
    expect(out).not.toContain("# --- Secrets ---");
  });
});
