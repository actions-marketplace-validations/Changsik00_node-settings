# Migrating from `node-config` (`config` npm package)

`node-config` (the `config` package on npm, often called node-config
to distinguish it) is YAML/JSON-file driven with a `NODE_ENV`-keyed
cascade. It has no env var validation of its own — values either
come from files, or you wrap `process.env` reads by hand. Moving to
`@env-kit/node-settings` adds env validation on top while keeping
the per-env file layering you're used to.

## Before / after

node-config:

```yaml
# config/default.yaml
db:
  host: localhost
  port: 5432
  poolSize: 10
worker:
  concurrency: 5
```

```yaml
# config/production.yaml
db:
  host: prod-db.example.com
  poolSize: 100
worker:
  concurrency: 50
```

```yaml
# config/custom-environment-variables.yaml
db:
  password: DB_PASSWORD
```

```ts
import config from "config";

const dbHost = config.get<string>("db.host");
const dbPassword = config.get<string>("db.password");
```

`@env-kit/node-settings`:

```ts
// settings.ts
import { defineSettings } from "@env-kit/node-settings";
import { z } from "zod";

export default defineSettings({
  envSchema: z.object({
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    DB_PASSWORD: z.string(),
  }),
  envKey: "NODE_ENV",
  defaults: {
    db: { host: "localhost", port: 5432, poolSize: 10 },
    worker: { concurrency: 5 },
  },
  perEnv: {
    development: {},
    production: {
      db: { host: "prod-db.example.com", poolSize: 100 },
      worker: { concurrency: 50 },
    },
  },
  build: (env, config) => ({
    db: {
      host: config.db.host,
      port: config.db.port,
      poolSize: config.db.poolSize,
      password: env.DB_PASSWORD,
    },
    worker: { concurrency: config.worker.concurrency },
  }),
});
```

## Feature mapping

| node-config | `@env-kit/node-settings` | Notes |
| --- | --- | --- |
| `config/default.yaml` | `defaults: { ... }` in `defineSettings` | Same shape; now typed. |
| `config/<NODE_ENV>.yaml` (or `.json`) | `perEnv: { development, production, ... }` | Same cascade idea, now in TS. |
| `config/local.yaml` | `perEnv` entry for whichever `envKey` value you use locally, OR a `.env.local` for env-side overrides | We don't ship a magic `local.yaml` — committed perEnv handles per-env stuff; `.env.local` (gitignored) handles per-machine stuff. |
| `config/custom-environment-variables.yaml` | `envSchema` (zod) | The "env vars mapped to config keys" indirection goes away — env vars are validated directly, then folded in via the `build()` function. |
| `config.get("db.host")` | `settings.db.host` | Typed property access. |
| `config.has("foo.bar")` | `"bar" in settings.foo` or optional-chained checks | Optional fields are typed `T \| undefined`. |
| File-format flexibility (YAML, JSON, JS, .toml, …) | TypeScript only | We chose TS for full type checking. Convert your YAML to TS as part of the migration. |
| Multiple `NODE_CONFIG_DIR` directories | Monorepo `extends` (t3-oss/env style) | Apps that share base config use `extends: [baseLoader]`. |

## Step-by-step

1. **Install**:

   ```bash
   pnpm add @env-kit/node-settings zod
   ```

2. **Sketch the `AppConfig` type** from your `default.yaml`. Top
   level of the file becomes a TS interface:

   ```ts
   // config/defaults.ts
   import type { DeepPartial } from "@env-kit/node-settings";

   export interface AppConfig {
     db: { host: string; port: number; poolSize: number };
     worker: { concurrency: number };
   }

   export const defaults: AppConfig = {
     db: { host: "localhost", port: 5432, poolSize: 10 },
     worker: { concurrency: 5 },
   };
   ```

3. **Per-env files** — translate each `config/<env>.yaml` into a TS
   file that exports a `DeepPartial<AppConfig>`:

   ```ts
   // config/production.ts
   import type { DeepPartial } from "@env-kit/node-settings";
   import type { AppConfig } from "./defaults.js";

   export const production: DeepPartial<AppConfig> = {
     db: { host: "prod-db.example.com", poolSize: 100 },
     worker: { concurrency: 50 },
   };
   ```

   Use `DeepPartial<AppConfig>` so typos in keys fail compilation —
   that's the main upgrade over YAML files.

4. **Env vars** — anything from
   `config/custom-environment-variables.yaml` becomes an entry in
   `envSchema`. Drop the `db.password: DB_PASSWORD` indirection;
   declare `DB_PASSWORD: z.string()` and reference it directly in
   `build()`.

5. **Pick `envKey`**. node-config keys off `NODE_ENV` by default. We
   can do the same: `envKey: "NODE_ENV"`. If you want richer enums
   (`local / dev / stage / prod` instead of the Node convention),
   add a separate `APP_ENV`.

6. **Wire it together** in `defineSettings`. Use the worked example
   in [`sample/`](../../sample/) as a template — it follows the
   split-file pattern at scale.

7. **Replace `config.get(...)` call sites** with typed property
   access. TypeScript errors give you the punch list.

8. **Delete** the old `config/*.yaml`, `config/*.json`, and `config`
   dep after the dust settles.

## Gotchas

- **TS, not YAML**: this is a trade. You give up "config person can
  edit a YAML file" in exchange for compiler-checked config. If
  non-engineers were the ones touching `config/production.yaml`
  before, that workflow changes — they now edit
  `config/production.ts` (still readable, but it's code).
- **No magic `local.yaml`**: node-config has special handling for
  `local.yaml` / `local-<env>.yaml` so contributors can override
  without committing. We handle that via `.env.local` /
  `.env.<mode>.local` (gitignored), not via a config layer.
- **No multi-format support**: just TS. If you have legacy `.json5`
  / `.toml` / `.hjson` files, you'll need to translate them once.
- **`NODE_CONFIG`** env-var-as-JSON-merge maps to our
  `overrideEnvKey` option (declare an env var like
  `APP_CONFIG_JSON: z.string().optional()` in `envSchema` and set
  `overrideEnvKey: "APP_CONFIG_JSON"`).
- **`config.util.toObject()` / `extendDeep` etc.**: not needed —
  the loader returns a plain frozen object.

## What you gain

- **Compile-time type safety** on every config key. No more
  `config.get("db.hots")` typos getting through to runtime.
- **Env var validation** layered on top of the file cascade. Today
  your app crashes mysteriously when `DB_PASSWORD` is missing; with
  us, zod fails with a clear path-pointed error at boot.
- **Generators**: `.env.example`, K8s manifests, JSON Schema,
  Markdown docs.
- **CLI**: pre-deploy `node-settings check` flags missing required
  env vars per environment.
- **Build-time plugins**: bad env aborts `vite build` / `next build`
  before bundling.
