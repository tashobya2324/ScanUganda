import { generateLookupCode } from "@scanuganda/core"
import { ApiError, api } from "./api"
import { db } from "./db"
import { InputError, checkScan } from "./scan"
import { freshDatabase, makeWorld, outcome, NOW } from "../test-utils"

vi.mock("./geo", () => ({ getPosition: async () => ({ lat: 0.3476, lng: 32.5825, accuracyM: 20 }) }))

const offline = () => vi.spyOn(api, "verify").mockRejectedValue(new ApiError(0, "NETWORK", "Cannot reach the server."))

beforeEach(freshDatabase)
afterEach(() => vi.restoreAllMocks())

describe("input checks happen on the phone, before any request", () => {
  it("rejects a QR that is not ours without calling the server or recording anything", async () => {
    const verify = vi.spyOn(api, "verify")
    await expect(checkScan({ payload: "https://example.com/menu" })).rejects.toMatchObject({ code: "NOT_A_SCANUGANDA_CODE" })
    expect(verify).not.toHaveBeenCalled()
    expect(await db.historyAll()).toHaveLength(0)
  })

  it("rejects a mistyped 12-digit code (bad check digit) locally", async () => {
    const verify = vi.spyOn(api, "verify")
    const good = generateLookupCode()
    const typo = good.slice(0, 11) + String((Number(good[11]) + 1) % 10)
    await expect(checkScan({ code: typo })).rejects.toBeInstanceOf(InputError)
    await expect(checkScan({ code: "12345" })).rejects.toMatchObject({ code: "INVALID_CODE_FORMAT" })
    expect(verify).not.toHaveBeenCalled()
  })
})

describe("online", () => {
  it("records the server's verdict, product and scan id", async () => {
    const w = makeWorld()
    const verify = vi.spyOn(api, "verify").mockResolvedValue(outcome("GENUINE") as never)
    const r = await checkScan({ payload: w.payload }, NOW)
    expect(r).toMatchObject({ status: "confirmed", verdict: "GENUINE", serverScanId: "srv-1", source: "qr" })
    expect(r.product?.productName).toBe("Premium White Sugar")
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ payload: w.payload, scannerRole: "consumer", position: { lat: 0.3476, lng: 32.5825, accuracyM: 20 } }))
    expect(await db.historyGet(r.id)).toEqual(r)
    expect(await db.queueCount()).toBe(0)
  })

  it("turns the server's 'not a code' refusal into an InputError", async () => {
    vi.spyOn(api, "verify").mockRejectedValue(new ApiError(422, "NOT_A_SCANUGANDA_CODE", "Not ours"))
    await expect(checkScan({ payload: makeWorld().payload })).rejects.toBeInstanceOf(InputError)
  })

  it("passes other server errors (rate limit, 500) to the caller and queues nothing", async () => {
    vi.spyOn(api, "verify").mockRejectedValue(new ApiError(429, "RATE_LIMITED", "Slow down"))
    await expect(checkScan({ payload: makeWorld().payload })).rejects.toMatchObject({ status: 429 })
    vi.spyOn(api, "verify").mockRejectedValue(new ApiError(500, "INTERNAL", "Oops"))
    await expect(checkScan({ payload: makeWorld().payload })).rejects.toMatchObject({ status: 500 })
    expect(await db.queueCount()).toBe(0)
    expect(await db.historyAll()).toHaveLength(0)
  })

  it("judges a shopkeeper's scan as retailer", async () => {
    localStorage.setItem("scanuganda.prefs", JSON.stringify({ role: "retailer" }))
    vi.resetModules()
    const { checkScan: fresh } = await import("./scan")
    const { api: freshApi } = await import("./api")
    const verify = vi.spyOn(freshApi, "verify").mockResolvedValue(outcome("GENUINE") as never)
    await fresh({ payload: makeWorld().payload })
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ scannerRole: "retailer" }))
  })
})

describe("offline", () => {
  it("a good QR is only ever CHECK (unconfirmed) and is queued for the server", async () => {
    const w = makeWorld()
    await db.setCache(w.cache)
    offline()
    const r = await checkScan({ payload: w.payload }, NOW)
    expect(r).toMatchObject({ status: "offline", verdict: "CHECK" })
    expect(r.reasons[0]?.code).toBe("OFFLINE_UNCONFIRMED")
    const [queued] = await db.queueAll()
    expect(queued).toMatchObject({ clientId: r.id, payload: w.payload, scannedAt: NOW, scannerRole: "consumer" })
    expect(queued?.position).toEqual({ lat: 0.3476, lng: 32.5825, accuracyM: 20 })
  })

  it("stops a forged code and a recalled batch on the phone", async () => {
    const w = makeWorld()
    await db.setCache(w.cache)
    offline()
    expect((await checkScan({ payload: w.forged }, NOW)).reasons[0]?.code).toBe("INVALID_SIGNATURE")
    const recalled = await checkScan({ payload: w.recalledPayload }, NOW)
    expect(recalled.verdict).toBe("STOP")
    expect(recalled.reasons[0]?.code).toBe("BATCH_RECALLED")
  })

  it("does not call a batch newer than the last sync fake", async () => {
    const w = makeWorld()
    await db.setCache(w.cache)
    offline()
    const r = await checkScan({ payload: w.unknownBatchPayload }, NOW)
    expect(r.verdict).toBe("CHECK")
  })

  it("with no offline list yet, says so instead of guessing", async () => {
    offline()
    const r = await checkScan({ payload: makeWorld().payload }, NOW)
    expect(r.verdict).toBe("CHECK")
    expect(r.reasons[0]?.message).toContain("No offline list")
  })

  it("a typed code is saved, not judged: waiting, with the full code only in the queue", async () => {
    offline()
    const code = generateLookupCode()
    const r = await checkScan({ code }, NOW)
    expect(r).toMatchObject({ status: "waiting", verdict: null, source: "code" })
    expect(r.label).toBe(`•••• •••• ${code.slice(-4)}`)
    expect(JSON.stringify(await db.historyAll())).not.toContain(code)
    expect((await db.queueAll())[0]?.code).toBe(code)
  })

  it("also falls back when the gateway is down (502)", async () => {
    vi.spyOn(api, "verify").mockRejectedValue(new ApiError(502, "ERROR", "Bad gateway"))
    const r = await checkScan({ code: generateLookupCode() }, NOW)
    expect(r.status).toBe("waiting")
  })
})
