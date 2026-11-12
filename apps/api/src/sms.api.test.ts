import { generateLookupCode } from "@scanuganda/core"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { buildApp } from "./app.ts"
import { composeVerdict, toGsm, truncate } from "./channel-text.ts"
import { SlidingWindow } from "./limiter.ts"
import { AfricasTalkingSms, parseSms } from "./sms.ts"
import { loadConfig } from "./config.ts"
import { makeTestApp, testable, type TestApp } from "./test-helpers.ts"

type T = Awaited<ReturnType<typeof makeTestApp>>
let t: T
let app: TestApp
const sent: { to: string; message: string }[] = []
let failSend = false

beforeAll(async () => {
  t = await makeTestApp()
  app = testable(buildApp({
    store: t.store,
    keys: t.keys,
    config: t.config,
    sms: { send: async (to, message) => { if (failSend) throw new Error("provider down"); sent.push({ to, message }) } },
  }))
})

let n = 0
const text = (body: string, from = `+2567111${String(++n).padStart(5, "0")}`) =>
  app.inject({ method: "POST", url: "/v1/sms", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams({ from, to: "20284", text: body }).toString() })
const code = (s: string, i = 0) => t.code(s, i).lookupCode

describe("SMS check", () => {
  it("replies to a bare code, and sends the reply to the sender", async () => {
    sent.length = 0
    const res = await text(code("E1", 0), "+256700123456")
    expect(res.json()).toMatchObject({ ok: true, delivered: true })
    expect(res.json().reply).toBe("GENUINE. Premium White Sugar 1 kg packet, batch PS-2408-17. Safe to buy.")
    expect(sent).toEqual([{ to: "+256700123456", message: res.json().reply }])
  })

  it("accepts a CHECK prefix and spaced or dashed digits", async () => {
    const c = code("E1", 1)
    expect((await text(`CHECK ${c.slice(0, 4)} ${c.slice(4, 8)} ${c.slice(8)}`)).json().reply).toMatch(/^GENUINE/)
    expect((await text(`check ${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`)).json().reply).toMatch(/^GENUINE/)
  })

  it("uses a town in the message as the location", async () => {
    expect((await text(`${code("E3", 0)} Kampala`)).json().reply).toMatch(/^CHECK\. Wait before you buy\. This batch is meant for Kapchorwa/)
    expect((await text(`${code("E3", 1)} kapchorwa`)).json().reply).toMatch(/^GENUINE/)
  })

  it("STOP for a recalled batch, within one SMS", async () => {
    const reply = (await text(code("E6", 0))).json().reply as string
    expect(reply).toMatch(/^STOP\. Do not buy or use\. This batch was recalled/)
    expect(reply.length).toBeLessThanOrEqual(160)
  })

  it("explains what to send when there is no code, or a bad one", async () => {
    expect((await text("hello")).json().reply).toMatch(/^Send the 12-digit code/)
    const good = generateLookupCode()
    const typo = good.slice(0, 11) + String((Number(good[11]) + 1) % 10)
    expect((await text(typo)).json().reply).toBe("That code does not look right. Check each digit and send it again.")
  })

  it("keeps the answer even if the provider fails to deliver it", async () => {
    failSend = true
    const res = await text(code("E1", 2))
    failSend = false
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true, delivered: false })
  })

  it("limits one number to 15 checks per window, shared with USSD", async () => {
    const phone = "+256700999111"
    for (let i = 0; i < 15; i++) expect((await text(code("E1", 3), phone)).json().reply).toMatch(/^GENUINE|^CHECK|^STOP/)
    expect((await text(code("E1", 3), phone)).json().reply).toBe("Too many checks from this number. Please try again later.")
  })

  it("rejects malformed callbacks", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/sms", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "text=hi" })
    expect(res.statusCode).toBe(400)
  })
})

describe("parseSms", () => {
  const regions = [
    { id: "a", name: "Fort Portal", center: { lat: 0, lng: 0 }, radiusKm: 1 },
    { id: "b", name: "Mbale", center: { lat: 0, lng: 0 }, radiusKm: 1 },
  ]
  it("finds the code and the town anywhere in the text", () => {
    expect(parseSms("Check 1234 5678 9012 in fort portal please", regions)).toMatchObject({ code: "123456789012", region: { id: "a" } })
    expect(parseSms("mbale 123456789012", regions).region?.id).toBe("b")
  })
  it("does not mistake part of a longer number or a stranger word for either", () => {
    expect(parseSms("12345", regions)).toEqual({ code: null, region: undefined })
    expect(parseSms("123456789012 Kampalaaa", regions).region).toBeUndefined()
  })
})

