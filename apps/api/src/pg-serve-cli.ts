// Serves a throwaway, seeded Postgres on 127.0.0.1:54329 so `pnpm dev:worker` (the API in
// Cloudflare's local Workers runtime) has a database, with nothing to install:
//
//   terminal 1:  pnpm --filter @scanuganda/api dev:worker:db
//   terminal 2:  pnpm --filter @scanuganda/api dev:worker
//
// The data lives in memory and is gone when this stops. Private keys are sealed with
// KEY_ENCRYPTION_KEY from .env (the Worker reads the same value from .dev.vars).
import { mkdirSync, writeFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { loadConfig } from "./config.ts"
import { migrate } from "./db.ts"
import { wrapPglite } from "./db-pglite.ts"
import { SealedKeyStore } from "./keys.ts"
import { loadDotEnv } from "./node-runtime.ts"
import { seedDemo } from "./seed.ts"
import { Store } from "./store.ts"

loadDotEnv()
const config = loadConfig()
if (!config.keyEncryptionKey) throw new Error("Set KEY_ENCRYPTION_KEY in apps/api/.env (and the same value in .dev.vars)")
const password = process.env.SEED_PASSWORD
if (!password || password.length < 10) throw new Error("Set SEED_PASSWORD (10+ characters) in apps/api/.env")

const port = Number(process.env.PG_PORT ?? 54329)
const pg = await PGlite.create({ parsers: { 20: (x: string) => Number(x) } })
const db = wrapPglite(pg)
await migrate(db)
const seed = await seedDemo(new Store(db), new SealedKeyStore(config.keyEncryptionKey), config.lookupPepper, password)
mkdirSync("./data", { recursive: true })
writeFileSync("./data/worker-demo-codes.json", JSON.stringify(seed.codes, null, 2))

const server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1", maxConnections: 20 })
await server.start()
console.log(`Seeded Postgres on postgres://postgres:postgres@127.0.0.1:${port}/postgres (demo codes: data/worker-demo-codes.json)`)

const stop = async () => {
  await server.stop()
  await pg.close()
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
