// AUTO-GENERATED SNAPSHOT — verify-api.mjs
// Diff is intentional: regenerate via `node scripts/verify-api.mjs --update`
// after a deliberate public-API change.
import type { Plugin } from "esbuild";
export interface NodeSettingsEsbuildOptions {
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
     * Directory holding the `.env*` files. Default: `process.cwd()`.
     */
    envDir?: string;
    /**
     * Env var that selects the mode for the cascade. Default: `APP_ENV`.
     */
    appEnvKey?: string;
    /**
     * If `true` (default), report validation failures as esbuild errors
     * — the build aborts. If `false`, report them as warnings — useful
     * when wiring the plugin into a watch / dev build where you'd
     * rather see the message than have the rebuild stop. esbuild has
     * no native dev/build distinction, so this is the only knob you
     * need (unlike the Vite / Next plugins which expose `failOnDev`
     * because the host framework already tells them which phase it's
     * in).
     */
    failOnError?: boolean;
}
/**
 * esbuild plugin that validates the user's env against the settings
 * schema at build start — *before* esbuild reads a single source
 * file. By default any validation failure becomes an esbuild error
 * and aborts the build (consistent with `vite build` / `next build`).
 *
 * @example
 * ```ts
 * // build.mjs
 * import { build } from "esbuild";
 * import { nodeSettings } from "@env-kit/node-settings/esbuild";
 *
 * await build({
 *   entryPoints: ["src/main.ts"],
 *   bundle: true,
 *   outfile: "dist/main.js",
 *   plugins: [nodeSettings()],
 * });
 * ```
 *
 * @example Watch mode — keep dev going on validation failures:
 * ```ts
 * const ctx = await context({
 *   entryPoints: ["src/main.ts"],
 *   bundle: true,
 *   plugins: [nodeSettings({ failOnError: false })],
 * });
 * await ctx.watch();
 * ```
 */
export declare function nodeSettings(options?: NodeSettingsEsbuildOptions): Plugin;
