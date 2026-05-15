import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        // Test files themselves and their snapshots
        "src/**/*.test.ts",
        "src/**/__snapshots__/**",
        // CLI bin shim — exercised by verify-dist after build, not unit tests
        "src/cli/bin.ts",
        // Re-export-only index files have no executable code
        "src/loaders/index.ts",
        "src/utils/index.ts",
        "src/generators/index.ts",
        // Placeholder for future frontend support
        "src/loaders/vite-env.ts",
      ],
      thresholds: {
        // Floors set slightly below current measured coverage so a
        // small regression bothers the PR author. Raise as coverage
        // improves; don't lower without discussion.
        lines: 80,
        functions: 85,
        statements: 80,
        branches: 80,
      },
    },
  },
});
