# Deployment guide

Three topics:

1. **[Setting `APP_ENV` per platform](#setting-app_env-per-platform)** — Docker, Kubernetes, GitHub Actions, Vercel, Heroku, ECS, Lambda, Render / Railway / Fly.
2. **[Platform presets](#platform-presets)** — opt-in adapters that map platform-specific env vars (`VERCEL_ENV`, `CONTEXT`, `CF_PAGES_BRANCH`, ...) to `APP_ENV`.
3. **[The `.env.<mode>` cascade](#the-envmode-cascade)** — the file-naming convention every other Node tool uses.

## Setting `APP_ENV` per platform

`node-settings` reads `process.env.APP_ENV` (or whatever `envKey` you
pick) **as a plain environment variable**. It does not auto-detect the
deployment environment — setting `APP_ENV` is the platform's job,
[12-factor app](https://12factor.net/config) style. Below are the
patterns each platform uses.

**Fallback for local dev:** if you give `envKey` a default
(`z.enum(['local','dev','prod']).default('local')`), nothing breaks
when `APP_ENV` is unset — you simply run in `local` mode. You only
need to set `APP_ENV` explicitly in deployed environments.

### Local development

```bash
# .env at project root, loaded via dotenv (or `loadDotenvCascade`).
APP_ENV=local
DB_HOST=localhost
DB_PASSWORD=local-dev-password
```

Or in `package.json` scripts:

```json
{
  "scripts": {
    "dev": "APP_ENV=local tsx src/main.ts",
    "dev:integration": "APP_ENV=dev tsx src/main.ts"
  }
}
```

See [`sample/env/`](../sample/env) for templates per environment.

### Docker

```bash
docker run -e APP_ENV=dev my-app:latest
# or:
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

Includes `APP_ENV: "prod"`. Attach via `envFrom`:

```yaml
spec:
  template:
    spec:
      containers:
        - name: api
          envFrom:
            - configMapRef: { name: my-app-config }
            - secretRef:    { name: my-app-secret }
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
per environment (Production / Preview / Development). Or use the
[`presets.vercel()`](#platform-presets) adapter to map Vercel's own
`VERCEL_ENV` to `APP_ENV` automatically.

### Heroku

```bash
heroku config:set APP_ENV=prod --app my-app
heroku config:set APP_ENV=stage --app my-app-stage
```

### AWS ECS / Fargate

```json
{
  "containerDefinitions": [{
    "environment": [{ "name": "APP_ENV", "value": "prod" }],
    "secrets":     [{ "name": "DB_PASSWORD", "valueFrom": "arn:..." }]
  }]
}
```

### AWS Lambda

Function env vars (typical Serverless / SAM / SST pattern):

```yaml
provider:
  environment:
    APP_ENV: ${self:custom.stage}
```

### Render / Railway / Fly.io

```bash
fly secrets set APP_ENV=prod
railway variables set APP_ENV=prod
```

Or use [`presets.render()`](#platform-presets) / `presets.railway()`.

### `APP_ENV` vs `NODE_ENV`

| Var       | Meaning                                                   | Use for                |
| --------- | --------------------------------------------------------- | ---------------------- |
| `NODE_ENV` | Node.js convention: `development` \| `production` \| `test`. Affects `npm install --omit=dev`, framework optimisations. | Build-time and framework concerns. |
| `APP_ENV`  | Your own deployment-env label: `local`, `dev`, `stage`, `prod`, ... | Per-environment config selection (this library). |

Treat them as orthogonal. `NODE_ENV=production` may be true for *every*
`APP_ENV` value other than `local`.

## Platform presets

For platforms that expose their own deployment-environment signal
(`VERCEL_ENV`, `CONTEXT`, `CF_PAGES_BRANCH`, `RAILWAY_ENVIRONMENT`,
...), the library ships **opt-in presets** that map those signals to
your `APP_ENV` value.

```ts
import { inferAppEnv, presets, loadDotenvCascade } from "@changsik00/node-settings";

// Standalone — explicit resolution
const APP_ENV = inferAppEnv({
  presets: [
    presets.vercel(),
    presets.githubActions({ branchToMode: { main: "prod" }, default: "dev" }),
    presets.nodeEnv(),
  ],
  default: "local",
});

// Or wired into the .env cascade
const { env, mode } = loadDotenvCascade({
  appEnvPresets: [presets.vercel(), presets.nodeEnv()],
});
```

Resolution order:

1. **Explicit** — `source[APP_ENV]` (or whatever `envKey` you pick).
2. **`.env` file** — when using `loadDotenvCascade`, the base `.env`'s
   `APP_ENV` value.
3. **Presets** — each `preset.detect(source)` in array order, first non-undefined wins.
4. **Default** — `'local'` by default.

### Available presets

| Preset                 | Signal                                  | Default mapping |
| ---------------------- | --------------------------------------- | --------------- |
| `presets.vercel()`     | `VERCEL_ENV`                            | `production` → `prod`, `preview` → `stage`, `development` → `local` |
| `presets.netlify()`    | `CONTEXT`                               | `production` → `prod`, `deploy-preview` → `stage`, `branch-deploy` → `dev`, `dev` → `local` |
| `presets.cloudflarePages()` | `CF_PAGES`, `CF_PAGES_BRANCH`      | `main` branch → `prod`, others → `dev` |
| `presets.githubActions()` | `GITHUB_ACTIONS`, `GITHUB_REF_NAME` | configurable per branch              |
| `presets.railway()`    | `RAILWAY_ENVIRONMENT_NAME`              | `production` → `prod`, `staging` → `stage`, `development` → `local` |
| `presets.render()`     | `RENDER`, `IS_PULL_REQUEST`             | normal deploy → `prod`, PR preview → `stage` |
| `presets.nodeEnv()`    | `NODE_ENV`                              | `production` → `prod`, `development` → `local`, `test` → `test` |

Each preset accepts an overrides object to customise the mapping
(e.g. `presets.vercel({ preview: 'dev' })`).

### Why no Vite / Turbo / Webpack preset?

Those are *build tools*, not deployment platforms — they don't expose
a deployment-environment signal. Vite has `import.meta.env.MODE` (a
*build* mode), Turbo has run / cache metadata. Neither tells you
whether you're running in dev or prod, which is what `APP_ENV` is for.
If you're behind Vite or Turbo, set `APP_ENV` from the actual host
(your deployment platform) or your shell.

## The `.env.<mode>` cascade

Opt-in helper that picks up the file-naming convention every Node tool
already uses (Next.js, Vite, dotenv-flow, Create React App). Drop the
right files in the project root and the helper loads them in the right
order:

```
.env                         ← base, committed
.env.local                   ← personal overrides, gitignored
.env.<APP_ENV>              ← env-specific (.env.dev, .env.prod, ...)
.env.<APP_ENV>.local        ← env-specific local, gitignored
process.env                 ← always wins
```

Wire it up at boot:

```ts
import { loadDotenvCascade } from "@changsik00/node-settings";
import settings from "./settings.config.js";

const { env, mode, loaded } = loadDotenvCascade();
console.log(`Booting in '${mode}' mode. Loaded:`, loaded);
export const cfg = settings(env);
```

Mode detection (priority):

1. `process.env.APP_ENV` if set, else
2. the `APP_ENV` value parsed out of `.env`, else
3. `appEnvPresets[i].detect(...)` in array order, else
4. `defaultMode` (`'local'` by default).

In `test` mode the two `.local` files are skipped — same convention
as Next/Vite — so CI runs aren't affected by developer overrides.

The templates in [`sample/env/`](../sample/env) plug straight in: drop
`.sample` and the cascade picks them up.

```bash
cp sample/env/.env.local.sample .env.local
cp sample/env/.env.prod.sample  .env.prod
```
