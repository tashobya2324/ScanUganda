import { describe, expect, it } from "vitest"
import { distanceKm, effectiveDistanceKm } from "./geo.ts"
import { checkExpiry, checkLifecycle, checkRecall, checkSpatial, checkTemporal } from "./rules.ts"
import { HOUR, NOW, at, regions } from "./test-fixtures.ts"
import { DEFAULT_RULE_CONFIG } from "./types.ts"

const cfg = DEFAULT_RULE_CONFIG

describe("geo", () => {
  it("measures Kampala to Jinja (district centres) at about 70 km", () => {
    const d = distanceKm(at("kampala"), at("jinja"))
    expect(d).toBeGreaterThan(65)
    expect(d).toBeLessThan(75)
  })
  it("is zero for the same point and symmetric", () => {
    expect(distanceKm(at("kampala"), at("kampala"))).toBe(0)
    expect(distanceKm(at("jinja"), at("fortportal"))).toBeCloseTo(distanceKm(at("fortportal"), at("jinja")), 9)
  })
  it("subtracts accuracy radii and never goes negative", () => {
    const a = { ...at("kampala"), accuracyM: 3000 }
    const b = { ...at("jinja"), accuracyM: 2000 }
    expect(effectiveDistanceKm(a, b)).toBeCloseTo(distanceKm(a, b) - 5, 6)
    expect(effectiveDistanceKm({ ...at("kampala"), accuracyM: 80_000 }, at("jinja"))).toBe(0)
  })
})

describe("recall (P1-5)", () => {
  it("passes when not recalled", () => expect(checkRecall(null).outcome).toBe("pass"))
  it("stops when recalled and gives the reason", () => {
    const r = checkRecall({ at: NOW, reason: "packaging fault" })
    expect(r.outcome).toBe("stop")
    expect(r.reason).toMatchObject({ code: "BATCH_RECALLED" })
    expect(r.reason!.message).toContain("packaging fault")
  })
})

describe("expiry (P1-5)", () => {
  it("passes before and exactly at expiry", () => {
    expect(checkExpiry(NOW + 1, NOW).outcome).toBe("pass")
    expect(checkExpiry(NOW, NOW).outcome).toBe("pass")
  })
  it("stops one millisecond after expiry", () => {
    const r = checkExpiry(NOW - 1, NOW)
    expect(r.outcome).toBe("stop")
    expect(r.reason!.code).toBe("BATCH_EXPIRED")
  })
})

describe("lifecycle (P1-6)", () => {
  it("stops a consumer or retailer scan of a unit still in the factory, with a high alert", () => {
    for (const role of ["consumer", "retailer"] as const) {
      const r = checkLifecycle("IN_FACTORY", role)
      expect(r.outcome).toBe("stop")
      expect(r.alert).toMatchObject({ type: "PARALLEL_MARKET", priority: "high" })
    }
  })
  it("asks to check an in-transit unit at a point of sale", () => {
    const r = checkLifecycle("IN_TRANSIT", "consumer")
    expect(r.outcome).toBe("check")
    expect(r.alert).toBeUndefined()
  })
  it("passes distributor and retail states", () => {
    expect(checkLifecycle("AT_DISTRIBUTOR", "retailer").outcome).toBe("pass")
    expect(checkLifecycle("AT_RETAIL", "consumer").outcome).toBe("pass")
  })
  it("skips inspectors in every state", () => {
    for (const s of ["IN_FACTORY", "IN_TRANSIT", "AT_DISTRIBUTOR", "AT_RETAIL"] as const) {
      expect(checkLifecycle(s, "inspector").outcome).toBe("skip")
    }
  })
})

describe("spatial (P1-7)", () => {
  it("passes for a nationwide batch with or without a location", () => {
    expect(checkSpatial([], regions, at("kampala")).outcome).toBe("pass")
    expect(checkSpatial([], regions, undefined).outcome).toBe("pass")
  })
  it("passes inside a designated region", () => {
    expect(checkSpatial(["kapchorwa"], regions, at("kapchorwa")).outcome).toBe("pass")
  })
  it("passes inside any one of several regions", () => {
    expect(checkSpatial(["kapchorwa", "kampala"], regions, at("kampala")).outcome).toBe("pass")
  })
  it("flags a Kapchorwa batch scanned in Kampala with a medium alert", () => {
    const r = checkSpatial(["kapchorwa"], regions, at("kampala"))
    expect(r.outcome).toBe("check")
    expect(r.reason!.message).toContain("Kapchorwa")
    expect(r.alert).toMatchObject({ type: "DISTRIBUTION_ANOMALY", priority: "medium" })
  })
  it("skips, without blame, when there is no location", () => {
    const r = checkSpatial(["kapchorwa"], regions, undefined)
    expect(r.outcome).toBe("skip")
    expect(r.reason!.code).toBe("LOCATION_UNAVAILABLE")
  })
  it("treats a fuzzy fix whose circle touches the region as inside", () => {
    // ~25 km from Kampala centre, radius 15 km: outside without slack, inside with 12 km accuracy.
    const p = { lat: 0.3476 + 25 / 111.195, lng: 32.5825 }
    expect(checkSpatial(["kampala"], regions, p).outcome).toBe("check")
    expect(checkSpatial(["kampala"], regions, { ...p, accuracyM: 12_000 }).outcome).toBe("pass")
  })
  it("ignores region ids that do not exist", () => {
    expect(checkSpatial(["nowhere"], regions, at("kampala")).outcome).toBe("pass")
  })
})

