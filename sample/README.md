# sample/

A complete worked example. Copy the structure to your project, adjust
paths, done. The repo's own CLI runs against this sample
(`pnpm verify:sample`), so it doubles as a live test of the public API.

## env/ vs config/ — the conceptual split

| | `env/` | `config/` |
| --- | --- | --- |
| **Purpose** | Sensitive runtime values | Settings + cross-team intent |
| **Who fills it** | Infra / CI / Vault / K8s Secret at deploy time | Developers editing source, reviewed via PR |
| **Examples** | `DB_PASSWORD`, `SENTRY_DSN`, hostnames, ports | bucket names, worker concurrency, feature flags, rate limits |
| **Source of truth** | Operator's secret store | Git (source code) |
| **Reviewed by** | Infra team (rotation, audit) | All engineers (code review) |
| **In your real project** | `.env.<mode>` gitignored; only `.env.example` committed | Fully committed, every file |
| **Validated by** | `envSchema` (zod) at runtime boot | TypeScript at definition time + `node-settings check` in CI |

Think of it as: **`env/` is the *what* (which values, where do they come
from at runtime)** — and **`config/` is the *how* (what does this
service do differently in each environment, written down so the team
agrees)**.

## File tree

```
sample/
├── settings.ts             # ← canonical entry point (envSchema + build)
├── env/                    # ← runtime env vars (sensitive)
│   ├── .env                #   shared across all envs (no secrets)
│   ├── .env.local          #   contributor's machine; gitignored in real projects
│   ├── .env.dev            #   dev cluster
│   ├── .env.stage          #   staging cluster
│   └── .env.prod           #   prod cluster (secrets via CI, NOT committed in real life)
├── config/                 # ← typed config layers (intent)
│   ├── defaults.ts         #   AppConfig type + baseline values
│   ├── local.ts            #   DeepPartial<AppConfig> for local
│   ├── dev.ts              #   ... for dev
│   ├── stage.ts            #   ... for stage
│   └── prod.ts             #   ... for prod
└── consumer/               # ← CI-only smoke test (installs from npm registry)
    └── ...                 #   see sample/consumer/README.md
```

## How the pieces fit at runtime

```
sample/env/.env             ┐
sample/env/.env.local       │
sample/env/.env.dev         ├─►  loadDotenvCascade()  ─►  envSchema.parse()  (zod)
sample/env/.env.stage       │                                       │
sample/env/.env.prod        │                                       ▼
process.env (CI-injected)   ┘  wins over file values        envKey selects perEnv[mode]
                                                                    │
              config/defaults.ts  ⊕  config/<mode>.ts  ⊕  CONFIG_OVERRIDE_JSON
                                                                    │
                                                                    ▼
                                                             build(env, config)
                                                                    │
                                                                    ▼
                                                           Object.freeze ⇒ cfg
```

## Two failure modes, two timings

The sample illustrates two ways "missing value" can be enforced — pick
the one that matches *when* the value arrives:

| Pattern | Where it lives | Filled by | Failure if missing |
| --- | --- | --- | --- |
| **env var** | `envSchema` in `settings.ts` | CI / infra at deploy | `ENV_VALIDATION_FAILED` (zod) |
| **perEnv hardcoded** | `config/<mode>.ts` | A developer editing source | `PER_ENV_TODO` (todo sentinel) |

In this sample:

- **`SENTRY_DSN`** is in `envSchema` — it's a secret the CI/infra team
  sets at deploy time (Vault, AWS Secrets Manager, GitHub Actions
  secrets, ...). If CI forgets to set it for an env that requires it,
  zod's required check fails the boot.
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

## Gitignore strategy (for your real project)

In the *sample*, every env file is committed so you can read them. In
**your** project, follow this split:

```gitignore
# .gitignore
.env
.env.*
!.env.example
!.env.*.example
```

- Commit a `.env.example` (or `.env.<mode>.example`) as the template.
- Real `.env`, `.env.local`, `.env.<mode>` stay local.
- Generate the example file directly from the schema:

  ```bash
  node-settings generate env-example --out .env.example
  node-settings generate envs        --out-dir env-samples/
  ```

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

1. Copy the relevant pieces of `sample/` into your project.
2. Rename folders to match your layout — `src/settings/`, `config/`,
   `apps/api/settings/`, etc.
3. Gitignore the real `.env.<mode>` files (see above); keep your
   `config/` files committed.
4. At boot, wire it up:

   ```ts
   import { loadDotenvCascade } from "@env-kit/node-settings";
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

## See also

- [`sample/consumer/`](./consumer) — a separate, CI-only smoke test
  that installs `@env-kit/node-settings` from npm (not a workspace
  link) and compiles a tiny app under strict tsc. Catches "works in
  our repo but breaks for actual npm consumers" issues.
