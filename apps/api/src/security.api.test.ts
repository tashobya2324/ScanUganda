import { Writable } from "node:stream"
import { beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "./app.ts"
import { PASSWORD, USERS, makeTestApp } from "./test-helpers.ts"

type T = Awaited<ReturnType<typeof makeTestApp>>
let t: T

beforeAll(async () => {
  t = await makeTestApp()
})

const login = (email: string, password: string, remoteAddress = "10.0.0.1", app: T["app"] = t.app) =>
  app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password }, remoteAddress })

describe("sign-in lockout", () => {
  it("locks guessing against one account from one address after 10 failures, even for the right password", async () => {
    for (let i = 0; i < 10; i++) expect((await login(USERS.maker, "wrong-password", "10.0.0.50")).statusCode).toBe(401)
    const blocked = await login(USERS.maker, PASSWORD, "10.0.0.50")
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().error.code).toBe("RATE_LIMITED")
  })

  it("does not lock the real user out from their own address, or other accounts from the same address", async () => {
    expect((await login(USERS.maker, PASSWORD, "10.0.0.51")).statusCode).toBe(200)
    expect((await login(USERS.admin, PASSWORD, "10.0.0.50")).statusCode).toBe(200)
  })

  it("counts failures only: many good sign-ins never lock anyone", async () => {
    for (let i = 0; i < 12; i++) expect((await login(USERS.inspector, PASSWORD, "10.0.0.52")).statusCode).toBe(200)
  })
})

describe("client address behind a proxy", () => {
  const fail = (app: T["app"], forwardedFor: string) =>
    app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: USERS.admin, password: "wrong-password" }, headers: { "x-forwarded-for": forwardedFor }, remoteAddress: "10.9.9.9" })

  it("by default ignores X-Forwarded-For, so it cannot be forged to dodge a lockout", async () => {
    const app = (await makeTestApp()).app
    for (let i = 0; i < 10; i++) await fail(app, `203.0.113.${i}`) // ten "different" visitors, one real address
    expect((await fail(app, "203.0.113.200")).statusCode).toBe(429)
  })

  it("with TRUST_PROXY, counts each visitor behind the proxy separately", async () => {
    const app = (await makeTestApp({ trustProxy: true })).app
    for (let i = 0; i < 10; i++) await fail(app, "203.0.113.7")
    expect((await fail(app, "203.0.113.7")).statusCode).toBe(429) // that visitor is locked
    expect((await fail(app, "203.0.113.8")).statusCode).toBe(401) // another visitor behind the same proxy is not
  })
})

