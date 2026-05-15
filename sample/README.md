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
