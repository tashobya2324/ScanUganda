import { beforeAll, describe, expect, it } from "vitest"
import { PASSWORD, USERS, makeTestApp, testConfig } from "./test-helpers.ts"

type T = Awaited<ReturnType<typeof makeTestApp>>
let t: T
beforeAll(async () => {
  t = await makeTestApp()
})

const call = async (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, who?: string, payload?: object) =>
  t.app.inject({ method, url, payload, headers: who ? await t.as(who) : {} })

describe("auth", () => {
  it("signs in and returns the user", async () => {
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: USERS.maker, password: PASSWORD } })
    expect(res.statusCode).toBe(200)
    expect(res.json().user).toMatchObject({ role: "manufacturer", email: USERS.maker })
    expect(JSON.stringify(res.json())).not.toMatch(/scrypt|password_hash/)
  })

  it("is case-insensitive on email", async () => {
    const res = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: USERS.admin.toUpperCase(), password: PASSWORD } })
    expect(res.statusCode).toBe(200)
  })

  it("gives the same error for a wrong password and an unknown email", async () => {
    const a = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: USERS.admin, password: "wrong-password" } })
    const b = await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "nobody@scanuganda.test", password: "wrong-password" } })
    expect(a.statusCode).toBe(401)
    expect(b.statusCode).toBe(401)
    expect(a.json()).toEqual(b.json())
  })

  it("GET /v1/auth/me needs a valid token", async () => {
    expect((await call("GET", "/v1/auth/me")).statusCode).toBe(401)
    expect((await t.app.inject({ method: "GET", url: "/v1/auth/me", headers: { authorization: "Bearer junk" } })).statusCode).toBe(401)
    expect((await call("GET", "/v1/auth/me", USERS.admin)).json().role).toBe("admin")
  })
})

describe("roles", () => {
  it("staff routes reject anonymous callers", async () => {
    for (const url of ["/v1/batches", "/v1/alerts", "/v1/scans", "/v1/overview", "/v1/products"]) {
      expect((await call("GET", url)).statusCode).toBe(401)
    }
  })

  it("inspectors can read but not create or recall", async () => {
    expect((await call("GET", "/v1/batches", USERS.inspector)).statusCode).toBe(200)
    expect((await call("POST", "/v1/products", USERS.inspector, { name: "X", category: "FOOD", packSize: "1" })).statusCode).toBe(403)
    const b = (await call("GET", "/v1/batches", USERS.inspector)).json()[0]
    expect((await call("POST", `/v1/batches/${b.id}/recall`, USERS.inspector, { reason: "no right to" })).statusCode).toBe(403)
  })

  it("only admins reach user and manufacturer management", async () => {
    for (const who of [USERS.maker, USERS.inspector]) {
      expect((await call("GET", "/v1/users", who)).statusCode).toBe(403)
      expect((await call("POST", "/v1/manufacturers", who, { name: "Rogue Ltd" })).statusCode).toBe(403)
    }
    expect((await call("GET", "/v1/users", USERS.admin)).json().length).toBe(3)
  })

  it("a manufacturer sees only its own batches, products and scans; others look like 404", async () => {
    const own = (await call("GET", "/v1/batches", USERS.maker)).json() as { manufacturerName: string; id: string }[]
    expect(own.length).toBeGreaterThan(0)
    expect(own.every((b) => b.manufacturerName === "Pearl Sugar Works")).toBe(true)
    expect((await call("GET", "/v1/products", USERS.maker)).json().length).toBe(2)

    const all = (await call("GET", "/v1/batches", USERS.admin)).json() as { manufacturerName: string; id: string }[]
    const foreign = all.find((b) => b.manufacturerName !== "Pearl Sugar Works")!
    expect((await call("GET", `/v1/batches/${foreign.id}`, USERS.maker)).statusCode).toBe(404)
    expect((await call("POST", `/v1/batches/${foreign.id}/units`, USERS.maker, { count: 1 })).statusCode).toBe(404)
    expect((await call("POST", `/v1/batches/${foreign.id}/recall`, USERS.maker, { reason: "not mine to recall" })).statusCode).toBe(404)
    expect((await call("GET", `/v1/scans?batchId=${foreign.id}`, USERS.maker)).statusCode).toBe(404)
  })
})

