# consumer-smoke-test

External-consumer smoke test for `@env-kit/node-settings`. **CI-only**;
not published.

## Why this exists

Our in-repo test suite runs against `src/` (the loose, fast path). A
real consumer installs from npm and compiles their code against
`dist/*.d.ts` with their own `tsconfig`. The gap is where bugs hide:

- `export type Foo` that exists in `src/` but accidentally not in
  `dist/*.d.ts`.
- A peer-dep type leak (e.g. `vite`'s types referenced from a `.d.ts`
  the consumer doesn't import).
- `skipLibCheck: false` catching subtle type issues the loose config
  silently dropped.

This package depends on `@env-kit/node-settings` **from the npm
registry** (not a workspace link) and compiles `settings.ts` + `app.ts`
under `strict: true, skipLibCheck: false`. CI runs this fresh on every
push.

## Local use

```bash
cd examples/consumer
pnpm install          # pulls @env-kit/node-settings from registry
pnpm check            # tsc --noEmit (strict + skipLibCheck: false)
pnpm smoke            # tsx app.ts (runtime check across Node 18+)
pnpm all              # both
```

To test an unpublished version locally, override the dep:

```bash
pnpm add file:../..   # link to the local checkout's tarball
```
