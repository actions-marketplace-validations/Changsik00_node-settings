import { describe, expect, it } from "vitest";
import { z } from "zod";
import { introspectEnvSchema } from "./introspect.js";
import { diffAgainstSchema, parseK8sYaml } from "./diff-k8s.js";

const SCHEMA = z.object({
  APP_ENV: z.enum(["local", "prod"]).default("local"),
  DB_HOST: z.string().describe("Primary database host"),
  DB_PASSWORD: z.string().describe("Primary database password"),
  CACHE_URL: z.string().optional(),
});

const FIELDS = introspectEnvSchema(SCHEMA);

const HAPPY_YAML = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: demo-config
data:
  APP_ENV: prod
  DB_HOST: db.example.com
---
apiVersion: v1
kind: Secret
metadata:
  name: demo-secret
type: Opaque
stringData:
  DB_PASSWORD: super-secret
`;

describe("parseK8sYaml", () => {
  it("extracts ConfigMap data keys and Secret stringData keys", () => {
    const parsed = parseK8sYaml(HAPPY_YAML);
    expect(parsed.configMapKeys).toEqual(["APP_ENV", "DB_HOST"]);
    expect(parsed.secretKeys).toEqual(["DB_PASSWORD"]);
  });

  it("merges Secret.data + Secret.stringData", () => {
    const yaml = `
apiVersion: v1
kind: Secret
metadata:
  name: s
type: Opaque
data:
  TOKEN_A: dG9rZW4tYQ==
stringData:
  TOKEN_B: token-b
`;
    const parsed = parseK8sYaml(yaml);
    expect(parsed.secretKeys.sort()).toEqual(["TOKEN_A", "TOKEN_B"]);
  });

  it("ignores unrelated kinds (Deployment, Service, etc.)", () => {
    const yaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 1
`;
    const parsed = parseK8sYaml(yaml);
    expect(parsed.configMapKeys).toEqual([]);
    expect(parsed.secretKeys).toEqual([]);
  });

  it("returns empty sets on an empty input", () => {
    const parsed = parseK8sYaml("");
    expect(parsed.configMapKeys).toEqual([]);
    expect(parsed.secretKeys).toEqual([]);
  });
});

describe("diffAgainstSchema — happy path", () => {
  it("reports no issues when ConfigMap + Secret match the schema", () => {
    const report = diffAgainstSchema(parseK8sYaml(HAPPY_YAML), FIELDS);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.counts.errors).toBe(0);
    expect(report.counts.warnings).toBe(0);
  });
});

describe("diffAgainstSchema — error categories", () => {
  it("flags missing-required when a required key is in neither manifest", () => {
    const yaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm
data:
  APP_ENV: prod
`;
    const report = diffAgainstSchema(parseK8sYaml(yaml), FIELDS);
    expect(report.ok).toBe(false);
    const codes = report.issues.map((i) => i.kind).sort();
    // DB_HOST and DB_PASSWORD are both required and missing
    expect(codes).toContain("missing-required");
    const dbHost = report.issues.find(
      (i) => i.kind === "missing-required" && i.key === "DB_HOST",
    );
    expect(dbHost).toBeDefined();
    expect(dbHost!.severity).toBe("error");
  });

  it("flags secret-in-configmap when a secret-marked key sits in a ConfigMap", () => {
    const yaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm
data:
  APP_ENV: prod
  DB_HOST: db.example.com
  DB_PASSWORD: oops-this-is-public
`;
    const report = diffAgainstSchema(parseK8sYaml(yaml), FIELDS);
    expect(report.ok).toBe(false);
    const issue = report.issues.find(
      (i) => i.kind === "secret-in-configmap" && i.key === "DB_PASSWORD",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");
    expect(issue!.foundIn).toBe("ConfigMap");
  });
});

describe("diffAgainstSchema — warning categories", () => {
  it("flags public-in-secret when a non-secret key lives in a Secret", () => {
    const yaml = `
apiVersion: v1
kind: Secret
metadata:
  name: s
type: Opaque
stringData:
  APP_ENV: prod
  DB_HOST: db.example.com
  DB_PASSWORD: secret
`;
    const report = diffAgainstSchema(parseK8sYaml(yaml), FIELDS);
    // ok because no errors (DB_HOST + APP_ENV present, just oddly placed)
    expect(report.ok).toBe(true);
    const warnKinds = report.issues
      .filter((i) => i.severity === "warning")
      .map((i) => i.kind);
    expect(warnKinds).toContain("public-in-secret");
  });

  it("flags extra-key for live keys not declared in the schema", () => {
    const yaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm
data:
  APP_ENV: prod
  DB_HOST: db.example.com
  LEGACY_KEY: leftover-from-old-deploy
---
apiVersion: v1
kind: Secret
metadata:
  name: s
type: Opaque
stringData:
  DB_PASSWORD: secret
`;
    const report = diffAgainstSchema(parseK8sYaml(yaml), FIELDS);
    expect(report.ok).toBe(true);
    const extra = report.issues.find(
      (i) => i.kind === "extra-key" && i.key === "LEGACY_KEY",
    );
    expect(extra).toBeDefined();
    expect(extra!.severity).toBe("warning");
    expect(extra!.foundIn).toBe("ConfigMap");
  });

  it("optional schema keys missing from live = no issue", () => {
    // CACHE_URL is optional in the sample schema
    const report = diffAgainstSchema(parseK8sYaml(HAPPY_YAML), FIELDS);
    const cacheIssue = report.issues.find((i) => i.key === "CACHE_URL");
    expect(cacheIssue).toBeUndefined();
  });
});

describe("diffAgainstSchema — observed mirror", () => {
  it("returns the parsed key sets for downstream rendering", () => {
    const report = diffAgainstSchema(parseK8sYaml(HAPPY_YAML), FIELDS);
    expect(report.observed.configMapKeys).toEqual(["APP_ENV", "DB_HOST"]);
    expect(report.observed.secretKeys).toEqual(["DB_PASSWORD"]);
  });
});
