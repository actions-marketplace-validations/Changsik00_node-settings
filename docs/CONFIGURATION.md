# Configuration guide

How `defineSettings` is structured, what the two "base" concepts mean,
and how to lay out config in a project of any size.

## Two "base" axes (often confused)

There are *two* separate bases in this library. They sit on different
axes.

| Axis              | "Base" means                                        | Override mechanism                              |
| ----------------- | --------------------------------------------------- | ----------------------------------------------- |
| **Env axis**      | `defaults` — values shared across every environment | `perEnv[mode]` (deepMerged on top)              |
| **Package axis**  | `extends: [baseLoader]` — another loader's whole shape | child's own `envSchema` / `defaults` / `perEnv` |

You can use both at once. `defaults` is your *intra-loader* base
(applies to every env), `extends` is your *inter-loader* base (shared
across packages in a monorepo).

There's also a third "base" outside the loader: the `.env.<mode>` file
cascade. That layers **env-var inputs**, not config values. See the
[deployment guide](./DEPLOYMENT.md) for that.

### Quick recap — which "base" do I want?

| Question                                                              | Use                |
| --------------------------------------------------------------------- | ------------------ |
| "Some values are the same across local/dev/prod"                      | `defaults`         |
| "Some values differ per environment"                                  | `perEnv[mode]`     |
| "Some env vars come from `.env` files at the project root"            | `loadDotenvCascade` |
| "Many apps in this monorepo share the same env vars and defaults"     | `extends: [base]`  |

## File-layout patterns

### Single-file (default)

Everything in one `settings.config.ts`. Best for small/medium apps.

```ts
import { z } from "zod";
import { defineSettings } from "@changsik00/node-settings";

export default defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
    DB_HOST: z.string(),
  }),
  envKey: "APP_ENV",
  defaults: { bucket: "", workerConcurrency: 1 },
  perEnv: {
    local: { bucket: "local-bucket" },
    dev:   { bucket: "dev-bucket" },
    prod:  { bucket: "prod-bucket", workerConcurrency: 8 },
  },
  build: (env, config) => ({
    dbHost: env.DB_HOST,
    bucket: config.bucket,
    workerConcurrency: config.workerConcurrency,
  }),
});
```

### Split-file

When `perEnv` outgrows a single screen: keep the schema and `build()`
in `settings.ts`, put each env's overrides in its own file.

```
settings.ts                  # envSchema + build()
config/
  defaults.ts                # exports AppConfig type + defaults
  local.ts                   # DeepPartial<AppConfig> for local
  dev.ts
  prod.ts
```

See [`sample/`](../sample) for a worked example. Per-env files import
`AppConfig` from `defaults.ts` and export `DeepPartial<AppConfig>`, so
typos and removed fields fail compilation.

### Monorepo (with `extends`)

Shared base loader in one package; child loaders in each app.
Modeled after `@t3-oss/env-core`'s `extends`.

```
packages/
  shared/
    settings.base.ts         # exports `base` from defineSettings(...)
  content-api/
    settings.config.ts       # defineSettings({ extends: [base], ... })
  worker/
    settings.config.ts       # defineSettings({ extends: [base], ... })
```

```ts
// packages/shared/settings.base.ts
import { z } from "zod";
import { defineSettings } from "@changsik00/node-settings";

export const base = defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
    DB_HOST: z.string(),
    DB_PASSWORD: z.string(),
  }),
  envKey: "APP_ENV",
  defaults: { region: "us-east-1", logLevel: "info" },
  perEnv: {
    local: { logLevel: "debug" },
    dev: {},
    prod: {},
  },
  build: (env, config) => ({
    dbHost: env.DB_HOST,
    region: config.region,
    logLevel: config.logLevel,
  }),
});
```

```ts
// packages/content-api/settings.config.ts
import { z } from "zod";
import { defineSettings } from "@changsik00/node-settings";
import { base } from "../shared/settings.base.js";

export default defineSettings({
  extends: [base],
  envSchema: z.object({ CONTENT_BUCKET: z.string() }),
  envKey: "APP_ENV",
  defaults: { bucket: "" },
  perEnv: {
    local: { bucket: "local-content" },
    dev:   { bucket: "dev-content" },
    prod:  { bucket: "prod-content" },
  },
  build: (env, config) => ({
    contentBucket: env.CONTENT_BUCKET, // child env
    dbHost: env.DB_HOST,                // from base
    bucket: config.bucket,              // child config
    region: config.region,              // from base
  }),
});
```

Merge rules:

| Field            | Behavior                                                              |
| ---------------- | --------------------------------------------------------------------- |
| `envSchema`      | `parent.merge(child)` via zod's built-in object merge (child wins).   |
| `defaults`       | `deepMerge(parent, child)` (child wins, nested objects merged).       |
| `perEnv`         | Per env key, `deepMerge(parent, child)`.                              |
| `envKey`         | Child wins.                                                           |
| `overrideEnvKey` | Child wins; if omitted, inherited from the last parent that sets one. |
| `build`          | Child's only — but `env` / `config` parameters have the merged shape. |

Multiple parents are supported (merged in array order, later wins):

```ts
defineSettings({ extends: [base, logging, metrics], /* ... */ });
```

### CLI walk-up auto-discovery

When you run the CLI from a package subdirectory, it walks up the
directory tree to find a `node-settings.config.*` (or
`settings.config.*`) in any ancestor — the same convention `tsc`,
`eslint`, and other cosmiconfig-based tools use.

```
my-monorepo/
├── .git/                              ← walk stops here
├── pnpm-workspace.yaml
├── node-settings.config.ts            ← (optional) root config
└── packages/
    └── content-api/
        ├── node-settings.config.ts    ← found first if present
        └── src/
```

Stop markers: `.git`, `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`,
`nx.json`, `rush.json`.

### `mergePerEnv` — programmatic composition helper

If you compose `perEnv` outside of `defineSettings`:

```ts
import { mergePerEnv } from "@changsik00/node-settings";

const perEnv = mergePerEnv(basePerEnv, {
  local: { bucket: "local-content" },
  prod:  { bucket: "prod-content" },
});
```

## Layering model

```
rawEnv (process.env or loadDotenvCascade output)
  ↓ resolvedSchema.parse(rawEnv)         (zod, with all `extends` merged)
env
  ↓ resolvedPerEnv[env[envKey]]          (perEnv branch lookup)
envSpecific
  ↓ deepMerge(resolvedDefaults, envSpecific)
baseConfig
  ↓ JSON.parse(env[overrideEnvKey])      (optional, top-priority layer)
  ↓ validateOverride? + deepMerge
finalConfig
  ↓ build(env, finalConfig)
Settings → Object.freeze
```

## See what your config resolves to

When in doubt, dry-run it with the CLI:

```bash
node-settings inspect --env=prod
```

Prints the env schema (the contract) plus the layered config
(`defaults` deep-merged with `perEnv.prod`) without calling your
`build()` function — no env values required. Great for "what does prod
look like?" without prod secrets.
