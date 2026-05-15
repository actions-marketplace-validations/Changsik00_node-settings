import { describe, expect, it } from "vitest";
import { z } from "zod";
import { findTodos, isTodo, todo, TODO_SYMBOL } from "./todo.js";
import { defineSettings } from "./define-settings.js";
import { checkPerEnvCompleteness } from "./check-per-env.js";
import { NodeSettingsError } from "./errors.js";
import { deepMerge } from "./utils/deep-merge.js";

describe("todo() sentinel", () => {
  it("creates an object marked with TODO_SYMBOL", () => {
    const t = todo("fill me");
    expect(isTodo(t)).toBe(true);
    expect((t as unknown as Record<symbol, unknown>)[TODO_SYMBOL]).toBe(true);
    expect((t as unknown as { reason: string }).reason).toBe("fill me");
  });

  it("supplies a default reason when none is given", () => {
    const t = todo();
    expect((t as unknown as { reason: string }).reason).toBe(
      "value not yet set",
    );
  });

  it("isTodo rejects plain objects, null, primitives", () => {
    expect(isTodo({ a: 1 })).toBe(false);
    expect(isTodo(null)).toBe(false);
    expect(isTodo("string")).toBe(false);
    expect(isTodo(undefined)).toBe(false);
  });
});

describe("findTodos", () => {
  it("returns paths of every sentinel in the tree", () => {
    const tree = {
      a: 1,
      b: todo("b-reason"),
      nested: {
        c: todo("c-reason"),
        d: { e: todo("deep") },
      },
      arr: [todo("arr0"), 2],
    };
    const found = findTodos(tree);
    expect(found).toEqual(
      expect.arrayContaining([
        { path: "b", reason: "b-reason" },
        { path: "nested.c", reason: "c-reason" },
        { path: "nested.d.e", reason: "deep" },
        { path: "arr[0]", reason: "arr0" },
      ]),
    );
    expect(found).toHaveLength(4);
  });

  it("returns an empty array when no sentinels exist", () => {
    expect(findTodos({ a: 1, b: { c: "x" } })).toEqual([]);
  });
});

describe("deepMerge interaction with sentinels", () => {
  it("treats sentinels as opaque (does not recurse into them)", () => {
    const target = { feature: { newCheckout: false } };
    const source = { feature: todo("set me") };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = deepMerge(target as any, source as any);
    expect(isTodo((result as { feature: unknown }).feature)).toBe(true);
  });

  it("allows a child sentinel to be overridden by a real value", () => {
    const target = { feature: todo("set me") };
    const source = { feature: { newCheckout: true } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = deepMerge(target as any, source as any);
    expect((result as { feature: { newCheckout: boolean } }).feature).toEqual({
      newCheckout: true,
    });
  });
});

describe("loader integration", () => {
  const envSchema = z.object({
    APP_ENV: z.enum(["local", "prod"]).default("local"),
    DB_HOST: z.string(),
  });

  it("throws PER_ENV_TODO when the loaded branch has unfilled sentinels", () => {
    const settings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { bucket: "" },
      perEnv: {
        local: { bucket: "local-b" },
        prod: { bucket: todo("set prod bucket before deploy") },
      },
      build: (env, config) => ({ host: env.DB_HOST, ...config }),
    });

    try {
      settings({ APP_ENV: "prod", DB_HOST: "h" });
      throw new Error("expected throw");
    } catch (err) {
      expect((err as NodeSettingsError).code).toBe("PER_ENV_TODO");
      expect((err as NodeSettingsError).message).toMatch(
        /set prod bucket before deploy/,
      );
    }
  });

  it("does NOT throw for branches that are not loaded", () => {
    const settings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { bucket: "" },
      perEnv: {
        local: { bucket: "local-b" },
        prod: { bucket: todo("set prod bucket before deploy") },
      },
      build: (env, config) => ({ host: env.DB_HOST, bucket: config.bucket }),
    });
    const result = settings({ APP_ENV: "local", DB_HOST: "h" });
    expect((result as { bucket: string }).bucket).toBe("local-b");
  });

  it("allows JSON override to fill in a sentinel at runtime", () => {
    const schemaWithOverride = z.object({
      APP_ENV: z.enum(["prod"]).default("prod"),
      DB_HOST: z.string(),
      OVERRIDE: z.string().optional(),
    });
    const settings = defineSettings({
      envSchema: schemaWithOverride,
      envKey: "APP_ENV",
      overrideEnvKey: "OVERRIDE",
      defaults: { bucket: "" },
      perEnv: { prod: { bucket: todo("provide at deploy") } },
      build: (env, config) => ({ host: env.DB_HOST, bucket: config.bucket }),
    });

    const result = settings({
      APP_ENV: "prod",
      DB_HOST: "h",
      OVERRIDE: JSON.stringify({ bucket: "real-bucket" }),
    });
    expect((result as { bucket: string }).bucket).toBe("real-bucket");
  });

  it("reports every unfilled path in one error message", () => {
    const settings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { a: 1, b: 2, c: 3 },
      perEnv: {
        prod: {
          a: todo("a needed"),
          b: todo("b needed"),
        },
        local: {},
      },
      build: (_env, config) => config,
    });
    try {
      settings({ APP_ENV: "prod", DB_HOST: "h" });
      throw new Error("expected throw");
    } catch (err) {
      const msg = (err as NodeSettingsError).message;
      expect(msg).toMatch(/a needed/);
      expect(msg).toMatch(/b needed/);
    }
  });
});

describe("checkPerEnvCompleteness picks up sentinels", () => {
  it("reports a 'todo' kind error for unfilled sentinels", () => {
    const envSchema = z.object({
      APP_ENV: z.enum(["local", "prod"]).default("local"),
      DB_HOST: z.string(),
    });
    const settings = defineSettings({
      envSchema,
      envKey: "APP_ENV",
      defaults: { bucket: "", workers: 1 },
      perEnv: {
        local: { bucket: "local-b" },
        prod: { bucket: todo("set me"), workers: 4 },
      },
      build: (env, config) => ({ ...env, ...config }),
    });

    const report = checkPerEnvCompleteness(settings, {
      envValues: {
        local: { DB_HOST: "h" },
        prod: { DB_HOST: "h" },
      },
    });
    expect(report.ok).toBe(false);
    const todoIssue = report.issues.find((i) => i.kind === "todo");
    expect(todoIssue).toBeDefined();
    expect(todoIssue?.env).toBe("prod");
    expect(todoIssue?.path).toBe("bucket");
    expect(todoIssue?.message).toMatch(/set me/);
  });
});
