import { beforeAll, describe, expect, it } from "vitest"
import { makeTestApp } from "./test-helpers.ts"

let t: Awaited<ReturnType<typeof makeTestApp>>
beforeAll(async () => {
  t = await makeTestApp()
})
const KAMPALA = { lat: 0.3476, lng: 32.5825, accuracyM: 20 }
const verify = (body: object) => t.app.inject({ method: "POST", url: "/v1/verify", payload: body })
const bought = (scanId: string) => t.app.inject({ method: "POST", url: `/v1/scans/${scanId}/bought` })

describe("buyer marks an item as bought", () => {
  it("deactivates the code on the spot: the next scan is STOP", async () => {
    const c = t.code("E1", 6)
    const first = (await verify({ payload: c.payload, position: KAMPALA })).json()
    expect(first.verdict).toBe("GENUINE")

    const done = await bought(first.scanId) // no sign-in needed
    expect(done.statusCode).toBe(200)
    expect(done.json()).toMatchObject({ alreadyBought: false })

    const again = (await verify({ payload: c.payload, position: KAMPALA })).json()
    expect(again.verdict).toBe("STOP")
    expect(again.reasons.map((r: { code: string }) => r.code)).toContain("ALREADY_BOUGHT")
    // The 12-digit code is deactivated too, not only the QR.
    expect((await verify({ code: c.lookupCode })).json().verdict).toBe("STOP")
  })

  it("keeps the first buyer's time if it is pressed twice", async () => {
    const c = t.code("E1", 7)
    const first = (await verify({ payload: c.payload })).json()
    expect((await bought(first.scanId)).json().alreadyBought).toBe(false)
    expect((await bought(first.scanId)).json().alreadyBought).toBe(true)
  })

  it("only a genuine result can be marked as bought; unknown scans are 404", async () => {
    const c = t.code("E6", 0) // recalled batch → STOP
    const stopped = (await verify({ payload: c.payload })).json()
    expect(stopped.verdict).toBe("STOP")
    const res = await bought(stopped.scanId)
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe("NOT_GENUINE")
    expect((await bought("no-such-scan")).statusCode).toBe(404)
  })
})
