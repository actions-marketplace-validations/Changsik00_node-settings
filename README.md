<div align="center">

# @env-kit/node-settings

**Schema-first settings for Node apps.**
One zod schema → typed runtime config + `.env.example` + Markdown docs + Kubernetes manifests + a CLI that gates deploys in CI.

[![npm version](https://img.shields.io/npm/v/@env-kit/node-settings?color=cb3837&label=npm&logo=npm)](https://www.npmjs.com/package/@env-kit/node-settings)
[![CI](https://github.com/Changsik00/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/Changsik00/node-settings/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Types: TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Install size](https://packagephobia.com/badge?p=@env-kit/node-settings)](https://packagephobia.com/result?p=@env-kit/node-settings)

[**Sample**](./sample) · [**Configuration**](./docs/CONFIGURATION.md) · [**Deployment**](./docs/DEPLOYMENT.md) · [**Errors**](./docs/ERRORS.md)

</div>

---

## TL;DR

```bash
pnpm add @env-kit/node-settings zod
```

<!-- doc-test:check -->
```ts
import { z } from "zod";
import { defineSettings } from "@env-kit/node-settings";

const settings = defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
    DB_HOST: z.string(),
    DB_PASSWORD: z.string(),  // auto-flagged as a secret
  }),
  envKey: "APP_ENV",
  defaults: { bucket: "" },
  perEnv: {
    local: { bucket: "local-bucket" },
    dev:   { bucket: "dev-bucket" },
    prod:  { bucket: "prod-bucket" },
  },
  build: (env, config) => ({
    dbHost: env.DB_HOST,
    dbPassword: env.DB_PASSWORD,
    bucket: config.bucket,
  }),
});

export default settings;
export type Settings = ReturnType<typeof settings>;
```

```ts
// at boot
import settings from "./settings.config.js";
export const cfg = settings(process.env); // fully typed, frozen
```

For a complete worked example with split-file config + env templates,
see [`sample/`](./sample).

## Why use this

- **Schema-first.** One `z.object({...})` becomes runtime config,
  `.env.example`, ENV.md docs, and K8s ConfigMap + Secret. No drift.
- **Layered config.** `defaults` + `perEnv[mode]` + optional JSON
  override. Result is `Object.freeze`'d.
- **Build once, deploy many.** Same image, `APP_ENV`-driven branching.
- **Monorepo-friendly.** `extends: [baseLoader]` for shared base
  configs ([t3-oss/env](https://github.com/t3-oss/t3-env)-style).
- **`.env.<mode>` cascade.** Opt-in helper that follows the Vite /
  Next.js / dotenv-flow file convention.
- **Platform presets.** `presets.vercel()`, `presets.netlify()`,
  `presets.githubActions(...)`, ... map platform signals to `APP_ENV`.
- **Defensive at definition time.** Typo'd `perEnv` key, wrong
  `envKey`, missing override key — all caught when the loader is
  *defined*, not on the first request.
- **`todo(reason)` markers.** Mark unfilled config slots with a
  type-safe sentinel; the loader fails loudly with `PER_ENV_TODO`
  when an env tries to load with one still in place.
- **Stable error API.** `NodeSettingsError.code` you can switch on.
- **ESM, Node ≥ 18.** Only `jiti` (TS config loading) at runtime;
  `zod` is a peer dep.

## Comparison

| Capability                                           | dotenv | dotenv-flow | t3-oss/env | convict | node-config | **node-settings** |
| ---------------------------------------------------- | :----: | :---------: | :--------: | :-----: | :---------: | :---------------: |
| zod-based env validation                             |   –    |      –      |     ✅     |    –    |      –      |        ✅         |
| Server / client env split (prefix-checked)           |   –    |      –      |     ✅     |    –    |      –      |        ✅         |
| `.env.<mode>` file cascade                           |   –    |     ✅      |     –      |    –    |      –      |        ✅         |
| Per-env config layering (defaults → perEnv)          |   –    |      –      |     –      |   ✅    |     ✅      |        ✅         |
| JSON runtime override                                |   –    |      –      |     –      |    –    | (env syntax)|        ✅         |
| Monorepo `extends`                                   |   –    |      –      |     ✅     |    –    |      –      |        ✅         |
| Platform presets (Vercel / Netlify / GH Actions / …) |   –    |      –      |     –      |    –    |      –      |        ✅         |
| `todo(...)` sentinel for unfilled values             |   –    |      –      |     –      |    –    |      –      |        ✅         |
| **K8s ConfigMap + Secret YAML**                      |   –    |      –      |     –      |    –    |      –      |        ✅         |
| **K8s drift detection (`diff` CLI)**                 |   –    |      –      |     –      |    –    |      –      |        ✅         |
| **Terraform `.tfvars` generation**                   |   –    |      –      |     –      |    –    |      –      |        ✅         |
| **Docker Compose fragment generation**               |   –    |      –      |     –      |    –    |      –      |        ✅         |
| **Build-time validation plugins (Vite + Next.js)**   |   –    |      –      |     –      |    –    |      –      |        ✅         |
| CLI (validate / check / inspect / generate)          |   –    |      –      |     –      |    –    |      –      |        ✅         |

The differentiation is concentrated in monorepo composition, per-env
layering with todo-sentinels, and first-class infra handoff (K8s
manifests, Terraform tfvars, Docker Compose, Vite / Next.js plugins).
`node-settings` is new; the others have years of usage behind them.

## CLI

```bash
# CI gate — exits non-zero on validation errors
npx node-settings validate [.env.production]

# Per-env completeness check (placeholders, missing required envs, secret lint)
npx node-settings check --env prod,stage
npx node-settings check --workspace          # every package in a monorepo

# Dry-run inspection — no secrets needed
npx node-settings inspect --env=prod
npx node-settings inspect --workspace        # every package in a monorepo

# Composite gate: validate + check + inspect in one shot
npx node-settings preflight .env.production

# Drift detection: compare a live K8s ConfigMap/Secret to your schema
kubectl get cm,secret -n prod -o yaml | npx node-settings diff -

# Machine-readable output for CI dashboards / AI agents
npx node-settings validate  .env.production --format json
npx node-settings preflight .env.production --format json
npx node-settings diff      live.yaml       --format json

# Generate artifacts from the schema
npx node-settings generate env-example  --out .env.example
npx node-settings generate envs         --out-dir env-samples/
npx node-settings generate docs         --out ENV.md
npx node-settings generate k8s          --name my-app --namespace prod --out k8s.yaml
npx node-settings generate json-schema  --out env.schema.json
npx node-settings generate tfvars       --out terraform.tfvars
npx node-settings generate compose      --name web --out docker-compose.snippet.yml
```

Auto-discovers `node-settings.config.{ts,js,...}` (or
`settings.config.{...}`) by walking up to the nearest workspace marker
(`.git`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`,
`rush.json`). TS configs work via [`jiti`](https://github.com/unjs/jiti).

### GitHub Action

```yaml
# .github/workflows/ci.yml
- uses: Changsik00/node-settings@v1
  with:
    command: validate
    config: ./settings.config.ts

- uses: Changsik00/node-settings@v1
  with:
    command: check
    args: --workspace --no-allow-warnings
```

See `action.yml` for the full input list.

### Build-time validation plugins

Fail the dev server / production build the moment your env is invalid,
without waiting for the app to boot. Both plugins reuse the same
loader your runtime code calls, so the contract that gated the build
is the contract that ships.

**Vite** (`vite.config.ts`):

```ts
import { defineConfig } from "vite";
import { nodeSettings } from "@env-kit/node-settings/vite";

export default defineConfig({
  plugins: [nodeSettings()],
});
```

**Next.js** (`next.config.mjs`):

```ts
import { withNodeSettings } from "@env-kit/node-settings/next";

export default await withNodeSettings({
  reactStrictMode: true,
});
```

`vite build` / `next build` always abort on validation failure.
`vite serve` / `next dev` abort too unless you pass `failOnDev: false`.

Both plugins accept the same shape of options: `config`, `mode`,
`envDir`, `appEnvKey`, `failOnDev`. Vite and Next.js are *optional*
peer deps — only projects that import the respective entry need them
installed.

## Server / client env split

Browser bundles must never see server-only secrets. `defineClientEnv`
is a separate loader for the public, prefix-gated half of your env:

```ts
// settings.client.ts
import { z } from "zod";
import { defineClientEnv } from "@env-kit/node-settings";

export const clientEnv = defineClientEnv({
  prefix: "VITE_",
  schema: z.object({
    VITE_API_URL: z.string().url(),
    VITE_SENTRY_DSN: z.string().optional(),
  }),
});

// app code (browser)
const env = clientEnv(import.meta.env);
fetch(env.VITE_API_URL);
```

Three guarantees:

- **Prefix enforced at definition time.** A schema key without the
  prefix throws `CLIENT_ENV_PREFIX_VIOLATION` immediately —
  mismatch is caught long before a secret reaches the bundle.
- **Server keys filtered before zod sees them.** Any input key
  without the prefix is dropped, so `clientEnv(process.env)` cannot
  smuggle `DATABASE_URL` into the client.
- **Optional `strict: true`** flags extra prefixed keys at runtime —
  catches typos and forgotten-to-declare drift.

Conventional prefixes: `NEXT_PUBLIC_` (Next.js), `VITE_` (Vite),
`PUBLIC_` (Astro, SvelteKit). Pair with `defineSettings` for the
server side; the prefix is your compile-time *and* runtime firewall.

## K8s drift detection

The `generate k8s` command writes ConfigMap + Secret YAML from your
schema. `node-settings diff` closes the loop in the other direction:
compare what's *actually* running in your cluster against the schema
your code expects.

```bash
kubectl get cm,secret -n prod -o yaml | npx node-settings diff -
```

The four issue categories:

| Category               | Severity | What it catches                                                                |
| ---------------------- | -------- | ------------------------------------------------------------------------------ |
| `missing-required`     | error    | Schema key is required but missing from every live manifest.                   |
| `secret-in-configmap`  | error    | Schema flags the key secret, but it sits in a ConfigMap (read by anyone).      |
| `public-in-secret`     | warning  | Schema doesn't flag it secret, but it lives in a Secret (harmless / odd).      |
| `extra-key`            | warning  | Key present in the live manifest but not declared in the schema.               |

Exit codes: `0` for clean / warnings-only, `1` on any error,
`2` for bad input. Pass `--strict` to upgrade warnings into errors.
`--format json` emits a single `DiffReport` document for CI dashboards.

## Documentation

- **[`sample/`](./sample)** — complete worked example (env files +
  split-file config + `settings.ts` that wires everything).
- **[Configuration guide](./docs/CONFIGURATION.md)** — file layouts,
  the two "base" concepts (`defaults` vs `extends`), monorepo
  composition, layering model.
- **[Deployment guide](./docs/DEPLOYMENT.md)** — setting `APP_ENV` on
  every common platform, opt-in `presets.*` adapters, the
  `.env.<mode>` cascade.
- **[Error codes](./docs/ERRORS.md)** — every `NodeSettingsError.code`.
- **[AGENTS.md](./AGENTS.md)** — context for AI coding assistants.
- **[llms.txt](./llms.txt)** — [llmstxt.org](https://llmstxt.org/) doc index.
- **[RELEASING.md](./RELEASING.md)** — tag-based release flow.
- **[BACKLOG.md](./BACKLOG.md)** — tracked future work.
- **[CHANGELOG.md](./CHANGELOG.md)**

## License

[MIT](./LICENSE) © Changsik00

---

<sub>Built for teams that ship the same image to many environments.</sub>
