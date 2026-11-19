import { beforeAll, describe, expect, it } from "vitest"
import { USERS, makeTestApp } from "./test-helpers.ts"

let t: Awaited<ReturnType<typeof makeTestApp>>
beforeAll(async () => {
  t = await makeTestApp()
})
const KAMPALA = { lat: 0.3476, lng: 32.5825, accuracyM: 20 }
const KAPCHORWA = { lat: 1.3988, lng: 34.45, accuracyM: 20 }
const verify = (body: object) => t.app.inject({ method: "POST", url: "/v1/verify", payload: body })
const repeats = async (who: string, q = "") => (await t.app.inject({ method: "GET", url: `/v1/repeat-scans${q}`, headers: await t.as(who) })).json() as { batchCode: string; serial: string; scans: number; places: number }[]

describe("codes scanned many times", () => {
  it("flags a code from its third scan: still genuine, but the owner is told", async () => {
    const c = t.code("E1", 9)
    for (let i = 0; i < 3; i++) expect((await verify({ payload: c.payload, position: KAMPALA })).json().verdict).toBe("GENUINE")
    const alerts = (await t.app.inject({ method: "GET", url: "/v1/alerts?limit=500", headers: await t.as(USERS.admin) })).json() as { type: string; priority: string; message: string }[]
    expect(alerts.some((a) => a.type === "DUPLICATE_SCANS" && a.priority === "low" && /3 times/.test(a.message))).toBe(true)
  })

  it("lists them for the admin and for the manufacturer who owns them, most scanned first", async () => {
    const c = t.code("E1", 9)
    const admin = await repeats(USERS.admin)
    const row = admin.find((r) => r.serial === c.serial && r.batchCode === c.batchCode)
    expect(row).toMatchObject({ scans: 3, places: 1 })
    expect((await repeats(USERS.maker)).some((r) => r.serial === c.serial && r.batchCode === c.batchCode)).toBe(true)
    expect(admin.map((r) => r.scans)).toEqual([...admin.map((r) => r.scans)].sort((a, b) => b - a))
  })

  it("a manufacturer does not see other manufacturers' codes", async () => {
    const other = t.code("E3", 2) // Kilimo's batch; the test maker is Pearl
    for (let i = 0; i < 3; i++) await verify({ payload: other.payload, position: KAPCHORWA })
    expect((await repeats(USERS.admin)).some((r) => r.batchCode === other.batchCode)).toBe(true)
    expect((await repeats(USERS.maker)).some((r) => r.batchCode === other.batchCode)).toBe(false)
  })

  it("respects the minimum", async () => {
    expect((await repeats(USERS.admin, "?min=50")).length).toBe(0)
  })
})
