/**
 * The phone's own database (IndexedDB): the offline list from the server, scans
 * waiting to be uploaded, and the scan history. Small hand-written wrapper so
 * there is nothing to download before the app works.
 */
import type { OfflineCache, Reason, Verdict } from "@scanuganda/core"

export interface ProductInfo {
  productName: string
  packSize: string
  category: string
  manufacturer: string
  batchCode: string
  manufacturedAt: number
  expiresAt: number
}

/**
 * - confirmed: the server judged it.
 * - offline: judged on the phone only (best answer is CHECK); will be re-judged on sync.
 * - waiting: a typed code saved while offline; no verdict yet.
 * - rejected: the server refused to record it (not one of our codes).
 */
export type ScanStatus = "confirmed" | "offline" | "waiting" | "rejected"

export interface ScanRecord {
  id: string
  at: number
  source: "qr" | "code"
  /** For history display, e.g. "•••• •••• 9012". The full code is kept only in the upload queue. */
  label: string
  status: ScanStatus
  verdict: Verdict | null
  reasons: Reason[]
  product: ProductInfo | null
  position?: { lat: number; lng: number; accuracyM?: number }
  /** The server's id for this scan, used to link a report to it. */
  serverScanId?: string
  /** Set when a later server check turned an offline CHECK into STOP: the user must be told. */
  worsened?: boolean
}

export interface QueuedScan {
  clientId: string
  payload?: string
  code?: string
  scannedAt: number
  position?: { lat: number; lng: number; accuracyM?: number }
  scannerRole: "consumer" | "retailer"
}

export interface CacheSnapshot extends OfflineCache {
  regions: unknown[]
}

const DB_NAME = "scanuganda"
const VERSION = 1

let opened: Promise<IDBDatabase> | undefined

function open(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore("kv")
      db.createObjectStore("queue", { keyPath: "clientId" })
      db.createObjectStore("history", { keyPath: "id" }).createIndex("at", "at")
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return opened
}

/** Forget the open connection (used by tests that swap in a fresh database). */
export function resetDbConnection() {
  opened = undefined
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(req.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const db = {
  getCache: () => run<CacheSnapshot | undefined>("kv", "readonly", (s) => s.get("cache")),
  setCache: (c: CacheSnapshot) => run("kv", "readwrite", (s) => s.put(c, "cache")),

  queueAdd: (q: QueuedScan) => run("queue", "readwrite", (s) => s.put(q)),
  queueAll: () => run<QueuedScan[]>("queue", "readonly", (s) => s.getAll()),
  queueDelete: (clientId: string) => run("queue", "readwrite", (s) => s.delete(clientId)),
  queueCount: () => run<number>("queue", "readonly", (s) => s.count()),

  historyPut: (r: ScanRecord) => run("history", "readwrite", (s) => s.put(r)),
  historyGet: (id: string) => run<ScanRecord | undefined>("history", "readonly", (s) => s.get(id)),
  historyClear: () => run("history", "readwrite", (s) => s.clear()),
  /** Newest first. */
  async historyAll(limit = 200): Promise<ScanRecord[]> {
    const all = await run<ScanRecord[]>("history", "readonly", (s) => s.getAll())
    return all.sort((a, b) => b.at - a.at).slice(0, limit)
  },
}
