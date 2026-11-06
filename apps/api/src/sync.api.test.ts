import { beforeAll, describe, expect, it } from "vitest"
import { verifyOffline } from "@scanuganda/core"
import { USERS, makeTestApp } from "./test-helpers.ts"

type T = Awaited<ReturnType<typeof makeTestApp>>
let t: T
beforeAll(async () => {
  t = await makeTestApp()
})

const sync = () => t.app.inject({ method: "GET", url: "/v1/sync" })
const upload = (scans: object[]) => t.app.inject({ method: "POST", url: "/v1/sync/scans", payload: { scans } })
const KAMPALA = { lat: 0.3476, lng: 32.5825 }
const JINJA = { lat: 0.4244, lng: 33.2041 }
const FORT_PORTAL = { lat: 0.671, lng: 30.275 }

describe("GET /v1/sync (offline cache)", () => {
  it("returns public keys, batches, recalls and regions: and no secrets", async () => {
    const body = (await sync()).json()
    expect(Object.keys(body.publicKeys).length).toBe(4)
    expect(Object.keys(body.batches).length).toBe(6)
    expect(body.recalledBatchIds.length).toBe(1)
    expect(body.regions.length).toBeGreaterThan(5)
    const text = JSON.stringify(body)
    expect(text).not.toMatch(/lookup|hash|password|private/i)
  })

  it("is enough for the core offline verifier to judge real codes", async () => {
    const cache = (await sync()).json()
    const good = t.code("E1", 0).payload
    const recalled = t.code("E6", 0).payload
    const forged = good.slice(0, -6) + (good.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA")
    const now = Date.now()
    expect(verifyOffline(good, cache, now).verdict).toBe("CHECK")
    expect(verifyOffline(good, cache, now).reasons[0]?.code).toBe("OFFLINE_UNCONFIRMED")
    expect(verifyOffline(recalled, cache, now).reasons[0]?.code).toBe("BATCH_RECALLED")
    expect(verifyOffline(forged, cache, now).reasons[0]?.code).toBe("INVALID_SIGNATURE")
  })

  it("reflects a recall made after the first sync", async () => {
    const before = (await sync()).json().recalledBatchIds.length
    const batches = (await t.app.inject({ method: "GET", url: "/v1/batches", headers: await t.as(USERS.admin) })).json() as { id: string; batchCode: string }[]
    const target = batches.find((b) => b.batchCode === "NV-2410-04")!
    await t.app.inject({ method: "POST", url: `/v1/batches/${target.id}/recall`, payload: { reason: "Contamination found" }, headers: await t.as(USERS.admin) })
    expect((await sync()).json().recalledBatchIds.length).toBe(before + 1)
  })
})

describe("POST /v1/sync/scans (queued offline scans)", () => {
  it("judges each scan as of when it happened and reports per-item results", async () => {
    const c = t.code("E1", 1)
    const res = await upload([
      { clientId: "device1-scan-0001", payload: c.payload, scannedAt: Date.now() - 3_600_000, position: KAMPALA },
    ])
    expect(res.statusCode).toBe(200)
    const [r] = res.json().results
    expect(r.ok).toBe(true)
    expect(r.outcome.verdict).toBe("GENUINE")
    expect(r.outcome.duplicate).toBe(false)
  })

  it("is idempotent: retrying the same clientId returns the stored answer and adds no scan", async () => {
    const c = t.code("E1", 2)
    const scan = { clientId: "device1-scan-0002", payload: c.payload, scannedAt: Date.now() - 60_000, position: KAMPALA }
    const first = (await upload([scan])).json().results[0]
    const countBefore = (await t.app.inject({ method: "GET", url: "/v1/scans?limit=500", headers: await t.as(USERS.admin) })).json().length
    const again = (await upload([scan])).json().results[0]
    const countAfter = (await t.app.inject({ method: "GET", url: "/v1/scans?limit=500", headers: await t.as(USERS.admin) })).json().length
    expect(again.outcome.duplicate).toBe(true)
    expect(again.outcome.scanId).toBe(first.outcome.scanId)
    expect(countAfter).toBe(countBefore)
  })

  it("catches impossible travel even when the scans arrive out of order", async () => {
    const c = t.code("E1", 3)
    const now = Date.now()
    // The later scan (Fort Portal, 1 min after) is uploaded first, then the earlier one (Jinja).
    await upload([{ clientId: "device2-scan-0001", payload: c.payload, scannedAt: now - 60_000, position: FORT_PORTAL }])
    const r = (await upload([{ clientId: "device3-scan-0001", payload: c.payload, scannedAt: now - 120_000, position: JINJA }])).json().results[0]
    expect(r.outcome.verdict).toBe("STOP")
    expect(r.outcome.reasons[0].code).toBe("IMPOSSIBLE_TRAVEL")
  })

  it("a typed code queued offline can be uploaded too", async () => {
    const c = t.code("E1", 4)
    const r = (await upload([{ clientId: "device4-scan-0001", code: c.lookupCode, scannedAt: Date.now() }])).json().results[0]
    expect(r.outcome.verdict).toBe("GENUINE")
  })

  it("one bad scan does not sink the batch", async () => {
    const good = t.code("E1", 5)
    const res = await upload([
      { clientId: "device5-scan-0001", payload: "https://example.com", scannedAt: Date.now() },
      { clientId: "device5-scan-0002", payload: good.payload, scannedAt: Date.now() + 3_600_000 },
      { clientId: "device5-scan-0003", payload: good.payload, scannedAt: Date.now() - 40 * 24 * 3_600_000 },
      { clientId: "device5-scan-0004", payload: good.payload, scannedAt: Date.now() },
    ])
    const codes = res.json().results.map((r: { ok: boolean; error?: { code: string }; outcome?: { verdict: string } }) => (r.ok ? r.outcome!.verdict : r.error!.code))
    expect(codes).toEqual(["NOT_A_SCANUGANDA_CODE", "SCAN_IN_FUTURE", "SCAN_TOO_OLD", "GENUINE"])
  })

  it("flags the scan as offline-originated", async () => {
    const scans = (await t.app.inject({ method: "GET", url: "/v1/scans?limit=500", headers: await t.as(USERS.admin) })).json() as { wasOffline: boolean }[]
    expect(scans.some((s) => s.wasOffline)).toBe(true)
  })

  it("validates the request", async () => {
    expect((await upload([])).statusCode).toBe(400)
    expect((await upload([{ clientId: "short", payload: "x", scannedAt: 1 }])).statusCode).toBe(400)
    expect((await upload([{ clientId: "device6-scan-0001", scannedAt: Date.now() }])).statusCode).toBe(400)
    const many = Array.from({ length: 101 }, (_, i) => ({ clientId: `device6-scan-${i + 100}`, payload: "x", scannedAt: 1 }))
    expect((await upload(many)).statusCode).toBe(400)
  })
})

describe("POST /v1/reports", () => {
  it("accepts a report and links it to a scan", async () => {
    const v = (await t.app.inject({ method: "POST", url: "/v1/verify", payload: { payload: t.code("E1", 6).payload } })).json()
    const res = await t.app.inject({
      method: "POST", url: "/v1/reports",
      payload: { description: "Packet looks different from usual and the seal was open", shopName: "Kikuubo Wholesale", scanId: v.scanId, position: KAMPALA },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().id).toBeTruthy()
  })

  it("rejects thin descriptions and unknown scans", async () => {
    expect((await t.app.inject({ method: "POST", url: "/v1/reports", payload: { description: "bad" } })).statusCode).toBe(400)
    const res = await t.app.inject({ method: "POST", url: "/v1/reports", payload: { description: "A long enough description", scanId: "nope" } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe("UNKNOWN_SCAN")
  })
})
