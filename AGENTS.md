# AGENTS.md

Context for AI coding assistants (Claude, Copilot, Cursor, etc.) working
with this codebase. Humans should read [README.md](./README.md) first.

## What this package is

`@changsik00/node-settings` — a schema-first settings library for Node
apps. One `z.object({...})` schema is the source of truth for:

- typed runtime config (validates `process.env`, layers per-env config,
  applies optional JSON override, freezes the result),
- generated `.env.example` files,
- generated Markdown env documentation,
- generated Kubernetes ConfigMap + Secret manifests,
- a CLI (`node-settings`) that validates env files and runs a per-env
  completeness check in CI.

It targets monorepos via a t3-oss/env-style `extends` field on
`defineSettings(...)`, and the CLI walks up parent directories to find
the config (cosmiconfig-style).

## Public API surface

Import map:

```ts
// Library
import {
  defineSettings,
  mergePerEnv,
  deepMerge,
  introspectEnvSchema,
  loadNodeEnv,
  loadDotenvFile,
  checkPerEnvCompleteness,
  NodeSettingsError,
} from "@changsik00/node-settings";

// Generators (used by the CLI; importable directly for custom scripts)
import {
  generateEnvExample,
  generateMarkdownDocs,
  generateK8sManifests,
} from "@changsik00/node-settings/generators";
```

CLI binary: `node-settings`

Subcommands:

| Command                                 | Purpose                                |
| --------------------------------------- | -------------------------------------- |
| `node-settings validate [env-file]`     | Run the schema against env (CI gate).      |
| `node-settings check [--env name]`      | Per-env placeholder / required check.      |
| `node-settings generate env-example`    | Write a single `.env.example`.             |
| `node-settings generate envs --out-dir` | One `.env.<branch>.example` per perEnv.    |
| `node-settings generate docs`           | Write Markdown env documentation.          |
| `node-settings generate k8s --name X`   | Write ConfigMap + Secret YAML.             |

The CLI auto-discovers `node-settings.config.{ts,mts,js,mjs,cjs}` or
`settings.config.{...}`, walking up to the nearest workspace boundary
(`.git`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`,
`rush.json`).

## Core mental model

```
rawEnv (process.env)
  ↓ resolvedSchema.parse(rawEnv)          (zod)
env                                        ←  every parent's schema merged in
  ↓ resolvedPerEnv[env[envKey]]            (lookup)
envSpecific
  ↓ deepMerge(resolvedDefaults, envSpecific)
baseConfig
  ↓ JSON.parse(env[overrideEnvKey])        (optional)
  ↓ validateOverride? + deepMerge
finalConfig
  ↓ build(env, finalConfig)
Settings → Object.freeze
```

The loader returned by `defineSettings(...)` carries three frozen
tooling properties:

- `loader.opts` — the options the caller passed (not the merged view).
- `loader.envFields` — `EnvField[]` introspected from the *merged*
  schema. Used by all generators.
- `loader.resolved` — `{ envSchema, defaults, perEnv, envKey,
  overrideEnvKey }` after all `extends` layers have been merged in.
  Used by `checkPerEnvCompleteness` and the CLI.

## Common patterns

### Single app

```ts
import { z } from "zod";
import { defineSettings } from "@changsik00/node-settings";

const settings = defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["local", "dev", "prod"]).default("local"),
    DB_HOST: z.string(),
    DB_PASSWORD: z.string(),       // auto-flagged as secret
  }),
  envKey: "APP_ENV",
  defaults: { bucket: "" },
  perEnv: {
    local: { bucket: "local-b" },
    dev:   { bucket: "dev-b" },
    prod:  { bucket: "prod-b" },
  },
  build: (env, config) => ({
    dbHost: env.DB_HOST,
    bucket: config.bucket,
  }),
});

export default settings;
export type Settings = ReturnType<typeof settings>;
```

### Monorepo composition (extends)

```ts
// packages/shared/settings.base.ts
export const base = defineSettings({ envSchema, envKey, defaults, perEnv, build });

