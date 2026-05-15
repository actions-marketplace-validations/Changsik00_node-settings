import { readFileSync } from "node:fs";

/**
 * Minimal `.env` file parser used by the CLI for `validate` / `check`.
 *
 * Supports the common subset of dotenv syntax:
 *   - `KEY=value`
 *   - Surrounding double or single quotes (stripped)
 *   - Lines starting with `#` are comments
 *   - Inline `#` comments after an unquoted value
 *   - Blank lines ignored
 *
 * Anything more exotic (variable expansion, multi-line values) is
 * deliberately out of scope. Use dotenv-expand etc. before piping the
 * result into `loadSettings(...)` if you need it.
 */
export function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

export function loadDotenvFile(path: string): Record<string, string> {
  return parseDotenv(readFileSync(path, "utf8"));
}
