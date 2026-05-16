// AUTO-GENERATED SNAPSHOT — verify-api.mjs
// Diff is intentional: regenerate via `node scripts/verify-api.mjs --update`
// after a deliberate public-API change.
import type { NextConfig } from "next";
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
 * import { withNodeSettings } from "@changsik00/node-settings/next";
 *
 * export default await withNodeSettings({
 *   reactStrictMode: true,
 * });
 * ```
 *
 * @example CJS
 * ```js
 * // next.config.js
 * const { withNodeSettings } = require("@changsik00/node-settings/next");
 *
 * // Next.js supports a Promise<NextConfig> module.exports.
 * module.exports = withNodeSettings({ reactStrictMode: true });
 * ```
 */
export declare function withNodeSettings(nextConfig?: NextConfig, options?: NodeSettingsNextOptions): Promise<NextConfig>;
