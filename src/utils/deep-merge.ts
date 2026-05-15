import { TODO_SYMBOL } from "../todo.js";

/**
 * A small deepMerge helper used for config layering
 * (defaults -> per-env overrides -> JSON overrides).
 *
 * Behaviour:
 *   - When a source value is a *plain object*, merge recursively.
 *   - Otherwise (primitive / array / null / undefined), the source replaces
 *     the target.
 *   - Source keys missing on the target are added.
 *
 * Arrays are *replaced* (not concatenated). For configuration purposes
 * (e.g. allowed locales, feature lists), full replacement per environment
 * is almost always what you want.
 *
 * Intentionally written without lodash to keep the runtime dependency
 * surface minimal.
 */
export type DeepPartial<T> = T extends object
  ? T extends ReadonlyArray<unknown>
    ? T
    : { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export function deepMerge<T extends object>(
  target: T,
  source: DeepPartial<T> | undefined,
): T {
  const targetRec = target as Record<string, unknown>;
  if (!source) return { ...targetRec } as T;
  const result: Record<string, unknown> = { ...targetRec };
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  // Sentinels (e.g. `todo(...)` markers) must be replaced wholesale,
  // not merged into. Recursing inside them would corrupt the marker.
  if (TODO_SYMBOL in (value as object)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
