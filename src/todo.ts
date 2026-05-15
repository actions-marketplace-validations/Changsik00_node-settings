/**
 * Sentinel-based "this value must be filled in before deploy" marker.
 *
 * Use `todo(reason)` in `defaults` or any `perEnv` branch to declare a
 * slot you'll fill in later. The loader scans the merged config before
 * calling `build()`; if any sentinel survives the merge for the env
 * being loaded, it throws `NodeSettingsError` with code `PER_ENV_TODO`.
 *
 * @example
 * ```ts
 * import { defineSettings, todo } from "@changsik00/node-settings";
 *
 * defineSettings({
 *   envSchema, envKey: "APP_ENV",
 *   defaults: { bucket: "" },
 *   perEnv: {
 *     local: { bucket: "local-bucket" },
 *     prod:  { bucket: todo("set production bucket name before deploy") },
 *   },
 *   build: (env, config) => ({ bucket: config.bucket }),
 * });
 *
 * settings({ APP_ENV: "local", ... }); // ok
 * settings({ APP_ENV: "prod",  ... }); // throws NodeSettingsError (PER_ENV_TODO)
 * ```
 *
 * Sentinels behave as opaque values inside `deepMerge` — a child
 * `perEnv` branch can fully replace a parent's sentinel with a real
 * value. This means `defaults: { bucket: todo("...") }` is a useful
 * pattern: every per-env branch is *forced* to provide a value.
 */

/**
 * Globally registered symbol that marks an object as a todo sentinel.
 * Using `Symbol.for(...)` keeps the marker stable across module
 * boundaries (e.g. mixed CJS / ESM situations).
 */
export const TODO_SYMBOL = Symbol.for("@changsik00/node-settings:todo");

/** Runtime shape of a todo sentinel. */
export interface TodoSentinel {
  readonly [k: symbol]: unknown;
  readonly reason: string;
}

/**
 * Mark a config field as "not yet set; must be filled in before the
 * env that contains it can be loaded".
 *
 * Typed as returning `never` so the result is assignable to any field
 * type. At runtime it returns a sentinel object that the loader,
 * `deepMerge`, `checkPerEnvCompleteness`, and the `inspect` CLI all
 * recognise.
 */
export function todo(reason?: string): never {
  const sentinel: TodoSentinel = {
    [TODO_SYMBOL]: true,
    reason: reason ?? "value not yet set",
  };
  return sentinel as never;
}

/** True when `value` is a `todo(...)` sentinel. */
export function isTodo(value: unknown): value is TodoSentinel {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[TODO_SYMBOL] === true
  );
}

/**
 * Recursively scan `value` for any `todo(...)` sentinels and return
 * their locations. Used by both the loader (to throw before build)
 * and the `check` CLI (to report across every perEnv branch).
 */
export function findTodos(
  value: unknown,
  path = "",
): Array<{ path: string; reason: string }> {
  if (isTodo(value)) {
    return [{ path: path || "(root)", reason: value.reason }];
  }
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, idx) =>
      findTodos(item, `${path}[${idx}]`),
    );
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => findTodos(child, path ? `${path}.${key}` : key),
  );
}
