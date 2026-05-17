# sample

A small, working project that uses `@env-kit/node-settings` the way
a real production app would. Read it as a project, not a tutorial —
the file layout and conventions are exactly what you'd commit to a
team repo.

## What lives where

```
sample/
├── .env                # base — committed, shared across envs, no secrets
├── .env.local          # YOUR machine; gitignored in real projects
├── .env.dev            # dev cluster — committed (hosts/URLs, no secrets)
├── .env.stage          # staging cluster
├── .env.prod           # prod cluster — committed shell, secrets via CI/Vault
├── .gitignore          # the real-world gitignore strategy (annotated)
├── settings.ts         # the canonical entry point — envSchema + build()
└── config/             # typed, per-env config layers
    ├── defaults.ts     #   AppConfig type + baseline values
    ├── local.ts        #   DeepPartial<AppConfig> for local
    ├── dev.ts          #   ... for dev
    ├── stage.ts        #   ... for stage
    └── prod.ts         #   ... for prod
```

The split is intentional:

| | files at the root (`./.env*`) | `./config/*.ts` |
| --- | --- | --- |
| **What it carries** | Sensitive or infra-shaped values: hostnames, ports, secrets, tokens, API keys, DB passwords. | Application-shaped values: bucket names, worker concurrency, feature flags, log levels, rate limits. |
| **Who fills it** | Infra / CI / Vault / Kubernetes Secret at deploy time. | Developers, edited in source, reviewed via PR. |
| **Committed?** | Non-secret parts yes; real secrets come from a secret store, never commit. | Yes, fully — `config/<mode>.ts` is the cross-team communication channel for "what does this app do differently in prod?" |
| **Validated by** | `envSchema` (zod) at runtime boot. | TypeScript at compile time (`DeepPartial<AppConfig>`) + `node-settings check` in CI for unfilled `todo()` placeholders. |
| **Failure mode** | `ENV_VALIDATION_FAILED` (zod error). | `PER_ENV_TODO` (unfilled placeholder) at boot, or compile error for shape mismatch. |

If you've used **dotenv / dotenv-flow** before — `.env*` files map
directly to your habit. If you've used **convict / node-config / a
custom `config/<env>.json` setup** — `config/*.ts` is the typed
upgrade of that pattern.

## How a value gets to your code

```
.env                ┐
.env.local          │
.env.<mode>         ├─► loadDotenvCascade() ─►  process.env (wins over files)
.env.<mode>.local   │                                  │
CI / Vault / ...    ┘                                  ▼
                                              envSchema.parse() (zod)
                                                       │
                                              envKey selects perEnv[mode]
                                                       │
        config/defaults.ts  ⊕  config/<mode>.ts  ⊕  CONFIG_OVERRIDE_JSON
                                                       │
                                                       ▼
                                                 build(env, config)
                                                       │
                                                       ▼
                                                Object.freeze ⇒ cfg
```

At every `⊕` step a value from a later source wins over the earlier
ones — deep-merged so nested fields combine field-by-field rather
than replace wholesale.

### Worked example: `cfg.bucket` in production

Walk through one key, top to bottom:

| Step | Source | Value seen so far |
| --- | --- | --- |
| 1 | `.env` (no `BUCKET` declared — it's a config value, not an env value) | — |
| 2 | `.env.prod` (same) | — |
| 3 | `envSchema` doesn't have `BUCKET` either — it's not an env var | — |
| 4 | `config/defaults.ts`: `defaults.bucket = ""` | `""` |
| 5 | `config/prod.ts`: `bucket: "prod-bucket"` | **`"prod-bucket"`** |
| 6 | `CONFIG_OVERRIDE_JSON` not set → no override | `"prod-bucket"` |
| 7 | `build(env, config)` returns `{ ..., bucket: config.bucket }` | `cfg.bucket === "prod-bucket"` |

### Worked example: `cfg.dbHost` in dev

Same key, env-injected this time:

| Step | Source | Value seen so far |
| --- | --- | --- |
| 1 | `.env` (no `DB_HOST` — left for env-specific files) | — |
| 2 | `.env.dev`: `DB_HOST=db.dev.internal` | `"db.dev.internal"` |
| 3 | CI sets `DB_HOST=db-replica-7.dev.internal` (overrides .env files) | `"db-replica-7.dev.internal"` |
| 4 | `envSchema.parse({ DB_HOST: ... })` validates as `string` | `"db-replica-7.dev.internal"` |
| 5 | `config/*` doesn't touch `dbHost` (it's not in the AppConfig shape) | — |
| 6 | `build(env, config)` returns `{ dbHost: env.DB_HOST, ... }` | `cfg.dbHost === "db-replica-7.dev.internal"` |

The cascade only goes through files; CI / Vault / Kubernetes Secret
inject directly into `process.env`, which is the final word.

## Runtime override (the escape hatch)

Set `CONFIG_OVERRIDE_JSON` and the whole `config` half can be
patched at boot, without a rebuild or redeploy:

```bash
# Canary the new feature flag for 5% of prod fleet
CONFIG_OVERRIDE_JSON='{"featureFlags":{"newCheckout":true}}' \
  node ./dist/server.js

# Incident: failover to the secondary bucket
CONFIG_OVERRIDE_JSON='{"bucket":"failover-bucket"}' \
  node ./dist/server.js
```

The JSON is deep-merged on top of `defaults + perEnv[mode]`, so you
override just the keys you need.

## Two failure modes, two timings

Pick the right pattern for *when* a value arrives:

