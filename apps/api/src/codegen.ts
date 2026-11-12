import { generateLookupCode, hashLookupCode, signUnit } from "@scanuganda/core"
import { HttpError } from "./http.ts"
import type { KeyStore } from "./keys.ts"
import type { Store } from "./store.ts"

export interface GeneratedUnit {
  serial: string
  /** Goes in the QR code. */
  payload: string
  /** 12 digits under the scratch layer. Stored only as a keyed hash: shown once. */
  lookupCode: string
}

/** Creates `count` units for a batch and returns their printable codes. Atomic. */
export async function generateUnits(
  store: Store,
  keys: KeyStore,
  pepper: string,
  batch: { id: string; keyId: string },
  count: number,
): Promise<GeneratedUnit[]> {
  const privateKey = await keys.getPrivate(batch.keyId, store)
  if (!privateKey) {
    throw new HttpError(503, "SIGNING_KEY_UNAVAILABLE", "This server does not hold the signing key for this batch")
  }
  return store.tx(async (s) => {
    const start = await s.nextSerial(batch.id)
    const units: GeneratedUnit[] = []
    for (let i = 0; i < count; i++) {
      const serial = String(start + i).padStart(6, "0")
      for (let attempt = 0; ; attempt++) {
        const lookupCode = generateLookupCode()
        // The lookup hash is unique; a collision is astronomically rare, so draw again a few times.
        if (await s.insertUnit(batch.id, serial, hashLookupCode(lookupCode, pepper))) {
          units.push({ serial, payload: signUnit(privateKey, batch.id, serial), lookupCode })
          break
        }
        if (attempt >= 5) throw new Error("Could not draw a unique lookup code")
      }
    }
    return units
  })
}
