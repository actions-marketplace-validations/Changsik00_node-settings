import type { ParsedArgs } from "./args.js";
import { flagString } from "./args.js";

/**
 * Output format requested via `--format`. Defaults to `text`. `json`
 * produces a single machine-readable JSON document on stdout. Other
 * values are treated as `text`.
 */
export type OutputFormat = "text" | "json";

export function resolveFormat(args: ParsedArgs): OutputFormat {
  const raw = (flagString(args, "format") ?? "").toLowerCase();
  return raw === "json" ? "json" : "text";
}

export function isJson(args: ParsedArgs): boolean {
  return resolveFormat(args) === "json";
}

/**
 * Print a value as pretty-printed JSON to stdout (with a trailing
 * newline so editors / pagers terminate cleanly). The value goes
 * through `JSON.stringify`, which respects any `toJSON()` methods —
 * notably, `todo()` sentinels serialise to `{ "$todo": "reason" }`.
 */
export function emitJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
