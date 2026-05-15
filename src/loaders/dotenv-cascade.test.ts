import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDotenvCascade } from "./dotenv-cascade.js";

describe("loadDotenvCascade", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "node-settings-cascade-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("loads .env when no other files exist", () => {
    writeFileSync(join(cwd, ".env"), "FOO=base\nAPP_ENV=local");
    const { env, mode, loaded } = loadDotenvCascade({ cwd, source: {} });
    expect(env.FOO).toBe("base");
    expect(mode).toBe("local");
    expect(loaded.some((p) => p.endsWith(".env"))).toBe(true);
  });

  it("falls back to defaultMode when APP_ENV is absent everywhere", () => {
    writeFileSync(join(cwd, ".env"), "FOO=x");
    const result = loadDotenvCascade({ cwd, source: {} });
    expect(result.mode).toBe("local");
  });

  it("source (process.env) determines mode and wins over file values", () => {
    writeFileSync(join(cwd, ".env"), "FOO=base\nAPP_ENV=local");
    writeFileSync(join(cwd, ".env.dev"), "FOO=dev-val\nDB=dev-db");
    const result = loadDotenvCascade({
      cwd,
      source: { APP_ENV: "dev", FOO: "from-process" },
    });
    expect(result.mode).toBe("dev");
    expect(result.env.FOO).toBe("from-process"); // source wins
    expect(result.env.DB).toBe("dev-db"); // file fills in
  });

  it("cascades in correct order: .env -> .env.local -> .env.<mode> -> .env.<mode>.local", () => {
    writeFileSync(join(cwd, ".env"), "LAYER=base");
    writeFileSync(join(cwd, ".env.local"), "LAYER=local");
    writeFileSync(join(cwd, ".env.dev"), "LAYER=dev");
    writeFileSync(join(cwd, ".env.dev.local"), "LAYER=dev-local");
    const { env } = loadDotenvCascade({
      cwd,
      source: { APP_ENV: "dev" },
    });
    expect(env.LAYER).toBe("dev-local");
  });

  it("reads APP_ENV from .env when source doesn't have it", () => {
    writeFileSync(join(cwd, ".env"), "APP_ENV=stage");
    writeFileSync(join(cwd, ".env.stage"), "STAGE_ONLY=1");
    const result = loadDotenvCascade({ cwd, source: {} });
    expect(result.mode).toBe("stage");
    expect(result.env.STAGE_ONLY).toBe("1");
  });

  it("skips .local files in 'test' mode by default", () => {
    writeFileSync(join(cwd, ".env"), "BASE=x");
    writeFileSync(join(cwd, ".env.local"), "LOCAL=should-not-appear");
    writeFileSync(join(cwd, ".env.test"), "TEST=yes");
    writeFileSync(
      join(cwd, ".env.test.local"),
      "LOCAL_TEST=should-not-appear",
    );
    const { env, loaded, skipped } = loadDotenvCascade({
      cwd,
      source: { APP_ENV: "test" },
    });
    expect(env.LOCAL).toBeUndefined();
    expect(env.LOCAL_TEST).toBeUndefined();
    expect(env.TEST).toBe("yes");
    expect(loaded.some((p) => p.endsWith(".env.test"))).toBe(true);
    expect(skipped.some((p) => p.endsWith(".env.local"))).toBe(true);
    expect(skipped.some((p) => p.endsWith(".env.test.local"))).toBe(true);
  });

  it("respects a custom skipLocalFor list", () => {
    writeFileSync(join(cwd, ".env.prod.local"), "SECRET=do-not-load");
    const { env, skipped } = loadDotenvCascade({
      cwd,
      source: { APP_ENV: "prod" },
      skipLocalFor: ["prod"],
    });
    expect(env.SECRET).toBeUndefined();
    expect(skipped.some((p) => p.endsWith(".env.prod.local"))).toBe(true);
  });

  it("handles a totally empty cwd", () => {
    const result = loadDotenvCascade({ cwd, source: {} });
    expect(result.mode).toBe("local");
    expect(result.loaded).toHaveLength(0);
    expect(result.env.APP_ENV).toBe("local"); // synthesised
  });

  it("uses custom appEnvKey", () => {
    writeFileSync(join(cwd, ".env"), "MY_STAGE=dev");
    writeFileSync(join(cwd, ".env.dev"), "MARKER=dev-file");
    const { env, mode } = loadDotenvCascade({
      cwd,
      source: {},
      appEnvKey: "MY_STAGE",
    });
    expect(mode).toBe("dev");
    expect(env.MARKER).toBe("dev-file");
  });
});
