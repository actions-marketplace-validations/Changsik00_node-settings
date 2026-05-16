/**
 * Vite plugin unit tests. The plugin object is invoked directly (no
 * real Vite). Rollup `this` is faked with spies on `info` / `warn` /
 * `error` so we can assert on the channels the plugin chose.
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

interface FakePluginContext {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
}

function makeCtx(): FakePluginContext {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn((msg: string) => {
      // Match rollup behaviour: this.error throws.
      throw new Error(typeof msg === "string" ? msg : (msg as Error).message);
    }),
  };
}

async function invokeAllHooks(
  plugin: ReturnType<typeof nodeSettings>,
  opts: {
    mode: string;
    command: "build" | "serve";
    envDir: string;
    ctx: FakePluginContext;
  },
) {
  const fakeConfigEnv = {
    command: opts.command,
    mode: opts.mode,
    isPreview: false,
    isSsrBuild: false,
  };
  // @ts-expect-error — plugin.config can be a fn or object
  await plugin.config({}, fakeConfigEnv);
  // @ts-expect-error — plugin.configResolved expects ResolvedConfig
  await plugin.configResolved({
    envDir: opts.envDir,
    root: opts.envDir,
  });
  // @ts-expect-error — buildStart is invoked with rollup PluginContext
  await plugin.buildStart.call(opts.ctx);
}

let tmpDir: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "node-settings-vite-"));
  originalEnv = { ...process.env };
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  process.env = originalEnv;
});

describe("Vite plugin — basic shape", () => {
  it("returns a plugin object with the right name and hooks", () => {
    const plugin = nodeSettings();
    expect(plugin.name).toBe("node-settings");
    expect(plugin.enforce).toBe("pre");
    expect(typeof plugin.config).toBe("function");
    expect(typeof plugin.configResolved).toBe("function");
    expect(typeof plugin.buildStart).toBe("function");
  });
});

describe("Vite plugin — successful validation", () => {
  it("passes with a complete .env file in serve mode", async () => {
    writeFileSync(
      join(tmpDir, ".env.local"),
      "APP_ENV=local\nDB_HOST=h\nDB_PASSWORD=p\n",
    );
    const ctx = makeCtx();
    const plugin = nodeSettings({ config: SAMPLE });
    await invokeAllHooks(plugin, {
      mode: "local",
      command: "serve",
      envDir: tmpDir,
      ctx,
    });
    expect(ctx.error).not.toHaveBeenCalled();
    expect(ctx.warn).not.toHaveBeenCalled();
    expect(ctx.info).toHaveBeenCalled();
    expect(ctx.info.mock.calls[0]![0]).toMatch(/env validated/);
  });

  it("uses process.env on top of the cascade", async () => {
    // No .env files; everything from process.env.
    process.env.APP_ENV = "local";
    process.env.DB_HOST = "from-process-env";
    process.env.DB_PASSWORD = "p";
    const ctx = makeCtx();
    const plugin = nodeSettings({ config: SAMPLE });
    await invokeAllHooks(plugin, {
      mode: "local",
      command: "build",
      envDir: tmpDir,
      ctx,
    });
    expect(ctx.error).not.toHaveBeenCalled();
  });
});

describe("Vite plugin — failure modes", () => {
  it("vite build aborts when required env is missing", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    const ctx = makeCtx();
    const plugin = nodeSettings({ config: SAMPLE });
    await expect(
      invokeAllHooks(plugin, {
        mode: "local",
        command: "build",
        envDir: tmpDir,
        ctx,
      }),
    ).rejects.toThrow(/env validation failed/);
    expect(ctx.error).toHaveBeenCalledTimes(1);
  });

  it("vite serve aborts by default on validation failure", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    const ctx = makeCtx();
    const plugin = nodeSettings({ config: SAMPLE });
    await expect(
      invokeAllHooks(plugin, {
        mode: "local",
        command: "serve",
        envDir: tmpDir,
        ctx,
      }),
    ).rejects.toThrow(/env validation failed/);
  });

  it("failOnDev: false downgrades dev failure to a warning", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    const ctx = makeCtx();
    const plugin = nodeSettings({ config: SAMPLE, failOnDev: false });
    await invokeAllHooks(plugin, {
      mode: "local",
      command: "serve",
      envDir: tmpDir,
      ctx,
    });
    expect(ctx.error).not.toHaveBeenCalled();
    expect(ctx.warn).toHaveBeenCalledTimes(1);
    expect(ctx.warn.mock.calls[0]![0]).toMatch(/failOnDev=false/);
  });

  it("failOnDev: false still fails on build", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    const ctx = makeCtx();
    const plugin = nodeSettings({ config: SAMPLE, failOnDev: false });
    await expect(
      invokeAllHooks(plugin, {
        mode: "local",
        command: "build",
        envDir: tmpDir,
        ctx,
      }),
    ).rejects.toThrow(/env validation failed/);
  });

  it("surfaces NodeSettingsError code when the wrapped error has one", async () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PASSWORD;
    const ctx = makeCtx();
    const plugin = nodeSettings({ config: SAMPLE });
    try {
      await invokeAllHooks(plugin, {
        mode: "local",
        command: "build",
        envDir: tmpDir,
        ctx,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/ENV_VALIDATION_FAILED|DB_HOST/);
    }
  });
});

describe("Vite plugin — mode resolution", () => {
  it("uses Vite's mode for the .env.<mode> cascade", async () => {
    writeFileSync(
      join(tmpDir, ".env"),
      "APP_ENV=dev\nDB_HOST=base\nDB_PASSWORD=p\n",
    );
    writeFileSync(
      join(tmpDir, ".env.dev"),
      "DB_HOST=dev-host\n",
    );
    const ctx = makeCtx();
    const plugin = nodeSettings({ config: SAMPLE });
    await invokeAllHooks(plugin, {
      mode: "dev",
      command: "build",
      envDir: tmpDir,
      ctx,
    });
    expect(ctx.error).not.toHaveBeenCalled();
  });

  it("options.mode overrides Vite's mode", async () => {
    writeFileSync(
      join(tmpDir, ".env.dev"),
      "APP_ENV=dev\nDB_HOST=dev-h\nDB_PASSWORD=p\n",
    );
    const ctx = makeCtx();
    const plugin = nodeSettings({ config: SAMPLE, mode: "dev" });
    await invokeAllHooks(plugin, {
      // Vite says production, but options.mode overrides.
      mode: "production",
      command: "build",
      envDir: tmpDir,
      ctx,
    });
    expect(ctx.error).not.toHaveBeenCalled();
  });
});
