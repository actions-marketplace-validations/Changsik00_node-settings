# Releasing

This project uses **tag-based versioning**. Day-to-day commits do *not*
touch `package.json`'s `version` field. A version is bumped only at
release time and recorded as a git tag (`vX.Y.Z`), and the
GitHub Actions `release.yml` workflow takes it from there to npm.

## Flow

1. **Land changes on `main`** — review, merge, repeat. Don't touch
   `package.json` `version` in feature commits. Add user-facing
   entries under the `## [Unreleased]` section at the top of
   `CHANGELOG.md`.
2. **When ready to publish a new version**:

   ```bash
   pnpm release 0.11.0
   ```

   The script:
   1. Refuses to run on a dirty working tree.
   2. Runs `pnpm verify` (the full 7-layer chain).
   3. Bumps `package.json` `version`.
   4. Rewrites the `## [Unreleased]` heading to `## [0.11.0] — YYYY-MM-DD`
      and inserts a fresh empty `## [Unreleased]` above it.
   5. Commits `chore: release v0.11.0`.
   6. Tags `v0.11.0`.
   7. Pushes the commit and the tag.

3. **`release.yml` picks up the tag** push and creates the GitHub
   Release page (body = matching CHANGELOG section).
4. **`npm publish` is manual** from your local shell:

   ```bash
   npm login                     # one-time per machine; opens browser
   npm publish --access public   # publishes the current package.json version
   npm view @env-kit/node-settings version   # verify
   ```

   `npm publish` runs against the local `dist/` (already built by
   `pnpm release` via the verify chain) so what ships is exactly
   what verify approved.

> **Why manual publish?** Trusted Publishing (OIDC) is wired up in
> `release.yml` and ready to use — `id-token: write` is granted and
> the `--provenance` flag has been tested. But the first publish
> attempt returned a 404 from npm despite a correct Trusted Publisher
> configuration, and rather than block releases on that debugging
> session we kept the GitHub Release automation and pushed npm
> publish back to the local shell. Tracked in BACKLOG.md "Trusted
> Publishing finalize". When that's resolved, restore the publish
> step from git history (commit c29c664) and drop this manual step.

[prov]: https://docs.npmjs.com/generating-provenance-statements

## Picking the version

Pre-1.0:

- **patch** (`0.10.0` → `0.10.1`) for bug fixes, doc-only changes,
  internal refactors with no API delta.
- **minor** (`0.10.0` → `0.11.0`) for new features. Breaking changes
  are allowed pre-1.0 but should be called out in the changelog.

Post-1.0: standard semver.

## Dry runs

- **What would ship?** `pnpm verify:pack` after `pnpm build` lists
  the tarball contents.
- **What's the public API today?** `node scripts/verify-api.mjs`
  (read-only) or `cat api-surface/*.d.ts`.
- **What changed since last release?** `git log v0.10.0..HEAD --oneline`.

## Hotfixes

If a serious bug ships in `0.11.0`:

1. Branch from the tag: `git checkout -b hotfix/0.11.1 v0.11.0`.
2. Cherry-pick the fix.
3. `pnpm release 0.11.1` on that branch.
4. Merge back to `main` afterwards.

## Why tag-based?

- Feature commits stay focused on the feature, not version housekeeping.
- The tag is the authoritative record of what shipped; `package.json`
  on `main` always reflects "the last released version".
- The release workflow has a single, observable trigger (`v*` tag push)
  that's easy to audit and revert.
