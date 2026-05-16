import type { NextConfig } from "next";
import { loadUserConfig } from "../cli/load-user-config.js";
import { loadDotenvCascade } from "../loaders/dotenv-cascade.js";
import { NodeSettingsError } from "../errors.js";

export interface NodeSettingsNextOptions {
  /**
   * Path to the settings config file. Default: auto-discover
   * `node-settings.config.{ts,js,...}` / `settings.config.{...}` by
   * walking up from `process.cwd()`.
   */
  config?: string;
  /**
   * Override the mode that drives the `.env.<mode>` cascade and the
   * per-env layering. Default: the value of `appEnvKey` in
   * `process.env`, then the base `.env` file, then `'local'`.
   */
  mode?: string;
  /**
   * Directory holding the `.env*` files. Default: `process.cwd()` —
   * which matches Next.js's own env loading directory.
   */
  envDir?: string;
  /**
   * Env var that selects the mode for the cascade. Default: `APP_ENV`.
   */
  appEnvKey?: string;
  /**
   * If `true`, throw during `next dev` so the dev server refuses to
   * start on validation failure. If `false`, log a warning and let
   * dev proceed. Default: `true` (fail fast — env mistakes should be
   * loud). `next build` always fails on validation errors regardless
   * of this option.
   */
  failOnDev?: boolean;
}

/**
 * Next.js plugin that validates the env against the settings schema
 * during `next.config.{js,ts,mjs}` evaluation — *before* Webpack /
 * Turbopack starts, before the dev server boots, before any code
 * loads.
 *
 * - `next build` aborts with a clear error on validation failure
 *   (production-build phase).
 * - `next dev` aborts too unless `failOnDev: false` is set.
 *
 * @example
 * ```ts
 * // next.config.mjs
 * import { withNodeSettings } from "@env-kit/node-settings/next";
 *
 * export default await withNodeSettings({
 *   reactStrictMode: true,
 * });
 * ```
 *
 * @example CJS
 * ```js
 * // next.config.js
 * const { withNodeSettings } = require("@env-kit/node-settings/next");
 *
 * // Next.js supports a Promise<NextConfig> module.exports.
 * module.exports = withNodeSettings({ reactStrictMode: true });
 * ```
 */
export async function withNodeSettings(
  nextConfig: NextConfig = {},
  options: NodeSettingsNextOptions = {},
): Promise<NextConfig> {
  try {
    const { loader } = await loadUserConfig(options.config);
    const cascade = loadDotenvCascade({
      cwd: options.envDir ?? process.cwd(),
      appEnvKey: options.appEnvKey ?? "APP_ENV",
      defaultMode: options.mode ?? "local",
      source: process.env,
    });
    loader(cascade.env);
  } catch (err) {
    const message = formatError(err);
    const phase = process.env.NEXT_PHASE ?? "";
    // NEXT_PHASE constants we care about:
    //   'phase-production-build'   → `next build`
    //   'phase-export'             → `next export` (legacy)
    //   'phase-development-server' → `next dev`
    //   'phase-production-server'  → `next start`
    const isBuild =
      phase.includes("production-build") || phase.includes("export");
    const isDev = phase.includes("development");

    const shouldFail =
      isBuild || (isDev ? options.failOnDev !== false : true);

    if (shouldFail) {
      throw new Error(`[node-settings] env validation failed:\n${message}`);
    } else {
      console.warn(
        `[node-settings] env validation failed (continuing because failOnDev=false):\n${message}`,
      );
    }
  }
  return nextConfig;
}

function formatError(err: unknown): string {
  if (err instanceof NodeSettingsError) {
    const hint = err.hint ? `\nhint: ${err.hint}` : "";
    return `${err.code}: ${err.message}${hint}`;
  }
  return err instanceof Error ? err.message : String(err);
}
