<div align="center">

# @changsik00/node-settings

**Schema-first settings for Node apps.**
One zod schema → typed runtime config + `.env.example` + Markdown docs + Kubernetes manifests + a CLI that gates deploys in CI.

[![npm version](https://img.shields.io/npm/v/@changsik00/node-settings?color=cb3837&label=npm&logo=npm)](https://www.npmjs.com/package/@changsik00/node-settings)
[![CI](https://github.com/Changsik00/node-settings/actions/workflows/ci.yml/badge.svg)](https://github.com/Changsik00/node-settings/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Types: TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Install size](https://packagephobia.com/badge?p=@changsik00/node-settings)](https://packagephobia.com/result?p=@changsik00/node-settings)

[**Sample**](./sample) · [**Configuration**](./docs/CONFIGURATION.md) · [**Deployment**](./docs/DEPLOYMENT.md) · [**Errors**](./docs/ERRORS.md)

</div>

---

## TL;DR

```bash
npm install @changsik00/node-settings zod
```

```ts
import { z } from "zod";
import { defineSettings } from "@changsik00/node-settings";

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
- **Stable error API.** `NodeSettingsError.code` you can switch on.
- **ESM, Node ≥ 18.** Only `jiti` (TS config loading) at runtime;
  `zod` is a peer dep.

## CLI

```bash
# CI gate — exits non-zero on validation errors
npx node-settings validate [.env.production]

# Per-env completeness check (placeholders, missing required envs)
npx node-settings check --env prod,stage

# Dry-run inspection — no secrets needed
npx node-settings inspect --env=prod

# Generate artifacts from the schema
npx node-settings generate env-example --out .env.example
npx node-settings generate envs        --out-dir env-samples/
npx node-settings generate docs        --out ENV.md
npx node-settings generate k8s         --name my-app --namespace prod --out k8s.yaml
```

Auto-discovers `node-settings.config.{ts,js,...}` (or
`settings.config.{...}`) by walking up to the nearest workspace marker
(`.git`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`,
`rush.json`). TS configs work via [`jiti`](https://github.com/unjs/jiti).

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
- **[CHANGELOG.md](./CHANGELOG.md)**

## License

[MIT](./LICENSE) © Changsik00

---

<sub>Built for teams that ship the same image to many environments.</sub>
