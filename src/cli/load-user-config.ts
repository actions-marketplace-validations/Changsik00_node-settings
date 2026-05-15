import { existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import type { z } from "zod";
import type { SettingsLoader } from "../define-settings.js";

const CANDIDATE_FILES = [
  "node-settings.config.ts",
  "node-settings.config.mts",
  "node-settings.config.js",
  "node-settings.config.mjs",
  "node-settings.config.cjs",
  "settings.config.ts",
  "settings.config.mts",
  "settings.config.js",
  "settings.config.mjs",
  "settings.config.cjs",
];

export interface LoadedUserConfig {
  /** Absolute path of the loaded config file. */
  path: string;
  /** The settings loader exported as `default` (or `settings`). */
  loader: SettingsLoader<
    z.ZodObject<z.ZodRawShape>,
    Record<string, unknown>,
    Record<string, unknown>
  >;
}

/**
 * Resolve and load the user's settings loader. Two strategies, tried in
 * order:
 *
 *   1. `--config <path>` (or the `path` argument here) — load that file
 *      directly.
 *   2. Auto-discover `node-settings.config.{ts,mts,js,mjs,cjs}` /
 *      `settings.config.{...}` in the current working directory.
 *
 * The loaded module must expose either a default export or a `settings`
 * named export that is a {@link SettingsLoader} (i.e. the return value
 * of `defineSettings({...})`).
 */
export async function loadUserConfig(
  explicitPath?: string,
): Promise<LoadedUserConfig> {
  const resolved = explicitPath
    ? resolve(process.cwd(), explicitPath)
    : autoDiscover(process.cwd());

  if (!resolved) {
    throw new Error(
      [
        "[node-settings] no config file found.",
        "Pass --config <path>, or create one of:",
        ...CANDIDATE_FILES.map((f) => `  - ${f}`),
      ].join("\n"),
    );
  }
  if (!existsSync(resolved)) {
    throw new Error(`[node-settings] config file not found: ${resolved}`);
  }

  const mod = await importModule(resolved);
  const candidate =
    (mod && (mod.default ?? (mod as Record<string, unknown>).settings)) ?? null;

  if (!isSettingsLoader(candidate)) {
    throw new Error(
      `[node-settings] ${resolved} must export a default (or named 'settings') value created by defineSettings(...).`,
    );
  }

  return { path: resolved, loader: candidate };
}

function autoDiscover(cwd: string): string | undefined {
  for (const candidate of CANDIDATE_FILES) {
    const full = resolve(cwd, candidate);
    if (existsSync(full)) return full;
  }
  return undefined;
}

async function importModule(filePath: string): Promise<Record<string, unknown>> {
  const abs = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  if (abs.endsWith(".ts") || abs.endsWith(".mts") || abs.endsWith(".cts")) {
    const jiti = createJiti(import.meta.url, {
      interopDefault: true,
      moduleCache: false,
    });
    return (await jiti.import(abs)) as Record<string, unknown>;
  }
  const url = pathToFileURL(abs).href;
  return (await import(url)) as Record<string, unknown>;
}

function isSettingsLoader(value: unknown): value is LoadedUserConfig["loader"] {
  if (typeof value !== "function") return false;
  const opts = (value as { opts?: unknown }).opts;
  const envFields = (value as { envFields?: unknown }).envFields;
  return Boolean(opts) && Array.isArray(envFields);
}
