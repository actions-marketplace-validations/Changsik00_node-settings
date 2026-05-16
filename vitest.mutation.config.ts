import { defineConfig } from "vitest/config";

// Stryker's vitest runner executes tests in worker threads, where
// `process.chdir()` throws. The CLI e2e suite uses chdir to simulate
// running the binary from inside a workspace, so we skip it here.
// The pure-logic tests below it (check-per-env, diff-k8s, generators,
// …) are where mutation testing actually pays off anyway — the CLI
// layer is mostly arg-parsing thin glue.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [
      "src/cli/cli-e2e.test.ts",
      "src/cli/workspace.test.ts",
    ],
    environment: "node",
  },
});
