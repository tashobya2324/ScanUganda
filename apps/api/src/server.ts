import { buildApp } from "./app.ts"
import { loadConfig } from "./config.ts"
import { openDb } from "./db.ts"
import { FileKeyStore } from "./keys.ts"
import { Store } from "./store.ts"

try {
  process.loadEnvFile?.(".env")
} catch {
  // no .env file: rely on the real environment
}

const config = loadConfig()
const store = new Store(openDb(config.dbPath))
const app = await buildApp({ store, keys: new FileKeyStore(config.keysDir), config, logger: true })

await app.listen({ port: config.port, host: "0.0.0.0" })
app.log.info(`API docs at http://localhost:${config.port}/docs`)