describe("manufacturer workflow: product → batch → codes → lifecycle → recall", () => {
  let batchId = ""
  let units: { serial: string; payload: string; lookupCode: string }[] = []

  it("creates a product and a batch with designated regions", async () => {
    const p = await call("POST", "/v1/products", USERS.maker, { name: "Brown Sugar", category: "FOOD", packSize: "2 kg bag" })
    expect(p.statusCode).toBe(201)
    const now = Date.now()
    const b = await call("POST", "/v1/batches", USERS.maker, { productId: p.json().id, batchCode: "PS-2411-01", manufacturedAt: now - 86_400_000, expiresAt: now + 200 * 86_400_000, regionIds: ["kampala"] })
    expect(b.statusCode).toBe(201)
    batchId = b.json().id
    const detail = (await call("GET", `/v1/batches/${batchId}`, USERS.maker)).json()
    expect(detail.designatedRegionIds).toEqual(["kampala"])
    expect(detail.unitCount).toBe(0)
  })

  it("rejects bad batches: duplicate code, dates, unknown regions, someone else's product", async () => {
    const products = (await call("GET", "/v1/products", USERS.maker)).json()
    const now = Date.now()
    const base = { productId: products[0].id, batchCode: "PS-NEW", manufacturedAt: now, expiresAt: now + 1000, regionIds: [] }
    expect((await call("POST", "/v1/batches", USERS.maker, { ...base, batchCode: "PS-2411-01" })).statusCode).toBe(409)
    expect((await call("POST", "/v1/batches", USERS.maker, { ...base, expiresAt: now - 1 })).statusCode).toBe(400)
    expect((await call("POST", "/v1/batches", USERS.maker, { ...base, regionIds: ["atlantis"] })).statusCode).toBe(400)
    const all = (await call("GET", "/v1/products", USERS.admin)).json() as { id: string; manufacturerId: string }[]
    const foreign = all.find((p) => p.manufacturerId !== products[0].manufacturerId)!
    expect((await call("POST", "/v1/batches", USERS.maker, { ...base, productId: foreign.id })).statusCode).toBe(400)
  })

  it("generates codes once and they verify", async () => {
    const res = await call("POST", `/v1/batches/${batchId}/units`, USERS.maker, { count: 3 })
    expect(res.statusCode).toBe(201)
    expect(res.headers["cache-control"]).toBe("no-store")
    units = res.json().units
    expect(units.map((u) => u.serial)).toEqual(["000001", "000002", "000003"])
    // Codes are stored hashed: a second batch of codes continues the numbering.
    const more = (await call("POST", `/v1/batches/${batchId}/units`, USERS.maker, { count: 2 })).json().units
    expect(more.map((u: { serial: string }) => u.serial)).toEqual(["000004", "000005"])
    // New units start in the factory, so a shelf scan is stopped until they are released.
    const v = await t.app.inject({ method: "POST", url: "/v1/verify", payload: { payload: units[0]!.payload, position: { lat: 0.3476, lng: 32.5825 } } })
    expect(v.json().reasons[0].code).toBe("LIFECYCLE_IN_FACTORY")
  })

  it("exports CSV", async () => {
    const res = await call("POST", `/v1/batches/${batchId}/units?format=csv`, USERS.maker, { count: 2 })
    expect(res.statusCode).toBe(201)
    expect(res.headers["content-type"]).toContain("text/csv")
    expect(res.headers["content-disposition"]).toContain("PS-2411-01-codes.csv")
    const lines = res.body.trim().split("\n")
    expect(lines[0]).toBe("serial,payload,lookup_code")
    expect(lines).toHaveLength(3)
    expect(lines[1]!.split(",")).toHaveLength(3)
  })

  it("moves units forward one stage at a time", async () => {
    expect((await call("POST", `/v1/batches/${batchId}/lifecycle`, USERS.maker, { from: "IN_FACTORY", to: "AT_RETAIL" })).statusCode).toBe(400)
    expect((await call("POST", `/v1/batches/${batchId}/lifecycle`, USERS.maker, { from: "AT_RETAIL", to: "IN_FACTORY" })).statusCode).toBe(400)
    const r1 = await call("POST", `/v1/batches/${batchId}/lifecycle`, USERS.maker, { from: "IN_FACTORY", to: "IN_TRANSIT" })
    expect(r1.json().moved).toBe(7)
    await call("POST", `/v1/batches/${batchId}/lifecycle`, USERS.maker, { from: "IN_TRANSIT", to: "AT_DISTRIBUTOR" })
    const detail = (await call("GET", `/v1/batches/${batchId}`, USERS.maker)).json()
    expect(detail.lifecycle).toEqual({ IN_FACTORY: 0, IN_TRANSIT: 0, AT_DISTRIBUTOR: 7, AT_RETAIL: 0 })
    const v = await t.app.inject({ method: "POST", url: "/v1/verify", payload: { payload: units[1]!.payload, position: { lat: 0.3476, lng: 32.5825 } } })
    expect(v.json().verdict).toBe("GENUINE")
  })

  it("a recall turns every code STOP at once, blocks new codes, and can be lifted", async () => {
    const recall = await call("POST", `/v1/batches/${batchId}/recall`, USERS.maker, { reason: "Metal fragments found" })
    expect(recall.statusCode).toBe(200)
    expect((await call("POST", `/v1/batches/${batchId}/recall`, USERS.maker, { reason: "Metal fragments found" })).statusCode).toBe(409)
    expect((await call("POST", `/v1/batches/${batchId}/units`, USERS.maker, { count: 1 })).statusCode).toBe(409)
    for (const u of units) {
      const byQr = await t.app.inject({ method: "POST", url: "/v1/verify", payload: { payload: u.payload } })
      const byCode = await t.app.inject({ method: "POST", url: "/v1/verify", payload: { code: u.lookupCode, channel: "USSD" } })
      expect(byQr.json().verdict).toBe("STOP")
      expect(byCode.json().verdict).toBe("STOP")
    }
    expect((await call("DELETE", `/v1/batches/${batchId}/recall`, USERS.maker)).statusCode).toBe(200)
    expect((await call("DELETE", `/v1/batches/${batchId}/recall`, USERS.maker)).statusCode).toBe(409)
    const v = await t.app.inject({ method: "POST", url: "/v1/verify", payload: { payload: units[2]!.payload, position: { lat: 0.3476, lng: 32.5825 } } })
    expect(v.json().verdict).toBe("GENUINE")
  })

  it("validates generation counts", async () => {
    for (const count of [0, -1, 5001, 1.5]) {
      expect((await call("POST", `/v1/batches/${batchId}/units`, USERS.maker, { count })).statusCode).toBe(400)
    }
  })
})

