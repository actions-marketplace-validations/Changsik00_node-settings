import type { Plugin, ConfigEnv } from "vite";
import { loadUserConfig } from "../cli/load-user-config.js";
import { loadDotenvCascade } from "../loaders/dotenv-cascade.js";
import { NodeSettingsError } from "../errors.js";

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
export function nodeSettings(options: NodeSettingsViteOptions = {}): Plugin {
  let resolvedMode = "";
  let resolvedEnvDir = "";
  let command: "build" | "serve" = "serve";

  return {
    name: "node-settings",
    enforce: "pre",

    config(_userConfig, env: ConfigEnv) {
      command = env.command;
      resolvedMode = options.mode ?? env.mode;
    },

    configResolved(config) {
      resolvedEnvDir =
        options.envDir ?? config.envDir ?? config.root ?? process.cwd();
    },

    async buildStart() {
      try {
        const { path: configPath, loader } = await loadUserConfig(
          options.config,
        );
        const cascade = loadDotenvCascade({
          cwd: resolvedEnvDir,
          appEnvKey: options.appEnvKey ?? "APP_ENV",
          defaultMode: resolvedMode,
          source: process.env,
        });
        loader(cascade.env);
        const tag = `[node-settings] env validated against ${configPath} (mode=${cascade.mode})`;
        if (command === "serve") {
          this.info(tag);
        } else {
          this.info(tag);
        }
      } catch (err) {
        const message = formatPluginError(err);
        const shouldFail = command === "build" || options.failOnDev !== false;
        if (shouldFail) {
          this.error(`[node-settings] env validation failed:\n${message}`);
        } else {
          this.warn(
            `[node-settings] env validation failed (continuing because failOnDev=false):\n${message}`,
          );
        }
      }
    },
  };
}

function formatPluginError(err: unknown): string {
  if (err instanceof NodeSettingsError) {
    const hint = err.hint ? `\nhint: ${err.hint}` : "";
    return `${err.code}: ${err.message}${hint}`;
  }
  return err instanceof Error ? err.message : String(err);
}
