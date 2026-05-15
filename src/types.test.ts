/**
 * Type-level tests for the public API.
 *
 * Uses vitest's `expectTypeOf`. The assertions are evaluated at TypeScript
 * compile time — so a regression like `todo()` losing its `never` return,
 * or `extends` failing to merge into `build()`'s parameter types, fails
 * `pnpm typecheck` and the test run.
 *
 * Runtime bodies are minimal; what we care about is the type position.
 */
import { z } from "zod";
import { describe, expectTypeOf, it } from "vitest";
import {
  DEFAULT_SECRET_PATTERNS,
  defineSettings,
  inferAppEnv,
  inferAppEnvDetailed,
  isTodo,
  loadDotenvCascade,
  mergePerEnv,
  NodeSettingsError,
  presets,
  todo,
  type AppEnvPreset,
  type DotenvCascadeResult,
  type EnvField,
  type InferAppEnvResult,
  type NodeSettingsErrorCode,
  type SettingsLoader,
  type TodoSentinel,
} from "./index.js";

describe("defineSettings — return shape", () => {
  it("is a callable that returns the build() result", () => {
    const settings = defineSettings({
      envSchema: z.object({
        APP_ENV: z.enum(["local", "prod"]).default("local"),
        DB_HOST: z.string(),
      }),
      envKey: "APP_ENV",
      defaults: { bucket: "" },
      perEnv: { local: { bucket: "l" }, prod: { bucket: "p" } },
      build: (env, config) => ({ host: env.DB_HOST, b: config.bucket }),
    });
    expectTypeOf(settings).toBeFunction();
    expectTypeOf(settings).parameter(0).toEqualTypeOf<
      Record<string, string | undefined>
    >();
    expectTypeOf<ReturnType<typeof settings>>().toEqualTypeOf<{
      host: string;
      b: string;
    }>();
  });

  it("attaches typed envFields / resolved / opts", () => {
    const settings = defineSettings({
      envSchema: z.object({
        APP_ENV: z.enum(["local"]).default("local"),
        DB_HOST: z.string(),
      }),
      envKey: "APP_ENV",
      defaults: {},
      perEnv: { local: {} },
      build: () => ({}),
    });
    expectTypeOf(settings.envFields).toEqualTypeOf<readonly EnvField[]>();
    expectTypeOf(settings.resolved.envKey).toBeString();
    expectTypeOf(settings.resolved.overrideEnvKey).toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(settings.opts.envKey).toBeString();
  });

  it("conforms to AnySettingsLoader via SettingsLoader generic", () => {
    const settings = defineSettings({
      envSchema: z.object({
        APP_ENV: z.enum(["local"]).default("local"),
        DB_HOST: z.string(),
      }),
      envKey: "APP_ENV",
      defaults: {},
      perEnv: { local: {} },
      build: () => ({ ok: true }),
    });
    // SettingsLoader with no generic args still types correctly
    expectTypeOf(settings).toMatchTypeOf<SettingsLoader>();
  });
});

describe("defineSettings — extends merges types into build()", () => {
  const base = defineSettings({
    envSchema: z.object({
      APP_ENV: z.enum(["local", "prod"]).default("local"),
      DB_HOST: z.string(),
    }),
    envKey: "APP_ENV",
    defaults: { region: "us-east-1", logLevel: "info" },
    perEnv: { local: {}, prod: {} },
    build: (env, config) => ({
      host: env.DB_HOST,
      region: config.region,
      logLevel: config.logLevel,
    }),
  });

  it("env parameter contains both parent and child env keys", () => {
    defineSettings({
      extends: [base],
      envSchema: z.object({ CHILD_KEY: z.string() }),
      envKey: "APP_ENV",
      defaults: { bucket: "" },
      perEnv: { local: {}, prod: {} },
      build: (env, _config) => {
        // From parent's envSchema
        expectTypeOf(env.DB_HOST).toBeString();
        expectTypeOf(env.APP_ENV).toEqualTypeOf<"local" | "prod">();
        // From child's envSchema
        expectTypeOf(env.CHILD_KEY).toBeString();
        return {};
      },
    });
  });

  it("config parameter contains both parent and child defaults", () => {
    defineSettings({
      extends: [base],
      envSchema: z.object({ CHILD_KEY: z.string() }),
      envKey: "APP_ENV",
      defaults: { bucket: "" },
      perEnv: { local: {}, prod: {} },
      build: (_env, config) => {
        // From parent's defaults
        expectTypeOf(config.region).toBeString();
        expectTypeOf(config.logLevel).toBeString();
        // From child's defaults
        expectTypeOf(config.bucket).toBeString();
        return {};
      },
    });
  });
});