describe("alerts, scans and overview", () => {
  it("lists alerts highest priority first, filters, and updates status", async () => {
    const c = t.code("E5", 3)
    await t.app.inject({ method: "POST", url: "/v1/verify", payload: { payload: c.payload } })
    const high = (await call("GET", "/v1/alerts?priority=high&status=open", USERS.inspector)).json() as { id: string; priority: string }[]
    expect(high.length).toBeGreaterThan(0)
    expect(high.every((a) => a.priority === "high")).toBe(true)
    const sorted = (await call("GET", "/v1/alerts", USERS.inspector)).json() as { priority: string }[]
    const rank = { high: 0, medium: 1, low: 2 } as const
    expect(sorted.map((a) => rank[a.priority as keyof typeof rank])).toEqual([...sorted.map((a) => rank[a.priority as keyof typeof rank])].sort())

    const id = high[0]!.id
    const inspectorId = (await call("GET", "/v1/auth/me", USERS.inspector)).json().id
    const upd = await call("PATCH", `/v1/alerts/${id}`, USERS.inspector, { status: "investigating", assignedTo: inspectorId })
    expect(upd.json()).toMatchObject({ status: "investigating", assignedTo: inspectorId })
    expect((await call("PATCH", `/v1/alerts/${id}`, USERS.inspector, { status: "resolved" })).json().assignedTo).toBe(inspectorId) // keeps assignee
    expect((await call("GET", "/v1/alerts?status=resolved", USERS.inspector)).json().some((a: { id: string }) => a.id === id)).toBe(true)
  })

  it("rejects bad alert updates", async () => {
    expect((await call("PATCH", "/v1/alerts/nope", USERS.admin, { status: "resolved" })).statusCode).toBe(404)
    const id = (await call("GET", "/v1/alerts", USERS.admin)).json()[0].id
    expect((await call("PATCH", `/v1/alerts/${id}`, USERS.admin, { status: "closed" })).statusCode).toBe(400)
    expect((await call("PATCH", `/v1/alerts/${id}`, USERS.admin, { status: "open", assignedTo: "ghost" })).statusCode).toBe(400)
  })

  it("a manufacturer only sees alerts on its own batches", async () => {
    const mine = (await call("GET", "/v1/alerts", USERS.maker)).json() as { batchCode: string | null }[]
    const everyone = (await call("GET", "/v1/alerts", USERS.admin)).json() as unknown[]
    expect(mine.length).toBeLessThan(everyone.length)
    expect(mine.every((a) => a.batchCode === null || /^(PS|PC)-/.test(a.batchCode))).toBe(true)
    const foreign = (await call("GET", "/v1/alerts", USERS.admin)).json().find((a: { batchCode: string | null }) => a.batchCode?.startsWith("NV-"))
    expect((await call("PATCH", `/v1/alerts/${foreign.id}`, USERS.maker, { status: "resolved" })).statusCode).toBe(404)
  })

  it("filters scans by verdict and respects limit", async () => {
    const stops = (await call("GET", "/v1/scans?verdict=STOP&limit=3", USERS.admin)).json() as { verdict: string }[]
    expect(stops.length).toBeLessThanOrEqual(3)
    expect(stops.every((s) => s.verdict === "STOP")).toBe(true)
    expect((await call("GET", "/v1/scans?limit=0", USERS.admin)).statusCode).toBe(400)
    expect((await call("GET", "/v1/scans?since=" + (Date.now() + 100000), USERS.admin)).json()).toEqual([])
  })

  it("overview has totals, open alerts and a 7-day trend, scoped per role", async () => {
    const all = (await call("GET", "/v1/overview", USERS.admin)).json()
    expect(all.last24h.total).toBe(all.last24h.genuine + all.last24h.check + all.last24h.stop)
    expect(all.last24h.total).toBeGreaterThan(0)
    expect(all.daily).toHaveLength(7)
    expect(all.daily[6].GENUINE + all.daily[6].CHECK + all.daily[6].STOP).toBe(all.last24h.total)
    const mine = (await call("GET", "/v1/overview", USERS.maker)).json()
    expect(mine.batches).toBeLessThan(all.batches)
    expect(mine.last24h.total).toBeLessThanOrEqual(all.last24h.total)
  })
})

