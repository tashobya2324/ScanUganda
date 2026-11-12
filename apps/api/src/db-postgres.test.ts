import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "./app.ts"
import { all, get, migrate, run, type Db } from "./db.ts"
import { openPostgres } from "./db-postgres.ts"
import { SealedKeyStore } from "./keys.ts"
import { seedDemo } from "./seed.ts"
import { Store } from "./store.ts"
import { PASSWORD, USERS, testConfig, testable } from "./test-helpers.ts"

/**
 * The network driver (what production uses: Neon, Hyperdrive...) against a real
 * Postgres wire-protocol server. PGlite's socket server stands in for the database
 * so the test needs nothing installed.
 */
let pg: PGlite
let server: PGLiteSocketServer
let db: Db

beforeAll(async () => {
  pg = await PGlite.create()
  const port = 20000 + Math.floor(Math.random() * 20000)
  server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1" })
  await server.start()
  db = openPostgres(`postgres://postgres:postgres@127.0.0.1:${port}/postgres`, { max: 1 })
  await migrate(db)
}, 30_000)

afterAll(async () => {
  await db?.close()
  await server?.stop()
  await pg?.close()
})

describe("postgres driver", () => {
  it("runs the multi-statement migrations and records them", async () => {
    expect((await all<{ id: string }>(db, "SELECT id FROM schema_migrations ORDER BY id")).map((r) => r.id)).toEqual([
      "001_init", "002_scan_client_id", "003_sealed_signing_keys",
    ])
    expect(await migrate(db)).toEqual([])
  })

  it("returns BIGINT and COUNT(*) as numbers, doubles at full precision, and booleans", async () => {
    await run(db, "INSERT INTO regions VALUES ($1,$2,$3,$4,$5)", "x", "X", 0.347612345, 32.582512345, 1.5)
    await run(db, "INSERT INTO manufacturers VALUES ($1,$2,$3)", "m-num", "Numbers Ltd", 1_731_400_000_123)
    expect(await get(db, "SELECT created_at, (SELECT COUNT(*) FROM regions) AS n, true AS yes FROM manufacturers WHERE id = $1", "m-num")).toEqual({
      created_at: 1_731_400_000_123, n: 1, yes: true,
    })
    expect(await get(db, "SELECT lat, lng FROM regions WHERE id = 'x'")).toEqual({ lat: 0.347612345, lng: 32.582512345 })
  })

  it("reports changed rows and treats undefined as NULL", async () => {
    expect(await run(db, "UPDATE regions SET name = 'Y' WHERE id = 'x'")).toBe(1)
    expect(await run(db, "UPDATE regions SET name = 'Y' WHERE id = 'nope'")).toBe(0)
    await expect(run(db, "INSERT INTO manufacturers VALUES ($1,$2,$3)", "m2", "B", undefined)).rejects.toThrow(/null value/)
  })

  it("commits or rolls back a transaction as a whole", async () => {
    await expect(
      db.transaction(async (tx) => {
        await run(tx, "INSERT INTO manufacturers VALUES ($1,$2,$3)", "m-tx", "Tx", 1)
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    expect(await get(db, "SELECT id FROM manufacturers WHERE id = 'm-tx'")).toBeUndefined()
    await db.transaction(async (tx) => void (await run(tx, "INSERT INTO manufacturers VALUES ($1,$2,$3)", "m-tx", "Tx", 1)))
    expect(await get(db, "SELECT id FROM manufacturers WHERE id = 'm-tx'")).toEqual({ id: "m-tx" })
  })
})

describe("the whole API on the network driver", () => {
  it("seeds, signs in, checks a code, makes codes and reports numbers", async () => {
    const config = testConfig()
    const keys = new SealedKeyStore(config.keyEncryptionKey!)
    const store = new Store(db)
    const seed = await seedDemo(store, keys, config.lookupPepper, PASSWORD)
    const app = testable(buildApp({ store, keys, config }))

    const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: USERS.maker, password: PASSWORD } })
    expect(login.statusCode).toBe(200)
    const auth = { authorization: `Bearer ${login.json().token}` }

    const genuine = seed.codes.find((c) => c.scenario.startsWith("E1"))!
    const verify = await app.inject({ method: "POST", url: "/v1/verify", payload: { payload: genuine.payload } })
    expect(verify.json().verdict).toBe("GENUINE")
    const byCode = await app.inject({ method: "POST", url: "/v1/verify", payload: { code: genuine.lookupCode } })
    expect(byCode.statusCode).toBe(200)

    const batch = (await app.inject({ method: "GET", url: "/v1/batches", headers: auth })).json()[0]
    const units = await app.inject({ method: "POST", url: `/v1/batches/${batch.id}/units`, headers: auth, payload: { count: 3 } })
    expect(units.statusCode).toBe(201)
    expect(units.json().units).toHaveLength(3)

    const overview = (await app.inject({ method: "GET", url: "/v1/overview", headers: auth })).json()
    expect(overview.last24h.total).toBeGreaterThanOrEqual(2)
    expect(overview.daily).toHaveLength(7)
  }, 60_000)
})
