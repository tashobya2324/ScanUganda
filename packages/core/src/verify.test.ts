import { describe, expect, it } from "vitest"
import { generateKeyPair, signUnit } from "./codes.ts"
import { HOUR, NOW, at, keys, makeBatch, makeContext, makeInput, makeUnit } from "./test-fixtures.ts"
import type { AlertType, ReasonCode, Verdict } from "./types.ts"
import { verifyScan, type VerifyInput } from "./verify.ts"

/**
 * Scenario table: PLAN.md §6, E1 to E6 and E8 (E7 is offline: see offline.test.ts).
 * Each row is one situation → the verdict, the leading reason and the alert raised.
 */
interface Scenario {
  name: string
  input: () => VerifyInput
  verdict: Verdict
  reason?: ReasonCode
  alert?: AlertType
}

const scenarios: Scenario[] = [
  {
    name: "E1 valid sugar packet at a Kampala shop",
    input: () => makeInput(),
    verdict: "GENUINE",
  },
  {
    name: "E2a altered signature",
    input: () => {
      const good = signUnit(keys.privateKey, "B-KS-2408-17", "000123")
      const bad = good.slice(0, -4) + (good.endsWith("AAAA") ? "BBBB" : "AAAA")
      return makeInput({ credential: { kind: "signed", payload: bad } })
    },
    verdict: "STOP",
    reason: "INVALID_SIGNATURE",
    alert: "COUNTERFEIT_SUSPECTED",
  },
  {
    name: "E2b code signed by someone else's key",
    input: () =>
      makeInput({
        credential: {
          kind: "signed",
          payload: signUnit(generateKeyPair().privateKey, "B-KS-2408-17", "000123"),
        },
      }),
    verdict: "STOP",
    reason: "INVALID_SIGNATURE",
    alert: "COUNTERFEIT_SUSPECTED",
  },
  {
    name: "E2c code never issued (no batch or unit)",
    input: () => makeInput({ batch: null, unit: null }),
    verdict: "STOP",
    reason: "UNKNOWN_CODE",
    alert: "COUNTERFEIT_SUSPECTED",
  },
  {
    name: "E3 agro-chemical for Kapchorwa scanned in Kampala",
    input: () => makeInput({ batch: makeBatch({ designatedRegionIds: ["kapchorwa"] }) }),
    verdict: "CHECK",
    reason: "OUTSIDE_REGION",
    alert: "DISTRIBUTION_ANOMALY",
  },
  {
    name: "E3b same batch scanned in Kapchorwa",
    input: () =>
      makeInput({
        batch: makeBatch({ designatedRegionIds: ["kapchorwa"] }),
        context: makeContext({ position: at("kapchorwa") }),
      }),
    verdict: "GENUINE",
  },
  {
    name: "E4 scanned in Jinja, then Fort Portal two minutes later",
    input: () =>
      makeInput({
        priorScans: [{ at: NOW - 2 * 60_000, position: at("jinja") }],
        context: makeContext({ position: at("fortportal") }),
      }),
    verdict: "STOP",
    reason: "IMPOSSIBLE_TRAVEL",
    alert: "IMPOSSIBLE_TRAVEL",
  },
  {
    name: "E4b same two towns, but a day apart",
    input: () =>
      makeInput({
        priorScans: [{ at: NOW - 24 * HOUR, position: at("jinja") }],
        context: makeContext({ position: at("fortportal") }),
      }),
    verdict: "GENUINE",
  },
  {
    name: "E5 unit still IN_FACTORY scanned at a shelf",
    input: () => makeInput({ unit: makeUnit({ lifecycle: "IN_FACTORY" }) }),
    verdict: "STOP",
    reason: "LIFECYCLE_IN_FACTORY",
    alert: "PARALLEL_MARKET",
  },
  {
    name: "E5b unit IN_TRANSIT scanned at a shelf",
    input: () => makeInput({ unit: makeUnit({ lifecycle: "IN_TRANSIT" }) }),
    verdict: "CHECK",
    reason: "LIFECYCLE_IN_TRANSIT",
  },
  {
    name: "E5c inspector scanning IN_FACTORY stock at the depot",
    input: () =>
      makeInput({
        unit: makeUnit({ lifecycle: "IN_FACTORY" }),
        context: makeContext({ scannerRole: "inspector" }),
      }),
    verdict: "GENUINE",
  },
  {
    name: "E6 recalled batch via the PWA",
    input: () => makeInput({ batch: makeBatch({ recall: { at: NOW - HOUR, reason: "packaging fault" } }) }),
    verdict: "STOP",
    reason: "BATCH_RECALLED",
  },
  {
    name: "E6b recalled batch via USSD",
    input: () =>
      makeInput({
        credential: { kind: "lookup" },
        batch: makeBatch({ recall: { at: NOW - HOUR, reason: "packaging fault" } }),
        context: makeContext({ channel: "USSD" }),
      }),
    verdict: "STOP",
    reason: "BATCH_RECALLED",
  },
  {
    name: "E6c recalled batch via SMS",
    input: () =>
      makeInput({
        credential: { kind: "lookup" },
        batch: makeBatch({ recall: { at: NOW - HOUR, reason: "packaging fault" } }),
        context: makeContext({ channel: "SMS" }),
      }),
    verdict: "STOP",
    reason: "BATCH_RECALLED",
  },
  {
    name: "expired batch",
    input: () => makeInput({ batch: makeBatch({ expiresAt: NOW - 1 }) }),
    verdict: "STOP",
    reason: "BATCH_EXPIRED",
  },
  {
    name: "E8 valid code over USSD with a district as the location",
    input: () =>
      makeInput({
        credential: { kind: "lookup" },
        context: makeContext({
          channel: "USSD",
          position: { ...at("kampala"), accuracyM: 15_000 },
        }),
      }),
    verdict: "GENUINE",
  },
  {
    name: "unit scanned too many times",
    input: () =>
      makeInput({
        priorScans: Array.from({ length: 5 }, (_, i) => ({
          at: NOW - (i + 1) * HOUR,
          position: at("kampala"),
        })),
      }),
    verdict: "CHECK",
    reason: "REPEAT_LIMIT",
    alert: "DUPLICATE_SCANS",
  },
  {
    name: "no location shared on a regional batch",
    input: () =>
      makeInput({
        batch: makeBatch({ designatedRegionIds: ["kapchorwa"] }),
        context: makeContext({ position: undefined }),
      }),
    verdict: "GENUINE",
    reason: "LOCATION_UNAVAILABLE",
  },
]