describe("admin", () => {
  it("creates a manufacturer with a signing key and a user for it", async () => {
    const m = await call("POST", "/v1/manufacturers", USERS.admin, { name: "Lake Honey Co" })
    expect(m.statusCode).toBe(201)
    expect(t.keys.getPrivate(m.json().keyId)).toBeTruthy()
    expect((await call("POST", "/v1/manufacturers", USERS.admin, { name: "Lake Honey Co" })).statusCode).toBe(409)
    const u = await call("POST", "/v1/users", USERS.admin, { email: "honey@scanuganda.test", name: "Honey QA", password: "a-long-password", role: "manufacturer", manufacturerId: m.json().id })
    expect(u.statusCode).toBe(201)
    expect((await t.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "honey@scanuganda.test", password: "a-long-password" } })).statusCode).toBe(200)
  })

  it("enforces user rules", async () => {
    const body = { email: "x@scanuganda.test", name: "X", password: "a-long-password" }
    expect((await call("POST", "/v1/users", USERS.admin, { ...body, role: "manufacturer" })).statusCode).toBe(400)
    expect((await call("POST", "/v1/users", USERS.admin, { ...body, role: "inspector", manufacturerId: "x" })).statusCode).toBe(400)
    expect((await call("POST", "/v1/users", USERS.admin, { ...body, role: "manufacturer", manufacturerId: "ghost" })).statusCode).toBe(400)
    expect((await call("POST", "/v1/users", USERS.admin, { ...body, email: USERS.admin, role: "admin" })).statusCode).toBe(409)
    expect((await call("POST", "/v1/users", USERS.admin, { ...body, password: "short", role: "admin" })).statusCode).toBe(400)
  })

  it("an admin must name the manufacturer when creating a product", async () => {
    expect((await call("POST", "/v1/products", USERS.admin, { name: "Thing", category: "FOOD", packSize: "1" })).statusCode).toBe(400)
    const m = (await call("GET", "/v1/manufacturers", USERS.admin)).json()[0]
    expect((await call("POST", "/v1/products", USERS.admin, { name: "Thing", category: "FOOD", packSize: "1", manufacturerId: m.id })).statusCode).toBe(201)
  })
})

