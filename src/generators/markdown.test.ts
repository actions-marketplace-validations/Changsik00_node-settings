import { describe, expect, it } from "vitest";
import { z } from "zod";
import { introspectEnvSchema } from "../introspect.js";
import { generateMarkdownDocs } from "./markdown.js";

describe("generateMarkdownDocs", () => {
  it("emits a Markdown table with one row per field", () => {
    const schema = z.object({
      APP_ENV: z.enum(["local", "prod"]).default("local"),
      DB_HOST: z.string().describe("primary db host"),
      DB_PASSWORD: z.string(),
    });
    const fields = introspectEnvSchema(schema);
    const out = generateMarkdownDocs(fields, { title: "Service Env" });
    expect(out).toContain("# Service Env");
    expect(out).toContain(
      "| Key | Type | Required | Default | Secret | Description |",
    );
    expect(out).toMatch(/\| `APP_ENV` \| enum/);
    expect(out).toMatch(/\| `DB_HOST` \| `string` \| yes \| — \| — \| primary db host/);
    expect(out).toMatch(/\| `DB_PASSWORD` \| `string` \| yes \| — \| yes \|/);
  });

  it("escapes pipe characters inside descriptions", () => {
    const schema = z.object({
      FOO: z.string().describe("a | b"),
    });
    const out = generateMarkdownDocs(introspectEnvSchema(schema));
    expect(out).toContain("a \\| b");
  });
});
