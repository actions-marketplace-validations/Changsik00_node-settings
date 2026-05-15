/**
 * End-to-end CLI tests against the canonical `sample/` directory.
 *
 * These call `runCli` (the programmatic entry point used by `bin.js`)
 * instead of spawning the binary, so the test stays fast and integrates
 * with the normal vitest run. The bin shim itself is trivial — it just
 * calls runCli and forwards the exit code — and is exercised by
 * `scripts/verify-dist.mjs` after build.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { runCli } from "./index.js";

const SAMPLE = "sample/settings.ts";

interface Capture {
  logs: string[];
  errs: string[];
  stdout: string[];
  stderr: string[];
}

let capture: Capture;
let tmp: string;

beforeEach(() => {
  capture = { logs: [], errs: [], stdout: [], stderr: [] };
  vi.spyOn(console, "log").mockImplementation((...args) => {
    capture.logs.push(args.map((a) => String(a)).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args) => {
    capture.errs.push(args.map((a) => String(a)).join(" "));
  });
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    capture.stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    capture.stderr.push(String(chunk));
    return true;
  });
  tmp = mkdtempSync(join(tmpdir(), "node-settings-e2e-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmp, { recursive: true, force: true });
});

describe("CLI e2e — inspect", () => {
  it("prints schema + layered config for every perEnv branch", async () => {
    const code = await runCli(["inspect", "--config", SAMPLE]);
    expect(code).toBe(0);
    const out = capture.logs.join("\n");
    expect(out).toContain("envKey=APP_ENV");
    expect(out).toContain("DB_HOST (string, required)");
    expect(out).toContain("DB_PASSWORD (string, required, secret)");
    expect(out).toContain("layered config for APP_ENV=local");
    expect(out).toContain("layered config for APP_ENV=prod");
  });

  it("--env=prod renders <TODO> for the unfilled cdnDomain", async () => {
    const code = await runCli([
      "inspect",
      "--config",
      SAMPLE,
      "--env=prod",
    ]);
    expect(code).toBe(0);
    const out = capture.logs.join("\n");
    expect(out).toContain("cdnDomain: <TODO:");
    expect(out).not.toContain("layered config for APP_ENV=local");
  });
});

describe("CLI e2e — validate", () => {
  it("returns 1 when the env file is missing required vars", async () => {
    const envFile = join(tmp, ".env.local");
    // Write a .env file that satisfies the sample schema...
    require("node:fs").writeFileSync(
      envFile,
      "APP_ENV=local\nDB_HOST=h\nDB_PASSWORD=p\n",
    );
    const code = await runCli([
      "validate",
      envFile,
      "--config",
      SAMPLE,
    ]);
    expect(code).toBe(0);
    expect(capture.logs.join("\n")).toContain("OK");
  });

  it("returns 1 when the env file is incomplete", async () => {
    const envFile = join(tmp, ".env.broken");
    require("node:fs").writeFileSync(envFile, "APP_ENV=local\n"); // missing DB_HOST
    const code = await runCli([
      "validate",
      envFile,
      "--config",
      SAMPLE,
    ]);
    expect(code).toBe(1);
    expect(capture.errs.join("\n")).toMatch(/FAIL|DB_HOST/);
  });

  it("returns 2 when the env file does not exist", async () => {
    const code = await runCli([
      "validate",
      "/tmp/nonexistent-node-settings-test.env",
      "--config",
      SAMPLE,
    ]);
    expect(code).toBe(2);
  });
});

describe("CLI e2e — check", () => {
  it("exits non-zero when prod has an unfilled todo and no envValues", async () => {
    const code = await runCli(["check", "--config", SAMPLE]);
    expect(code).toBe(1);
    const out = (capture.logs.concat(capture.errs)).join("\n");
    expect(out).toContain("prod");
    expect(out).toMatch(/unfilled todo|missing-required-env/);
  });
});

describe("CLI e2e — generate", () => {
  it("generate env-example writes the rendered template to --out", async () => {
    const out = join(tmp, ".env.example");
    const code = await runCli([
      "generate",
      "env-example",
      "--config",
      SAMPLE,
      "--out",
      out,
    ]);
    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const text = readFileSync(out, "utf8");
    expect(text).toContain("APP_ENV");
    expect(text).toContain("DB_HOST");
    expect(text).toMatch(/# DB_PASSWORD .*secret/);
  });

  it("generate envs writes one file per perEnv branch", async () => {
    const code = await runCli([
      "generate",
      "envs",
      "--config",
      SAMPLE,
      "--out-dir",
      tmp,
    ]);
    expect(code).toBe(0);
    const files = readdirSync(tmp).sort();
    expect(files).toEqual([
      ".env.dev.example",
      ".env.local.example",
      ".env.prod.example",
      ".env.stage.example",
    ]);
    const prod = readFileSync(join(tmp, ".env.prod.example"), "utf8");
    expect(prod).toContain("APP_ENV=prod");
  });

  it("generate docs writes a Markdown table", async () => {
    const out = join(tmp, "ENV.md");
    const code = await runCli([
      "generate",
      "docs",
      "--config",
      SAMPLE,
      "--out",
      out,
    ]);
    expect(code).toBe(0);
    const text = readFileSync(out, "utf8");
    expect(text).toContain("# Environment Variables");
    expect(text).toContain("| `DB_HOST` |");
  });

  it("generate k8s emits ConfigMap + Secret yaml", async () => {
    const out = join(tmp, "k8s.yaml");
    const code = await runCli([
      "generate",
      "k8s",
      "--config",
      SAMPLE,
      "--name",
      "demo",
      "--namespace",
      "prod",
      "--out",
      out,
    ]);
    expect(code).toBe(0);
    const text = readFileSync(out, "utf8");
    expect(text).toContain("kind: ConfigMap");
    expect(text).toContain("kind: Secret");
    expect(text).toContain("name: demo-config");
    expect(text).toContain("name: demo-secret");
    expect(text).toContain("namespace: prod");
    // DB_PASSWORD ends up in the Secret, not the ConfigMap
    const cmStart = text.indexOf("kind: ConfigMap");
    const secStart = text.indexOf("kind: Secret");
    expect(text.slice(cmStart, secStart)).not.toContain("DB_PASSWORD");
    expect(text.slice(secStart)).toContain("DB_PASSWORD");
  });

  it("returns exit code 2 when generate target is missing", async () => {
    const code = await runCli(["generate"]);
    expect(code).toBe(2);
  });

  it("returns exit code 2 for an unknown generate target", async () => {
    const code = await runCli([
      "generate",
      "nonsense",
      "--config",
      SAMPLE,
    ]);
    expect(code).toBe(2);
  });
});

describe("CLI e2e — top-level dispatch", () => {
  it("prints help and exits 0 when no command is given", async () => {
    const code = await runCli([]);
    expect(code).toBe(0);
    expect(capture.stdout.join("")).toContain("node-settings");
  });

  it("exits 2 for an unknown command", async () => {
    const code = await runCli(["dunno"]);
    expect(code).toBe(2);
  });
});