describe("text for small screens", () => {
  it("replaces characters a basic phone cannot show", () => {
    expect(toGsm("Café “quoted” – dash… [x] a|b")).toBe('Cafe "quoted" - dash... (x) a b')
    expect(toGsm("emoji 😀 here")).toBe("emoji ? here")
  })

  it("truncate adds dots only when it cuts", () => {
    expect(truncate("short", 10)).toBe("short")
    expect(truncate("0123456789", 8)).toBe("01234...")
  })

  const product = { productName: "Premium White Sugar", packSize: "1 kg packet", category: "FOOD", manufacturer: "x", batchCode: "PS-2408-17", manufacturedAt: 0, expiresAt: 1 }

  it("always fits one screen, dropping detail in order, however long the text", () => {
    const longReason = "This batch was recalled: " + "contamination found at the factory during routine testing ".repeat(5)
    for (const verdict of ["GENUINE", "CHECK", "STOP"] as const) {
      const out = composeVerdict({ verdict, reasons: [{ code: "BATCH_RECALLED", message: longReason }], product: { ...product, productName: "A very long product name indeed ".repeat(4) } })
      expect(out.length).toBeLessThanOrEqual(160)
      expect(out.startsWith(verdict)).toBe(true)
    }
  })

  it("gives a verdict with no product when the code is not ours", () => {
    expect(composeVerdict({ verdict: "STOP", reasons: [{ code: "UNKNOWN_CODE", message: "This code is not in the registry." }], product: null })).toBe(
      "STOP. Do not buy or use. This code is not in the registry.",
    )
  })

  it("keeps the product name when only the full details are too long", () => {
    const out = composeVerdict({ verdict: "GENUINE", reasons: [], product: { ...product, packSize: "x".repeat(150) } })
    expect(out).toBe("GENUINE. Premium White Sugar. Safe to buy.")
  })
})

describe("SlidingWindow", () => {
  it("allows up to the maximum, then blocks, then recovers as the window slides", () => {
    const w = new SlidingWindow(3, 1000)
    expect([1, 2, 3, 4].map(() => w.allow("k", 0))).toEqual([true, true, true, false])
    expect(w.allow("k", 999)).toBe(false)
    expect(w.allow("k", 1001)).toBe(true)
    expect(w.allow("other", 0)).toBe(true)
  })
})

describe("Africa's Talking sender (request shape only; not verified against the live service)", () => {
  const ok = () => Promise.resolve(new Response("{}", { status: 201 }))

  it("posts a form to the sandbox host with the key in a header", async () => {
    const fetchMock = vi.fn(ok)
    await new AfricasTalkingSms({ username: "sandbox", apiKey: "KEY", sandbox: true, from: "ScanUG" }, fetchMock as never).send("+256700000001", "GENUINE. Safe to buy.")
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.sandbox.africastalking.com/version1/messaging")
    expect((init.headers as Record<string, string>).apiKey).toBe("KEY")
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ username: "sandbox", to: "+256700000001", message: "GENUINE. Safe to buy.", from: "ScanUG" })
  })

  it("uses the live host when not in sandbox, and throws when the provider refuses", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("no", { status: 401 })))
    const sender = new AfricasTalkingSms({ username: "u", apiKey: "k", sandbox: false }, fetchMock as never)
    await expect(sender.send("+1", "x")).rejects.toThrow("401")
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.africastalking.com/version1/messaging")
  })
})

describe("channel configuration", () => {
  const base = { TOKEN_SECRET: "a".repeat(40), LOOKUP_PEPPER: "b".repeat(40) }
  it("is optional, but a short channel secret is refused", () => {
    expect(loadConfig(base).channelSecret).toBeUndefined()
    expect(() => loadConfig({ ...base, CHANNEL_SECRET: "short" })).toThrow(/CHANNEL_SECRET/)
    expect(loadConfig({ ...base, CHANNEL_SECRET: "x".repeat(20) }).channelSecret).toHaveLength(20)
  })
  it("reads Africa's Talking settings, defaulting to the sandbox", () => {
    expect(loadConfig(base).africasTalking).toBeUndefined()
    expect(loadConfig({ ...base, AT_USERNAME: "u", AT_API_KEY: "k" }).africasTalking).toEqual({ username: "u", apiKey: "k", sandbox: true, from: undefined })
    expect(loadConfig({ ...base, AT_USERNAME: "u", AT_API_KEY: "k", AT_SANDBOX: "false", AT_SMS_FROM: "ScanUG" }).africasTalking).toMatchObject({ sandbox: false, from: "ScanUG" })
  })
})
