// Stryker is run nightly via .github/workflows/mutation.yml, not on
// every push — mutation runs take ~10-30x the regular test time.
// Mutation score floors are intentionally permissive at the start;
// raise them as we tighten test coverage (see CONTRIBUTING.md).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "pnpm",
  testRunner: "vitest",
  // Explicit plugin path — Stryker's auto-discovery doesn't walk
  // through pnpm's symlinked node_modules layout reliably.
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: {
    configFile: "vitest.mutation.config.ts",
  },
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: {
    fileName: "reports/mutation/mutation.html",
  },
  coverageAnalysis: "perTest",
  mutate: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/__snapshots__/**",
    // Re-export-only index files have no logic to mutate.
    "!src/index.ts",
    "!src/loaders/index.ts",
    "!src/utils/index.ts",
    "!src/generators/index.ts",
    "!src/cli/index.ts",
    // CLI bin shim is exercised via build artefacts, not unit tests.
    "!src/cli/bin.ts",
    // CLI surface is covered by cli-e2e.test.ts and workspace.test.ts,
    // both excluded from the mutation run (they need process.chdir,
    // which throws inside worker threads). Mutate the pure logic
    // they orchestrate, not the orchestration itself.
    "!src/cli/**",
    // Placeholder for future frontend support.
    "!src/loaders/vite-env.ts",
    // Type-only file — Stryker has nothing meaningful to mutate.
    "!src/errors.ts",
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  timeoutMS: 60000,
  disableTypeChecks: "src/**/*.ts",
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
};
