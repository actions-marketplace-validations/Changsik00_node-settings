import { describe, expect, it } from "vitest";
import { z } from "zod";
import { introspectEnvSchema } from "../introspect.js";
import { generateComposeFragment } from "./compose.js";

const SCHEMA = z.object({
  APP_ENV: z.enum(["local", "prod"]).default("local"),
  DB_HOST: z.string().describe("Primary database host"),
  DB_PASSWORD: z.string(),
  CACHE_TTL_S: z.coerce.number().default(30),
});

const FIELDS = introspectEnvSchema(SCHEMA);

describe("generateComposeFragment — service style (default)", () => {
  it("emits a services: snippet with the default service name 'app'", () => {
    const out = generateComposeFragment(FIELDS);
    expect(out).toMatch(/^services:$/m);
    expect(out).toMatch(/^ {2}app:$/m);
    expect(out).toMatch(/^ {4}environment:$/m);
  });

  it("uses ${VAR:-default} for non-secret optionals with a schema default", () => {
    const out = generateComposeFragment(FIELDS);
    expect(out).toMatch(/APP_ENV: "\$\{APP_ENV:-local\}"/);
    expect(out).toMatch(/CACHE_TTL_S: "\$\{CACHE_TTL_S:-30\}"/);
  });

  it("uses ${VAR} (no default) for required and secret fields", () => {
    const out = generateComposeFragment(FIELDS);
    expect(out).toMatch(/DB_HOST: "\$\{DB_HOST\}"/);
    expect(out).toMatch(/DB_PASSWORD: "\$\{DB_PASSWORD\}"/);
  });

  it("custom serviceName is used in the snippet", () => {
    const out = generateComposeFragment(FIELDS, { serviceName: "web" });
    expect(out).toMatch(/^ {2}web:$/m);
  });

  it("description renders as comments above the key", () => {
    const out = generateComposeFragment(FIELDS);
    expect(out).toContain("# Primary database host");
  });

  it("respects an explicit values override (no interpolation)", () => {
    const out = generateComposeFragment(FIELDS, {
      values: { DB_HOST: "db.example.com" },
    });
    expect(out).toMatch(/DB_HOST: "db\.example\.com"/);
    expect(out).not.toMatch(/DB_HOST: "\$\{DB_HOST/);
  });
});

describe("generateComposeFragment — env-file style", () => {
  it("emits a flat KEY=VALUE file", () => {
    const out = generateComposeFragment(FIELDS, { style: "env-file" });
    expect(out).toMatch(/^APP_ENV=local$/m);
    expect(out).toMatch(/^CACHE_TTL_S=30$/m);
  });

  it("required and secret values get REPLACE_ME", () => {
    const out = generateComposeFragment(FIELDS, { style: "env-file" });
    expect(out).toMatch(/^DB_HOST=REPLACE_ME$/m);
    expect(out).toMatch(/^DB_PASSWORD=REPLACE_ME$/m);
  });

  it("overrides win over defaults / REPLACE_ME", () => {
    const out = generateComposeFragment(FIELDS, {
      style: "env-file",
      values: { DB_HOST: "db.example.com", DB_PASSWORD: "literal-secret" },
    });
    expect(out).toMatch(/^DB_HOST=db\.example\.com$/m);
    expect(out).toMatch(/^DB_PASSWORD=literal-secret$/m);
  });
});
