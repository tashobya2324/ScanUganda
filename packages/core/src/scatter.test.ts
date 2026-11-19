import { describe, expect, it } from "vitest"
import { checkScatter, checkSold } from "./rules.ts"
import { DEFAULT_RULE_CONFIG } from "./types.ts"

const at = (lat: number, lng: number) => ({ at: 0, position: { lat, lng } })
const KAMPALA = at(0.3476, 32.5825)
const JINJA = at(0.4244, 33.2041)
const MBARARA = at(-0.6072, 30.6545)
const GULU = at(2.7746, 32.299)
const MBALE = at(1.0821, 34.1751)

describe("scattered scans", () => {
  it("is fine in one place, however many times", () => {
    const r = checkScatter([KAMPALA, KAMPALA, at(0.35, 32.59)], KAMPALA, DEFAULT_RULE_CONFIG)
    expect(r.outcome).toBe("pass")
  })
  it("is fine in two towns", () => {
    expect(checkScatter([KAMPALA, JINJA], { position: MBARARA.position }, DEFAULT_RULE_CONFIG).outcome).not.toBe("stop")
    expect(checkScatter([KAMPALA], { position: JINJA.position }, DEFAULT_RULE_CONFIG).outcome).toBe("pass")
  })
  it("is suspicious in three different places and raises a high counterfeit alert", () => {
    const r = checkScatter([KAMPALA, JINJA], { position: MBARARA.position }, DEFAULT_RULE_CONFIG)
    expect(r.outcome).toBe("check")
    expect(r.reason?.code).toBe("MANY_LOCATIONS")
    expect(r.alert).toMatchObject({ type: "COUNTERFEIT_SUSPECTED", priority: "high" })
  })
  it("is a copy in five different places", () => {
    expect(checkScatter([KAMPALA, JINJA, MBARARA, GULU], { position: MBALE.position }, DEFAULT_RULE_CONFIG).outcome).toBe("stop")
  })
  it("ignores scans with no location", () => {
    expect(checkScatter([{ at: 0 }, { at: 0 }, KAMPALA], {}, DEFAULT_RULE_CONFIG).outcome).toBe("pass")
  })
})

describe("bought items", () => {
  it("passes while unsold, and at the moment of purchase", () => {
    expect(checkSold(undefined, 1000).outcome).toBe("pass")
    expect(checkSold(null, 1000).outcome).toBe("pass")
    expect(checkSold(1000, 1000).outcome).toBe("pass")
  })
  it("stops any scan after the purchase", () => {
    const r = checkSold(1000, 2000)
    expect(r.outcome).toBe("stop")
    expect(r.reason?.code).toBe("ALREADY_BOUGHT")
    expect(r.alert?.type).toBe("COUNTERFEIT_SUSPECTED")
  })
})

import { checkTemporal } from "./rules.ts"

describe("repeat scans are flagged early", () => {
  const here = { at: 0, position: { lat: 0.3476, lng: 32.5825 } }
  it("says nothing for the first two scans", () => {
    expect(checkTemporal([], { at: 1 }, DEFAULT_RULE_CONFIG).alert).toBeUndefined()
    expect(checkTemporal([here], { at: 1 }, DEFAULT_RULE_CONFIG).alert).toBeUndefined()
  })
  it("raises a low alert on the third scan without changing the verdict", () => {
    const r = checkTemporal([here, here], { at: 1 }, DEFAULT_RULE_CONFIG)
    expect(r.outcome).toBe("pass")
    expect(r.alert).toMatchObject({ type: "DUPLICATE_SCANS", priority: "low" })
  })
  it("still turns to CHECK at the limit", () => {
    expect(checkTemporal([here, here, here, here, here], { at: 1 }, DEFAULT_RULE_CONFIG).outcome).toBe("check")
  })
})
