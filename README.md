<div align="center">

# @changsik00/node-settings

**Schema-first settings for Node apps.**
One zod schema → typed runtime config + `.env.example` + Markdown docs + Kubernetes manifests, plus a CLI that gates deploys in CI.

[![npm version](https://img.shields.io/npm/v/@changsik00/node-settings?color=cb3837&label=npm&logo=npm)](https://www.npmjs.com/package/@changsik00/node-settings)
[![CI](https://github.com/Changsik00/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/Changsik00/node-settings/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Types: TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Install size](https://packagephobia.com/badge?p=@changsik00/node-settings)](https://packagephobia.com/result?p=@changsik00/node-settings)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@changsik00/node-settings?label=minzipped)](https://bundlephobia.com/package/@changsik00/node-settings)

[**Quickstart**](#quick-start) · [**CLI**](#cli) · [**Monorepo**](#monorepo-support) · [**Errors**](#errors) · [**Why?**](#why-another-settings-library)

</div>

---

## Table of contents

- [Features at a glance](#features-at-a-glance)
- [Why another settings library?](#why-another-settings-library)
- [Install](#install)
- [Quick start](#quick-start)
- [Setting `APP_ENV` across deployments](#setting-app_env-across-deployments)
- [Where your config lives](#where-your-config-lives)
- [CLI](#cli)
- [Programmatic generator API](#programmatic-generator-api)
- [Monorepo support](#monorepo-support)
- [Layering model](#layering-model)
- [Errors](#errors)
- [License](#license)

## Features at a glance

- **One zod schema, four outputs.** Runtime settings, `.env.example`, Markdown docs, Kubernetes ConfigMap/Secret — all generated from the same definition.
- **Build Once, Deploy Many.** One container image, `APP_ENV`-driven per-env layering. Nothing baked at build time.
- **Typed end-to-end.** `defineSettings` returns a fully-typed loader; `build(env, config)` sees the inferred merged shape with `extends`.
- **Monorepo-aware.** t3-oss/env-style `extends` for shared base configs; the CLI walks up to find `node-settings.config.*` like `tsc` does.
- **Defensive at definition time.** Misconfiguration (wrong `envKey`, typo'd `perEnv` branch, missing override key) is caught when the loader is *defined*, not on the first request to prod.
- **CI gate, not a vibe.** `node-settings validate` and `check` exit non-zero and tell you exactly what's wrong.
- **Auto secret detection.** `PASSWORD` / `TOKEN` / `SECRET` / `API_KEY` / `PRIVATE_KEY` / `CREDENTIAL` patterns split into the Secret manifest automatically; `@secret` / `@public` tags override.
- **Stable error API.** Every thrown error is a `NodeSettingsError` with a string `code` you can switch on.
- **`.env.<mode>` cascade.** Opt-in `loadDotenvCascade()` follows the Vite / Next.js / dotenv-flow naming convention so you can drop `.env.local` / `.env.dev` / `.env.prod` files in the project root and have them load in the right order.
- **Tiny.** No runtime deps beyond zod (peer) and jiti (TS config loading); ESM-only; Node ≥ 18.

```
                ┌──────────────────────────────────────────────┐
                │             One zod env schema               │
                └──────────────────────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────────┐
       ▼                      ▼                          ▼
  Typed runtime         .env.example +              ConfigMap +
  settings (frozen)     ENV.md docs                 Secret YAML
       │                      │                          │
   Your app             Developers, infra            kubectl /
                                                     Sealed Secrets
```

## Why another settings library?

Most env libraries stop at runtime validation. `node-settings` covers the
**handoff between developers and infra** that those libraries leave open:

| Capability                                            | dotenv | t3-oss/env | convict | node-settings |
| ----------------------------------------------------- | :----: | :--------: | :-----: | :-----------: |
| zod-based env validation                              |        |     ✅     |         |       ✅       |
| Layered config (defaults → per-env → JSON override)   |        |            |   ✅    |       ✅       |
| Monorepo `extends` for shared base configs            |        |     ✅     |         |       ✅       |
| Generates `.env.example` from the schema              |        |            |         |       ✅       |
| Generates Markdown docs for infra teams               |        |            |         |       ✅       |
| Generates Kubernetes ConfigMap + Secret YAML          |        |            |         |       ✅       |
| CLI validation for CI (`.env.production` is complete) |        |            |         |       ✅       |
| Per-env placeholder detection (`TODO-…`)              |        |            |         |       ✅       |

Built for **Build Once, Deploy Many** workflows where the same container
image needs to behave differently in `local` / `dev` / `stage` / `prod`,
and the env contract must be visible to people who don't read your TS.

## Install

```bash
npm install @changsik00/node-settings zod
# or
pnpm add @changsik00/node-settings zod
# or
yarn add @changsik00/node-settings zod
```

`zod` is a peer dependency — install it explicitly.

## Quick start

### 1. Define the schema

```ts
// settings.config.ts
import { z } from "zod";
import { defineSettings } from "@changsik00/node-settings";

const envSchema = z.object({
  APP_ENV: z.enum(["local", "dev", "stage", "prod"]).default("local"),
  PORT: z.coerce.number().default(3000),
  DB_HOST: z.string().describe("Primary database host"),
  DB_PASSWORD: z.string(), // auto-flagged as secret by name pattern
  CONFIG_OVERRIDE_JSON: z.string().optional(),
});

interface AppConfig {
  bucket: string;
  workerConcurrency: number;
  featureFlags: { newCheckout: boolean };
}

const defaults: AppConfig = {
  bucket: "",
  workerConcurrency: 1,
  featureFlags: { newCheckout: false },
};

const settings = defineSettings({
  envSchema,
  envKey: "APP_ENV",
  overrideEnvKey: "CONFIG_OVERRIDE_JSON",
  defaults,
  perEnv: {
    local: { bucket: "local-bucket" },
    dev:   { bucket: "dev-bucket" },
    stage: { bucket: "stage-bucket" },
    prod:  { bucket: "prod-bucket", featureFlags: { newCheckout: true } },
  },
  build: (env, config) => ({
    port: env.PORT,
    dbHost: env.DB_HOST,
    dbPassword: env.DB_PASSWORD,
    bucket: config.bucket,
    workerConcurrency: config.workerConcurrency,
    featureFlags: config.featureFlags,
  }),
});

export default settings;
export type Settings = ReturnType<typeof settings>;
```

### 2. Use it at runtime

```ts
// bootstrap.ts
import settings from "./settings.config.js";

const cfg = settings(process.env);
console.log(cfg.dbHost, cfg.bucket);
// cfg is fully typed and frozen
```

### NestJS integration

```ts
import { ConfigModule, ConfigService } from "@nestjs/config";
import settings, { type Settings } from "./settings.config.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (raw) => settings(raw),
    }),
  ],
})
export class AppModule {}

class FooService {
  constructor(private readonly cfg: ConfigService<Settings, true>) {}
  bucket() {
    return this.cfg.get("bucket", { infer: true });
  }
}
```

## Setting `APP_ENV` across deployments

`node-settings` reads `process.env.APP_ENV` (or whatever `envKey` you
pick) **as a plain environment variable**. It does not auto-detect the
deployment environment — setting `APP_ENV` is the deployment platform's
job, per [12-factor app](https://12factor.net/config) methodology.
Below are the patterns each common platform uses.

**Fallback for local dev:** if you give `envKey` a default
(`z.enum(['local','dev','prod']).default('local')`), nothing breaks
when `APP_ENV` is unset — you simply run in `local` mode. So you only
need to set `APP_ENV` explicitly in deployed environments.

### Local development — the `.env.<mode>` cascade

The library ships a `loadDotenvCascade()` helper that picks up the
file-naming convention every other Node tool uses (Next.js, Vite,
dotenv-flow). Drop the right files in the project root and the helper
loads them in the right order:

```
.env                       ← base, committed
.env.local                 ← personal local overrides, gitignored
.env.<APP_ENV>            ← environment-specific (.env.dev, .env.prod, ...)
.env.<APP_ENV>.local      ← personal env-specific local, gitignored
process.env               ← always wins (deployment platform's values)
```

Wire it up at boot:

```ts
import { defineSettings, loadDotenvCascade } from "@changsik00/node-settings";
import settings from "./settings.config.js";

const { env, mode, loaded } = loadDotenvCascade();
console.log(`Booting in '${mode}' mode. Loaded:`, loaded);
export const cfg = settings(env);
```

Mode detection (`mode` is what `.env.<mode>` resolves to):

1. `process.env.APP_ENV` if set, else
2. the `APP_ENV` value parsed out of `.env`, else
3. the `defaultMode` option (`'local'` by default).

In `test` mode the two `.local` files are skipped — same convention as
Next/Vite — so CI runs aren't affected by developer-local overrides.

The committed templates in [`examples/env-samples/`](./examples/env-samples)
plug straight in: drop `.sample` and the cascade picks them up.

```bash
cp examples/env-samples/.env.local.sample .env.local
cp examples/env-samples/.env.prod.sample  .env.prod
```

Alternatively, set `APP_ENV` inline if you don't want files:

```json
{
  "scripts": {
    "dev": "APP_ENV=local tsx src/main.ts",
    "dev:integration": "APP_ENV=dev tsx src/main.ts"
  }
}
```

### Docker

Set at `docker run` time (preferred — keeps the image environment-agnostic):

```bash
docker run -e APP_ENV=dev my-app:latest
```

Or via `--env-file`:

```bash
docker run --env-file .env.dev my-app:latest
```

Avoid baking `ENV APP_ENV=…` into the `Dockerfile` — that breaks
"build once, deploy many".

### Docker Compose

```yaml
services:
  api:
    image: my-app:latest
    environment:
      APP_ENV: dev
    # or:
    env_file: .env.dev
```

### Kubernetes

Use the auto-generated ConfigMap (one of the reasons this library
exists):

```bash
node-settings generate k8s --name my-app --namespace prod --out k8s.yaml
```

The ConfigMap includes `APP_ENV: "prod"`. Attach it to your Deployment:

```yaml
spec:
  template:
    spec:
      containers:
        - name: api
          envFrom:
            - configMapRef:
                name: my-app-config
            - secretRef:
                name: my-app-secret
```

### GitHub Actions

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      APP_ENV: ${{ github.ref == 'refs/heads/main' && 'prod' || 'dev' }}
    steps:
      - run: npx node-settings validate
      - run: ./deploy.sh
```

### Vercel

Set `APP_ENV` in **Project Settings → Environment Variables**, scoped
per environment (Production / Preview / Development). Vercel also
exposes its own `VERCEL_ENV` — you can map it in code if you prefer:

```ts
const APP_ENV = process.env.APP_ENV ?? process.env.VERCEL_ENV ?? "local";
const settings = loader({ ...process.env, APP_ENV });
```

### Heroku

```bash
heroku config:set APP_ENV=prod --app my-app
heroku config:set APP_ENV=stage --app my-app-stage
```

### AWS ECS / Fargate

Set `APP_ENV` in the task definition `environment` block (and pull
secrets from Secrets Manager via `secrets`):

```json
{
  "containerDefinitions": [{
    "environment": [{ "name": "APP_ENV", "value": "prod" }],
    "secrets":     [{ "name": "DB_PASSWORD", "valueFrom": "arn:..." }]
  }]
}
```

### AWS Lambda

Configure in **Configuration → Environment variables**, one stack /
function per environment (typical Serverless Framework / SAM /
SST pattern):

```yaml
# serverless.yml
provider:
  environment:
    APP_ENV: ${self:custom.stage}
```

### Render / Railway / Fly.io

Environment Variables panel in the dashboard, or via the platform CLI:

```bash
fly secrets set APP_ENV=prod
railway variables set APP_ENV=prod
```

### `APP_ENV` vs `NODE_ENV` — which to use?

| Var       | What it really means                                      | Use it for                |
| --------- | --------------------------------------------------------- | ------------------------- |
| `NODE_ENV` | Node.js convention: `development` \| `production` \| `test`. Affects `npm install --omit=dev`, framework optimizations, error verbosity. | Build-time and framework concerns. |
| `APP_ENV`  | Your own deployment-environment label: `local`, `dev`, `stage`, `prod`, ... whatever you choose. | Per-environment config selection (this library). |

Treat them as orthogonal. `NODE_ENV=production` may be true for *every*
`APP_ENV` value other than `local` — keep them in separate columns of
your env files and ConfigMaps.

You can use `NODE_ENV` as your `envKey` if you only care about
`production` vs `development`, but most real systems outgrow that
quickly. Define `APP_ENV` from day one.

## Where your config lives

There are *two* "base" concepts in this library and they're often
confused. They live on different axes.

| Axis              | "Base" means                                        | Override mechanism                          | Where it shows up           |
| ----------------- | --------------------------------------------------- | ------------------------------------------- | --------------------------- |
| **Env axis**      | `defaults` — values shared across every environment | `perEnv[mode]` (deepMerged on top)          | Inside a single loader      |
| **Package axis**  | `extends: [baseLoader]` — another loader's whole shape | child's own `envSchema` / `defaults` / `perEnv` | Across packages in a monorepo |

You can use both at once — `defaults` is your *intra-loader* base, and
`extends` is your *inter-loader* base.

Plus there's a third "base" outside the loader: the `.env` cascade
file convention (`.env`, `.env.local`, `.env.<mode>`, `.env.<mode>.local`).
That layers *env var inputs* — separate from layering *config values*.

### Single-file layout (default)

Everything in one `settings.config.ts`. The simplest layout; works for
small/medium apps. See [`examples/basic.config.ts`](./examples/basic.config.ts).

```ts
defineSettings({
  envSchema: z.object({...}),
  defaults: { bucket: "", workerConcurrency: 1, ... },
  perEnv: {
    local: { bucket: "local-bucket" },
    dev:   { bucket: "dev-bucket" },
    prod:  { bucket: "prod-bucket", workerConcurrency: 8 },
  },
  build: (env, config) => ({...}),
});
```

### Split-file layout

When `perEnv` outgrows a single file: keep the schema and `build()`
in `settings.config.ts`, put each env's overrides in its own file
under `./config/`. See [`examples/multi-file/`](./examples/multi-file)
for a worked-out version.

```
settings.config.ts          # envSchema + build()
config/
  defaults.ts               # exports AppConfig type + defaults
  local.ts                  # DeepPartial<AppConfig> for local
  dev.ts                    # ...
  prod.ts                   # ...
```

```ts
// settings.config.ts
import { defaults } from "./config/defaults.js";
import { local } from "./config/local.js";
import { dev   } from "./config/dev.js";
import { prod  } from "./config/prod.js";

export default defineSettings({
  envSchema, envKey: "APP_ENV",
  defaults,
  perEnv: { local, dev, prod },
  build: (env, config) => ({...}),
});
```

Per-env files import `AppConfig` from `defaults.ts` and export
`DeepPartial<AppConfig>`, so typos and removed fields fail compilation.
Same generators, same CLI, same runtime — just better git-blame.

### Monorepo layout (with `extends`)

A shared base loader in one package, child loaders in each app. The
child inherits the base's envSchema, defaults, and perEnv, then adds
its own. See [the Monorepo section below](#monorepo-support).

```
packages/
  shared/
    settings.base.ts        # exports `base` from defineSettings(...)
  content-api/
    settings.config.ts      # defineSettings({ extends: [base], ... })
  worker/
    settings.config.ts      # defineSettings({ extends: [base], ... })
```

### Quick recap — which "base" do I want?

| Question                                                              | Use                |
| --------------------------------------------------------------------- | ------------------ |
| "Some values are the same across local/dev/prod"                      | `defaults`         |
| "Some values differ per environment"                                  | `perEnv[mode]`     |
| "Some env vars come from `.env` files at the project root"            | `loadDotenvCascade` |
| "Many apps in this monorepo share the same env vars and defaults"     | `extends: [base]`  |

### See what your config resolves to

When in doubt, dry-run it with `inspect`:

```bash
node-settings inspect --env=prod
```

Prints the env schema (the contract) plus the layered config
(`defaults` deep-merged with `perEnv.prod`) without calling your
`build()` function. No env values needed — useful for "what does prod
look like?" without prod secrets.

## CLI

```bash
# Validate the current env against the schema (great for CI)
npx node-settings validate .env.production

# Check every per-env branch for TODO placeholders and missing required envs
npx node-settings check --env prod,stage

# Inspect what each env actually resolves to (dry-run, no secrets needed)
npx node-settings inspect --env prod

# Generate artifacts from the schema
npx node-settings generate env-example --out .env.example
npx node-settings generate envs        --out-dir env-samples/      # one .env per perEnv branch
npx node-settings generate docs        --out ENV.md
npx node-settings generate k8s         --name my-app --namespace prod --out k8s.yaml
```

The CLI auto-discovers `node-settings.config.{ts,mts,js,mjs,cjs}` (or
`settings.config.*`) in the working directory. Use `--config <path>` to
point at a different file. TypeScript configs work out of the box via
[`jiti`](https://github.com/unjs/jiti).

### `validate`

Runs the schema against a `.env` file (or `process.env`). Exits non-zero
on validation errors. Drop it in your PR pipeline:

```yaml
- run: npx node-settings validate .env.production
```

### `check`

Scans every `perEnv` branch and reports:

- **Placeholder values** — values matching `TODO-`, `FIXME-`, `REPLACE_ME`, `<...>`.
- **Empty required strings** in the layered config.
- **Missing required env vars** for each environment (compared against optional `--env-file name=path` inputs).

```bash
npx node-settings check --env prod \
  --env-file prod=.env.prod \
  --no-allow-warnings
```

### `generate`

| Target        | Description                                                                   |
| ------------- | ----------------------------------------------------------------------------- |
| `env-example` | A heavily-commented `.env.example` file (groups secrets separately).          |
| `envs`        | One `.env.<branch>.example` per `perEnv` branch, with `APP_ENV` pre-filled. Needs `--out-dir <dir>`. |
| `docs`        | Markdown table for `ENV.md` — handoff doc for SRE / infra.                    |
| `k8s`         | ConfigMap + Secret YAML (auto-splits secrets, opaque `stringData` by default).|

Pass `--out <path>` to write to disk; otherwise output goes to stdout.

## Programmatic generator API

If you'd rather wire generators into your own scripts:

```ts
import {
  generateEnvExample,
  generateMarkdownDocs,
  generateK8sManifests,
} from "@changsik00/node-settings/generators";
import settings from "./settings.config.js";

const exampleText = generateEnvExample(settings.envFields);
const docs = generateMarkdownDocs(settings.envFields, { title: "My Service" });
const { configMap, secret } = generateK8sManifests(settings.envFields, {
  name: "my-app",
  namespace: "prod",
});
```

## Monorepo support

`node-settings` follows the patterns that the rest of the Node ecosystem
already uses, so it should feel familiar in a Turborepo / Nx / pnpm-workspace
setup.

### `extends` — share a base across packages

Modeled after [`@t3-oss/env-core`](https://github.com/t3-oss/t3-env)'s
`extends` field. Pass an array of parent loaders and their `envSchema`,
`defaults`, and `perEnv` get merged in before the child's:

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
// packages/content-api/node-settings.config.ts
import { z } from "zod";
import { defineSettings } from "@changsik00/node-settings";
import { base } from "../shared/settings.base.js";

export default defineSettings({
  extends: [base],                                        // ← inherit
  envSchema: z.object({ CONTENT_BUCKET: z.string() }),    // child-only
  envKey: "APP_ENV",
  defaults: { bucket: "" },
  perEnv: {
    local: { bucket: "local-content" },
    dev:   { bucket: "dev-content" },
    prod:  { bucket: "prod-content" },
  },
  build: (env, config) => ({
    contentBucket: env.CONTENT_BUCKET, // child env var
    dbHost: env.DB_HOST,               // inherited from base
    bucket: config.bucket,             // child config
    region: config.region,             // inherited from base
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
directory tree to find a `node-settings.config.*` (or `settings.config.*`)
in any ancestor — the same behavior `tsc`, `eslint`, and other
cosmiconfig-driven tools have.

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
`nx.json`, `rush.json`. If none of these is found and no config exists,
the walk continues to the filesystem root.

### `mergePerEnv` — programmatic composition helper

If you need to compose `perEnv` outside of `defineSettings` (e.g. when
parts of it come from environment-specific files), use the standalone
helper:

```ts
import { mergePerEnv } from "@changsik00/node-settings";
import { basePerEnv } from "../shared/settings.base.js";

const perEnv = mergePerEnv(basePerEnv, {
  local: { bucket: "local-content" },
  prod:  { bucket: "prod-content" },
});
```

## Layering model

```
rawEnv (process.env)
  ↓ envSchema.parse  (zod)
env: TEnv
  ↓ perEnv[env[envKey]] lookup
envSpecific: DeepPartial<TConfig>
  ↓ deepMerge(defaults, envSpecific)
baseConfig: TConfig
  ↓ overrideEnvKey → JSON.parse → validateOverride? → deepMerge
finalConfig: TConfig
  ↓ build(env, finalConfig)
Settings → Object.freeze
```

### Design principles

1. **Domain-agnostic** — this package knows nothing about your databases,
   buckets, or external services. The application defines the shape.
2. **Schema is the source of truth** — every artifact (.env.example, ENV.md,
   K8s YAML) is generated from the same zod schema. No drift.
3. **External injection for side effects** — `onOverride` / `validateOverride`
   are hooks; this package owns no logger and emits no console output.
4. **Frozen results** — the returned settings object is `Object.freeze`'d so
   misbehaving callers can't mutate it.
5. **Build Once, Deploy Many** — the same artifact handles every env via the
   `APP_ENV` lookup; nothing is baked at build time.

### Secret detection

A field is treated as a secret when **any** of these is true:

- Its name matches a default pattern (`PASSWORD`, `SECRET`, `TOKEN`,
  `PRIVATE_KEY`, `API_KEY`, `CREDENTIAL`, `PASSPHRASE`).
- Its zod description contains `@secret`.

You can override:

- Force a field public with `.describe("... @public")`.
- Replace the default patterns:
  ```ts
  defineSettings({
    /* ... */
    secretPatterns: [/SECRET/i, /MY_CUSTOM_TAG/],
  });
  ```

## Errors

Every error thrown by the package is a `NodeSettingsError`. Match on
`.code` — never on `.message`, which can evolve.

```ts
import { NodeSettingsError } from "@changsik00/node-settings";

try {
  const cfg = settings(process.env);
} catch (err) {
  if (err instanceof NodeSettingsError) {
    switch (err.code) {
      case "ENV_VALIDATION_FAILED":
        console.error("missing env vars — see schema for required keys");
        break;
      case "PER_ENV_BRANCH_MISSING":
        console.error(`unknown APP_ENV value: ${err.message}`);
        break;
      default:
        console.error(err.message);
    }
  }
  process.exit(1);
}
```

| Code                       | When                                                          |
| -------------------------- | ------------------------------------------------------------- |
| `INVALID_ENV_SCHEMA`       | `envSchema` is not a `z.object({...})`.                       |
| `MISSING_ENV_KEY`          | `envKey` not in the (merged) schema.                          |
| `INVALID_ENV_KEY_TYPE`     | `envKey` is not `z.string()` / `z.enum(...)`.                 |
| `INVALID_OVERRIDE_KEY`     | `overrideEnvKey` not in the (merged) schema.                  |
| `PER_ENV_EMPTY`            | `perEnv` has no branches.                                     |
| `PER_ENV_KEY_NOT_IN_ENUM`  | `perEnv` branch is not a value of the `envKey` enum (typo).   |
| `PER_ENV_BRANCH_MISSING`   | Runtime: no `perEnv` branch matches the parsed `envKey` value.|
| `INVALID_EXTENDS_ITEM`     | `extends[i]` is not a `defineSettings(...)` return value.     |
| `OVERRIDE_JSON_PARSE`      | `overrideEnvKey` env var is not valid JSON.                   |
| `ENV_VALIDATION_FAILED`    | Zod env validation failed at runtime.                         |

The first six surface at `defineSettings(...)` call time so misconfiguration
fails fast — before the loader ever runs.

## License

[MIT](./LICENSE) © Changsik00

---

<sub>Built for teams that ship the same image to many environments.
See [AGENTS.md](./AGENTS.md) for an LLM-friendly summary of the API.</sub>
