# Migrating from `@t3-oss/env-nextjs` (and `@t3-oss/env-core`)

t3-oss/env was the nearest neighbour — both libraries put a zod
schema at the centre of env handling. The migration is largely
syntactic, with one conceptual addition: **per-env config layering**.

## Before / after

t3-oss/env (Next.js):

```ts
// src/env.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    OPEN_AI_API_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_PUBLISHABLE_KEY: z.string().min(1),
  },
  experimental__runtimeEnv: process.env,
});
```

`@env-kit/node-settings` equivalent — split into two files so the
client bundle never sees server-only secrets at type-level:

```ts
// settings.ts (server)
import { defineSettings } from "@env-kit/node-settings";
import { z } from "zod";

const settings = defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["local", "prod"]).default("local"),
    DATABASE_URL: z.string().url(),
    OPEN_AI_API_KEY: z.string().min(1),
  }),
  envKey: "APP_ENV",
  defaults: {},
  perEnv: { local: {}, prod: {} },
  build: (env) => ({
    databaseUrl: env.DATABASE_URL,
    openaiKey: env.OPEN_AI_API_KEY,
  }),
});

export default settings;
```

```ts
// settings.client.ts (client)
import { defineClientEnv } from "@env-kit/node-settings";
import { z } from "zod";

export const clientEnv = defineClientEnv({
  prefix: "NEXT_PUBLIC_",
  schema: z.object({
    NEXT_PUBLIC_PUBLISHABLE_KEY: z.string().min(1),
  }),
});
```

## Feature mapping

| t3-oss/env | `@env-kit/node-settings` | Notes |
| --- | --- | --- |
| `createEnv({ server, client, ... })` | `defineSettings(...)` + `defineClientEnv(...)` | We split the two halves into separate files so a client import can't pull in server types. |
| `experimental__runtimeEnv: process.env` | implicit — `settings(process.env)` at boot | Or use `loadDotenvCascade()` for the `.env.<mode>` cascade. |
| `runtimeEnv: { NEXT_PUBLIC_X: process.env.NEXT_PUBLIC_X, ... }` (Next.js literal-access workaround) | not needed | Our client loader takes the source map directly: `clientEnv(import.meta.env)` or an object you build by hand. |
| `clientPrefix: "NEXT_PUBLIC_"` | `prefix: "NEXT_PUBLIC_"` (required) | We **enforce** the prefix at definition time: a server-only key in the client schema throws `CLIENT_ENV_PREFIX_VIOLATION` immediately. |
| Hand-rolled `NODE_ENV` branching in app code | `perEnv: { local, dev, stage, prod }` | First-class. perEnv values deep-merge over `defaults` based on `envKey`. |
| Hand-rolled JSON config override | `overrideEnvKey: "APP_CONFIG_JSON"` | A single env var carries a JSON blob deep-merged on top of perEnv at boot. |
| Build-time validation in `next.config.js` (manual `import "./env"`) | `withNodeSettings(nextConfig)` from `@env-kit/node-settings/next` | Validates env during `next.config` evaluation — fails `next build` before bundling. |
| Vite app: import `~/env` at module init | `nodeSettings()` plugin from `@env-kit/node-settings/vite` | Validates during `buildStart`, fails `vite build` before bundling. |
| `.env.example` maintenance | `node-settings generate env-example` | One source of truth — the schema — generates the template. |

## Step-by-step

1. **Install** alongside (you can have both temporarily):

   ```bash
   pnpm add @env-kit/node-settings zod
   pnpm remove @t3-oss/env-core @t3-oss/env-nextjs   # when done
   ```

2. **Server schema** — copy each `server: {...}` entry into a
   `z.object({...})` and pass it to `defineSettings` as `envSchema`.

3. **Pick an `envKey`**. If you've been switching on `NODE_ENV`, set
   `envKey: "NODE_ENV"`. If you want richer environments (`local /
   dev / stage / prod`), add `APP_ENV: z.enum(...)` to the schema
   and use `envKey: "APP_ENV"`.

4. **Add `defaults` + `perEnv`** for any config that varied by
   environment. If your t3-oss/env code did:

   ```ts
   const region = process.env.NODE_ENV === "production"
     ? "us-west-2"
     : "us-east-1";
   ```

   replace with:

   ```ts
   defaults: { region: "us-east-1" },
   perEnv:   { production: { region: "us-west-2" } },
   ```

5. **Client schema** — copy each `client: {...}` entry into
   `defineClientEnv({ prefix, schema })`. Move the import in your
   client code from `src/env` to `src/settings.client`.

6. **Next.js plugin** — wrap `next.config`:

   ```ts
   // next.config.mjs
   import { withNodeSettings } from "@env-kit/node-settings/next";
   export default await withNodeSettings({ reactStrictMode: true });
   ```

   Drop any explicit `import "./src/env"` you had at the top of
   `next.config` to force validation; the plugin does that now.

7. **CI gate**: add `npx node-settings preflight` (or `validate +
   check`) to your CI workflow if you don't already validate env
   there. Catches drift between source schema and deployed env.

## Gotchas

- **`experimental__runtimeEnv: process.env` is implicit here**. In
  t3-oss/env-nextjs the explicit `runtimeEnv` map was needed because
  Next.js inlines literal `process.env.X` accesses only. We don't
  have that constraint — `settings(process.env)` at boot Just Works.
- **Server keys in client schema → hard error**. t3-oss/env had a
  build warning. We throw `CLIENT_ENV_PREFIX_VIOLATION` at
  `defineClientEnv` call time. Catches it earlier; some users find
  this stricter.
- **`createEnv`'s emptyStringAsUndefined**. We don't have a global
  flag for this; do it per-field in zod (`z.string().transform(s =>
  s === "" ? undefined : s).optional()`) or normalise once in your
  loader wrapper.

## What you gain

- **Per-env config layering** (`defaults` + `perEnv`) so non-env
  values (bucket names, feature flags, worker concurrency) live in
  typed source instead of stringly-typed env vars.
- **Generators**: `.env.example`, Markdown env docs, K8s ConfigMap
  + Secret, Terraform `.tfvars`, Docker Compose, JSON Schema.
- **CLI**: `validate`, `check`, `inspect`, `preflight`, `diff`
  (drift detection vs live K8s).
- **Monorepo `extends`** — apps can extend a shared base loader.
