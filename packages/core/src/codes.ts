import { ed25519 } from "@noble/curves/ed25519"
import { hmac } from "@noble/hashes/hmac"
import { sha256 } from "@noble/hashes/sha256"
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils"

/**
 * Signed code payload:  `<batchId>.<serial>.<signature>`
 *  - batchId, serial: letters, digits, `_` and `-` only (no dots).
 *  - signature: base64url Ed25519 signature over the UTF-8 bytes of `<batchId>.<serial>`.
 * The server keeps the private key; clients only ever hold public keys.
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

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

export interface ParsedPayload {
  batchId: string
  serial: string
  signature: string
}

/** Returns null for anything that is not a well-formed payload. */
export function parsePayload(payload: string): ParsedPayload | null {
  const parts = payload.trim().split(".")
  if (parts.length !== 3) return null
  const [batchId, serial, signature] = parts as [string, string, string]
  if (!ID_PATTERN.test(batchId) || !ID_PATTERN.test(serial)) return null
  if (!/^[A-Za-z0-9_-]{16,}$/.test(signature)) return null
  return { batchId, serial, signature }
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

/* ---------- 12-digit lookup code (scratch layer / USSD) ---------- */

/** Luhn check digit for a string of digits. */
function luhnCheckDigit(digits: string): number {
  let sum = 0
  // Walk from the right; the digit next to the check position is doubled.
  for (let i = digits.length - 1, double = true; i >= 0; i--, double = !double) {
    let d = digits.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return (10 - (sum % 10)) % 10
}

/** Removes spaces and dashes users may type. */
export function normalizeLookupCode(input: string): string {
  return input.replace(/[\s-]/g, "")
}

/** True if the input is 12 digits and its last digit is a valid Luhn check digit. */
export function isValidLookupCode(input: string): boolean {
  const code = normalizeLookupCode(input)
  if (!/^\d{12}$/.test(code)) return false
  return luhnCheckDigit(code.slice(0, 11)) === Number(code[11])
}

/** Uniform random digit string using rejection sampling (no modulo bias). */
function randomDigits(length: number): string {
  let out = ""
  const buf = new Uint8Array(32)
  while (out.length < length) {
    globalThis.crypto.getRandomValues(buf)
    for (const byte of buf) {
      if (byte < 250 && out.length < length) out += String(byte % 10)
    }
  }
  return out
}

/** 11 random digits + 1 check digit, so typos are caught before any lookup. */
export function generateLookupCode(): string {
  const body = randomDigits(11)
  return body + String(luhnCheckDigit(body))
}

/** "123456789012" → "1234 5678 9012" */
export function formatLookupCode(code: string): string {
  return normalizeLookupCode(code).replace(/(\d{4})(?=\d)/g, "$1 ")
}

/**
 * Keyed hash for storage. The code space is only 10^11, so a plain hash could
 * be brute-forced from a leaked table; the server-side pepper prevents that.
 */
export function hashLookupCode(code: string, pepper: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(pepper), utf8ToBytes(normalizeLookupCode(code))))
}
