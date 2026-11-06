import { describe, expect, it } from "vitest"
import {
  formatLookupCode,
  generateKeyPair,
  generateLookupCode,
  hashLookupCode,
  isValidLookupCode,
  normalizeLookupCode,
  parsePayload,
  signUnit,
  verifyPayload,
} from "./codes.ts"

describe("signed payloads", () => {
  const { privateKey, publicKey } = generateKeyPair()
  const payload = signUnit(privateKey, "B-1", "000123")

  it("has the format batchId.serial.signature", () => {
    const parsed = parsePayload(payload)
    expect(parsed).toMatchObject({ batchId: "B-1", serial: "000123" })
    expect(parsed!.signature.length).toBeGreaterThan(60)
  })

  it("verifies with the matching public key", () => {
    expect(verifyPayload(publicKey, payload)).toBe(true)
  })

  it("rejects another key", () => {
    expect(verifyPayload(generateKeyPair().publicKey, payload)).toBe(false)
  })

  it("rejects a changed serial or batch", () => {
    expect(verifyPayload(publicKey, payload.replace("000123", "000124"))).toBe(false)
    expect(verifyPayload(publicKey, payload.replace("B-1", "B-2"))).toBe(false)
  })

  it("rejects a tampered or truncated signature", () => {
    const [b, s, sig] = payload.split(".")
    const flipped = sig!.slice(0, -2) + (sig!.endsWith("AA") ? "BB" : "AA")
    expect(verifyPayload(publicKey, `${b}.${s}.${flipped}`)).toBe(false)
    expect(verifyPayload(publicKey, `${b}.${s}.${sig!.slice(0, 20)}`)).toBe(false)
  })

  it("rejects malformed input without throwing", () => {
    for (const bad of ["", "abc", "a.b", "a.b.c.d", "a b.c.d", "../x.y.zzzzzzzzzzzzzzzzzz", "B-1.1.!!!!!!!!!!!!!!!!!!!!"]) {
      expect(parsePayload(bad)).toBeNull()
      expect(verifyPayload(publicKey, bad)).toBe(false)
    }
  })

  it("returns false for a malformed public key instead of throwing", () => {
    expect(verifyPayload("zz", payload)).toBe(false)
  })

  it("refuses to sign ids containing dots or spaces", () => {
    expect(() => signUnit(privateKey, "a.b", "1")).toThrow()
    expect(() => signUnit(privateKey, "a", "1 2")).toThrow()
  })

  it("accepts surrounding whitespace from a scanner", () => {
    expect(verifyPayload(publicKey, `  ${payload}\n`)).toBe(true)
  })
})

describe("12-digit lookup codes", () => {
  it("generates 12 digits with a valid check digit", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateLookupCode()
      expect(c).toMatch(/^\d{12}$/)
      expect(isValidLookupCode(c)).toBe(true)
    }
  })

  it("catches any single-digit typo", () => {
    const c = generateLookupCode()
    for (let i = 0; i < 12; i++) {
      const wrong = (Number(c[i]) + 1) % 10
      expect(isValidLookupCode(c.slice(0, i) + wrong + c.slice(i + 1))).toBe(false)
    }
  })

  it("accepts spaces and dashes, rejects wrong length or letters", () => {
    const c = generateLookupCode()
    expect(isValidLookupCode(formatLookupCode(c))).toBe(true)
    expect(isValidLookupCode(c.replace(/(\d{4})(\d{4})/, "$1-$2-"))).toBe(true)
    expect(isValidLookupCode(c.slice(0, 11))).toBe(false)
    expect(isValidLookupCode(c + "0")).toBe(false)
    expect(isValidLookupCode("12345678901a")).toBe(false)
  })

  it("is not constant: codes differ", () => {
    expect(new Set(Array.from({ length: 50 }, generateLookupCode)).size).toBe(50)
  })

  it("formats in groups of four", () => {
    expect(formatLookupCode("123456789012")).toBe("1234 5678 9012")
    expect(normalizeLookupCode("1234 5678-9012")).toBe("123456789012")
  })

  it("hashes deterministically, ignoring formatting, and depends on the pepper", () => {
    const c = generateLookupCode()
    expect(hashLookupCode(c, "pepper")).toBe(hashLookupCode(formatLookupCode(c), "pepper"))
    expect(hashLookupCode(c, "pepper")).not.toBe(hashLookupCode(c, "other"))
    expect(hashLookupCode(c, "pepper")).toMatch(/^[0-9a-f]{64}$/)
  })
})
