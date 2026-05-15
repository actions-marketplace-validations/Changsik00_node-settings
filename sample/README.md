# sample/

A complete worked example. Copy the structure to your project — drop
the `.sample` suffix on env files, adjust paths, done.

```
sample/
├── settings.ts             # ← the canonical entry point (envSchema + build)
├── env/                    # ← committed templates for runtime env vars
│   ├── .env.local.sample
│   ├── .env.dev.sample
│   ├── .env.stage.sample
│   └── .env.prod.sample
└── config/                 # ← typed config layers consumed by settings.ts
    ├── defaults.ts         #   AppConfig type + baseline values
    ├── local.ts            #   DeepPartial<AppConfig> for local
    ├── dev.ts              #   ... for dev
    ├── stage.ts            #   ... for stage
    └── prod.ts             #   ... for prod
```

## How the pieces fit

- **`env/`** holds **runtime inputs** — environment variables. The
  `.sample` files are committed templates; real `.env.<mode>` files
  belong at the project root and are gitignored. `loadDotenvCascade()`
  reads them automatically based on `APP_ENV`.

- **`config/`** holds **typed config layers** — `defaults.ts` plus one
  `<mode>.ts` per perEnv branch. These get composed by `defineSettings`
  inside `settings.ts`. Each per-env file imports `AppConfig` from
  `defaults.ts` and exports a `DeepPartial<AppConfig>`, so a typo or a
  removed field fails compilation.

- **`settings.ts`** assembles everything. It declares the env schema,
  imports the config layers, and provides the `build()` function that
  produces the final settings object the app consumes.

## Two failure modes, two timings

The sample illustrates two distinct ways "missing value" can be
enforced — pick the one that matches *when* the value arrives:

| Pattern             | Where it lives          | Filled by                       | Failure if missing            |
| ------------------- | ----------------------- | ------------------------------- | ----------------------------- |
| **env var**         | `envSchema` (settings.ts)| CI / infra at deploy            | `ENV_VALIDATION_FAILED` (zod) |
| **perEnv hardcoded**| `config/<mode>.ts`       | a developer editing source      | `PER_ENV_TODO` (todo sentinel)|

In this sample:

- **`SENTRY_DSN`** is in `envSchema` — it's a secret the CI/infra
  team sets at deploy time (Vault, AWS Secrets Manager, GitHub
  Actions secrets, etc.). If CI forgets to set it for an env that
  requires it, zod's required check fails the boot.
- **`cdnDomain`** is in `perEnv` — it's committed in source. Each
  per-env file (`config/local.ts`, `config/dev.ts`, ...) supplies a
  literal value. `config/prod.ts` deliberately leaves it as
  `todo(...)` to demonstrate the failure path:

  ```bash
  # inspect — prints <TODO: "..."> in the layered config
  node-settings inspect --config sample/settings.ts --env=prod
  #   cdnDomain: <TODO: "set the prod CDN domain before first deploy">

  # check — fails with kind:'todo' error before deploy
  node-settings check --config sample/settings.ts
  #   ERR  [prod] cdnDomain: unfilled todo() at 'cdnDomain': ...

  # loading the env at runtime — throws NodeSettingsError(PER_ENV_TODO)
  import settings from "./sample/settings.ts";
  settings({ APP_ENV: "prod", DB_HOST: "h", DB_PASSWORD: "p" });
  //   NodeSettingsError [PER_ENV_TODO]: unfilled todo() value(s) for APP_ENV=prod:
  //     - cdnDomain: set the prod CDN domain before first deploy
  ```

> **Don't put `todo(...)` on a value that arrives via CI/env.** `todo()`
> is a commit-time placeholder. It will throw `PER_ENV_TODO` regardless
> of what CI sets, because env-var injection does not implicitly fill
> in perEnv slots. See
> [`docs/CONFIGURATION.md` "Which pattern for which value?"](../docs/CONFIGURATION.md#which-pattern-for-which-value)
> for the full table.

## Run the CLI against this sample

From the repo root:

```bash
# What does prod resolve to? (dry-run, no secrets required)
node-settings inspect --config sample/settings.ts --env=prod

# Generate per-env .env templates from the schema
node-settings generate envs --config sample/settings.ts --out-dir /tmp/envs

# Generate Markdown docs for infra
node-settings generate docs --config sample/settings.ts --out /tmp/ENV.md

# Generate Kubernetes ConfigMap + Secret
node-settings generate k8s --config sample/settings.ts --name demo --out /tmp/k8s.yaml

# Catch TODO placeholders / missing required envs per branch
node-settings check --config sample/settings.ts
```

## Use it in your own project

1. Copy `sample/` (or just the pieces you want) into your project.
2. Rename `sample/` to whatever fits your layout — `src/settings/`,
   `config/`, `apps/api/settings/`, etc.
3. Drop `.sample` on the env files you want loaded:
   ```bash
   cp sample/env/.env.local.sample .env.local
   cp sample/env/.env.prod.sample  .env.prod
   ```
4. At boot, wire it up:
   ```ts
   import { loadDotenvCascade } from "@changsik00/node-settings";
   import settings from "./settings.js";

   const { env, mode } = loadDotenvCascade();
   console.log(`Booting in ${mode} mode`);
   export const cfg = settings(env);
   ```

## When *not* to split

If your config fits in 30-40 lines, keep it in one file:

```ts
defineSettings({
  envSchema: z.object({...}),
  envKey: "APP_ENV",
  defaults: {...},
  perEnv: {
    local: {...},
    prod:  {...},
  },
  build: (env, config) => ({...}),
});
```

The split is for legibility, not type safety — both layouts get the
same runtime behaviour and the same type checking.
