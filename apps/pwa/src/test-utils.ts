import { generateKeyPair, signUnit } from "@scanuganda/core"
import { IDBFactory } from "fake-indexeddb"
import { resetDbConnection, type CacheSnapshot } from "./lib/db"

/** A fresh, empty phone database for each test. */
export function freshDatabase() {
  globalThis.indexedDB = new IDBFactory()
  resetDbConnection()
  localStorage.clear()
}

export const NOW = Date.UTC(2026, 10, 6, 10, 0, 0)

/** Real keys and codes, so offline verification is exercised for real. */
export function makeWorld() {
  const keys = generateKeyPair()
  const payload = signUnit(keys.privateKey, "BATCH01", "000123")
  const recalledPayload = signUnit(keys.privateKey, "BATCH02", "000001")
  const unknownBatchPayload = signUnit(keys.privateKey, "NEWBATCH", "000001")
  const forged = payload.slice(0, -6) + (payload.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA")
  const cache: CacheSnapshot = {
    syncedAt: NOW - 3_600_000,
    publicKeys: { k1: keys.publicKey },
    batches: {
      BATCH01: { keyId: "k1", expiresAt: NOW + 100 * 86_400_000 },
      BATCH02: { keyId: "k1", expiresAt: NOW + 100 * 86_400_000 },
    },
    recalledBatchIds: ["BATCH02"],
    regions: [],
  }
  return { keys, payload, recalledPayload, unknownBatchPayload, forged, cache }
}

export const outcome = (verdict: "GENUINE" | "CHECK" | "STOP", over: Record<string, unknown> = {}) => ({
  scanId: "srv-1",
  verdict,
  reasons: verdict === "GENUINE" ? [] : [{ code: "BATCH_RECALLED", message: "This batch was recalled: test" }],
  product: {
    productName: "Premium White Sugar",
    packSize: "1 kg packet",
    category: "FOOD",
    manufacturer: "Pearl Sugar Works",
    batchCode: "PS-2408-17",
    manufacturedAt: NOW - 86_400_000,
    expiresAt: NOW + 86_400_000,
  },
  duplicate: false,
  ...over,
})
