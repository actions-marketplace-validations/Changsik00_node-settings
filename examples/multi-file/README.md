# Multi-file config example

A real-world layout for projects whose `perEnv` map outgrows a single
file. Same library, same generators — just better-organised source.

## Layout

```
multi-file/
├── settings.config.ts           # assembles everything (envSchema + build)
└── config/
    ├── defaults.ts              # AppConfig type + baseline values
    ├── local.ts                 # DeepPartial<AppConfig> for local
    ├── dev.ts                   # DeepPartial<AppConfig> for dev
    ├── stage.ts                 # DeepPartial<AppConfig> for stage
    └── prod.ts                  # DeepPartial<AppConfig> for prod
```

## Why split?

- **Git blame per environment** — when prod config changes, the diff is
  in one file.
- **Code review scope** — touching only prod doesn't trigger reviews on
  the dev branch's owners.
- **Type safety preserved** — each per-env file imports `AppConfig`
  from `defaults.ts` and exports a `DeepPartial<AppConfig>`. Typos and
  removed fields fail compilation immediately.

## Try it

From the repo root:

```bash
# See what each env resolves to (no secrets required):
node-settings inspect --config examples/multi-file/settings.config.ts
node-settings inspect --config examples/multi-file/settings.config.ts --env=prod

# Generate artifacts:
node-settings generate envs   --config examples/multi-file/settings.config.ts --out-dir /tmp/envs
node-settings generate docs   --config examples/multi-file/settings.config.ts --out /tmp/ENV.md
node-settings generate k8s    --config examples/multi-file/settings.config.ts --name demo --out /tmp/k8s.yaml

# Validate per-env completeness:
node-settings check --config examples/multi-file/settings.config.ts
```

## When *not* to split

If `perEnv` fits comfortably in one screen, keep it in one file. The
split is for legibility, not type safety — both layouts get the same
runtime behaviour and the same type checking. See
[`examples/basic.config.ts`](../basic.config.ts) for the single-file
variant.
