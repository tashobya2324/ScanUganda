import { defineConfig } from "vitest/config"

// Kept apart from vite.config.ts: Vitest bundles its own Vite, and mixing its
// types with the app's Vite 8 plugins does not type-check. Tests need no Tailwind.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
