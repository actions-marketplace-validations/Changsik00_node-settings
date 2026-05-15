import { z } from "zod";
import { deepMerge, type DeepPartial } from "./utils/deep-merge.js";
import {
  introspectEnvSchema,
  type EnvField,
  type IntrospectOptions,
} from "./introspect.js";

/**
 * Options for {@link defineSettings}.
 *
 * @typeParam TSchema   - The zod env schema (must be a `z.object({...})`).
 * @typeParam TConfig   - Shape of the layered, non-env "config" object
 *                       (defaults + per-env overrides + optional JSON override).
 * @typeParam TSettings - Final settings shape returned by `build`. This is what
 *                       the rest of your application consumes.
 */
export interface DefineSettingsOptions<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TConfig extends object,
  TSettings extends object,
> {
  /** Zod schema that validates `process.env`. Must be a `z.object({...})`. */
  envSchema: TSchema;
  /**
   * The env key whose value selects which `perEnv` branch to apply.
   * Typical choice: `'APP_ENV'` or `'NODE_ENV'`.
   */
  envKey: keyof z.infer<TSchema>;
  /**
   * Optional env key that, when set, contains a JSON-encoded partial
   * config used as the highest-priority override layer.
   */
  overrideEnvKey?: keyof z.infer<TSchema>;
  /** Defaults applied first (layer A). */
  defaults: TConfig;
  /** Per-env overrides keyed by the value of `envKey` (layer B). */
  perEnv: Record<string, DeepPartial<NoInfer<TConfig>>>;
  /**
   * Optional validator for the JSON override layer. Receives the parsed
   * JSON; should throw on unknown keys / invalid types and return a
   * narrowed partial config. If omitted, the parsed JSON is trusted.
   */
  validateOverride?: (parsed: unknown) => DeepPartial<NoInfer<TConfig>>;
  /**
   * Map the validated env and the final layered config into the public
   * settings object that the application consumes.
   */
  build: (env: z.infer<TSchema>, config: NoInfer<TConfig>) => TSettings;
  /**
   * Called once when a JSON override is applied. Useful for emitting an
   * operational audit log without giving this package a logger dep.
   */
  onOverride?: (
    overrides: DeepPartial<NoInfer<TConfig>>,
    envValue: string,
  ) => void;
  /**
   * Customise which fields are flagged as secrets when generating
   * Kubernetes manifests, Markdown docs, etc. See
   * {@link IntrospectOptions} for the defaults.
   */
  secretPatterns?: IntrospectOptions["secretPatterns"];
}

/**
 * A settings loader function with tooling metadata attached.
 *
 * Call it as a function to produce the frozen settings object. Read
 * `.opts` and `.envFields` for CLI introspection and code generation.
 */
export interface SettingsLoader<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TConfig extends object,
  TSettings extends object,
> {
  (rawEnv: Record<string, string | undefined>): TSettings;
  readonly opts: Readonly<DefineSettingsOptions<TSchema, TConfig, TSettings>>;
  readonly envFields: readonly EnvField[];
}

/**
 * Define a settings loader from a zod env schema and layered config.
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { defineSettings } from '@changsik00/node-settings';
 *
 * const envSchema = z.object({
 *   APP_ENV: z.enum(['local', 'dev', 'stage', 'prod']).default('local'),
 *   DB_HOST: z.string(),
 *   DB_PASSWORD: z.string(), // auto-flagged as secret by name pattern
 *   CONFIG_OVERRIDE_JSON: z.string().optional(),
 * });
 *
 * export const settings = defineSettings({
 *   envSchema,
 *   envKey: 'APP_ENV',
 *   overrideEnvKey: 'CONFIG_OVERRIDE_JSON',
 *   defaults: { bucket: '', workerConcurrency: 1 },
 *   perEnv: {
 *     local: { bucket: 'local-bucket' },
 *     dev:   { bucket: 'dev-bucket' },
 *     stage: { bucket: 'TODO-stage-bucket' },
 *     prod:  { bucket: 'TODO-prod-bucket' },
 *   },
 *   build: (env, config) => ({
 *     dbHost: env.DB_HOST,
 *     dbPassword: env.DB_PASSWORD,
 *     bucket: config.bucket,
 *     workerConcurrency: config.workerConcurrency,
 *   }),
 * });
 *
 * export type Settings = ReturnType<typeof settings>;
 * ```
 */
export function defineSettings<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TConfig extends object,
  TSettings extends object,
>(
  opts: DefineSettingsOptions<TSchema, TConfig, TSettings>,
): SettingsLoader<TSchema, TConfig, TSettings> {
  const envFields = Object.freeze(
    introspectEnvSchema(opts.envSchema, { secretPatterns: opts.secretPatterns }),
  );
  const frozenOpts = Object.freeze({ ...opts });

  const load = ((rawEnv: Record<string, string | undefined>) => {
    const env = opts.envSchema.parse(rawEnv) as z.infer<TSchema>;

    const envValue = env[opts.envKey];
    if (typeof envValue !== "string") {
      throw new Error(
        `[node-settings] env[${String(opts.envKey)}] is not a string (got ${typeof envValue}).`,
      );
    }
    const envSpecific = opts.perEnv[envValue];
    if (!envSpecific) {
      const keys = Object.keys(opts.perEnv).join(", ");
      throw new Error(
        `[node-settings] perEnv has no branch for '${envValue}'. Known branches: ${keys}`,
      );
    }

    const baseConfig = deepMerge(opts.defaults, envSpecific);

    const overrides = opts.overrideEnvKey
      ? parseJsonOverride<TConfig>(
          env[opts.overrideEnvKey] as unknown,
          opts.validateOverride,
        )
      : undefined;
    const finalConfig = overrides
      ? deepMerge(baseConfig, overrides)
      : baseConfig;

    if (overrides && opts.onOverride) {
      opts.onOverride(overrides, envValue);
    }

    return Object.freeze(opts.build(env, finalConfig));
  }) as SettingsLoader<TSchema, TConfig, TSettings>;

  Object.defineProperty(load, "opts", {
    value: frozenOpts,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(load, "envFields", {
    value: envFields,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return load;
}

function parseJsonOverride<TConfig extends object>(
  raw: unknown,
  validate?: (parsed: unknown) => DeepPartial<TConfig>,
): DeepPartial<TConfig> | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[node-settings] override JSON parse failed: ${(err as Error).message}`,
    );
  }
  return validate ? validate(parsed) : (parsed as DeepPartial<TConfig>);
}
