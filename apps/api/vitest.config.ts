import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Entry points and CLIs: exercised by running them (pnpm dev, e2e, the Worker smoke test), not by unit tests.
      exclude: ["src/**/*.test.ts", "src/test-helpers.ts", "src/server.ts", "src/seed-cli.ts", "src/migrate-cli.ts", "src/pg-serve-cli.ts", "src/worker.ts", "src/node-runtime.ts"],
    },
  },
})
