# Backlog

Future work, grouped by theme. Items move from here into commits on
`main` and ultimately into a tagged release via `pnpm release`. See
[RELEASING.md](./RELEASING.md) for the flow.

Each item carries a one-line motivation and (where useful) a rough
size sketch. The priority order inside each section reflects current
thinking — feel free to re-rank during planning.

## CI/CD ergonomics

- [ ] **`preflight` CLI** — single subcommand bundling validate + check
      + inspect into one CI-friendly JSON output. Replaces three
      separate steps in deployment pipelines. _(small)_
- [ ] **Drift detection** — `kubectl get cm my-app -o yaml | node-settings
      diff -`. Compare a live K8s ConfigMap to what `generate k8s`
      would produce; report missing / extra / changed keys. _(medium)_
- [ ] **GitHub Action major-tag rolling** — move `action.yml` into a
      dedicated tag scheme (`v1`, `v1.0.0`) so users can pin to a
      major version line. _(small, post-publish)_
- [ ] **Pre-built Docker image** containing the CLI, for non-Node
      CI/CD shells (Jenkins / Tekton / Argo Workflows). _(medium)_
- [ ] **CI examples for Bitbucket Pipelines, GitLab CI, CircleCI** in
      `docs/DEPLOYMENT.md`. _(small)_

## AI ergonomics

- [ ] **MCP server** (`@changsik00/node-settings-mcp`) — Model Context
      Protocol server exposing `validate` / `check` / `inspect` /
      `generate` to AI agents so they can audit a project's env
      contract directly. _(medium)_
- [ ] **`llms-full.txt`** companion to `llms.txt`, containing the
      concatenated content of all canonical docs for one-shot LLM
      ingestion. _(small)_
- [ ] **Structured JSON output mode** on `check` / `inspect` /
      `validate` (`--format=json`) so AI agents and dashboards can
      consume results without parsing free-form text. _(small)_

## env / config ergonomics

- [ ] **Server / client schema split** (t3-oss/env-nextjs style) for
      libraries that ship code to the browser. _(medium)_
- [ ] **Build-time validation plugin** for Vite / Next / esbuild —
      fails the prod build on bad env instead of at boot. _(medium)_
- [ ] **`generate tfvars`** — Terraform variable file template from
      the env schema, for IaC handoff. _(small)_
- [ ] **`generate compose`** — `docker-compose.yml` `env_file` or
      service-level `environment:` block from the schema. _(small)_

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
- [ ] **Real downstream consumer repo** — a tiny app that depends on
      the published version and runs in our CI matrix. Validates
      that the public API survives `tsc --skipLibCheck false` in
      consumer projects. _(small, post-publish)_
- [ ] **Coverage tighten** — `validate-options.ts` and
      `check-per-env.ts` have lower per-file coverage; targeted tests
      to bring them >85%. _(small)_

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
