# @changsik00/node-settings

> Schema-first settings for Node apps. One zod schema → typed runtime config,
> `.env.example`, Markdown docs, and Kubernetes manifests. Plus a CLI to
> validate envs and gate deploys in CI.

[![CI](https://github.com/Changsik00/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/Changsik00/node-settings/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@changsik00/node-settings.svg)](https://www.npmjs.com/package/@changsik00/node-settings)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

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

## CLI

```bash
# Validate the current env against the schema (great for CI)
npx node-settings validate .env.production

# Check every per-env branch for TODO placeholders and missing required envs
npx node-settings check --env prod,stage

# Generate artifacts from the schema
npx node-settings generate env-example --out .env.example
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

## License

[MIT](./LICENSE) © Changsik00
