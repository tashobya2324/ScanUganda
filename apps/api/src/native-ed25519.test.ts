import { generateKeyPair, signUnit, verifyPayload } from "@scanuganda/core"
import { describe, expect, it } from "vitest"
import { verifyPayloadNative } from "./native-ed25519.ts"

/**
 * The server uses Node's native Ed25519; phones use the portable one. They must
 * never disagree, or a code could be genuine on one and forged on the other.
 */
describe("native Ed25519 agrees with the portable verifier", () => {
  const a = generateKeyPair()
  const b = generateKeyPair()
  const good = signUnit(a.privateKey, "BATCH01", "000123")
  const [batch, serial, sig] = good.split(".") as [string, string, string]
  const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1)

  const cases: [string, string, string][] = [
    ["valid", a.publicKey, good],
    ["valid, padded with whitespace", a.publicKey, `  ${good}\n`],
    ["another manufacturer's key", b.publicKey, good],
    ["changed batch", a.publicKey, `BATCH02.${serial}.${sig}`],
    ["changed serial", a.publicKey, `${batch}.000124.${sig}`],
    ["first signature character flipped", a.publicKey, `${batch}.${serial}.${flip(sig, 0)}`],
    ["last signature character flipped", a.publicKey, `${batch}.${serial}.${flip(sig, sig.length - 3)}`],
    ["truncated signature", a.publicKey, `${batch}.${serial}.${sig.slice(0, 40)}`],
    ["extended signature", a.publicKey, `${batch}.${serial}.${sig}AAAA`],
    ["not a code", a.publicKey, "https://example.com/menu"],
    ["empty", a.publicKey, ""],
    ["short public key", "abcd", good],
    ["non-hex public key", "zz".repeat(32), good],
    ["empty public key", "", good],
  ]

  it.each(cases)("%s", (_name, key, payload) => {
    expect(verifyPayloadNative(key, payload)).toBe(verifyPayload(key, payload))
  })

  it("accepts the genuine one and rejects the forged ones (so the table above is not all-false)", () => {
    expect(verifyPayloadNative(a.publicKey, good)).toBe(true)
    expect(verifyPayloadNative(b.publicKey, good)).toBe(false)
    expect(verifyPayloadNative(a.publicKey, `${batch}.${serial}.${flip(sig, 0)}`)).toBe(false)
  })

  it("agrees on many random keys and units", () => {
    for (let i = 0; i < 50; i++) {
      const k = generateKeyPair()
      const p = signUnit(k.privateKey, `B${i}`, String(i).padStart(6, "0"))
      expect(verifyPayloadNative(k.publicKey, p)).toBe(true)
      expect(verifyPayloadNative(k.publicKey, p.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBe(verifyPayload(k.publicKey, p.replace(/.$/, (c) => (c === "A" ? "B" : "A"))))
    }
  })
})
