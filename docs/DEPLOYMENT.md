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

## Injecting secrets from infra

Sensitive values (`DB_PASSWORD`, `SENTRY_DSN`, `STRIPE_API_KEY`, ...)
should live in `envSchema`, not `perEnv` — that's the *only* layer
the operator can override at deploy time. Every common infra channel
ends up at the same place: `process.env`. Once the secret is in
`process.env`, zod validates it, and any committed `.env` placeholders
are silently overridden (process.env wins).

The library does not pull secrets directly from Vault / AWS Secrets
Manager / GCP Secret Manager — that's the deploy platform's job.
Below are the canonical patterns.

### GitHub Actions

Repo secrets are exposed as `secrets.X`; set them in the job's `env:`
block so they reach `process.env`:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      APP_ENV: prod
      SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
      DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
    steps:
      - run: npx node-settings validate
      - run: ./deploy.sh
```

For environment-scoped secrets, use [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
and reference `environment: prod` at the job level — the same
`${{ secrets.X }}` syntax then pulls from that environment's secrets.

### HashiCorp Vault

Three common ingestion patterns; all end in env vars:

- **Vault Agent** as a sidecar/init container writes secrets to a
  file and `source`s them into the process env at start.
- **Vault Sidecar with `consul-template`** renders an env file the
  application reads (often into `.env.<mode>.local` style).
- **CSI Volume / Vault Injector** mounts secrets as files; a small
  shim reads them into env vars before the app boots.

```dockerfile
# Dockerfile or entrypoint script
ENTRYPOINT ["sh", "-c", "set -a; . /vault/secrets/env; set +a; exec node dist/main.js"]
```

After this, `process.env.SENTRY_DSN` (etc.) is set by the time
`settings(process.env)` runs.

### AWS Secrets Manager + ECS / Fargate

ECS task definition's `secrets` block pulls a Secrets Manager (or
SSM Parameter Store) entry into an env var:

```json
{
  "containerDefinitions": [{
    "environment": [{ "name": "APP_ENV", "value": "prod" }],
    "secrets": [
      { "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:...:secret:db-password" },
      { "name": "SENTRY_DSN",  "valueFrom": "arn:aws:secretsmanager:...:secret:sentry-dsn"  }
    ]
  }]
}
```

ECS injects each `secrets` entry as an env var at container start —
identical to `environment` from the app's perspective.

### AWS Lambda + Secrets Manager

Two options:

- **Lambda env vars** — store the secret value directly (KMS-encrypted
  by Lambda). Simple, no extra fetch latency.
- **AWS Secrets Manager Lambda extension** — fetches the secret at
  invoke time. Set `SECRETS_MANAGER_TIMEOUT_MILLIS` and read via the
  local extension HTTP API; many teams wrap that in a tiny bootstrap
  that exports the result as `process.env.X` before importing the app.

### Kubernetes — External Secrets Operator / Sealed Secrets

These tools materialise a Kubernetes `Secret` from your secret backend.
The pod consumes it via `envFrom`:

```yaml
spec:
  containers:
    - name: api
      envFrom:
        - configMapRef: { name: my-app-config }    # from node-settings generate k8s
        - secretRef:    { name: my-app-secret }    # mounted env vars
```

The Secret's `data` keys become env var names. `node-settings generate
k8s --name my-app` already emits a Secret manifest with the right
keys — fill in the values via your secret operator and apply.

### Doppler / Infisical / 1Password CLI

All three wrap your start command and inject secrets into the child
process's `process.env`:

```bash
doppler run -- node dist/main.js
infisical run -- node dist/main.js
op run --env-file .env.prod -- node dist/main.js
```

No app changes needed — `settings(process.env)` sees the injected
values.

### Operator-supplied `.env.<mode>.local`

If your infra team prefers to maintain a separate env file (kept in a
private repo or a secrets bucket) and copy it onto the host at deploy
time, name it `.env.<APP_ENV>.local`. The `.local` suffix:

- Is the conventional gitignored pattern (`.gitignore` already excludes
  `.env.*` except `.sample`/`.example`).
- Sits **above** committed `.env` and `.env.<mode>` in the cascade
  precedence — operator's values win over any committed placeholders.
- Sits **below** `process.env` — explicit CI env vars still win if
  both are set (intentional: lets ops promote a value to "always
  override" by setting it as an env var without touching the file).

```bash
# At deploy time
scp ops-vault://prod-secrets.env app@host:/srv/myapp/.env.prod.local
ssh app@host "APP_ENV=prod node /srv/myapp/dist/main.js"
```

### All paths converge

Whichever channel you pick:

```
GitHub Actions secrets  ┐
Vault Agent / Sidecar    │
AWS Secrets Manager      │
GCP Secret Manager       ├──► process.env  ──► envSchema.parse()  ──► your app
External Secrets / Sealed│
Doppler / Infisical / 1P │
.env.<mode>.local        ┘
```

That's why **`envSchema` is the only safe place for operator-injected
values**. The `secret-in-config` lint in `node-settings check`
enforces this by flagging secret-looking keys that ended up in
`perEnv`.

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
