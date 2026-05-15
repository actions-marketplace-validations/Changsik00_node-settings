# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/).

## [0.4.0] — 2026-05-15

### Added — `loadDotenvCascade()` helper

Adopt the file-naming convention every other Node tool already uses
(Next.js, Vite, dotenv-flow, Create React App). The library previously
left env-loading entirely to the host app; this opt-in helper closes
the gap so users can drop `.env.local` / `.env.<mode>` files at the
project root and have them load in the right order.

- **`loadDotenvCascade({ cwd?, appEnvKey?, defaultMode?, skipLocalFor?, source? })`**
  exported from the package root and `./loaders`. Returns `{ env,
  mode, loaded, skipped }`.
- Load order (later wins, `process.env` always tops):
  1. `.env`                  — base, committed
  2. `.env.local`            — personal overrides, gitignored
  3. `.env.<mode>`           — env-specific
  4. `.env.<mode>.local`     — env-specific local, gitignored
  5. `process.env`           — always wins
- Mode resolves from `process.env[appEnvKey]`, then `.env`'s value,
  then `defaultMode` (default `'local'`).
- `.local` files are skipped in `'test'` mode by default (same as Vite
  / Next). Customise via `skipLocalFor`.
- The existing committed templates in `examples/env-samples/` plug
  straight in: drop the `.sample` suffix and the cascade picks them up.

### Updated

- README — new "Local development — the `.env.<mode>` cascade"
  subsection, plus a feature-grid bullet.
- AGENTS.md — new section documenting the cascade for AI assistants.

### Internal

- 9 cascade tests covering load order, `process.env` precedence,
  mode discovery from `.env`, `skipLocalFor`, custom `appEnvKey`,
  empty cwd. 87 tests across 15 files.

## [0.3.0] — 2026-05-15

### Added — per-env env samples + platform documentation

- **`generate envs` CLI subcommand**. Emits one
  `.env.<branch>.example` file per `perEnv` branch into `--out-dir`,
  with the loader's `envKey` (e.g. `APP_ENV`) pre-filled and a comment
  block summarising the layered config that branch resolves to.
- **`generatePerEnvExamples(loader, options?)`** — programmatic helper
  exported from `@changsik00/node-settings/generators`. Returns a
  `Record<envName, string>` of generated `.env` contents.
- **`generateEnvExample(fields, { values, ... })`** — the existing
  helper now accepts a `values` map for pre-filling specific keys.
- **Hand-written samples** in `examples/env-samples/` —
  `.env.local.sample`, `.env.dev.sample`, `.env.stage.sample`,
  `.env.prod.sample`, plus a README. The `.gitignore` no longer
  ignores `*.sample` / `.env.*.example`.
- **README — "Setting `APP_ENV` across deployments" section**. Concrete
  patterns for Docker, Docker Compose, Kubernetes, GitHub Actions,
  Vercel, Heroku, AWS ECS / Lambda, Render / Railway / Fly. Plus an
  `APP_ENV` vs `NODE_ENV` clarification table.
- **AGENTS.md** updated with the platform table and the new generator.

### Internal

- 6 new tests covering the values option and per-env helper. 78 tests
  across 14 files. Typecheck + build clean.

## [0.2.0] — 2026-05-15

### Added — monorepo support

- **`extends`** on `defineSettings`. Modeled after
  [`@t3-oss/env-core`](https://github.com/t3-oss/t3-env). Pass an array
  of parent loaders; their `envSchema`, `defaults`, and `perEnv` merge
  into the child's at runtime, and the `build(env, config)` callback
  receives the merged type via the new `MergedEnv` / `MergedConfig`
  helper types.
- **`SettingsLoader.resolved`** — frozen view of the merged
  `{ envSchema, defaults, perEnv, envKey, overrideEnvKey }`. Generators
  and `checkPerEnvCompleteness` now read from this view so inherited
  config participates in every output.
- **`mergePerEnv`** — public helper for composing per-env config maps
  outside of `defineSettings`.
- **CLI walk-up auto-discovery**. `loadUserConfig` walks parent
  directories until a `node-settings.config.*` / `settings.config.*` is
  found or it hits a workspace marker (`.git`, `pnpm-workspace.yaml`,
  `turbo.json`, `nx.json`, `lerna.json`, `rush.json`). Same convention
  as `tsc`, `eslint`, and the rest of the cosmiconfig family.

### Added — defensive validations

- **`NodeSettingsError`** — every thrown error now carries a stable
  string `code` plus an optional `hint`. Codes:
  `INVALID_ENV_SCHEMA`, `MISSING_ENV_KEY`, `INVALID_ENV_KEY_TYPE`,
  `INVALID_OVERRIDE_KEY`, `PER_ENV_EMPTY`, `PER_ENV_KEY_NOT_IN_ENUM`,
  `PER_ENV_BRANCH_MISSING`, `INVALID_EXTENDS_ITEM`,
  `OVERRIDE_JSON_PARSE`, `ENV_VALIDATION_FAILED`.
- **Definition-time validation**. `defineSettings(...)` now rejects:
  - `envSchema` that is not a `z.object({...})`,
  - an `envKey` that does not exist in the (merged) schema,
  - an `envKey` whose underlying type is not `z.string()` or `z.enum(...)`,
  - a `perEnv` with no branches at all,
  - `perEnv` keys that are not values of the `envKey` enum (typo guard),
  - an `overrideEnvKey` that does not exist in the schema,
  - `extends` entries that are not `defineSettings(...)` return values.
- Zod env validation errors at load time are now wrapped as
  `ENV_VALIDATION_FAILED` with a path-by-path summary, preserving the
  original `ZodError` as `.cause`.
- `OVERRIDE_JSON_PARSE` errors include a hint on the expected format.

### Added — docs and tooling

- **`AGENTS.md`** at repo root — a concise context document for AI
  coding assistants (Claude, Copilot, Cursor, etc.).
- **README polish** — feature grid, badge cluster (npm, CI, license,
  Node, install size, bundle size), TOC, and a new "Errors" section.

### Internal

- 72 tests across 13 files, all passing. Typecheck and build clean.

## [0.1.0] — 2026-05-15

Initial release.

- `defineSettings({ envSchema, envKey, defaults, perEnv, build, ... })`
  — zod env validation + per-env config layering + optional JSON
  override + frozen result.
- `introspectEnvSchema` with auto secret detection.
- Generators: `.env.example`, Markdown docs, Kubernetes
  ConfigMap/Secret manifests.
- `checkPerEnvCompleteness` — placeholder / missing-env scanner.
- CLI `node-settings` with `validate`, `check`, `generate` subcommands.
- GitHub Actions CI matrix (Node 18 / 20 / 22) + release workflow.
- MIT license.
