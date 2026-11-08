/**
 * The small, dependency-free half of the code handling: reading a signed payload and
 * working with the 12-digit code. Apps import this (as "@scanuganda/core/light") for
 * what they need on every screen, and load the heavy signature code (`codes.ts`, which
 * brings in the Ed25519 library) only when a signature actually has to be checked.
 */

/** Letters, digits, `_` and `-` only: no dots, so the payload splits cleanly. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

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
