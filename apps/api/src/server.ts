// The API as a Node server: `pnpm dev` locally, or `pnpm start` on any Node host
// (Render, Railway, Fly.io, a VPS, Cloudflare Containers). For Cloudflare Workers see worker.ts.
import { serve } from "@hono/node-server"
import { buildApp } from "./app.ts"
import { loadConfig } from "./config.ts"
import { loadDotEnv, openNodeDeps } from "./node-runtime.ts"

loadDotEnv()
const config = loadConfig()
const { store, keys, where } = await openNodeDeps(config)
const app = buildApp({ store, keys, config, logger: true })

const server = serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, () => {
  console.log(`API on http://localhost:${config.port} (docs at /docs), database: ${where}`)
})

const stop = () => {
  server.close()
  void store.close().finally(() => process.exit(0))
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