describe("verifyScan scenarios", () => {
  it.each(scenarios)("$name", ({ input, verdict, reason, alert }) => {
    const r = verifyScan(input())
    expect(r.verdict).toBe(verdict)
    if (reason) expect(r.reasons[0]?.code).toBe(reason)
    else expect(r.reasons).toEqual([])
    if (alert) expect(r.alerts.map((a) => a.type)).toContain(alert)
    else expect(r.alerts).toEqual([])
  })
})

describe("verifyScan combination", () => {
  it("STOP outranks CHECK and lists the stop reason first", () => {
    const r = verifyScan(
      makeInput({
        batch: makeBatch({
          designatedRegionIds: ["kapchorwa"], // CHECK: outside region
          recall: { at: NOW, reason: "contamination" }, // STOP
        }),
      }),
    )
    expect(r.verdict).toBe("STOP")
    expect(r.reasons.map((x) => x.code)).toEqual(["BATCH_RECALLED", "OUTSIDE_REGION"])
    expect(r.alerts.map((a) => a.type)).toEqual(["DISTRIBUTION_ANOMALY"])
  })

  it("collects every alert when several rules fire", () => {
    const r = verifyScan(
      makeInput({
        unit: makeUnit({ lifecycle: "IN_FACTORY" }),
        priorScans: [{ at: NOW - 60_000, position: at("fortportal") }],
      }),
    )
    expect(r.verdict).toBe("STOP")
    expect(r.alerts.map((a) => a.type).sort()).toEqual(["IMPOSSIBLE_TRAVEL", "PARALLEL_MARKET"])
  })

  it("a forged signature short-circuits: nothing else is trusted or evaluated", () => {
    const r = verifyScan(
      makeInput({
        credential: { kind: "signed", payload: "B-KS-2408-17.000123.AAAAAAAAAAAAAAAAAAAAAA" },
        unit: makeUnit({ lifecycle: "IN_FACTORY" }),
      }),
    )
    expect(r.checks.map((c) => c.rule)).toEqual(["signature"])
    expect(r.reasons.map((x) => x.code)).toEqual(["INVALID_SIGNATURE"])
  })

  it("rejects a validly signed code presented for a different unit", () => {
    // A genuine signature for serial 000123, but the record resolved is serial 000999.
    const payload = signUnit(keys.privateKey, "B-KS-2408-17", "000123")
    const r = verifyScan(
      makeInput({ credential: { kind: "signed", payload }, unit: makeUnit({ serial: "000999" }) }),
    )
    expect(r.verdict).toBe("STOP")
    expect(r.reasons[0]?.code).toBe("INVALID_SIGNATURE")
  })

  it("treats a unit that belongs to a different batch as unknown", () => {
    const r = verifyScan(makeInput({ unit: makeUnit({ batchId: "B-OTHER" }) }))
    expect(r.reasons[0]?.code).toBe("UNKNOWN_CODE")
  })

  it("fails closed when the batch's signing key is missing", () => {
    const r = verifyScan(makeInput({ publicKeys: {} }))
    expect(r.verdict).toBe("STOP")
    expect(r.reasons[0]?.code).toBe("INVALID_SIGNATURE")
  })

  it("uses a supplied signature checker instead of the built-in one", () => {
    const calls: string[] = []
    const accept = verifyScan(makeInput({ verifySignature: (k, p) => (calls.push(`${k.length}:${p.split(".")[1]}`), true) }))
    expect(accept.verdict).toBe("GENUINE")
    expect(calls).toEqual(["64:000123"]) // asked once, with the batch's public key and this code
    const reject = verifyScan(makeInput({ verifySignature: () => false }))
    expect(reject.verdict).toBe("STOP")
    expect(reject.reasons[0]?.code).toBe("INVALID_SIGNATURE")
  })

  it("does not call the signature checker for lookup-code scans", () => {
    let called = false
    verifyScan(makeInput({ credential: { kind: "lookup" }, verifySignature: () => ((called = true), true) }))
    expect(called).toBe(false)
  })

  it("applies config overrides", () => {
    const r = verifyScan(
      makeInput({
        priorScans: [{ at: NOW - 60_000, position: at("kampala") }],
        context: makeContext({ position: at("jinja") }),
        config: { maxSpeedKmh: 100_000 },
      }),
    )
    expect(r.verdict).toBe("GENUINE")
  })

  it("is deterministic and does not mutate its input", () => {
    const input = makeInput({ priorScans: [{ at: NOW - HOUR, position: at("kampala") }] })
    const snapshot = JSON.stringify(input)
    expect(verifyScan(input)).toEqual(verifyScan(input))
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})
