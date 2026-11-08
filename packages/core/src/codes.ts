import { ed25519 } from "@noble/curves/ed25519"
import { hmac } from "@noble/hashes/hmac"
import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils"
import { ID_PATTERN, normalizeLookupCode, parsePayload } from "./light.ts"

// The light helpers (payload parsing, the 12-digit code) live in light.ts so apps can
// use them without loading the signature library; they are re-exported here so
// `@scanuganda/core` still offers everything from one place.
export * from "./light.ts"

/**
 * Signed code payload:  `<batchId>.<serial>.<signature>`
 *  - batchId, serial: letters, digits, `_` and `-` only (no dots).
 *  - signature: base64url Ed25519 signature over the UTF-8 bytes of `<batchId>.<serial>`.
 * The server keeps the private key; clients only ever hold public keys.
 */

export interface KeyPair {
  /** 32-byte seed, hex. Keep secret; never commit. */
  privateKey: string
  /** 32-byte public key, hex. Safe to distribute and cache on devices. */
  publicKey: string
}

export function generateKeyPair(): KeyPair {
  const priv = ed25519.utils.randomPrivateKey()
  return {
    privateKey: bytesToHex(priv),
    publicKey: bytesToHex(ed25519.getPublicKey(priv)),
  }
}

const b64urlEncode = (bytes: Uint8Array): string => {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const b64urlDecode = (s: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

export function signUnit(privateKey: string, batchId: string, serial: string): string {
  if (!ID_PATTERN.test(batchId) || !ID_PATTERN.test(serial)) {
    throw new Error("batchId and serial may only contain letters, digits, _ and -")
  }
  const sig = ed25519.sign(utf8ToBytes(`${batchId}.${serial}`), hexToBytes(privateKey))
  return `${batchId}.${serial}.${b64urlEncode(sig)}`
}

/** True only if the payload is well-formed and the signature matches `publicKey`. */
export function verifyPayload(publicKey: string, payload: string): boolean {
  const parsed = parsePayload(payload)
  if (!parsed) return false
  const sig = b64urlDecode(parsed.signature)
  if (!sig) return false
  try {
    return ed25519.verify(
      sig,
      utf8ToBytes(`${parsed.batchId}.${parsed.serial}`),
      hexToBytes(publicKey),
    )
  } catch {
    return false
  }
}

/**
 * Keyed hash for storage. The code space is only 10^11, so a plain hash could
 * be brute-forced from a leaked table; the server-side pepper prevents that.
 */
export function hashLookupCode(code: string, pepper: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(pepper), utf8ToBytes(normalizeLookupCode(code))))
}
