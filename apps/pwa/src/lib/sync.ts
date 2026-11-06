import type { ReasonCode } from "@scanuganda/core"
import { ApiError, api } from "./api"
import { notifyChange } from "./bus"
import { db, type QueuedScan, type ScanRecord } from "./db"

const CHUNK = 50
/** Offline lists older than this are flagged: a recall may have been missed. */
export const STALE_AFTER_MS = 7 * 24 * 3_600_000

export type CacheResult = "updated" | "offline"

/** Downloads the offline list (public keys, batches, recalls). */
export async function refreshCache(): Promise<CacheResult> {
  try {
    const snapshot = await api.sync()
    await db.setCache(snapshot)
    notifyChange()
    return "updated"
  } catch (e) {
    if (e instanceof ApiError && e.unreachable) return "offline"
    throw e
  }
}

export interface FlushResult {
  uploaded: number
  /** Scans the server judged more severely than the phone did (e.g. offline CHECK → STOP). */
  worsened: number
  remaining: number
}

let inFlight: Promise<FlushResult> | undefined

/** Uploads queued scans. Safe to call often and to retry: the server ignores repeats. */
export function flushQueue(): Promise<FlushResult> {
  inFlight ??= doFlush().finally(() => {
    inFlight = undefined
  })
  return inFlight
}

async function doFlush(): Promise<FlushResult> {
  const queue = await db.queueAll()
  let uploaded = 0
  let worsened = 0

  for (let i = 0; i < queue.length; i += CHUNK) {
    const chunk: QueuedScan[] = queue.slice(i, i + CHUNK)
    let results
    try {
      results = (await api.uploadScans(chunk)).results
    } catch (e) {
      if (e instanceof ApiError && (e.unreachable || e.status === 429)) break // try again later
      throw e
    }
    for (const r of results) {
      const record = await db.historyGet(r.clientId)
      if (r.ok) {
        const updated: ScanRecord | undefined = record && {
          ...record,
          status: "confirmed",
          verdict: r.outcome.verdict,
          reasons: r.outcome.reasons,
          product: r.outcome.product,
          serverScanId: r.outcome.scanId,
          worsened: record.verdict !== "STOP" && r.outcome.verdict === "STOP" ? true : record.worsened,
        }
        if (updated) {
          await db.historyPut(updated)
          if (updated.worsened && !record?.worsened) worsened++
        }
        uploaded++
      } else if (record) {
        await db.historyPut({ ...record, status: "rejected", reasons: [{ code: r.error.code as ReasonCode, message: r.error.message }] })
      }
      await db.queueDelete(r.clientId) // answered, one way or the other
    }
  }

  const remaining = await db.queueCount()
  if (uploaded || worsened || remaining !== queue.length) notifyChange()
  return { uploaded, worsened, remaining }
}

/**
 * Keeps the phone current: updates the offline list and uploads queued scans on
 * start, when the network returns, when the app comes back to the foreground,
 * and every minute while scans are waiting. Returns a stop function.
 */
export function startAutoSync(): () => void {
  const run = async () => {
    if (navigator.onLine === false) return
    try {
      await flushQueue()
      const cache = await db.getCache()
      if (!cache || Date.now() - cache.syncedAt > 6 * 3_600_000) await refreshCache()
    } catch {
      // Nothing to do: the next trigger retries.
    }
  }
  const onVisible = () => document.visibilityState === "visible" && void run()
  window.addEventListener("online", run)
  document.addEventListener("visibilitychange", onVisible)
  const timer = setInterval(async () => {
    if ((await db.queueCount()) > 0) void run()
  }, 60_000)
  void run()
  return () => {
    window.removeEventListener("online", run)
    document.removeEventListener("visibilitychange", onVisible)
    clearInterval(timer)
  }
}