// packages/foo/node-settings.config.ts
export default defineSettings({
  extends: [base],
  envSchema: z.object({ FOO_BUCKET: z.string() }),
  envKey: "APP_ENV",
  defaults: { bucket: "" },
  perEnv: { local: {}, dev: {}, prod: {} },
  build: (env, config) => ({ /* env+config have merged shape */ }),
});
```

`extends` accepts a tuple. Merge order: parents (in array order) then
the child's own. Child wins on collisions. Multiple parents work.

### NestJS

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validate: (raw) => settings(raw),
});
```

### Secret detection

Default name patterns: `PASSWORD`, `SECRET`, `TOKEN`, `PRIVATE_KEY`,
`API_KEY`, `CREDENTIAL`, `PASSPHRASE` (case-insensitive).

Override per field:
- `.describe("... @secret")` — force secret.
- `.describe("... @public")` — force not secret.

Override globally:
- `defineSettings({ secretPatterns: [/MY_THING/], ... })`.

## Error handling

Every error this package throws is a `NodeSettingsError` carrying a
stable `code` plus an optional `hint`. Match on `code`, not `message`.

| `code`                     | When it happens                                              |
| -------------------------- | ------------------------------------------------------------ |
| `INVALID_ENV_SCHEMA`       | `envSchema` is not a `z.object({...})`.                      |
| `MISSING_ENV_KEY`          | `envKey` not in the (merged) schema.                         |
| `INVALID_ENV_KEY_TYPE`     | `envKey` is not `z.string()` / `z.enum(...)`.                |
| `INVALID_OVERRIDE_KEY`     | `overrideEnvKey` not in the (merged) schema.                 |
| `PER_ENV_EMPTY`            | `perEnv` has no branches at all.                             |
| `PER_ENV_KEY_NOT_IN_ENUM`  | `perEnv` branch is not a value of the `envKey` enum (typo).  |
| `PER_ENV_BRANCH_MISSING`   | Runtime: no `perEnv` branch matches the parsed envKey value. |
| `INVALID_EXTENDS_ITEM`     | `extends[i]` is not a `defineSettings(...)` return value.    |
| `OVERRIDE_JSON_PARSE`      | `overrideEnvKey` env var is not valid JSON.                  |
| `ENV_VALIDATION_FAILED`    | Zod env validation failed at runtime.                        |

The first six are raised at `defineSettings(...)` call time. The rest
surface when the loader is invoked.

## File map

```
src/
  define-settings.ts     # defineSettings(), SettingsLoader, extends merge
  introspect.ts          # zod schema -> EnvField[], secret detection
  errors.ts              # NodeSettingsError + codes
  validate-options.ts    # defensive checks run at defineSettings time
  check-per-env.ts       # placeholder + missing-env scanner
  index.ts               # public exports

  generators/
    env-example.ts       # generateEnvExample(fields)
    markdown.ts          # generateMarkdownDocs(fields)
    k8s.ts               # generateK8sManifests(fields, { name, ... })

  utils/
    deep-merge.ts        # deepMerge / DeepPartial
    merge-per-env.ts     # mergePerEnv helper

  loaders/
    node-env.ts          # loadNodeEnv()
    vite-env.ts          # loadViteEnv() — placeholder
    dotenv-file.ts       # parseDotenv / loadDotenvFile

  cli/
    bin.ts               # #!/usr/bin/env node entrypoint
    index.ts             # subcommand dispatch
    args.ts              # parseArgs (no external dep)
    load-user-config.ts  # cosmiconfig-style walk-up + jiti loader
    validate.ts          # validate subcommand
    check.ts             # check subcommand
    generate.ts          # generate subcommand
    help.ts              # help text
```

## Conventions in this codebase

- **ESM only** (`"type": "module"`). All imports use `.js` suffix even
  for `.ts` source — that's how NodeNext resolution wants them.