describe("temporal (P1-8)", () => {
  const here = { at: NOW, position: at("jinja") }

  it("passes with no history", () => {
    expect(checkTemporal([], here, cfg).outcome).toBe("pass")
  })

  it("stops Jinja then Fort Portal two minutes apart, with a high alert", () => {
    const r = checkTemporal(
      [{ at: NOW - 2 * 60_000, position: at("fortportal") }],
      here,
      cfg,
    )
    expect(r.outcome).toBe("stop")
    expect(r.reason!.code).toBe("IMPOSSIBLE_TRAVEL")
    expect(r.alert).toMatchObject({ type: "IMPOSSIBLE_TRAVEL", priority: "high" })
  })

  it("stops two distant places at the same instant", () => {
    const r = checkTemporal([{ at: NOW, position: at("fortportal") }], here, cfg)
    expect(r.outcome).toBe("stop")
  })

  it("passes the same journey with enough time", () => {
    const km = distanceKm(at("jinja"), at("fortportal"))
    const hours = km / cfg.maxSpeedKmh
    expect(checkTemporal([{ at: NOW - (hours + 0.1) * HOUR, position: at("fortportal") }], here, cfg).outcome).toBe("pass")
  })

  it("is exact at the speed ceiling: at the limit passes, a little faster stops", () => {
    const km = distanceKm(at("jinja"), at("fortportal"))
    const exact = (km / cfg.maxSpeedKmh) * HOUR
    const prior = (ms: number) => [{ at: NOW - ms, position: at("fortportal") }]
    expect(checkTemporal(prior(exact + 1000), here, cfg).outcome).toBe("pass")
    expect(checkTemporal(prior(exact - 1000), here, cfg).outcome).toBe("stop")
  })

  it("ignores movement below the GPS-noise distance", () => {
    const near = { lat: at("kampala").lat + 1 / 111.195, lng: at("kampala").lng } // ~1 km
    expect(
      checkTemporal([{ at: NOW, position: near }], { at: NOW, position: at("kampala") }, cfg).outcome,
    ).toBe("pass")
  })

  it("handles scans arriving out of order (offline sync)", () => {
    const r = checkTemporal(
      [{ at: NOW + 60_000, position: at("fortportal") }], // the other scan is a minute *later*
      here,
      cfg,
    )
    expect(r.outcome).toBe("stop")
  })

  it("skips history entries that have no position and passes with no current position", () => {
    expect(checkTemporal([{ at: NOW }], here, cfg).outcome).toBe("pass")
    expect(
      checkTemporal([{ at: NOW, position: at("fortportal") }], { at: NOW }, cfg).outcome,
    ).toBe("pass")
  })

  it("uses the most implausible earlier scan in the message", () => {
    const r = checkTemporal(
      [
        { at: NOW - 3 * HOUR, position: at("kampala") }, // plausible (~27 km/h)
        { at: NOW - 60_000, position: at("fortportal") }, // impossible
      ],
      here,
      cfg,
    )
    expect(r.outcome).toBe("stop")
    expect(r.reason!.message).toContain("1 minute ")
  })

  it("asks to check once the per-unit scan limit is reached, even in one place", () => {
    const same = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ at: NOW - (i + 1) * HOUR, position: at("jinja") }))
    expect(checkTemporal(same(cfg.maxScansPerUnit - 1), here, cfg).outcome).toBe("pass")
    const r = checkTemporal(same(cfg.maxScansPerUnit), here, cfg)
    expect(r.outcome).toBe("check")
    expect(r.reason!.code).toBe("REPEAT_LIMIT")
    expect(r.alert!.type).toBe("DUPLICATE_SCANS")
  })

  it("respects a custom config", () => {
    const r = checkTemporal([{ at: NOW - HOUR, position: at("kampala") }], here, { ...cfg, maxSpeedKmh: 40 })
    expect(r.outcome).toBe("stop") // ~70 km in 1 h > 40 km/h
  })
})
