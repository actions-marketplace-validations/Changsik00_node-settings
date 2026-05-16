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
- [ ] **Trusted Publishing (OIDC) finalize** — `release.yml` is
      wired for OIDC + `--provenance` (commit c29c664) but the first
      publish attempt (v0.11.1) returned 404 from npm despite a
      successful provenance sigstore submission. v0.11.1 was
      published locally as a fallback. Next steps: verify the npm
      Trusted Publisher entry exactly matches the OIDC subject the
      workflow sends; possibly capture the OIDC claims via a debug
      step. Should be unblocked in 1-2 iterations. _(small)_
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

- [x] ~~**Full pnpm-workspace.yaml glob expansion**~~ — Shipped:
      `discoverWorkspacePackages()` now parses pnpm-workspace.yaml's
      `packages:` globs first, then package.json `workspaces` (npm /
      yarn / Bun), then falls back to the heuristic dir scan.
      Supports `!`-exclusions and `**` recursion via picomatch.
- [ ] **Nx / Lerna explicit support** — `lerna.json`'s `packages`
      field already works through the npm-workspaces path
      (package.json `workspaces`). What's missing: reading
      `nx.json`'s `projects` config and `lerna.json`'s `packages`
      array directly when neither pnpm nor package.json workspaces
      is declared. _(small)_
- [ ] **Cross-package extends graph** — `node-settings inspect
      --workspace --graph` prints a tree of which apps extend which
      base loader. _(small)_

## Coverage / robustness

- [ ] **Mutation testing (Stryker)** — verify that the unit tests
      actually catch broken implementations. Probably wired into a
      nightly schedule rather than per-PR. _(medium)_
- [x] ~~**Windows in CI**~~ — Shipped: CI matrix includes
      windows-latest. verify-pack uses an in-process gzip+tar
      parser; verify:sample is a Node script that captures stdout
      via spawnSync; `clean` is Node too. No subprocess-shell
      differences left in the verify path.
- [x] ~~**Real downstream consumer repo** — a tiny app that depends~~
      ~~on the published version and runs in our CI matrix.~~ Built,
      ran once, then retired. Caught one useful finding before
      removal (logged under "AnySettingsLoader variance" below);
      ongoing value didn't justify the noise of a separate
      sample-but-not-sample directory. Sample directory now reads
      as a single project.
- [x] ~~**Coverage tighten**~~ — Shipped: 18 targeted tests across
      `validate-options.ts` and `check-per-env.ts`; full-suite
      coverage now 87%+ (post-switch to istanbul provider, which
      aggregates correctly across import paths where v8 was
      under-reporting).
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
- [x] ~~**Migration guides** for users coming from t3-oss/env,~~
      ~~convict, node-config, dotenv-flow.~~ Shipped: `docs/migration/`
      with one before/after + feature-mapping + step-by-step guide
      per library, plus a shared-principles index README.

## Project hygiene

- [ ] **Public roadmap** — surface this BACKLOG.md content as GitHub
      issues with labels (`type:feature`, `area:ci`, etc.) once
      the repo has external contributors. _(small)_
- [x] ~~**Contributor guide** (`CONTRIBUTING.md`)~~ — Shipped:
      covers local setup, the verify-chain mapping, conventions,
      doc-only PRs, releasing, and the BACKLOG-as-roadmap pointer.
