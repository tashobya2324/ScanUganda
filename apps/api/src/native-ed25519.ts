import { createPublicKey, verify, type KeyObject } from "node:crypto"
import { parsePayload } from "@scanuganda/core"

/**
 * Ed25519 signature check using Node's built-in crypto: about 100 times faster than
 * the portable JavaScript version the phones use, which matters when every shopper's
 * QR scan is checked on the server. It must give the same answers as core's
 * `verifyPayload`; a test compares them on valid, tampered and malformed input.
 */

// DER prefix that wraps a raw 32-byte Ed25519 public key as SubjectPublicKeyInfo.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex")
const keyObjects = new Map<string, KeyObject | null>()

function keyFor(publicKeyHex: string): KeyObject | null {
  let key = keyObjects.get(publicKeyHex)
  if (key === undefined) {
    try {
      const raw = Buffer.from(publicKeyHex, "hex")
      key = raw.length === 32 ? createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" }) : null
    } catch {
      key = null
    }
    if (keyObjects.size > 1000) keyObjects.clear() // public keys are few; this only guards against abuse
    keyObjects.set(publicKeyHex, key)
  }
  return key
}

export function verifyPayloadNative(publicKeyHex: string, payload: string): boolean {
  const parsed = parsePayload(payload)
  if (!parsed) return false
  const key = keyFor(publicKeyHex)
  if (!key) return false
  try {
    return verify(null, Buffer.from(`${parsed.batchId}.${parsed.serial}`), key, Buffer.from(parsed.signature, "base64url"))
  } catch {
    return false
  }
}