describe("alert flooding", () => {
  const alertsOf = (type: string) =>
    (t.store.db.prepare("SELECT id FROM alerts WHERE type = ?").all(type) as { id: string }[]).length
  const forge = (i: number) => {
    const p = t.code("E1", i).payload
    return p.slice(0, -6) + (p.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA")
  }
  const verify = (payload: string) => t.app.inject({ method: "POST", url: "/v1/verify", payload: { payload } })

  it("folds repeated attempts on the same forged code into one open alert", async () => {
    const before = alertsOf("COUNTERFEIT_SUSPECTED")
    const code = forge(0)
    for (let i = 0; i < 6; i++) expect((await verify(code)).json().verdict).toBe("STOP")
    expect(alertsOf("COUNTERFEIT_SUSPECTED") - before).toBe(1)
    // every attempt is still recorded as a scan
    const scans = t.store.db.prepare("SELECT COUNT(*) AS n FROM scans WHERE verdict = 'STOP' AND serial = ?").get(t.code("E1", 0).payload.split(".")[1] ?? "") as { n: number }
    expect(scans.n).toBeGreaterThanOrEqual(6)
  })

  it("still raises a separate alert for a different code", async () => {
    const before = alertsOf("COUNTERFEIT_SUSPECTED")
    await verify(forge(1))
    expect(alertsOf("COUNTERFEIT_SUSPECTED") - before).toBe(1)
  })

  it("raises a new alert once the earlier one is resolved", async () => {
    const code = forge(2)
    await verify(code)
    const id = (t.store.db.prepare("SELECT a.id FROM alerts a JOIN scans s ON s.id = a.scan_id WHERE a.type = 'COUNTERFEIT_SUSPECTED' AND s.serial = ? ORDER BY a.created_at DESC LIMIT 1").get(t.code("E1", 2).payload.split(".")[1] ?? "") as { id: string }).id
    await t.app.inject({ method: "PATCH", url: `/v1/alerts/${id}`, payload: { status: "resolved" }, headers: await t.as(USERS.inspector) })
    const before = alertsOf("COUNTERFEIT_SUSPECTED")
    await verify(code)
    expect(alertsOf("COUNTERFEIT_SUSPECTED") - before).toBe(1)
  })
})

describe("signing key rotation", () => {
  let makerId = ""
  let oldBatchId = ""
  let oldPayload = ""

  it("is admin-only and rejects an unknown manufacturer", async () => {
    makerId = (await t.app.inject({ method: "GET", url: "/v1/manufacturers", headers: await t.as(USERS.admin) })).json().find((m: { name: string }) => m.name === "Pearl Sugar Works").id
    expect((await t.app.inject({ method: "POST", url: `/v1/manufacturers/${makerId}/rotate-key`, headers: await t.as(USERS.maker) })).statusCode).toBe(403)
    expect((await t.app.inject({ method: "POST", url: "/v1/manufacturers/nope/rotate-key", headers: await t.as(USERS.admin) })).statusCode).toBe(404)
    const old = t.code("E1", 5)
    oldPayload = old.payload
    oldBatchId = old.payload.split(".")[0]!
  })

  it("new batches are signed with the new key; codes already printed keep verifying", async () => {
    const before = t.store.activeKeyId(makerId)
    const res = await t.app.inject({ method: "POST", url: `/v1/manufacturers/${makerId}/rotate-key`, headers: await t.as(USERS.admin) })
    expect(res.statusCode).toBe(201)
    const newKey = res.json().keyId as string
    expect(newKey).not.toBe(before)
    expect(t.keys.getPrivate(newKey)).toBeTruthy()
    expect(t.store.activeKeyId(makerId)).toBe(newKey)

    // an old, already-printed code still verifies (the retired key's public half is kept)
    const old = await t.app.inject({ method: "POST", url: "/v1/verify", payload: { payload: oldPayload } })
    expect(old.json().reasons.map((r: { code: string }) => r.code)).not.toContain("INVALID_SIGNATURE")
    expect(t.store.batch(oldBatchId)?.keyId).toBe(before)

    // a batch created now uses the new key, and its codes verify
    const product = (await t.app.inject({ method: "GET", url: "/v1/products", headers: await t.as(USERS.maker) })).json()[0]
    const now = Date.now()
    const b = await t.app.inject({ method: "POST", url: "/v1/batches", headers: await t.as(USERS.maker), payload: { productId: product.id, batchCode: "ROT-1", manufacturedAt: now - 1000, expiresAt: now + 1e9 } })
    expect(t.store.batch(b.json().id)?.keyId).toBe(newKey)
    const units = (await t.app.inject({ method: "POST", url: `/v1/batches/${b.json().id}/units`, headers: await t.as(USERS.maker), payload: { count: 1 } })).json().units
    await t.app.inject({ method: "POST", url: `/v1/batches/${b.json().id}/lifecycle`, headers: await t.as(USERS.maker), payload: { from: "IN_FACTORY", to: "IN_TRANSIT" } })
    await t.app.inject({ method: "POST", url: `/v1/batches/${b.json().id}/lifecycle`, headers: await t.as(USERS.maker), payload: { from: "IN_TRANSIT", to: "AT_DISTRIBUTOR" } })
    const fresh = await t.app.inject({ method: "POST", url: "/v1/verify", payload: { payload: units[0].payload } })
    expect(fresh.json().verdict).toBe("GENUINE")
  })

  it("devices syncing for offline use receive both keys", async () => {
    const sync = (await t.app.inject({ method: "GET", url: "/v1/sync" })).json()
    const keyIds = Object.values(sync.batches as Record<string, { keyId: string }>).map((b) => b.keyId)
    for (const k of new Set(keyIds)) expect(sync.publicKeys[k], k).toBeTruthy()
    expect(Object.keys(sync.publicKeys).length).toBeGreaterThanOrEqual(5)
  })
})

describe("response headers", () => {
  it("API responses cannot run or be framed, and are not shared across sites", async () => {
    const res = await t.app.inject({ method: "GET", url: "/health" })
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'")
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-site")
    expect(res.headers["x-content-type-options"]).toBe("nosniff")
    expect(res.headers["strict-transport-security"]).toBeUndefined() // plain http: never send HSTS
  })

  it("sends HSTS only for requests that arrived over https", async () => {
    const res = await t.app.inject({ method: "GET", url: "/health", headers: { "x-forwarded-proto": "https" } })
    expect(res.headers["strict-transport-security"]).toContain("max-age=31536000")
  })

  it("leaves the docs page able to load Swagger UI", async () => {
    expect((await t.app.inject({ method: "GET", url: "/docs" })).headers["content-security-policy"]).toBeUndefined()
  })
})

describe("logs", () => {
  it("never contain the channel key from a query string", async () => {
    const lines: string[] = []
    const stream = new Writable({ write(chunk, _enc, done) { lines.push(String(chunk)); done() } })
    const secret = "a-very-secret-channel-key-9"
    const app = await buildApp({ store: t.store, keys: t.keys, config: { ...t.config, channelSecret: secret }, logger: { stream } })
    await app.inject({ method: "POST", url: `/v1/ussd?key=${secret}`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "phoneNumber=%2B256700000999&text=" })
    await app.inject({ method: "POST", url: `/v1/ussd?key=wrong-guess-key-1234`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "phoneNumber=%2B256700000999&text=" })
    const log = lines.join("")
    expect(log).toContain("/v1/ussd") // it does log the request
    expect(log).not.toContain(secret)
    expect(log).not.toContain("wrong-guess")
    expect(log).not.toContain("256700000999") // nor the phone number
  })
})

describe("public check limit", () => {
  it("is configurable, and refuses beyond it with a clear message", async () => {
    const tight = await makeTestApp({ verifyRateLimit: 2 })
    const code = tight.code("E1", 0).payload
    const codes: number[] = []
    for (let i = 0; i < 4; i++) codes.push((await tight.app.inject({ method: "POST", url: "/v1/verify", payload: { payload: code } })).statusCode)
    expect(codes).toEqual([200, 200, 429, 429])
  })
})
