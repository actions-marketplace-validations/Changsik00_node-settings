// AUTO-GENERATED SNAPSHOT — verify-api.mjs
// Diff is intentional: regenerate via `node scripts/verify-api.mjs --update`
// after a deliberate public-API change.
import type { Plugin } from "vite";
export interface NodeSettingsViteOptions {
    /**
     * Path to the settings config file. Default: auto-discover
     * `node-settings.config.{ts,js,...}` / `settings.config.{...}` by
     * walking up from `process.cwd()`.
     */
    config?: string;
    /**
     * Override the mode that drives the `.env.<mode>` cascade and the
     * per-env layering. Default: Vite's resolved mode (`development` for
     * dev, `production` for build, or whatever `--mode <name>` selected).
     */
    mode?: string;
    /**
     * Directory holding the `.env*` files. Default: Vite's resolved
     * `envDir`, then `root`, then `process.cwd()`.
     */
    envDir?: string;
    /**
     * Env var that selects the mode for the cascade. Default: `APP_ENV`.
     */
    appEnvKey?: string;
    /**
     * If `true`, throw on validation failure during `vite serve` so the
     * dev server refuses to start. If `false`, log a warning and let dev
     * proceed. Default: `true` (fail fast — env mistakes should be loud).
     * Build (`vite build`) always fails on validation errors.
     */
    failOnDev?: boolean;
}
/**
 * Vite plugin that validates the user's env against the settings
 * schema at config-resolution time, *before* any code loads.
 *
 * - `vite build` aborts on validation failure (non-zero exit).
 * - `vite serve` (dev) aborts unless `failOnDev: false` is set.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import { nodeSettings } from "@changsik00/node-settings/vite";
 *
 * export default defineConfig({
 *   plugins: [nodeSettings()],
 * });
 * ```
 */
export declare function nodeSettings(options?: NodeSettingsViteOptions): Plugin;
