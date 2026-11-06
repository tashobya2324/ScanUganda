/** Shared sample data for tests. Not exported from the package. */
import { generateKeyPair, generateLookupCode, signUnit, type KeyPair } from "./codes.ts"
import type { Batch, Position, Region, ScanContext, Unit } from "./types.ts"
import type { VerifyInput } from "./verify.ts"

export const HOUR = 3_600_000
export const NOW = Date.UTC(2026, 10, 6, 10, 0, 0)

export const regions: Region[] = [
  { id: "kampala", name: "Kampala", center: { lat: 0.3476, lng: 32.5825 }, radiusKm: 15 },
  { id: "jinja", name: "Jinja", center: { lat: 0.4244, lng: 33.2041 }, radiusKm: 15 },
  { id: "fortportal", name: "Fort Portal", center: { lat: 0.671, lng: 30.275 }, radiusKm: 12 },
  { id: "kapchorwa", name: "Kapchorwa", center: { lat: 1.3988, lng: 34.45 }, radiusKm: 20 },
]

export const at = (id: string): Position => ({ ...regions.find((r) => r.id === id)!.center })

export const keys: KeyPair = generateKeyPair()

export function makeBatch(over: Partial<Batch> = {}): Batch {
  return {
    id: "B-KS-2408-17",
    productId: "p-sugar",
    manufacturerId: "m-kakira",
    batchCode: "KS-2408-17",
    keyId: "k1",
    manufacturedAt: NOW - 90 * 24 * HOUR,
    expiresAt: NOW + 365 * 24 * HOUR,
    designatedRegionIds: [],
    recall: null,
    ...over,
  }
}

export function makeUnit(over: Partial<Unit> = {}): Unit {
  return { serial: "000123", batchId: "B-KS-2408-17", lifecycle: "AT_DISTRIBUTOR", ...over }
}

export function makeContext(over: Partial<ScanContext> = {}): ScanContext {
  return { at: NOW, channel: "PWA", scannerRole: "consumer", position: at("kampala"), ...over }
}

/** A valid, signed, in-region, never-scanned unit. Override pieces per test. */
export function makeInput(over: Partial<VerifyInput> = {}): VerifyInput {
  const batch = over.batch === undefined ? makeBatch() : over.batch
  const unit = over.unit === undefined ? makeUnit() : over.unit
  return {
    credential: {
      kind: "signed",
      payload: signUnit(keys.privateKey, batch?.id ?? "B-KS-2408-17", unit?.serial ?? "000123"),
    },
    batch,
    unit,
    publicKeys: { k1: keys.publicKey },
    regions,
    priorScans: [],
    context: makeContext(),
    ...over,
  }
}

export const sampleLookupCode = generateLookupCode()
