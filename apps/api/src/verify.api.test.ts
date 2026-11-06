import { beforeAll, describe, expect, it } from "vitest"
import { USERS, makeTestApp } from "./test-helpers.ts"

type T = Awaited<ReturnType<typeof makeTestApp>>
let t: T

beforeAll(async () => {
  t = await makeTestApp()
})

const KAMPALA = { lat: 0.3476, lng: 32.5825, accuracyM: 20 }
const JINJA = { lat: 0.4244, lng: 33.2041, accuracyM: 20 }
const FORT_PORTAL = { lat: 0.671, lng: 30.275, accuracyM: 20 }
const KAPCHORWA = { lat: 1.3988, lng: 34.45, accuracyM: 20 }

const verify = (body: object, headers: Record<string, string> = {}) =>
  t.app.inject({ method: "POST", url: "/v1/verify", payload: body, headers })

const alertTypes = async () => {
  const res = await t.app.inject({ method: "GET", url: "/v1/alerts?limit=500", headers: await t.as(USERS.inspector) })
  return (res.json() as { type: string }[]).map((a) => a.type)
}

describe("POST /v1/verify: scenarios from the plan", () => {
  it("E1 genuine sugar packet at a Kampala shop → GENUINE with product facts", async () => {
    const c = t.code("E1", 0)
    const res = await verify({ payload: c.payload, position: KAMPALA })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.verdict).toBe("GENUINE")
    expect(body.reasons).toEqual([])
    expect(body.product).toMatchObject({ productName: "Premium White Sugar", packSize: "1 kg packet", manufacturer: "Pearl Sugar Works", batchCode: "PS-2408-17" })
    expect(body.duplicate).toBe(false)
  })

  it("E8 the same kind of unit through its 12-digit code (USSD-style) → GENUINE", async () => {
    const c = t.code("E1", 1)
    const res = await verify({ code: c.lookupCode, channel: "USSD", position: { ...KAMPALA, accuracyM: 15000 } })
    expect(res.json().verdict).toBe("GENUINE")
  })

  it("accepts the code with spaces, as printed", async () => {
    const c = t.code("E1", 2)
    const spaced = c.lookupCode.replace(/(\d{4})(?=\d)/g, "$1 ")
    expect((await verify({ code: spaced })).json().verdict).toBe("GENUINE")
  })

  it("E2 altered signature → STOP, product hidden, counterfeit alert", async () => {
    const c = t.code("E1", 3)
    const forged = c.payload.slice(0, -6) + (c.payload.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA")
    const body = (await verify({ payload: forged })).json()
    expect(body.verdict).toBe("STOP")
    expect(body.reasons[0].code).toBe("INVALID_SIGNATURE")
    expect(body.product).toBeNull()
    expect(await alertTypes()).toContain("COUNTERFEIT_SUSPECTED")
  })

  it("E2 a well-formed code for a batch that does not exist → STOP, UNKNOWN_CODE", async () => {
    const real = t.code("E1", 4).payload.split(".")
    const body = (await verify({ payload: `NOSUCHBATCH.000001.${real[2]}` })).json()
    expect(body.verdict).toBe("STOP")
    expect(body.reasons[0].code).toBe("UNKNOWN_CODE")
    expect(body.product).toBeNull()
  })

  it("E2 a valid-looking lookup code that was never issued → STOP", async () => {
    // Build a code with a valid check digit that no unit has.
    const body = (await verify({ code: "000000000000" })).json()
    expect(body.verdict).toBe("STOP")
    expect(body.reasons[0].code).toBe("UNKNOWN_CODE")
  })

  it("E3 Kapchorwa-only agro-chemical scanned in Kampala → CHECK + distribution alert", async () => {
    const c = t.code("E3", 0)
    const body = (await verify({ payload: c.payload, position: KAMPALA, scannerRole: "retailer" })).json()
    expect(body.verdict).toBe("CHECK")
    expect(body.reasons[0].code).toBe("OUTSIDE_REGION")
    expect(await alertTypes()).toContain("DISTRIBUTION_ANOMALY")
  })

  it("E3 the same product scanned in Kapchorwa → GENUINE", async () => {
    const c = t.code("E3", 1)
    expect((await verify({ payload: c.payload, position: KAPCHORWA })).json().verdict).toBe("GENUINE")
  })

  it("E4 one unit in Jinja, then Fort Portal moments later → STOP + impossible-travel alert", async () => {
    const c = t.code("E1", 5)
    expect((await verify({ payload: c.payload, position: JINJA })).json().verdict).toBe("GENUINE")
    const second = (await verify({ payload: c.payload, position: FORT_PORTAL })).json()
    expect(second.verdict).toBe("STOP")
    expect(second.reasons[0].code).toBe("IMPOSSIBLE_TRAVEL")
    expect(await alertTypes()).toContain("IMPOSSIBLE_TRAVEL")
  })

  it("E4 the same shop scanning the unit twice is fine", async () => {
    const c = t.code("E1", 6)
    await verify({ payload: c.payload, position: KAMPALA })
    expect((await verify({ payload: c.payload, position: KAMPALA })).json().verdict).toBe("GENUINE")
  })

  it("E5 unit still in the factory at a shelf → STOP + parallel-market alert", async () => {
    const c = t.code("E5", 0)
    const body = (await verify({ payload: c.payload, position: KAMPALA })).json()
    expect(body.verdict).toBe("STOP")
    expect(body.reasons[0].code).toBe("LIFECYCLE_IN_FACTORY")
    expect(await alertTypes()).toContain("PARALLEL_MARKET")
  })

  it("an inspector may scan factory stock without a stop", async () => {
    const c = t.code("E5", 1)
    const res = await verify({ payload: c.payload, scannerRole: "inspector", position: KAMPALA }, await t.as(USERS.inspector))
    expect(res.json().verdict).toBe("GENUINE")
  })

  it("in-transit stock at a shelf → CHECK", async () => {
    const c = t.code("in transit", 0)
    expect((await verify({ payload: c.payload })).json().verdict).toBe("CHECK")
  })

  it("E6 recalled batch → STOP on the PWA, USSD and SMS alike, with the reason", async () => {
    for (const [i, channel] of (["PWA", "USSD", "SMS"] as const).entries()) {
      const c = t.code("E6", i)
      const body = (await verify({ code: c.lookupCode, channel })).json()
      expect(body.verdict).toBe("STOP")
      expect(body.reasons[0].code).toBe("BATCH_RECALLED")
      expect(body.reasons[0].message).toContain("Packaging fault")
      expect(body.product.productName).toBe("Infant Maize Cereal") // a recalled product is still named
    }
  })

  it("expired batch → STOP", async () => {
    const c = t.code("expired", 0)
    expect((await verify({ payload: c.payload })).json().reasons[0].code).toBe("BATCH_EXPIRED")
  })
})