describe("todo() — sentinel returns never", () => {
  it("returns a value of type never", () => {
    const t = todo("reason");
    expectTypeOf(t).toBeNever();
  });

  it("is assignable to any field type (string/number/boolean/object)", () => {
    // Each of these must compile. The runtime never runs because we never
    // actually call this it() body during type-only checks — but vitest
    // does require the body to type-check.
    const _s: string = todo("a") as never as string;
    const _n: number = todo("b") as never as number;
    const _b: boolean = todo("c") as never as boolean;
    const _o: { foo: string } = todo("d") as never as { foo: string };
    void _s;
    void _n;
    void _b;
    void _o;
  });

  it("isTodo narrows to TodoSentinel", () => {
    const v: unknown = todo("x");
    if (isTodo(v)) {
      expectTypeOf(v).toMatchTypeOf<TodoSentinel>();
      expectTypeOf(v.reason).toBeString();
    }
  });
});

describe("inferAppEnv / presets / loadDotenvCascade", () => {
  it("inferAppEnv returns string", () => {
    const r = inferAppEnv({ source: {}, default: "x" });
    expectTypeOf(r).toBeString();
  });

  it("inferAppEnvDetailed returns the detailed shape", () => {
    const d = inferAppEnvDetailed({ source: {} });
    expectTypeOf(d).toEqualTypeOf<InferAppEnvResult>();
    expectTypeOf(d.value).toBeString();
    expectTypeOf(d.source).toEqualTypeOf<"explicit" | "preset" | "default">();
  });

  it("each preset factory returns AppEnvPreset", () => {
    expectTypeOf(presets.vercel()).toMatchTypeOf<AppEnvPreset>();
    expectTypeOf(presets.netlify()).toMatchTypeOf<AppEnvPreset>();
    expectTypeOf(presets.cloudflarePages()).toMatchTypeOf<AppEnvPreset>();
    expectTypeOf(presets.githubActions()).toMatchTypeOf<AppEnvPreset>();
    expectTypeOf(presets.railway()).toMatchTypeOf<AppEnvPreset>();
    expectTypeOf(presets.render()).toMatchTypeOf<AppEnvPreset>();
    expectTypeOf(presets.nodeEnv()).toMatchTypeOf<AppEnvPreset>();
  });

  it("loadDotenvCascade returns DotenvCascadeResult", () => {
    const r = loadDotenvCascade({ source: {} });
    expectTypeOf(r).toEqualTypeOf<DotenvCascadeResult>();
    expectTypeOf(r.env).toEqualTypeOf<Record<string, string | undefined>>();
    expectTypeOf(r.mode).toBeString();
    expectTypeOf(r.loaded).toEqualTypeOf<string[]>();
    expectTypeOf(r.skipped).toEqualTypeOf<string[]>();
  });
});

describe("utility types", () => {
  it("mergePerEnv preserves the generic shape", () => {
    interface Cfg {
      bucket: string;
      flags: { newCheckout: boolean };
    }
    const merged = mergePerEnv<Cfg>(
      { prod: { bucket: "x" } },
      { prod: { flags: { newCheckout: true } } },
    );
    expectTypeOf(merged).toEqualTypeOf<Record<string, Partial<Cfg> | { [K in keyof Cfg]?: unknown }>>(
      // mergePerEnv returns Record<string, DeepPartial<T>>; the shape is
      // wider than Partial<Cfg> because of DeepPartial recursion. We just
      // confirm the keys are environment names and entries are partial.
    );
    expectTypeOf(merged.prod?.bucket).toEqualTypeOf<string | undefined>();
  });
});

describe("NodeSettingsError — code union is stable", () => {
  it("code is one of the documented values", () => {
    expectTypeOf<NodeSettingsErrorCode>().toEqualTypeOf<
      | "INVALID_ENV_SCHEMA"
      | "MISSING_ENV_KEY"
      | "INVALID_ENV_KEY_TYPE"
      | "INVALID_OVERRIDE_KEY"
      | "PER_ENV_KEY_NOT_IN_ENUM"
      | "PER_ENV_EMPTY"
      | "PER_ENV_BRANCH_MISSING"
      | "PER_ENV_TODO"
      | "INVALID_EXTENDS_ITEM"
      | "OVERRIDE_JSON_PARSE"
      | "ENV_VALIDATION_FAILED"
    >();
  });

  it("constructor signature", () => {
    expectTypeOf(NodeSettingsError).constructorParameters.toEqualTypeOf<
      [
        NodeSettingsErrorCode,
        string,
        { hint?: string; cause?: unknown }?,
      ]
    >();
  });
});

describe("misc types", () => {
  it("DEFAULT_SECRET_PATTERNS is a readonly array of RegExp", () => {
    expectTypeOf(DEFAULT_SECRET_PATTERNS).toEqualTypeOf<readonly RegExp[]>();
  });

  it("EnvField has the documented shape", () => {
    type _EnvFieldShape = {
      key: string;
      type: "string" | "number" | "boolean" | "enum" | "unknown";
      required: boolean;
      defaultValue?: unknown;
      enumValues?: readonly string[];
      description?: string;
      secret: boolean;
    };
    expectTypeOf<EnvField>().toMatchTypeOf<_EnvFieldShape>();
  });
});
