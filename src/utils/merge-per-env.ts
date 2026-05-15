import { deepMerge, type DeepPartial } from "./deep-merge.js";

/**
 * Merge per-environment config maps. Useful when composing a child
 * monorepo package's `perEnv` on top of a shared base, outside of the
 * `extends` field on {@link defineSettings}.
 *
 * Semantics: for every env key found across `base` and `overrides`,
 * deepMerge the branches in argument order. Branches that exist only in
 * one of the maps are passed through unchanged.
 *
 * @example
 * ```ts
 * const merged = mergePerEnv(basePerEnv, {
 *   local: { bucket: 'local-content' },
 *   prod:  { bucket: 'prod-content' },
 * });
 * ```
 */
export function mergePerEnv<TConfig extends object>(
  base: Record<string, DeepPartial<TConfig>>,
  ...overrides: Array<Record<string, DeepPartial<TConfig>>>
): Record<string, DeepPartial<TConfig>> {
  const result: Record<string, DeepPartial<TConfig>> = {};
  const sources = [base, ...overrides];
  const envKeys = new Set<string>();
  for (const src of sources) {
    for (const k of Object.keys(src)) envKeys.add(k);
  }
  for (const env of envKeys) {
    let merged: DeepPartial<TConfig> = {} as DeepPartial<TConfig>;
    for (const src of sources) {
      const branch = src[env];
      if (branch !== undefined) {
        merged = deepMerge(merged as TConfig, branch) as DeepPartial<TConfig>;
      }
    }
    result[env] = merged;
  }
  return result;
}
