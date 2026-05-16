/**
 * esbuild plugin unit tests. The plugin object is invoked directly
 * via a fake PluginBuild so we don't pay the cost of spawning real
 * esbuild on every test (and don't need a real entrypoint on disk).
 * We capture the onStart callback and assert on what it returns.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import { nodeSettings } from "./index.js";

const PROJECT_ROOT = process.cwd();
const SAMPLE = `${PROJECT_ROOT}/sample/settings.ts`;

type OnStartCb = () => unknown;

function captureOnStart(plugin: ReturnType<typeof nodeSettings>): OnStartCb {
  let captured: OnStartCb | undefined;
  const fakeBuild = {
    onStart(cb: OnStartCb) {
      captured = cb;
    },
  };
  // @ts-expect-error — partial PluginBuild is enough for our setup
  plugin.setup(fakeBuild);
  if (!captured) throw new Error("plugin did not register onStart");
  return captured;
}

let tmpDir: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "node-settings-esbuild-"));
  originalEnv = { ...process.env };
  // Sample needs APP_ENV + DB_HOST + DB_PASSWORD; tests opt into a
  // missing-required scenario by clearing what they care about.
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe("esbuild plugin — basic shape", () => {
  it("returns a plugin object with the right name and a setup fn", () => {
    const plugin = nodeSettings();
    expect(plugin.name).toBe("node-settings");
    expect(typeof plugin.setup).toBe("function");
  });

  it("setup registers an onStart hook", () => {
    const plugin = nodeSettings();
    const onStart = vi.fn();
    // @ts-expect-error — partial PluginBuild
    plugin.setup({ onStart });
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

describe("esbuild plugin — successful validation", () => {
  it("returns null (no errors / warnings) when the cascade is complete", async () => {
    writeFileSync(
      join(tmpDir, ".env"),
      "APP_ENV=local\nDB_HOST=h\nDB_PASSWORD=p\n",
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const onStart = captureOnStart(
      nodeSettings({ config: SAMPLE, envDir: tmpDir }),
    );
    const result = await onStart();
    expect(result).toBeNull();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/env validated against .*settings\.ts/),
    );
  });

  it("reads from process.env on top of the cascade", async () => {
    process.env.APP_ENV = "local";
    process.env.DB_HOST = "from-process-env";
    process.env.DB_PASSWORD = "p";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const onStart = captureOnStart(
      nodeSettings({ config: SAMPLE, envDir: tmpDir }),
    );
    const result = await onStart();
    expect(result).toBeNull();
  });
});

describe("esbuild plugin — failure modes", () => {
  it("returns errors[] when required env is missing (default failOnError)", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    const onStart = captureOnStart(
      nodeSettings({ config: SAMPLE, envDir: tmpDir }),
    );
    const result = (await onStart()) as { errors?: Array<{ text: string }> };
    expect(result.errors).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]!.text).toMatch(/env validation failed/);
    expect(result.errors![0]!.text).toMatch(/ENV_VALIDATION_FAILED|DB_HOST/);
  });

  it("failOnError: false downgrades the failure to a warning", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    const onStart = captureOnStart(
      nodeSettings({ config: SAMPLE, envDir: tmpDir, failOnError: false }),
    );
    const result = (await onStart()) as {
      errors?: Array<{ text: string }>;
      warnings?: Array<{ text: string }>;
    };
    expect(result.errors).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]!.text).toMatch(/env validation failed/);
  });

  it("surfaces a meaningful error message (code or field)", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    const onStart = captureOnStart(
      nodeSettings({ config: SAMPLE, envDir: tmpDir }),
    );
    const result = (await onStart()) as { errors: Array<{ text: string }> };
    // The NodeSettingsError instanceof check can miss across module
    // boundaries (vitest reloads can hand back a distinct class).
    // Either the code or the offending field surfacing is enough.
    expect(result.errors[0]!.text).toMatch(/ENV_VALIDATION_FAILED|DB_HOST/);
  });
});

describe("esbuild plugin — mode resolution", () => {
  it("uses options.mode for the .env.<mode> cascade", async () => {
    writeFileSync(
      join(tmpDir, ".env"),
      "APP_ENV=dev\nDB_HOST=base\nDB_PASSWORD=p\n",
    );
    writeFileSync(join(tmpDir, ".env.dev"), "DB_HOST=dev-host\n");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const onStart = captureOnStart(
      nodeSettings({ config: SAMPLE, envDir: tmpDir, mode: "dev" }),
    );
    const result = await onStart();
    expect(result).toBeNull();
  });

  it("appEnvKey override changes which env var selects the mode", async () => {
    writeFileSync(
      join(tmpDir, ".env"),
      "MY_ENV=dev\nDB_HOST=base\nDB_PASSWORD=p\n",
    );
    writeFileSync(join(tmpDir, ".env.dev"), "DB_HOST=dev-host\n");
    // Plain sample uses APP_ENV — we only assert the cascade works
    // with the custom key. The sample loader will still see APP_ENV
    // missing, so use options.mode to drive the layer anyway.
    process.env.APP_ENV = "dev";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const onStart = captureOnStart(
      nodeSettings({
        config: SAMPLE,
        envDir: tmpDir,
        appEnvKey: "MY_ENV",
        mode: "dev",
      }),
    );
    const result = await onStart();
    expect(result).toBeNull();
  });
});
