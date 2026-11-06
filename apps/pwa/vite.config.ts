import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const api = process.env.VITE_API_PROXY ?? "http://localhost:3000"
/** "/" on its own host; "/app/" when mounted under the console's dev server. */
const base = process.env.PWA_BASE ?? "/"

/**
 * Writes `precache-manifest.json`: every file of this build, as paths relative
 * to the app's own folder (so it works at "/" and at "/app/"). The service
 * worker downloads them all on install, so the app opens offline even if the
 * user never visited some screen (e.g. the QR-decoder chunk) while online.
 */
function precacheManifest(): Plugin {
  return {
    name: "precache-manifest",
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map"))
      const shell = ["", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "favicon.svg"]
      const urls = [...shell, ...files]
      // The version changes whenever any file name (which includes a content hash) changes.
      let h = 0
      for (const c of urls.join("|")) h = (h * 31 + c.charCodeAt(0)) | 0
      this.emitFile({ type: "asset", fileName: "precache-manifest.json", source: JSON.stringify({ version: (h >>> 0).toString(36), urls }) })
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), precacheManifest()],
  server: { port: 5175, strictPort: true, host: true, proxy: { "/v1": api, "/health": api } },
  preview: { port: 5175, strictPort: true, host: true, proxy: { "/v1": api, "/health": api } },
})
