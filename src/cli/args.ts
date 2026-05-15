/**
 * Minimal argv parser used by the CLI. Stays dependency-free so the
 * binary stays small.
 *
 * Supports:
 *   - Long flags: `--key value` or `--key=value`
 *   - Boolean long flags: `--key` (presence = true)
 *   - Positional arguments collected in order
 *   - `--` terminator stops flag parsing
 */
export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 0;
  let terminated = false;
  while (i < argv.length) {
    const token = argv[i] as string;
    if (!terminated && token === "--") {
      terminated = true;
      i += 1;
      continue;
    }
    if (!terminated && token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
        i += 1;
        continue;
      }
      const name = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[name] = next;
        i += 2;
        continue;
      }
      flags[name] = true;
      i += 1;
      continue;
    }
    positionals.push(token);
    i += 1;
  }
  return { positionals, flags };
}

export function flagString(
  args: ParsedArgs,
  name: string,
  fallback?: string,
): string | undefined {
  const value = args.flags[name];
  if (typeof value === "string") return value;
  return fallback;
}

export function flagBool(
  args: ParsedArgs,
  name: string,
  fallback = false,
): boolean {
  const value = args.flags[name];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value !== "false" && value !== "0" && value !== "";
  }
  return fallback;
}
