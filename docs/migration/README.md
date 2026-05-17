# Migration guides

Recipes for moving from a popular env / config library to
`@env-kit/node-settings`. Each guide is self-contained:

- A **before / after** snippet showing the same code in both worlds.
- A **feature mapping** table — what concept goes where.
- A **step-by-step** migration walk-through.
- A list of **gotchas** specific to that library.

| From | When it fits you | Guide |
| --- | --- | --- |
| [**t3-oss/env**](./from-t3-oss-env.md) | You're on Next.js with zod env validation; you want per-env config layering on top. | [`from-t3-oss-env.md`](./from-t3-oss-env.md) |
| [**convict**](./from-convict.md) | You have a mature server using convict's `{format, default, env, doc}` schema and want zod + per-env. | [`from-convict.md`](./from-convict.md) |
| [**node-config**](./from-node-config.md) | You use YAML / JSON files (`config/default.yaml`, `config/production.yaml`) and want types + validation. | [`from-node-config.md`](./from-node-config.md) |
| [**dotenv-flow**](./from-dotenv-flow.md) | You only do `.env.<mode>` cascade today; you want validation + per-env config layered on. | [`from-dotenv-flow.md`](./from-dotenv-flow.md) |

## Shared principles

Every migration ends up with the same four-layer mental model:

```
.env files (cascade)     ─►  process.env (CI/infra wins)
                              │
                              ▼
                       envSchema.parse() (zod)
                              │
                              ▼
                       envKey selects perEnv branch
                              │
                              ▼
       defaults  ⊕  perEnv[mode]  ⊕  JSON override
                              │
                              ▼
                         build(env, config)
                              │
                              ▼
                       Object.freeze ⇒ settings
```

If your current library only covers one or two of those layers
(e.g. dotenv-flow is just the file cascade; convict only does env
validation), you'll find we don't *replace* it so much as **subsume**
it — the things you had still work, you just get the rest for free.

## Common pitfalls (no matter where you're coming from)

- **Don't put `todo()` on a value that arrives via CI/env**.
  `todo()` is a commit-time placeholder. Use it only for values
  developers have to fill in (`config/prod.ts` items), not for
  things infra injects at deploy time. See
  [`../CONFIGURATION.md`](../CONFIGURATION.md#which-pattern-for-which-value).
- **Pick `envKey` carefully**. `APP_ENV` (custom enum) gives you
  richer branches than `NODE_ENV` (limited to
  development/production/test). Both work; richer wins for ops.
- **`perEnv` keys must be values of the `envKey` enum**. Typos are
  caught at `defineSettings` call time, not at boot.
- **Secrets stay in `envSchema`, not in `perEnv`**. The CI / infra
  side fills them, and we never commit them in source.
