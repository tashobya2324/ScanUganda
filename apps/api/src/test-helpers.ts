import { buildApp } from "./app.ts"
import type { Config } from "./config.ts"
import { openDb } from "./db.ts"
import { MemoryKeyStore } from "./keys.ts"
import { seedDemo, type DemoCode } from "./seed.ts"
import { Store } from "./store.ts"

export const PASSWORD = "correct-horse-battery"

export const testConfig = (over: Partial<Config> = {}): Config => ({
  port: 0,
  dbPath: ":memory:",
  keysDir: "",
  tokenSecret: "t".repeat(40),
  lookupPepper: "p".repeat(40),
  corsOrigins: [],
  rateLimitMax: 100_000,
  validateResponses: true,
  ...over,
})

/** A fresh app on an in-memory database, seeded with the sample data. */
export async function makeTestApp(over: Partial<Config> = {}) {
  const config = testConfig(over)
  const store = new Store(openDb(":memory:"))
  const keys = new MemoryKeyStore()
  const seed = await seedDemo(store, keys, config.lookupPepper, PASSWORD)
  const app = await buildApp({ store, keys, config })

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
  return { app, store, keys, config, seed, as, code }
}

export const USERS = {
  admin: "admin@scanuganda.test",
  maker: "pearl@scanuganda.test",
  inspector: "inspector@scanuganda.test",
}
