# Migrating from `convict`

convict pioneered "schema-first config" for Node, with its own
declarative `{format, default, env, doc, arg}` shape. The biggest
shift in moving to `@env-kit/node-settings` is swapping that custom
schema for zod — you trade a smaller dependency for a far richer
type system (refinements, transforms, branded types, …).

## Before / after

convict:

```ts
import convict from "convict";

const config = convict({
  env: {
    doc: "App environment",
    format: ["local", "dev", "stage", "prod"],
    default: "local",
    env: "NODE_ENV",
  },
  port: {
    doc: "The port to bind to",
    format: "port",
    default: 3000,
    env: "PORT",
  },
  db: {
    host: {
      doc: "Database host",
      format: String,
      default: "localhost",
      env: "DB_HOST",
    },
    password: {
      doc: "Database password",
      format: String,
      default: "",
      env: "DB_PASSWORD",
      sensitive: true,
    },
  },
});

config.loadFile(`./config/${config.get("env")}.json`);
config.validate({ allowed: "strict" });

export default config;
```

`@env-kit/node-settings`:

```ts
import { defineSettings } from "@env-kit/node-settings";
import { z } from "zod";

export default defineSettings({
  envSchema: z.object({
    APP_ENV: z.enum(["local", "dev", "stage", "prod"]).default("local"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DB_HOST: z.string().describe("Database host"),
    DB_PASSWORD: z.string().describe("Database password"),
  }),
  envKey: "APP_ENV",
  defaults: { db: { connectionPoolSize: 10 } },
  perEnv: {
    local: {},
    dev:   { db: { connectionPoolSize: 20 } },
    stage: { db: { connectionPoolSize: 50 } },
    prod:  { db: { connectionPoolSize: 100 } },
  },
  build: (env, config) => ({
    port: env.PORT,
    db: {
      host: env.DB_HOST,
      password: env.DB_PASSWORD,
      connectionPoolSize: config.db.connectionPoolSize,
    },
  }),
});
```

## Feature mapping

| convict | `@env-kit/node-settings` | Notes |
| --- | --- | --- |
| `convict({...})` declarative schema | `defineSettings({ envSchema, defaults, perEnv, build })` | We separate the *env contract* (envSchema) from the *layered config* (defaults + perEnv). |
| `format: "port" / "url" / "ipaddress" / ...` | zod refinements (`z.string().url()`, `z.coerce.number().min(1).max(65535)`, etc.) | zod's refinement syntax covers convict's built-in formats and arbitrary extras. |
| `doc: "..."` | `.describe(...)` on the zod field | The introspector reads `.describe()` for generated docs / `.env.example`. |
| `env: "VAR_NAME"` (separate mapping) | The zod key **is** the env var name | Less indirection — `DB_HOST: z.string()` in `envSchema` reads `process.env.DB_HOST` directly. |
| `sensitive: true` | Auto-detected by `DEFAULT_SECRET_PATTERNS` (PASSWORD, TOKEN, SECRET, …) | Override with explicit `secretPatterns` in introspect options if your naming doesn't match. |
| `config.loadFile("./config/...")` | `perEnv: { local, dev, stage, prod }` in source | Per-env config lives in typed TS code instead of JSON files. (You can still load files if you prefer — see the `sample/config/` pattern.) |
| `config.get("db.host")` (string path) | `cfg.db.host` (typed) | TypeScript catches typos at compile time. |
| `config.validate({ allowed: "strict" })` | runs automatically when you call the loader | No two-step "construct then validate" — validation is part of `settings(env)`. |
| `arg: "--port"` (CLI args mapped to config) | not built-in | Use `commander` / `yargs` for CLI args, then pass them to settings as part of the env map. |

## Step-by-step

1. **Install** alongside (run both temporarily for confidence):

   ```bash
   pnpm add @env-kit/node-settings zod
   ```

2. **Translate the schema field by field**. For each convict entry:

   | convict | zod |
   | --- | --- |
   | `format: String, default: "x"` | `z.string().default("x")` |
   | `format: "port", default: 3000` | `z.coerce.number().int().min(1).max(65535).default(3000)` |
   | `format: "url"` | `z.string().url()` |
   | `format: "email"` | `z.string().email()` |
   | `format: ["a", "b", "c"]` | `z.enum(["a", "b", "c"])` |
   | `format: Boolean, default: false` | `z.coerce.boolean().default(false)` |
   | `doc: "..."` | `.describe("...")` |
   | `sensitive: true` | rename so it matches `DEFAULT_SECRET_PATTERNS` (e.g. add `_PASSWORD` / `_TOKEN` suffix), or pass a custom regex to `introspectEnvSchema` |

3. **Pick `envKey`**. If you've been keying off `NODE_ENV`, use
   `envKey: "NODE_ENV"`. For richer environments, add a separate
   `APP_ENV` enum.

4. **Move per-env config from JSON files to `perEnv`**. The cleanest
   path:

   ```
   config/local.json   →  config/local.ts  (exports DeepPartial<AppConfig>)
   config/prod.json    →  config/prod.ts
   ```

   See [`sample/config/`](../../sample/config/) for the convention.
   Each per-env file imports the base `AppConfig` type and exports a
   `DeepPartial<AppConfig>` — the compiler now catches typos.

5. **Replace `config.get("path")` call sites** with typed property
   access: `settings.dbHost` → `cfg.dbHost`. Run TypeScript; the
   errors are your migration TODO list.

6. **Drop `config.loadFile(...)` calls** — `perEnv` handles this now.

## Gotchas

- **String coercion**: convict's formats often coerced strings
  automatically (e.g. `"3000"` → `3000` for `port`). zod's
  `z.number()` does NOT coerce by default — use `z.coerce.number()`
  to keep the same behaviour.
- **`format: String` accepts anything**. zod's `z.string()` rejects
  `null` / `undefined`. If you had silent string-coercion of
  `undefined` env vars before, decide explicitly: `.optional()`,
  `.default("...")`, or hard-required.
- **Sensitive flag** is replaced by name-based detection. If your
  legacy keys don't match `DEFAULT_SECRET_PATTERNS` (PASSWORD,
  TOKEN, SECRET, PRIVATE_KEY, API_KEY, ACCESS_KEY, CREDENTIAL,
  PASSPHRASE, DSN), either rename them or extend the pattern list
  via `introspectEnvSchema(schema, { secretPatterns: [...] })`.
- **`arg:` CLI args**: not built-in. The migration path is to use
  a CLI library (`commander`, `yargs`, `clipanion`) and pass parsed
  args to settings as part of the env source map.

## What you gain

- **Per-env layered config** in typed TS files instead of untyped
  JSON / YAML.
- **zod's full type system** — refinements, transforms,
  discriminated unions, branded types, `.transform()`, all available
  for config fields.
- **Generators**: `.env.example`, K8s manifests, JSON Schema,
  Markdown docs, Terraform `.tfvars`, Docker Compose.
- **CLI**: `validate`, `check`, `inspect`, `preflight`, `diff`.
- **Build-time plugins**: `vite build` / `next build` abort on bad
  env before bundling.
