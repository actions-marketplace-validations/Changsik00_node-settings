import { describe, expect, it } from "vitest";
import { z } from "zod";
import { introspectEnvSchema } from "../introspect.js";
import { generateK8sManifests } from "./k8s.js";

const schema = z.object({
  APP_ENV: z.enum(["local", "prod"]).default("local"),
  DB_HOST: z.string(),
  DB_PASSWORD: z.string(),
  API_TOKEN: z.string(),
  PORT: z.coerce.number().default(3000),
});
const fields = introspectEnvSchema(schema);

describe("generateK8sManifests", () => {
  it("splits secrets from non-secrets into ConfigMap and Secret", () => {
    const result = generateK8sManifests(fields, {
      name: "my-app",
      namespace: "prod",
      values: {
        DB_HOST: "prod-db.internal",
        APP_ENV: "prod",
      },
    });

    expect(result.configMap).toContain("kind: ConfigMap");
    expect(result.configMap).toContain("name: my-app-config");
    expect(result.configMap).toContain("namespace: prod");
    expect(result.configMap).toContain('DB_HOST: "prod-db.internal"');
    expect(result.configMap).toContain('APP_ENV: "prod"');
    expect(result.configMap).toContain('PORT: "3000"');
    expect(result.configMap).not.toContain("DB_PASSWORD");
    expect(result.configMap).not.toContain("API_TOKEN");

    expect(result.secret).toContain("kind: Secret");
    expect(result.secret).toContain("name: my-app-secret");
    expect(result.secret).toContain("type: Opaque");
    expect(result.secret).toContain("stringData:");
    expect(result.secret).toContain('DB_PASSWORD: "REPLACE_ME"');
    expect(result.secret).toContain('API_TOKEN: "REPLACE_ME"');

    expect(result.yaml).toContain("---");
  });

  it("uses base64 'data' when inlineSecretValues is set", () => {
    const result = generateK8sManifests(fields, {
      name: "my-app",
      values: { DB_PASSWORD: "supersecret", API_TOKEN: "tok" },
      inlineSecretValues: true,
    });
    expect(result.secret).toContain("data:");
    const expected = Buffer.from("supersecret", "utf8").toString("base64");
    expect(result.secret).toContain(`DB_PASSWORD: ${expected}`);
  });

  it("emits a TODO marker for required fields with no value", () => {
    const result = generateK8sManifests(fields, { name: "svc" });
    expect(result.configMap).toContain(
      "# TODO: required, no default — provide before deploy",
    );
  });

  it("omits the Secret manifest when no secret fields exist", () => {
    const plainSchema = z.object({
      APP_ENV: z.enum(["local", "prod"]).default("local"),
      HOST: z.string(),
    });
    const result = generateK8sManifests(introspectEnvSchema(plainSchema), {
      name: "svc",
    });
    expect(result.secret).toBe("");
    expect(result.yaml).not.toContain("---");
  });

  it("throws when name is missing", () => {
    expect(() =>
      generateK8sManifests(fields, { name: "" } as unknown as {
        name: string;
      }),
    ).toThrow(/requires `name`/);
  });
});
