# Migrating from `dotenv-flow`

`dotenv-flow` loads the `.env` file cascade and stops there — no
validation, no per-env config layering, no types. Moving to
`@env-kit/node-settings` keeps the same cascade behaviour (load
order is identical, by design) and adds the rest of the pipeline.

## Before / after

dotenv-flow:

```ts
// at the top of your entry file
import dotenvFlow from "dotenv-flow";
dotenvFlow.config();

// later in your app
const dbHost = process.env.DB_HOST!;          // any field could be missing
const port = Number(process.env.PORT) || 3000; // hand-rolled coercion
const debug = process.env.DEBUG === "true";    // hand-rolled boolean parse
```

`@env-kit/node-settings`:

```ts
// settings.ts
import { defineSettings } from "@env-kit/node-settings";
import { z } from "zod";

export default defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["local", "prod"]).default("local"),
    DB_HOST: z.string(),
    PORT: z.coerce.number().default(3000),
    DEBUG: z.coerce.boolean().default(false),
  }),
  envKey: "APP_ENV",
  defaults: {},
  perEnv: { local: {}, prod: {} },
  build: (env) => ({
    dbHost: env.DB_HOST,
    port: env.PORT,
    debug: env.DEBUG,
  }),
});
```

```ts
// at boot
import { loadDotenvCascade } from "@env-kit/node-settings";
import settings from "./settings.js";

const { env } = loadDotenvCascade();   // same cascade as dotenv-flow
export const cfg = settings(env);      // + validation + types + perEnv
```

## Feature mapping

| dotenv-flow | `@env-kit/node-settings` | Notes |
| --- | --- | --- |
| `dotenvFlow.config()` | `loadDotenvCascade()` | Same file order: `.env` → `.env.local` → `.env.<mode>` → `.env.<mode>.local` → `process.env`. |
| `node_env` option / `NODE_ENV` reading | `appEnvKey` option (default `APP_ENV`, set to `"NODE_ENV"` if that's your convention) | Both libraries pick the mode from an env var; ours just makes the key configurable. |
| `default_node_env` option | `defaultMode` option | Same idea — the mode to use when `appEnvKey` is unset. |
| `silent: true` (suppress warnings on missing files) | always silent | Missing files are reported in `loadDotenvCascade()`'s `skipped` array for diagnostics; no console noise. |
| Skip `.local` files in `test` | `skipLocalFor: ["test"]` (default already) | Same default behaviour. |
| `process.env.DB_HOST` direct access | `cfg.dbHost` from the loader return | Typed, validated, frozen. |

## Step-by-step

1. **Install**:

   ```bash
   pnpm add @env-kit/node-settings zod
   ```

2. **Inventory your env vars**. Grep the codebase for `process.env.`:

   ```bash
   grep -rn "process\.env\." src/ | sort -u
   ```

   Each one becomes a field in `envSchema`. Pick the right zod type:
   - String → `z.string()` or `.optional()` if it can be missing
   - Number → `z.coerce.number()` (the `coerce` is important —
     env vars are always strings at the source)
   - Boolean → `z.coerce.boolean()` (treats `"true"` / `"1"` /
     non-empty as true; check the [zod coerce docs][zod-coerce] if
     you need stricter parsing)
   - Enum → `z.enum(["a", "b"])`
   - URL → `z.string().url()`

3. **Decide `envKey`**. dotenv-flow uses `NODE_ENV` by default. You
   can keep that (`envKey: "NODE_ENV"`) or switch to a richer custom
   enum (`envKey: "APP_ENV"`).

4. **Optionally add per-env config**. If your dotenv-flow usage
   includes "bucket name varies per env" (encoded as different
   `.env.<mode>` files), consider moving those values to `perEnv:`
   in source instead. Env files stay for *secrets* and
   *infra-injected* values; perEnv handles *committed config that
   varies by env*.

5. **Replace direct `process.env.X` reads** with `cfg.foo`. Lean on
   TypeScript errors to find every site.

6. **At boot**, swap `dotenvFlow.config()` for:

   ```ts
   const { env } = loadDotenvCascade();
   export const cfg = settings(env);
   ```

   `loadDotenvCascade()` reads the same files in the same order
   (by design); your existing `.env*` files keep working without
   change.

7. **Drop `dotenv-flow`** once the migration compiles and tests
   pass.

[zod-coerce]: https://zod.dev/?id=coerce

## Gotchas

- **No coercion by default in zod**. If your app reads
  `process.env.PORT` as a string and does `Number(...)` later,
  remember to use `z.coerce.number()` in the schema — plain
  `z.number()` rejects strings.
- **`z.coerce.boolean()` is permissive**: it returns `true` for any
  non-empty string, including `"false"` and `"0"`. If you want
  strict `"true"`/`"false"` parsing, define it explicitly:
  ```ts
  DEBUG: z
    .string()
    .transform(s => s === "true")
    .default("false"),
  ```
- **`.local` files in `test`**: dotenv-flow skips them, we skip
  them, behaviour matches. If you have CI workflows that override
  this, set `skipLocalFor: []` on the cascade call.

## What you gain

- **Validation**: missing required env vars fail loudly at boot
  with a path-pointed zod error, instead of mysteriously
  `undefined` later in app code.
- **Typed access**: `cfg.dbHost` instead of `process.env.DB_HOST!`
  + the `!` non-null assertion that lies.
- **Per-env config layering**: non-secret values that vary by env
  (bucket names, worker counts, feature flags) live in typed
  source instead of duplicated across `.env.*` files.
- **Runtime override**: a single env var (`APP_CONFIG_JSON`) can
  patch config at boot — useful for canary deploys, feature
  flags, hot-swap scenarios.
- **Generators**: `.env.example` from the schema, K8s manifests,
  Markdown docs, JSON Schema, Terraform tfvars, Compose fragment.
- **CLI**: `node-settings check` flags missing required env vars
  per environment in CI, before deploy.
