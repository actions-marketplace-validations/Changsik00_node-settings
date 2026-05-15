# env samples

Per-environment `.env` templates corresponding to [`examples/basic.config.ts`](../basic.config.ts).

| File                  | When                                                                 |
| --------------------- | -------------------------------------------------------------------- |
| `.env.local.sample`   | Local development — copy to `.env.local` and fill in.                |
| `.env.dev.sample`     | Dev cluster — secrets injected by the deploy platform.               |
| `.env.stage.sample`   | Pre-production — same shape as prod, used to catch drift.            |
| `.env.prod.sample`    | Production — never commit real values.                               |

`APP_ENV` is pre-set in each file. The library reads `APP_ENV` from
`process.env` and looks up the matching `perEnv` branch. The header
comment in each file shows what the layered config will resolve to at
runtime.

## Regenerate

If your schema changes, regenerate the samples in bulk:

```bash
node-settings generate envs \
  --config examples/basic.config.ts \
  --out-dir examples/env-samples
```

The generator pre-fills `APP_ENV` with each `perEnv` branch name and
leaves required values blank.
