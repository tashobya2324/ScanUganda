import { defineConfig } from "vitest/config"

// Separate from vite.config.ts: Vitest bundles its own Vite, which does not
// type-check against the app's Vite 8 plugins. Tests need no Tailwind.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
