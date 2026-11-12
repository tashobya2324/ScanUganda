// The API as a Cloudflare Worker. Deploy with `pnpm --filter @scanuganda/api deploy:worker`
// (settings in wrangler.jsonc, steps in docs/DEPLOY.md). Must not import anything Node-only
// (node:fs, PGlite): it is bundled for the Workers runtime with `nodejs_compat`.
import { AsyncLocalStorage } from "node:async_hooks"
import type { Context } from "hono"
import { buildApp, type App } from "./app.ts"
import { loadConfig } from "./config.ts"
import type { Db, Queryable } from "./db.ts"
import { openPostgres } from "./db-postgres.ts"
import { SealedKeyStore } from "./keys.ts"
import { Store } from "./store.ts"

interface Env {
  /** Cloudflare Hyperdrive binding: pooled, cached connection to the Postgres server. */
  HYPERDRIVE?: { connectionString: string }
  [name: string]: unknown
}

type ExecutionContext = NonNullable<Parameters<App["fetch"]>[2]>

/**
 * Workers may not reuse a database connection across requests, so each request opens its
 * own (cheap: Hyperdrive keeps the real connections warm) and this Db forwards to it.
 * The app and its caches are built once per isolate; only the connection is per request.
 */
const current = new AsyncLocalStorage<Db>()
const db = (): Db => {
  const d = current.getStore()
  if (!d) throw new Error("No database for this request")
  return d
}
const requestDb: Db = {
  query: (sql, params) => db().query(sql, params),
  exec: (sql) => db().exec(sql),
  transaction: <T>(fn: (tx: Queryable) => Promise<T>) => db().transaction(fn),
  close: async () => {},
}

let app: App | undefined

function appFor(env: Env): App {
  if (app) return app
  const config = loadConfig(env)
  if (!config.keyEncryptionKey) throw new Error("Set the KEY_ENCRYPTION_KEY secret: a Worker has no disk for signing keys")
  app = buildApp({
    store: new Store(requestDb),
    keys: new SealedKeyStore(config.keyEncryptionKey),
    config,
    logger: true,
    // Set by Cloudflare's edge for every request; a client cannot forge it.
    remoteAddress: (c: Context) => c.req.header("cf-connecting-ip"),
  })
  return app
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = env.HYPERDRIVE?.connectionString ?? (env.DATABASE_URL as string | undefined)
    if (!url) return new Response("Database is not configured (HYPERDRIVE binding or DATABASE_URL)", { status: 500 })
    const handler = appFor(env)
    const conn = openPostgres(url, { max: 5 })
    try {
      return await current.run(conn, () => handler.fetch(request, env, ctx))
    } finally {
      ctx.waitUntil(conn.close())
    }
  },
}
