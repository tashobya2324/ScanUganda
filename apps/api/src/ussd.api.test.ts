import { generateLookupCode } from "@scanuganda/core"
import { beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "./app.ts"
import { USERS, makeTestApp } from "./test-helpers.ts"

type T = Awaited<ReturnType<typeof makeTestApp>>
let t: T

beforeAll(async () => {
  t = await makeTestApp()
})

let phoneCounter = 0
const freshPhone = () => `+25670000${String(++phoneCounter).padStart(4, "0")}`

const dial = (text: string, phone = freshPhone(), app: T["app"] = t.app, headers: Record<string, string> = {}, url = "/v1/ussd") =>
  app.inject({
    method: "POST",
    url,
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    payload: new URLSearchParams({ sessionId: "s1", serviceCode: "*284#", phoneNumber: phone, text }).toString(),
  })

const say = async (text: string, phone?: string) => (await dial(text, phone)).body
const code = (scenario: string, i = 0) => t.code(scenario, i).lookupCode

// Regions are listed alphabetically: page 1 = Entebbe, Fort Portal, Gulu, Jinja, Kampala; "6" shows the rest.
const KAMPALA = "5"
const MORE = "6"
const KAPCHORWA_AFTER_MORE = "1"

describe("menu and wire format", () => {
  it("opens with the main menu, as plain text starting CON", async () => {
    const res = await dial("")
    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toContain("text/plain")
    expect(res.body).toBe("CON ScanUganda\n1. Check a product\n2. Report a product")
  })

  it("asks for the code, then the district", async () => {
    expect(await say("1")).toBe("CON Enter the 12-digit code under the scratch layer.\n0. Back")
    const where = await say(`1*${code("E1", 0)}`)
    expect(where).toBe("CON Where are you?\n1. Entebbe\n2. Fort Portal\n3. Gulu\n4. Jinja\n5. Kampala\n6. More\n0. Not sure")
  })

  it("pages through the districts", async () => {
    const c = code("E1", 1)
    expect(await say(`1*${c}*${MORE}`)).toBe("CON Where are you?\n1. Kapchorwa\n2. Masaka\n3. Mbale\n4. Mbarara\n6. More\n0. Not sure")
    // a second "More" wraps back to the first page
    expect(await say(`1*${c}*${MORE}*${MORE}`)).toContain("1. Entebbe")
  })

  it("every screen fits 160 characters and a basic phone's alphabet", async () => {
    const c = code("E1", 2)
    const chains = ["", "9", "1", "2", "1*abc", `1*${c}`, `1*${c}*9`, `1*${c}*${MORE}`, "2*hi", "1*0", "2*0", c]
    for (const chain of chains) {
      const body = await say(chain)
      expect(body.length, chain).toBeLessThanOrEqual(164) // "CON " + 160
      expect(body, chain).toMatch(/^(CON|END) [\x20-\x7E\n]+$/)
    }
  })
})

describe("checking a product", () => {
  it("E1 genuine product → GENUINE with the product", async () => {
    const out = await say(`1*${code("E1", 3)}*${KAMPALA}`)
    expect(out).toBe("END GENUINE. Premium White Sugar 1 kg packet, batch PS-2408-17. Safe to buy.")
  })

  it("'Not sure' checks without a location", async () => {
    expect(await say(`1*${code("E1", 4)}*0`)).toMatch(/^END GENUINE\./)
  })

  it("E3 regional product: CHECK in Kampala, GENUINE in Kapchorwa", async () => {
    const away = await say(`1*${code("E3", 0)}*${KAMPALA}`)
    expect(away).toMatch(/^END CHECK\. Wait before you buy\. This batch is meant for Kapchorwa, Mbale\./)
    expect(await say(`1*${code("E3", 1)}*${MORE}*${KAPCHORWA_AFTER_MORE}`)).toMatch(/^END GENUINE\./)
  })

  it("E5 factory stock → STOP", async () => {
    expect(await say(`1*${code("E5", 0)}*${KAMPALA}`)).toMatch(/^END STOP\. Do not buy or use\./)
  })

  it("E6 recalled batch → STOP with the reason, within one screen", async () => {
    const out = await say(`1*${code("E6", 0)}*0`)
    expect(out).toMatch(/^END STOP\. Do not buy or use\. This batch was recalled: Packaging fault/)
    expect(out.length).toBeLessThanOrEqual(164)
  })

  it("expired batch → STOP", async () => {
    expect(await say(`1*${code("expired", 0)}*0`)).toMatch(/^END STOP\..*expiry/)
  })

  it("a code that was never issued → STOP, not in our records", async () => {
    // a code with a valid check digit that no unit has
    const stranger = generateLookupCode()
    expect(await say(`1*${stranger}*0`)).toBe("END STOP. Do not buy or use. This code is not in the registry.")
  })

  it("records the scan as USSD, located at the district's centre", async () => {
    await say(`1*${code("E1", 5)}*${KAMPALA}`)
    const scans = (await t.app.inject({ method: "GET", url: "/v1/scans?limit=1", headers: await t.as(USERS.admin) })).json()
    expect(scans[0]).toMatchObject({ channel: "USSD", scannerRole: "consumer", verdict: "GENUINE" })
    expect(scans[0].lat).toBeCloseTo(0.3476, 3)
    expect(scans[0].lng).toBeCloseTo(32.5825, 3)
  })
})

describe("direct dial and input handling", () => {
  it("*284*CODE# skips the menu and asks only for the district", async () => {
    const c = code("E1", 6)
    expect(await say(c)).toContain("Where are you?")
    expect(await say(`${c}*${KAMPALA}`)).toMatch(/^END GENUINE\./)
  })

  it("a mistyped code is refused on the spot and can be re-entered", async () => {
    const good = code("E1", 7)
    const typo = good.slice(0, 11) + String((Number(good[11]) + 1) % 10)
    const retry = await say(`1*${typo}`)
    expect(retry).toBe("CON That code does not look right. Check each digit and try again.\nEnter the 12-digit code under the scratch layer.\n0. Back")
    expect(await say(`1*${typo}*${good}`)).toContain("Where are you?")
    expect(await say(`1*12*${typo}*${good}*${KAMPALA}`)).toMatch(/^END GENUINE\./)
  })

  it("0 goes back", async () => {
    expect(await say("1*0")).toBe("CON ScanUganda\n1. Check a product\n2. Report a product")
    expect(await say("2*0")).toBe("CON ScanUganda\n1. Check a product\n2. Report a product")
  })

  it("unknown choices keep the user where they are with a hint", async () => {
    expect(await say("7")).toMatch(/^CON Choose 1 or 2\.\nScanUganda/)
    expect(await say(`1*${code("E1", 8)}*9`)).toMatch(/^CON Choose a number\.\nWhere are you\?/)
    expect(await say(`1*${code("E1", 8)}*x`)).toMatch(/^CON Choose a number\./)
  })

  it("ignores spaces and dashes in a typed code", async () => {
    const c = code("E1", 9)
    expect(await say(`1*${c.slice(0, 4)} ${c.slice(4, 8)} ${c.slice(8)}`)).toContain("Where are you?")
  })
})

describe("reports", () => {
  it("takes a short description and files it", async () => {
    expect(await say("2")).toBe("CON Describe the problem in a few words.\n0. Back")
    expect(await say("2*too short")).toBe("CON Please write at least 10 characters.\nDescribe the problem in a few words.\n0. Back")
    expect(await say("2*too short*Seal was open and the tin looked different")).toBe("END Thank you. We have your report.")
    const row = t.store.db.prepare("SELECT description FROM reports ORDER BY created_at DESC LIMIT 1").get() as { description: string }
    expect(row.description).toBe("[USSD] Seal was open and the tin looked different")
  })
})

describe("abuse and failure", () => {
  it("limits one phone number to 15 checks per window", async () => {
    const phone = freshPhone()
    const c = code("E1", 0)
    for (let i = 0; i < 15; i++) expect((await dial(`1*${c}*0`, phone)).body).toMatch(/^END (GENUINE|CHECK|STOP)/)
    expect((await dial(`1*${c}*0`, phone)).body).toBe("END Too many checks from this number. Please try again later.")
    // another phone is unaffected, and so is the menu itself
    expect((await dial(`1*${c}*0`, freshPhone())).body).toMatch(/^END (GENUINE|CHECK|STOP)/)
    expect((await dial("", phone)).body).toMatch(/^CON/)
  })

  it("a failure inside the server becomes a polite END screen, never an error page", async () => {
    const broken = await makeTestApp()
    broken.store.db.close()
    const res = await dial(`1*${broken.code("E1", 0).lookupCode}*0`, freshPhone(), broken.app)
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe("END Sorry, something went wrong. Please try again.")
  })

  it("rejects a callback without a phone number", async () => {
    const res = await t.app.inject({ method: "POST", url: "/v1/ussd", headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "text=1" })
    expect(res.statusCode).toBe(400)
  })

  it("with a channel secret set, only the aggregator can call it", async () => {
    const secured = await makeTestApp({ channelSecret: "a-long-shared-secret-123" })
    expect((await dial("", freshPhone(), secured.app)).statusCode).toBe(401)
    expect((await dial("", freshPhone(), secured.app, { "x-channel-key": "wrong-secret-value-00" })).statusCode).toBe(401)
    expect((await dial("", freshPhone(), secured.app, { "x-channel-key": "a-long-shared-secret-123" })).body).toMatch(/^CON/)
    expect((await dial("", freshPhone(), secured.app, {}, "/v1/ussd?key=a-long-shared-secret-123")).body).toMatch(/^CON/)
  })
})

describe("simulator endpoint (staff)", () => {
  const sim = async (text: string, who?: string) =>
    t.app.inject({ method: "POST", url: "/v1/ussd/simulate", payload: { text }, headers: who ? await t.as(who) : {} })

  it("needs a signed-in staff user", async () => {
    expect((await sim("")).statusCode).toBe(401)
  })

  it("runs the same menu and returns structured screens", async () => {
    const menu = await sim("", USERS.maker)
    expect(menu.json()).toEqual({ type: "CON", message: "ScanUganda\n1. Check a product\n2. Report a product", wire: "CON ScanUganda\n1. Check a product\n2. Report a product" })
    const end = await sim(`1*${code("E1", 0)}*0`, USERS.inspector)
    expect(end.json().type).toBe("END")
    expect(end.json().message).toMatch(/^GENUINE|^CHECK|^STOP/)
  })
})

describe("the app wires channels correctly", () => {
  it("lists the channel routes in the API document", async () => {
    const spec = (await t.app.inject({ method: "GET", url: "/openapi.json" })).json()
    for (const p of ["/v1/ussd", "/v1/sms", "/v1/ussd/simulate"]) expect(spec.paths[p], p).toBeTruthy()
  })

  it("buildApp accepts a custom SMS sender", async () => {
    const app = await buildApp({ store: t.store, keys: t.keys, config: t.config, sms: { send: async () => {} } })
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200)
  })
})