| Pattern | Where it lives | Filled by | Failure if missing |
| --- | --- | --- | --- |
| **env var** | `envSchema` in `settings.ts` | CI / infra at deploy | `ENV_VALIDATION_FAILED` (zod) |
| **perEnv hardcoded** | `config/<mode>.ts` | Developer editing source | `PER_ENV_TODO` (todo sentinel) |

This sample exercises both:

- **`SENTRY_DSN`** is in `envSchema` — it's a secret CI/infra sets
  at deploy time. Forgetting to set it for an env that requires it
  fails the boot with a zod error.
- **`cdnDomain`** is in `perEnv` — committed in source. Each
  `config/<mode>.ts` supplies a literal value. `config/prod.ts`
  deliberately leaves it as `todo(...)` to demonstrate the failure
  path:

  ```bash
  # inspect — prints <TODO: "..."> in the layered config
  node-settings inspect --config sample/settings.ts --env=prod
  #   cdnDomain: <TODO: "set the prod CDN domain before first deploy">

  # check — fails before deploy
  node-settings check --config sample/settings.ts
  #   ERR  [prod] cdnDomain: unfilled todo() at 'cdnDomain': ...

  # at runtime — throws NodeSettingsError(PER_ENV_TODO)
  import settings from "./sample/settings.ts";
  settings({ APP_ENV: "prod", DB_HOST: "h", DB_PASSWORD: "p" });
  //   NodeSettingsError [PER_ENV_TODO]: unfilled todo() value(s)
  //   for APP_ENV=prod:
  //     - cdnDomain: set the prod CDN domain before first deploy
  ```

> **Don't put `todo(...)` on a value that arrives via CI/env.**
> `todo()` is a commit-time placeholder. It will throw
> `PER_ENV_TODO` no matter what CI sets, because env-var injection
> does *not* fill in perEnv slots. Sentry DSN belongs in
> `envSchema`; CDN domain belongs in `perEnv`.

## Handling errors at boot

What real boot code looks like — match on `err.code` for control flow
and ship `reportError(err)` to your logger / dashboard for the
structured view:

```ts
// boot.ts (the entrypoint of your app)
import { loadDotenvCascade, NodeSettingsError, reportError } from "@env-kit/node-settings";
import settings from "./settings.js";

declare const logger: { error: (payload: unknown) => void };

try {
  const { env, mode } = loadDotenvCascade();
  const cfg = settings(env);            // throws if env / perEnv is wrong
  console.log(`booting in ${mode} mode on port ${cfg.port}`);
  // ... start the server with `cfg` ...
} catch (err) {
  if (err instanceof NodeSettingsError) {
    if (err.severity === "config") {
      // Misconfiguration in source — fix the code, not the env.
      // CI should never have let this reach prod; this is a developer-time alarm.
    } else if (err.severity === "runtime") {
      // Bad env at boot — page the on-call operator, not the developer.
    } else if (err.severity === "io") {
      // FS / parse failure — usually CI or the deploy platform.
    }
    console.error(`${err.title}: ${err.message}`);
    console.error(`  see ${err.docsUrl}`);
  }
  logger.error(reportError(err));       // structured payload for log aggregators
  process.exit(1);
}
```

`reportError()` returns the same shape the CLI's `--format=json`
emits, so dashboards built on one cover the other.

## Try the CLI against this sample

From the repo root:

```bash
# What does prod resolve to? (dry-run, no secrets required)
node-settings inspect --config sample/settings.ts --env=prod

# Generate per-env .env templates from the schema
node-settings generate envs --config sample/settings.ts --out-dir /tmp/envs

# Generate Markdown env documentation
node-settings generate docs --config sample/settings.ts --out /tmp/ENV.md

# Generate Kubernetes ConfigMap + Secret
node-settings generate k8s --config sample/settings.ts --name demo --out /tmp/k8s.yaml

# Catch TODO placeholders / missing required envs per env
node-settings check --config sample/settings.ts

# Composite gate: validate + check + inspect in one shot
node-settings preflight .env.local --config sample/settings.ts
```

## Lift it into your own project

1. Copy the files you want. Most projects start with `settings.ts`
   + `config/defaults.ts` + one `config/<mode>.ts` and grow.
2. **Add `.env*` to your real `.gitignore`** (see `sample/.gitignore`
   — that's a template you can drop in).
3. At boot, hand the cascade output to `settings`:

   ```ts
   import { loadDotenvCascade } from "@env-kit/node-settings";
   import settings from "./settings.js";

   const { env, mode } = loadDotenvCascade();
   console.log(`Booting in ${mode} mode`);
   export const cfg = settings(env);
   ```

   For Vite or Next.js, add the build-time plugin and you're done —
   bad env aborts the build, not the runtime:

   ```ts
   // vite.config.ts
   import { nodeSettings } from "@env-kit/node-settings/vite";
   export default defineConfig({ plugins: [nodeSettings()] });
   ```

   ```ts
   // next.config.mjs
   import { withNodeSettings } from "@env-kit/node-settings/next";
   export default await withNodeSettings({ reactStrictMode: true });
   ```

## When *not* to split

If your config fits in 30-40 lines, skip the `config/` folder and
inline everything in `settings.ts`:

```ts
defineSettings({
  envSchema: z.object({...}),
  envKey: "APP_ENV",
  defaults: {...},
  perEnv: { local: {...}, prod: {...} },
  build: (env, config) => ({...}),
});
```

The split is for legibility at scale, not for type safety — both
layouts have identical runtime behaviour and identical types.
