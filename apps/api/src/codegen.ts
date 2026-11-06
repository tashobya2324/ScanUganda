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
export function generateUnits(
  store: Store,
  keys: KeyStore,
  pepper: string,
  batch: { id: string; keyId: string },
  count: number,
): GeneratedUnit[] {
  const privateKey = keys.getPrivate(batch.keyId)
  if (!privateKey) {
    throw new HttpError(503, "SIGNING_KEY_UNAVAILABLE", "This server does not hold the signing key for this batch")
  }
  return store.tx(() => {
    const start = store.nextSerial(batch.id)
    return Array.from({ length: count }, (_, i) => {
      const serial = String(start + i).padStart(6, "0")
      for (let attempt = 0; ; attempt++) {
        const lookupCode = generateLookupCode()
        try {
          store.insertUnit(batch.id, serial, hashLookupCode(lookupCode, pepper))
          return { serial, payload: signUnit(privateKey, batch.id, serial), lookupCode }
        } catch (e) {
          // The lookup hash is unique; a collision is astronomically rare, so retry a few times.
          if (attempt >= 5) throw e
        }
      }
    })
  })
}
