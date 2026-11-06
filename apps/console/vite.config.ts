import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const api = process.env.VITE_API_PROXY ?? "http://localhost:3000"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    // Same-origin calls in development: no CORS setup needed.
    proxy: { "/v1": api, "/health": api },
  },
})
