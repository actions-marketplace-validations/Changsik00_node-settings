<div align="center">

**Schema-first settings for Node apps.**
One zod schema → typed runtime config + `.env.example` + Markdown docs + Kubernetes manifests + a CLI that gates deploys in CI.

[![npm version](https://img.shields.io/npm/v/@env-kit/node-settings?color=cb3837&label=npm&logo=npm)](https://www.npmjs.com/package/@env-kit/node-settings)
[![npm downloads](https://img.shields.io/npm/dm/@env-kit/node-settings?color=cb3837&logo=npm)](https://www.npmjs.com/package/@env-kit/node-settings)
[![CI](https://github.com/Changsik00/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/Changsik00/node-settings/actions/workflows/ci.yml)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@env-kit/node-settings?label=min%2Bgzip)](https://bundlephobia.com/package/@env-kit/node-settings)
[![Install size](https://packagephobia.com/badge?p=@env-kit/node-settings)](https://packagephobia.com/result?p=@env-kit/node-settings)
[![Tests](https://img.shields.io/badge/tests-260%20passing-success?logo=vitest&logoColor=white)](./src)
[![Coverage](https://img.shields.io/badge/coverage-81%25-brightgreen)](./vitest.config.ts)
[![Types: TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

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
  // 1. envSchema — the contract for env vars. CI/infra injects these.
  //    Key names matching DEFAULT_SECRET_PATTERNS (PASSWORD, TOKEN, …)
  //    are auto-flagged as secrets, so they land in K8s Secret (not
  //    ConfigMap) and get masked in generated docs.
  envSchema: z.object({
    APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
    DB_HOST: z.string(),
    DB_PASSWORD: z.string(),         // auto-flagged as a secret
    APP_CONFIG_JSON: z.string().optional(), // runtime override (see (5))
  }),

  // 2. envKey — which env var picks the active perEnv branch.
  //    Use "APP_ENV" for rich enums (local/dev/stage/prod), or
  //    "NODE_ENV" if you want to stick to the Node convention
  //    (development/production/test). Must exist in envSchema.
  envKey: "APP_ENV",

  // 3. defaults — config shared across every env. Used as the *base*;
  //    perEnv[mode] is deep-merged on top. If a key exists only in
  //    defaults, it survives to the final config (fallback for envs
  //    that don't override it).
  defaults: {
    bucket: "",
    region: "us-east-1",            // every env keeps this unless overridden
  },

  // 4. perEnv — branch-specific overrides keyed by envKey value.
  //    Each key here MUST be a value from the envKey enum (typos are
  //    caught at definition time). Branch wins over defaults via deep
  //    merge; nested objects merge field-by-field, not replace.
  perEnv: {
    local: { bucket: "local-bucket" },
    dev:   { bucket: "dev-bucket" },
    prod:  { bucket: "prod-bucket", region: "us-west-2" }, // overrides region
  },

  // 5. overrideEnvKey — name of an env var that, if set, carries a
  //    JSON blob deep-merged on top of perEnv at boot. The runtime
  //    escape hatch: hot-swap a value in a canary deploy, flip a
  //    flag without redeploying, patch a region during incident
  //    response. Same image, different config, no rebuild.
  overrideEnvKey: "APP_CONFIG_JSON",

  // 6. build — receives (envSchema output, merged defaults + perEnv
  //    + JSON override) and returns the final settings object. This
  //    is what you import in your app code; the loader Object.freeze()s
  //    the return value.
  build: (env, config) => ({
    dbHost: env.DB_HOST,
    dbPassword: env.DB_PASSWORD,
    bucket: config.bucket,
    region: config.region,
  }),
});

export default settings;
export type Settings = ReturnType<typeof settings>;
```

```ts
// at boot — three sources resolve into one frozen settings object
import { loadDotenvCascade } from "@env-kit/node-settings";
import settings from "./settings.config.js";

const { env, mode } = loadDotenvCascade();
//   .env → .env.local → .env.<mode> → .env.<mode>.local → process.env
//   (Vite / Next / dotenv-flow convention; later sources win)

export const cfg = settings(env); // → validate → layer → override → frozen
```

**One factory, every source**:

```
files (cascade)        ┐
   .env                │
   .env.local          │
   .env.<mode>         ├─► process.env  ─►  envSchema.parse() (zod)
   .env.<mode>.local   │     wins                      │
                       ┘                               ▼
                                              envKey selects perEnv[mode]
                                                       │
              defaults  ⊕  perEnv[mode]  ⊕  JSON override (APP_CONFIG_JSON)
                            (deep merge, right wins at each layer)
                                                       │
                                                       ▼
                                                  build(env, config)
                                                       │
                                                       ▼
                                                Object.freeze ⇒ cfg
```

- **`.env` files** — automatic cascade; missing files are skipped silently.
- **`process.env`** — CI / Kubernetes / Vault inject here; always wins over files.
- **`defaults` + `perEnv[mode]`** — committed config, layered by env.
- **`APP_CONFIG_JSON`** — runtime override env var. Deploy the same image,
  change behaviour via `APP_CONFIG_JSON='{"bucket":"failover"}'`. No rebuild.

For a complete worked example with split-file config + monorepo
`extends` + env templates, see [`sample/`](./sample).

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
without waiting for the app to boot. All three plugins reuse the same
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

**esbuild** (`build.mjs`):

```ts
import { build } from "esbuild";
import { nodeSettings } from "@env-kit/node-settings/esbuild";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  plugins: [nodeSettings()],
});
```

`vite build` / `next build` / `esbuild build` always abort on
validation failure. `vite serve` / `next dev` abort too unless you
pass `failOnDev: false`; the esbuild plugin exposes `failOnError`
for the same purpose in watch mode.

Vite, Next.js, and esbuild are *optional* peer deps — only projects
that import the respective entry need them installed.

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
- **[Migration guides](./docs/migration/)** — recipes for moving
  from t3-oss/env, convict, node-config, or dotenv-flow.
- **[AGENTS.md](./AGENTS.md)** — context for AI coding assistants.
- **[llms.txt](./llms.txt)** — [llmstxt.org](https://llmstxt.org/) doc index.
- **[RELEASING.md](./RELEASING.md)** — tag-based release flow.
- **[BACKLOG.md](./BACKLOG.md)** — tracked future work.
- **[CHANGELOG.md](./CHANGELOG.md)**

## License

[MIT](./LICENSE) © Changsik00

---

<sub>Built for teams that ship the same image to many environments.</sub>