- **No emojis** in source, README, or commit messages.
- **No Claude / generated-by attribution** in commits. Author is
  Changsik00 / lowmans00@gmail.com.
- **Tests live next to source** as `*.test.ts`. They're the canonical
  documentation for the public API; reading them is the fastest way to
  learn a feature.
- **Comments explain *why*, not *what***. Public functions have JSDoc
  with at least one runnable `@example`.
- **`peerDependencies: { zod }`** — never bundle zod, never pin it.

## The `.env.<mode>` cascade (`loadDotenvCascade`)

Opt-in helper that follows the Vite / Next.js / dotenv-flow naming
convention. Load order (later wins; `process.env` always wins on top):

1. `.env`                — base, committed
2. `.env.local`          — personal overrides, gitignored
3. `.env.<mode>`         — env-specific
4. `.env.<mode>.local`   — env-specific local, gitignored
5. `process.env`         — always wins

`mode` resolves from `process.env[appEnvKey]`, then `.env`'s value,
then `defaultMode` (`'local'` by default). `.local` files are skipped
in `'test'` mode by default.

```ts
import { loadDotenvCascade } from "@changsik00/node-settings";
const { env, mode, loaded, skipped } = loadDotenvCascade({
  cwd: process.cwd(),
  appEnvKey: "APP_ENV",
  defaultMode: "local",
});
```

The library does *not* call this automatically. Users opt in by
calling it explicitly at boot and passing the result to the loader.

## How `APP_ENV` gets set

The library reads `APP_ENV` (or whatever `envKey` is named) from
`process.env`. It does not auto-detect — the deployment platform is
responsible for setting the value. Default `envKey` in the schema
gives a local-dev fallback.

| Platform          | Set `APP_ENV` via                                                  |
| ----------------- | ------------------------------------------------------------------ |
| Local             | `.env` file + dotenv, or shell export                              |
| Docker            | `docker run -e APP_ENV=dev`                                        |
| Docker Compose    | `environment:` or `env_file:` in `docker-compose.yml`              |
| Kubernetes        | ConfigMap from `node-settings generate k8s`                        |
| GitHub Actions    | `env: APP_ENV: ${{ ... }}` on job/step                             |
| Vercel            | Project Settings → Environment Variables, or map from `VERCEL_ENV` |
| Heroku            | `heroku config:set APP_ENV=prod`                                   |
| AWS ECS / Fargate | Task definition `environment` block                                |
| AWS Lambda        | Function env vars (one stack per env)                              |
| Render / Railway  | Dashboard env vars panel or `railway variables set`                |

`APP_ENV` and `NODE_ENV` are orthogonal: `NODE_ENV` is the Node.js
convention (development/production/test) and affects npm install,
framework behavior. `APP_ENV` is this library's per-environment label
and drives `perEnv` lookup.

## When the user asks…

- **"How do I use this in my monorepo?"** → Point to README's "Monorepo
  support" section. Use `extends: [base]`.
- **"My CLI can't find the config."** → It walks up to the nearest
  workspace marker. They can use `--config <path>` explicitly.
- **"How do I add a generator for Terraform / Helm / Pulumi?"** →
  Generators are pure functions over `EnvField[]`. Add a file under
  `src/generators/`, export from `generators/index.ts`, wire into
  `cli/generate.ts`. Tests pattern in `src/generators/k8s.test.ts`.
- **"Why is my zod refinement not introspected?"** → Refinements on the
  outer schema are rejected at `defineSettings(...)` time
  (`INVALID_ENV_SCHEMA`). Apply refinements at the field level instead.

## Out of scope

This package deliberately does not:

- Load `.env` files (host app's responsibility — use `dotenv`, `dotenv-flow`, etc.).
- Provide a logger (`onOverride` hook lets the app inject one).
- Cache env values (env is read once at boot; settings is frozen).
- Talk to Vault / AWS Secrets Manager / etc. (the app loads them into
  the env first, then passes to `loader(env)`).
