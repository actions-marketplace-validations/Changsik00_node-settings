/**
 * Next.js plugin tests. The HOF is invoked directly with fake env;
 * we don't spawn `next build` (way too heavy for a unit test). The
 * plugin's responsibility is just to run validation, throw cleanly,
 * and pass the user's nextConfig through on success — which is what
 * these tests exercise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withNodeSettings } from "./index.js";

const PROJECT_ROOT = process.cwd();
const SAMPLE = `${PROJECT_ROOT}/sample/settings.ts`;

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  // The sample's APP_ENV defaults to 'local' so local + DB_HOST + DB_PASSWORD
  // is the easiest happy path.
  delete process.env.NEXT_PHASE;
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe("withNodeSettings — happy path", () => {
  it("passes the user's nextConfig through on success", async () => {
    process.env.APP_ENV = "local";
    process.env.DB_HOST = "h";
    process.env.DB_PASSWORD = "p";
    const userConfig = { reactStrictMode: true };
    const out = await withNodeSettings(userConfig, { config: SAMPLE });
    expect(out).toBe(userConfig);
  });

  it("returns an empty config if none was passed", async () => {
    process.env.APP_ENV = "local";
    process.env.DB_HOST = "h";
    process.env.DB_PASSWORD = "p";
    const out = await withNodeSettings(undefined, { config: SAMPLE });
    expect(out).toEqual({});
  });
});

describe("withNodeSettings — build phase", () => {
  it("throws on validation failure during `next build`", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    process.env.NEXT_PHASE = "phase-production-build";
    await expect(
      withNodeSettings({}, { config: SAMPLE }),
    ).rejects.toThrow(/env validation failed/);
  });

  it("throws on validation failure during `next export` (legacy)", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    process.env.NEXT_PHASE = "phase-export";
    await expect(
      withNodeSettings({}, { config: SAMPLE }),
    ).rejects.toThrow(/env validation failed/);
  });
});

describe("withNodeSettings — dev phase", () => {
  it("throws by default during `next dev`", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    process.env.NEXT_PHASE = "phase-development-server";
    await expect(
      withNodeSettings({}, { config: SAMPLE }),
    ).rejects.toThrow(/env validation failed/);
  });

  it("failOnDev: false downgrades to a warning during `next dev`", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    process.env.NEXT_PHASE = "phase-development-server";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await withNodeSettings(
      { reactStrictMode: true },
      { config: SAMPLE, failOnDev: false },
    );
    expect(out).toEqual({ reactStrictMode: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/failOnDev=false/);
  });

  it("failOnDev: false still throws during `next build`", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    process.env.NEXT_PHASE = "phase-production-build";
    await expect(
      withNodeSettings({}, { config: SAMPLE, failOnDev: false }),
    ).rejects.toThrow(/env validation failed/);
  });
});

describe("withNodeSettings — error surface", () => {
  it("surfaces the NodeSettingsError code in the thrown message", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    process.env.NEXT_PHASE = "phase-production-build";
    try {
      await withNodeSettings({}, { config: SAMPLE });
      expect.fail("expected throw");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/ENV_VALIDATION_FAILED|DB_HOST/);
    }
  });
});
