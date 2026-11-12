import type { PGlite } from "@electric-sql/pglite"
import { buildApp, type App } from "./app.ts"
import type { Config } from "./config.ts"
import { all, migrate, type Db, type Param } from "./db.ts"
import { clonePglite, openPglite } from "./db-pglite.ts"
import { SealedKeyStore, type KeyStore } from "./keys.ts"
import { seedDemo, type SeedResult, type DemoCode } from "./seed.ts"
import { Store } from "./store.ts"

export const PASSWORD = "correct-horse-battery"

export const testConfig = (over: Partial<Config> = {}): Config => ({
  port: 0,
  pgliteDir: "",
  keysDir: "",
  tokenSecret: "t".repeat(40),
  lookupPepper: "p".repeat(40),
  keyEncryptionKey: "k".repeat(40),
  corsOrigins: [],
  rateLimitMax: 100_000,
  verifyRateLimit: 100_000,
  loginRateLimit: 100_000,
  trustProxy: false,
  validateResponses: true,
  ...over,
})

/* ---------- requests ---------- */

export interface InjectOptions {
  method?: string
  url: string
  /** Object → JSON; string → sent as is (set content-type yourself). */
  payload?: unknown
  headers?: Record<string, string>
  /** The client's socket address. */
  remoteAddress?: string
}

export interface InjectResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
  json(): any
}

/** Sends one request through the app in memory (no network), like Fastify's `inject`. */
export async function inject(app: App, o: InjectOptions): Promise<InjectResponse> {
  const headers: Record<string, string> = { ...o.headers }
  let body: string | undefined
  if (o.payload !== undefined) {
    if (typeof o.payload === "string") body = o.payload
    else {
      body = JSON.stringify(o.payload)
      headers["content-type"] ??= "application/json"
    }
  }
  const res = await app.request(
    `http://localhost${o.url}`,
    { method: o.method ?? "GET", headers, body },
    { incoming: { socket: { remoteAddress: o.remoteAddress ?? "127.0.0.1" } } },
  )
  const text = await res.text()
  return {
    statusCode: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: text,
    json: () => JSON.parse(text),
  }
}

/** The app plus a Fastify-style `inject`, so tests read the same as before. */
export const testable = (app: App) => Object.assign(app, { inject: (o: InjectOptions) => inject(app, o) })
export type TestApp = ReturnType<typeof testable>

/* ---------- a seeded database, built once per test file and copied ---------- */

// Seeding hashes passwords and signs ~40 codes, and PGlite takes a moment to start, so the
// seeded database is made once per test file and each app gets its own copy.
let template: Promise<{ db: Db & { pglite: PGlite }; seed: SeedResult }> | undefined
const keys: KeyStore = new SealedKeyStore(testConfig().keyEncryptionKey!) // sealed keys travel with the copy

function seeded() {
  template ??= (async () => {
    const db = await openPglite()
    await migrate(db)
    const seed = await seedDemo(new Store(db), keys, testConfig().lookupPepper, PASSWORD)
    return { db: db as Db & { pglite: PGlite }, seed }
  })()
  return template
}

/** A fresh app on its own copy of the seeded database. */
export async function makeTestApp(over: Partial<Config> = {}) {
  const config = testConfig(over)
  const { db: base, seed } = await seeded()
  const store = new Store(await clonePglite(base))
  const app = testable(buildApp({ store, keys, config }))

  const tokens = new Map<string, string>()
  async function login(email: string): Promise<string> {
    const cached = tokens.get(email)
    if (cached) return cached
    const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PASSWORD } })
    if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.body}`)
    const token = res.json().token as string
    tokens.set(email, token)
    return token
  }
  const as = async (email: string) => ({ authorization: `Bearer ${await login(email)}` })

  const code = (scenarioStart: string, index = 0): DemoCode => {
    const found = seed.codes.filter((c) => c.scenario.startsWith(scenarioStart))[index]
    if (!found) throw new Error(`no demo code for ${scenarioStart} #${index}`)
    return found
  }
  /** Raw SQL against this app's database, for checks the API does not expose. */
  const sql = <T = Record<string, unknown>>(text: string, ...params: Param[]) => all<T>(store.db, text, ...params)
  return { app, store, keys, config, seed, as, code, sql }
}

export const USERS = {
  admin: "admin@scanuganda.test",
  maker: "pearl@scanuganda.test",
  inspector: "inspector@scanuganda.test",
}
