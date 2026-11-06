import { describe, expect, it } from "vitest"
import { generateKeyPair, signUnit } from "./codes.ts"
import { verifyOffline, type OfflineCache } from "./offline.ts"
import { HOUR, NOW, keys } from "./test-fixtures.ts"

const cache = (over: Partial<OfflineCache> = {}): OfflineCache => ({
  publicKeys: { k1: keys.publicKey },
  batches: { "B-1": { keyId: "k1", expiresAt: NOW + 100 * HOUR } },
  recalledBatchIds: [],
  syncedAt: NOW - HOUR,
  ...over,
})
const payload = signUnit(keys.privateKey, "B-1", "000001")

describe("verifyOffline (E7)", () => {
  it("never says GENUINE: a good code is CHECK, unconfirmed", () => {
    const r = verifyOffline(payload, cache(), NOW)
    expect(r.verdict).toBe("CHECK")
    expect(r.reasons[0]?.code).toBe("OFFLINE_UNCONFIRMED")
  })

  it("stops a forged signature", () => {
    const forged = signUnit(generateKeyPair().privateKey, "B-1", "000001")
    const r = verifyOffline(forged, cache(), NOW)
    expect(r.verdict).toBe("STOP")
    expect(r.reasons[0]?.code).toBe("INVALID_SIGNATURE")
  })

  it("stops garbage input", () => {
    for (const bad of ["", "hello", "a.b.c"]) {
      expect(verifyOffline(bad, cache(), NOW).verdict).toBe("STOP")
    }
  })

  it("stops a batch recalled as of the last sync", () => {
    const r = verifyOffline(payload, cache({ recalledBatchIds: ["B-1"] }), NOW)
    expect(r.verdict).toBe("STOP")
    expect(r.reasons[0]?.code).toBe("BATCH_RECALLED")
  })

  it("stops an expired batch", () => {
    const r = verifyOffline(payload, cache(), NOW + 200 * HOUR)
    expect(r.verdict).toBe("STOP")
    expect(r.reasons[0]?.code).toBe("BATCH_EXPIRED")
  })

  it("reports every stop reason together", () => {
    const r = verifyOffline(payload, cache({ recalledBatchIds: ["B-1"] }), NOW + 200 * HOUR)
    expect(r.reasons.map((x) => x.code)).toEqual(["BATCH_RECALLED", "BATCH_EXPIRED"])
  })

  it("does not call an unknown but well-formed batch fake: it may be newer than the sync", () => {
    const r = verifyOffline(signUnit(keys.privateKey, "B-NEW", "000001"), cache(), NOW)
    expect(r.verdict).toBe("CHECK")
    expect(r.reasons[0]?.message).toContain("offline list")
  })

  it("stops when the cached key for the batch is missing", () => {
    expect(verifyOffline(payload, cache({ publicKeys: {} }), NOW).verdict).toBe("STOP")
  })

  it("raises no alerts itself: the server does that on sync", () => {
    expect(verifyOffline(payload, cache({ recalledBatchIds: ["B-1"] }), NOW).alerts).toEqual([])
  })
})