describe("POST /v1/verify: input handling", () => {
  it("rejects something that is not a ScanUganda code, and records nothing", async () => {
    const before = (await t.app.inject({ method: "GET", url: "/v1/scans?limit=500", headers: await t.as(USERS.admin) })).json().length
    for (const payload of ["https://example.com/menu", "5449000000996", "a.b"]) {
      const res = await verify({ payload })
      expect(res.statusCode).toBe(422)
      expect(res.json().error.code).toBe("NOT_A_SCANUGANDA_CODE")
    }
    const after = (await t.app.inject({ method: "GET", url: "/v1/scans?limit=500", headers: await t.as(USERS.admin) })).json().length
    expect(after).toBe(before)
  })

  it("rejects a mistyped 12-digit code before touching the registry", async () => {
    const c = t.code("E1", 7)
    const wrong = c.lookupCode.slice(0, 11) + String((Number(c.lookupCode[11]) + 1) % 10)
    const res = await verify({ code: wrong })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe("INVALID_CODE_FORMAT")
  })

  it("requires exactly one of payload or code", async () => {
    expect((await verify({})).statusCode).toBe(400)
    expect((await verify({ payload: "x.y.z", code: "123" })).statusCode).toBe(400)
  })

  it("validates coordinates and channel", async () => {
    const c = t.code("E1", 8)
    expect((await verify({ payload: c.payload, position: { lat: 120, lng: 0 } })).statusCode).toBe(400)
    expect((await verify({ payload: c.payload, channel: "FAX" })).statusCode).toBe(400)
  })

  it("does not let an anonymous caller claim to be an inspector", async () => {
    const c = t.code("E5", 2)
    const res = await verify({ payload: c.payload, scannerRole: "inspector" })
    expect(res.statusCode).toBe(401)
  })

  it("works without any location: regional batches get a note, not a failure", async () => {
    const c = t.code("E3", 2)
    const body = (await verify({ payload: c.payload })).json()
    expect(body.verdict).toBe("GENUINE")
    expect(body.reasons[0].code).toBe("LOCATION_UNAVAILABLE")
  })

  it("marks a unit scanned too many times for a check", async () => {
    const c = t.code("E1", 9)
    let last = ""
    for (let i = 0; i < 7; i++) last = (await verify({ payload: c.payload, position: KAMPALA })).json().verdict
    expect(last).toBe("CHECK")
    expect(await alertTypes()).toContain("DUPLICATE_SCANS")
  })

  it("never leaks the lifecycle, alerts or internals to the public", async () => {
    const c = t.code("E1", 0)
    const body = (await verify({ payload: c.payload, position: KAMPALA })).json()
    expect(Object.keys(body).sort()).toEqual(["duplicate", "product", "reasons", "scanId", "verdict"])
  })
})
