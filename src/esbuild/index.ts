import type { Plugin, PluginBuild } from "esbuild";
import { loadUserConfig } from "../cli/load-user-config.js";
import { loadDotenvCascade } from "../loaders/dotenv-cascade.js";
import { NodeSettingsError } from "../errors.js";

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
export function nodeSettings(
  options: NodeSettingsEsbuildOptions = {},
): Plugin {
  return {
    name: "node-settings",
    setup(build: PluginBuild) {
      build.onStart(async () => {
        try {
          const { path: configPath, loader } = await loadUserConfig(
            options.config,
          );
          const cascade = loadDotenvCascade({
            cwd: options.envDir ?? process.cwd(),
            appEnvKey: options.appEnvKey ?? "APP_ENV",
            defaultMode: options.mode ?? "local",
            source: process.env,
          });
          loader(cascade.env);
          // onStart can't `info()` like rollup; a plain console.log is
          // what other esbuild plugins do for status output.
          console.log(
            `[node-settings] env validated against ${configPath} (mode=${cascade.mode})`,
          );
          return null;
        } catch (err) {
          const text = `[node-settings] env validation failed:\n${formatError(err)}`;
          if (options.failOnError === false) {
            return { warnings: [{ text }] };
          }
          return { errors: [{ text }] };
        }
      });
    },
  };
}

function formatError(err: unknown): string {
  if (err instanceof NodeSettingsError) {
    const hint = err.hint ? `\nhint: ${err.hint}` : "";
    return `${err.code}: ${err.message}${hint}`;
  }
  return err instanceof Error ? err.message : String(err);
}