describe("platform behaviour", () => {
  it("uses one error shape everywhere", async () => {
    const e404 = await t.app.inject({ method: "GET", url: "/nope" })
    expect(e404.statusCode).toBe(404)
    expect(e404.json().error.code).toBe("NOT_FOUND")
    const e400 = await t.app.inject({ method: "POST", url: "/v1/verify", payload: "{bad json", headers: { "content-type": "application/json" } })
    expect(e400.statusCode).toBe(400)
    expect(e400.json().error.code).toBeTruthy()
    const e401 = await call("GET", "/v1/batches")
    expect(e401.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } })
    const detail = await t.app.inject({ method: "POST", url: "/v1/reports", payload: { description: "x" } })
    expect(detail.json().error.details.fieldErrors.description).toBeTruthy()
  })

  it("serves an OpenAPI document covering every route, and the docs page", async () => {
    const spec = (await t.app.inject({ method: "GET", url: "/openapi.json" })).json()
    expect(spec.openapi).toBe("3.1.0")
    for (const path of ["/v1/verify", "/v1/sync", "/v1/sync/scans", "/v1/batches/{id}/units", "/v1/alerts/{id}", "/v1/auth/login"]) {
      expect(spec.paths[path], path).toBeTruthy()
    }
    expect(spec.paths["/v1/batches"].post.security).toEqual([{ bearer: [] }])
    expect(spec.paths["/v1/verify"].post.requestBody.content["application/json"].schema).toBeTruthy()
    const docs = await t.app.inject({ method: "GET", url: "/docs" })
    expect(docs.headers["content-type"]).toContain("text/html")
    expect(docs.body).toContain("/openapi.json")
  })

  it("rate-limits abusive callers with a clear error", async () => {
    const limited = await makeTestApp({ rateLimitMax: 3 })
    const codes: number[] = []
    for (let i = 0; i < 5; i++) codes.push((await limited.app.inject({ method: "GET", url: "/health" })).statusCode)
    expect(codes).toEqual([200, 200, 200, 429, 429])
    const res = await limited.app.inject({ method: "GET", url: "/health" })
    expect(res.json().error.code).toBe("RATE_LIMITED")
  })

  it("sets safe headers and only allows configured CORS origins", async () => {
    const h = await t.app.inject({ method: "GET", url: "/health" })
    expect(h.headers["x-content-type-options"]).toBe("nosniff")
    const open = await makeTestApp({ corsOrigins: ["http://localhost:8443"] })
    const ok = await open.app.inject({ method: "GET", url: "/health", headers: { origin: "http://localhost:8443" } })
    const bad = await open.app.inject({ method: "GET", url: "/health", headers: { origin: "http://evil.example" } })
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:8443")
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("lists regions publicly", async () => {
    const res = await t.app.inject({ method: "GET", url: "/v1/regions" })
    expect(res.json().map((r: { id: string }) => r.id)).toContain("kapchorwa")
  })

  it("config refuses weak or identical secrets", async () => {
    const { loadConfig } = await import("./config.ts")
    expect(() => loadConfig({ TOKEN_SECRET: "short", LOOKUP_PEPPER: "p".repeat(40) })).toThrow(/TOKEN_SECRET/)
    expect(() => loadConfig({ TOKEN_SECRET: "a".repeat(40), LOOKUP_PEPPER: "a".repeat(40) })).toThrow(/differ/)
    const ok = loadConfig({ TOKEN_SECRET: "a".repeat(40), LOOKUP_PEPPER: "b".repeat(40), CORS_ORIGINS: "http://a, http://b" })
    expect(ok.corsOrigins).toEqual(["http://a", "http://b"])
    expect(testConfig().validateResponses).toBe(true)
  })
})
