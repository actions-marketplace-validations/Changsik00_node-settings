# Backlog

Future work, grouped by theme. Items move from here into commits on
`main` and ultimately into a tagged release via `pnpm release`. See
[RELEASING.md](./RELEASING.md) for the flow.

Each item carries a one-line motivation and (where useful) a rough
size sketch. The priority order inside each section reflects current
thinking — feel free to re-rank during planning.

## CI/CD ergonomics

- [x] ~~**`preflight` CLI** — single subcommand bundling validate + check~~
      ~~+ inspect into one CI-friendly JSON output.~~ Shipped: `node-settings
      preflight [env-file]` with `--workspace` + `--format=json`.
- [x] ~~**Drift detection** — `kubectl get cm my-app -o yaml | node-settings~~
      ~~diff -`.~~ Shipped: `node-settings diff [file|-]` with four
      issue kinds (`missing-required`, `secret-in-configmap`,
      `public-in-secret`, `extra-key`), `--strict`, `--format json`.
      Value-level diff (defaults vs live values) left as a follow-up.
- [ ] **GitHub Action major-tag rolling** — move `action.yml` into a
      dedicated tag scheme (`v1`, `v1.0.0`) so users can pin to a
      major version line. _(small, post-publish)_
- [ ] **Pre-built Docker image** containing the CLI, for non-Node
      CI/CD shells (Jenkins / Tekton / Argo Workflows). _(medium)_
- [ ] **CI examples for Bitbucket Pipelines, GitLab CI, CircleCI** in
      `docs/DEPLOYMENT.md`. _(small)_

## AI ergonomics

- [ ] **MCP server** (`@env-kit/node-settings-mcp`) — Model Context
      Protocol server exposing `validate` / `check` / `inspect` /
      `generate` to AI agents so they can audit a project's env
      contract directly. _(medium)_
- [ ] **`llms-full.txt`** companion to `llms.txt`, containing the
      concatenated content of all canonical docs for one-shot LLM
      ingestion. _(small)_
- [x] ~~**Structured JSON output mode** on `check` / `inspect` /~~
      ~~`validate` (`--format=json`).~~ Shipped: stable `ValidateResult`
      / `CheckResult` / `InspectResult` / `PreflightResult` shapes,
      with `todo()` sentinels serialising as `{ "$todo": "reason" }`.

## env / config ergonomics

- [x] ~~**Server / client schema split** (t3-oss/env-nextjs style)~~
      Shipped: `defineClientEnv({ prefix, schema, strict? })` at the
      package root. Prefix enforced at definition time;
      non-prefixed keys filtered at runtime.
- [x] ~~**Build-time validation plugin** for Vite~~ — shipped:
      `import { nodeSettings } from "@env-kit/node-settings/vite"`.
      Next.js / esbuild variants are follow-up.
- [x] ~~**Build-time validation plugin** for Next.js~~ — shipped:
      `import { withNodeSettings } from "@env-kit/node-settings/next"`.
      esbuild variant still open.
- [ ] **Build-time validation plugin** for esbuild — round out the
      "build-time plugin" claim to cover non-Vite, non-Next bundlers
      (Remix esbuild config, custom esbuild-based pipelines). _(medium)_
- [x] ~~**`generate tfvars`** — Terraform variable file template~~
      Shipped: `node-settings generate tfvars`. HCL output with
      REPLACE_ME placeholders; programmatic `generateTfvars(...)`
      exported from `/generators`.
- [x] ~~**`generate compose`** — `docker-compose.yml` `env_file` or~~
      ~~service-level `environment:` block.~~ Shipped: `node-settings
      generate compose [--style service|env-file] [--name <svc>]`.

## Monorepo

- [ ] **Full pnpm-workspace.yaml glob expansion** — replace the
      heuristic `packages/`+`apps/` directory scan in
      `src/cli/workspace.ts` with proper workspace glob parsing.
      _(medium)_
- [ ] **Nx / Lerna explicit support** — first-class discovery for
      these layouts (`workspaces` field, `lerna.json` `packages`).
      _(small once globs are in)_
- [ ] **Cross-package extends graph** — `node-settings inspect
      --workspace --graph` prints a tree of which apps extend which
      base loader. _(small)_

## Coverage / robustness

- [ ] **Mutation testing (Stryker)** — verify that the unit tests
      actually catch broken implementations. Probably wired into a
      nightly schedule rather than per-PR. _(medium)_
- [ ] **Windows in CI** — would require `scripts/verify-pack.mjs` to
      use a Node-native tarball reader instead of `tar -tzf`. _(small)_
- [x] ~~**Real downstream consumer repo** — a tiny app that depends~~
      ~~on the published version and runs in our CI matrix.~~ Shipped:
      `examples/consumer/` + `.github/workflows/consumer.yml`. Daily
      cron + push/PR trigger. Caught one finding worth following up
      on: `AnySettingsLoader` upper bound has a variance issue —
      specific loaders satisfy the `extends` use site through
      inference but fail explicit `T extends AnySettingsLoader`
      checks. Not user-visible today; revisit when reworking the
      `extends` types.
- [ ] **Coverage tighten** — `validate-options.ts` and
      `check-per-env.ts` have lower per-file coverage; targeted tests
      to bring them >85%. _(small)_
- [ ] **AnySettingsLoader variance** — `AnySettingsLoader` is meant
      as the "any loader" upper bound for `extends` arrays. Its
      `build: (env: { [x: string]: any }, config: object) => object`
      signature trips function-arg contravariance, so a specific
      loader fails `T extends AnySettingsLoader` from the consumer
      side even though `extends: [specificLoader]` works fine
      (inference avoids the constraint check). Rework so explicit
      satisfies works; surfaced by the consumer smoke test. _(small)_

## Generators

- [ ] **`generate yaml`** — generic YAML output for non-K8s consumers
      (Helm values, Ansible host vars, …). _(small)_
- [ ] **`generate dockerfile-env`** — `ENV K=v` lines for an image
      base layer. _(small)_

## Documentation

- [ ] **Doc site** (Astro Starlight / Nextra) once the project has
      meaningful adoption. _(large)_
- [ ] **More `<!-- doc-test:check -->` blocks** as docs evolve — at
      least the AGENTS.md "Common patterns" examples. _(small, ongoing)_
- [ ] **Migration guides** for users coming from t3-oss/env,
      convict, node-config, dotenv-flow. _(medium)_

## Project hygiene

- [ ] **Public roadmap** — surface this BACKLOG.md content as GitHub
      issues with labels (`type:feature`, `area:ci`, etc.) once
      the repo has external contributors. _(small)_
- [ ] **Contributor guide** (`CONTRIBUTING.md`) — local setup,
      how to run `pnpm verify`, how to land a doc-only PR, how to
      cut a release. _(small)_
