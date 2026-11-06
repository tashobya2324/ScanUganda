import { ApiError, api, type SyncResult } from "./api"
import { db, type QueuedScan, type ScanRecord } from "./db"
import { flushQueue, refreshCache } from "./sync"
import { freshDatabase, makeWorld, outcome, NOW } from "../test-utils"

beforeEach(freshDatabase)
afterEach(() => vi.restoreAllMocks())

const queued = (id: string): QueuedScan => ({ clientId: id, payload: "p." + id, scannedAt: NOW, scannerRole: "consumer" })
const record = (id: string, over: Partial<ScanRecord> = {}): ScanRecord => ({
  id, at: NOW, source: "qr", label: "QR · 1", status: "offline", verdict: "CHECK",
  reasons: [{ code: "OFFLINE_UNCONFIRMED", message: "Checked offline." }], product: null, ...over,
})
const ok = (id: string, verdict: "GENUINE" | "CHECK" | "STOP"): SyncResult => ({ clientId: id, ok: true, outcome: outcome(verdict) as never })

async function seed(...ids: string[]) {
  for (const id of ids) {
    await db.queueAdd(queued(id))
    await db.historyPut(record(id))
  }
}

describe("flushQueue", () => {
  it("does nothing when the queue is empty", async () => {
    const upload = vi.spyOn(api, "uploadScans")
    expect(await flushQueue()).toEqual({ uploaded: 0, worsened: 0, remaining: 0 })
    expect(upload).not.toHaveBeenCalled()
  })

  it("confirms each scan with the server's verdict and empties the queue", async () => {
    await seed("a", "b")
    vi.spyOn(api, "uploadScans").mockResolvedValue({ results: [ok("a", "GENUINE"), ok("b", "CHECK")] })
    expect(await flushQueue()).toMatchObject({ uploaded: 2, remaining: 0 })
    expect(await db.historyGet("a")).toMatchObject({ status: "confirmed", verdict: "GENUINE", serverScanId: "srv-1" })
    expect((await db.historyGet("a"))?.product?.productName).toBe("Premium White Sugar")
    expect(await db.queueCount()).toBe(0)
  })

  it("flags a scan the server found unsafe after the phone said CHECK", async () => {
    await seed("a", "b")
    vi.spyOn(api, "uploadScans").mockResolvedValue({ results: [ok("a", "STOP"), ok("b", "GENUINE")] })
    expect((await flushQueue()).worsened).toBe(1)
    expect((await db.historyGet("a"))?.worsened).toBe(true)
    expect((await db.historyGet("b"))?.worsened).toBeUndefined()
  })

  it("does not flag a scan that was already STOP offline", async () => {
    await db.queueAdd(queued("a"))
    await db.historyPut(record("a", { verdict: "STOP" }))
    vi.spyOn(api, "uploadScans").mockResolvedValue({ results: [ok("a", "STOP")] })
    expect((await flushQueue()).worsened).toBe(0)
  })

  it("keeps the queue when there is still no connection, so nothing is lost", async () => {
    await seed("a")
    vi.spyOn(api, "uploadScans").mockRejectedValue(new ApiError(0, "NETWORK", "down"))
    expect(await flushQueue()).toMatchObject({ uploaded: 0, remaining: 1 })
    expect(await db.queueCount()).toBe(1)
    expect((await db.historyGet("a"))?.status).toBe("offline")
  })

  it("keeps the queue when rate limited, and surfaces unexpected errors", async () => {
    await seed("a")
    vi.spyOn(api, "uploadScans").mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", "slow"))
    expect((await flushQueue()).remaining).toBe(1)
    vi.spyOn(api, "uploadScans").mockRejectedValueOnce(new ApiError(500, "INTERNAL", "bug"))
    await expect(flushQueue()).rejects.toMatchObject({ status: 500 })
    expect(await db.queueCount()).toBe(1)
  })

  it("drops scans the server refuses and marks them rejected", async () => {
    await seed("a")
    vi.spyOn(api, "uploadScans").mockResolvedValue({ results: [{ clientId: "a", ok: false, error: { code: "SCAN_TOO_OLD", message: "Scan is older than 30 days" } }] })
    await flushQueue()
    expect(await db.queueCount()).toBe(0)
    expect(await db.historyGet("a")).toMatchObject({ status: "rejected" })
  })

  it("uploads in chunks of 50", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `scan-${String(i).padStart(3, "0")}`)
    await seed(...ids)
    const upload = vi.spyOn(api, "uploadScans").mockImplementation(async (scans) => ({ results: scans.map((s) => ok(s.clientId, "GENUINE")) }))
    expect((await flushQueue()).uploaded).toBe(120)
    expect(upload.mock.calls.map((c) => c[0].length)).toEqual([50, 50, 20])
  })

  it("runs one upload at a time however often it is called", async () => {
    await seed("a")
    const upload = vi.spyOn(api, "uploadScans").mockResolvedValue({ results: [ok("a", "GENUINE")] })
    await Promise.all([flushQueue(), flushQueue(), flushQueue()])
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it("survives a history record that was cleared while queued", async () => {
    await db.queueAdd(queued("gone"))
    vi.spyOn(api, "uploadScans").mockResolvedValue({ results: [ok("gone", "GENUINE")] })
    expect((await flushQueue()).remaining).toBe(0)
  })
})

describe("refreshCache", () => {
  it("stores the offline list", async () => {
    const w = makeWorld()
    vi.spyOn(api, "sync").mockResolvedValue(w.cache as never)
    expect(await refreshCache()).toBe("updated")
    expect((await db.getCache())?.recalledBatchIds).toEqual(["BATCH02"])
  })

  it("reports offline without throwing, and keeps the old list", async () => {
    const w = makeWorld()
    await db.setCache(w.cache)
    vi.spyOn(api, "sync").mockRejectedValue(new ApiError(0, "NETWORK", "down"))
    expect(await refreshCache()).toBe("offline")
    expect((await db.getCache())?.syncedAt).toBe(w.cache.syncedAt)
  })
})
