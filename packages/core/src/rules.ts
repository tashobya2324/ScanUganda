import { verifyPayload, parsePayload } from "./codes.ts"
import { distanceKm, effectiveDistanceKm } from "./geo.ts"
import type {
  Batch,
  LifecycleState,
  PriorScan,
  Region,
  RuleConfig,
  RuleResult,
  ScanContext,
  ScannerRole,
} from "./types.ts"

const HOUR_MS = 3_600_000

const pass = (rule: string): RuleResult => ({ rule, outcome: "pass" })

/* ---------- P1-4: signature ---------- */

/**
 * The payload must be well-formed, name this batch and unit, and carry a
 * valid signature from the batch's key. Anything else is treated as forged.
 */
export function checkSignature(
  payload: string,
  expected: { batchId: string; serial: string },
  publicKey: string | undefined,
): RuleResult {
  const rule = "signature"
  const parsed = parsePayload(payload)
  const ok =
    parsed !== null &&
    publicKey !== undefined &&
    parsed.batchId === expected.batchId &&
    parsed.serial === expected.serial &&
    verifyPayload(publicKey, payload)
  if (ok) return pass(rule)
  return {
    rule,
    outcome: "stop",
    reason: {
      code: "INVALID_SIGNATURE",
      message: "This code does not match the manufacturer's records.",
    },
    alert: {
      type: "COUNTERFEIT_SUSPECTED",
      priority: "medium",
      message: "A code with an invalid signature was scanned.",
    },
  }
}

/* ---------- P1-5: recall and expiry ---------- */

export function checkRecall(recall: Batch["recall"]): RuleResult {
  const rule = "recall"
  if (!recall) return pass(rule)
  return {
    rule,
    outcome: "stop",
    reason: { code: "BATCH_RECALLED", message: `This batch was recalled: ${recall.reason}` },
  }
}

export function checkExpiry(expiresAt: number, now: number): RuleResult {
  const rule = "expiry"
  if (now <= expiresAt) return pass(rule)
  return {
    rule,
    outcome: "stop",
    reason: { code: "BATCH_EXPIRED", message: "This product is past its expiry date." },
  }
}

/* ---------- P1-6: lifecycle ---------- */

/**
 * Only point-of-sale scans (consumer, retailer) are judged: a unit still in
 * the factory cannot legitimately be on a shelf. Inspectors scan anywhere.
 * `AT_DISTRIBUTOR` and `AT_RETAIL` pass: the next hop is often not recorded.
 */
export function checkLifecycle(state: LifecycleState, role: ScannerRole): RuleResult {
  const rule = "lifecycle"
  if (role === "inspector") return { rule, outcome: "skip" }
  if (state === "IN_FACTORY") {
    return {
      rule,
      outcome: "stop",
      reason: {
        code: "LIFECYCLE_IN_FACTORY",
        message: "The maker has not released this item yet. It should not be on sale.",
      },
      alert: {
        type: "PARALLEL_MARKET",
        priority: "high",
        message: "A unit still recorded in the factory was scanned at a point of sale.",
      },
    }
  }
  if (state === "IN_TRANSIT") {
    return {
      rule,
      outcome: "check",
      reason: {
        code: "LIFECYCLE_IN_TRANSIT",
        message: "Records show this item is still being transported.",
      },
    }
  }
  return pass(rule)
}

/* ---------- P1-7: spatial ---------- */

export function checkSpatial(
  designatedRegionIds: string[],
  regions: Region[],
  position: ScanContext["position"],
): RuleResult {
  const rule = "spatial"
  const designated = regions.filter((r) => designatedRegionIds.includes(r.id))
  if (designated.length === 0) return pass(rule) // nationwide, or regions unknown
  if (!position) {
    return {
      rule,
      outcome: "skip",
      reason: {
        code: "LOCATION_UNAVAILABLE",
        message: "Location was not shared, so the sale area was not checked.",
      },
    }
  }
  const slackKm = (position.accuracyM ?? 0) / 1000
  const inside = designated.some((r) => distanceKm(position, r.center) - slackKm <= r.radiusKm)
  if (inside) return pass(rule)
  const names = designated.map((r) => r.name).join(", ")
  return {
    rule,
    outcome: "check",
    reason: { code: "OUTSIDE_REGION", message: `This batch is meant for ${names}.` },
    alert: {
      type: "DISTRIBUTION_ANOMALY",
      priority: "medium",
      message: `Scanned outside its designated area (${names}).`,
    },
  }
}

/* ---------- P1-8: temporal ---------- */

/** "under a minute", "1 minute", "45 minutes", "3.5 hours" */
function describeGap(minutes: number): string {
  if (minutes < 1) return "under a minute"
  if (minutes < 120) {
    const m = Math.round(minutes)
    return `${m} minute${m === 1 ? "" : "s"}`
  }
  return `${(minutes / 60).toFixed(1)} hours`
}

/**
 * Impossible travel: two scans of one unit further apart than the speed
 * ceiling allows. Scans can arrive out of order (offline sync), so the time
 * gap is absolute. Repeat scans in one place are fine until the per-unit
 * limit, after which the unit may be a clone.
 */
export function checkTemporal(
  priorScans: PriorScan[],
  context: Pick<ScanContext, "at" | "position">,
  config: RuleConfig,
): RuleResult {
  const rule = "temporal"

  if (context.position) {
    let worst: { km: number; minutes: number; speed: number } | null = null
    for (const prior of priorScans) {
      if (!prior.position) continue
      const km = effectiveDistanceKm(context.position, prior.position)
      if (km < config.minTravelKm) continue
      const hours = Math.abs(context.at - prior.at) / HOUR_MS
      const speed = hours === 0 ? Infinity : km / hours
      if (speed > config.maxSpeedKmh && (!worst || speed > worst.speed)) {
        worst = { km, minutes: hours * 60, speed }
      }
    }
    if (worst) {
      const km = Math.round(worst.km)
      const gap = describeGap(worst.minutes)
      return {
        rule,
        outcome: "stop",
        reason: {
          code: "IMPOSSIBLE_TRAVEL",
          message: `This code was scanned ${km} km apart in ${gap}. It may be copied.`,
        },
        alert: {
          type: "IMPOSSIBLE_TRAVEL",
          priority: "high",
          message: `Same unit scanned ${km} km apart in ${gap}.`,
        },
      }
    }
  }

  if (priorScans.length >= config.maxScansPerUnit) {
    return {
      rule,
      outcome: "check",
      reason: {
        code: "REPEAT_LIMIT",
        message: `This code has already been scanned ${priorScans.length} times.`,
      },
      alert: {
        type: "DUPLICATE_SCANS",
        priority: "medium",
        message: `Unit scanned ${priorScans.length + 1} times (limit ${config.maxScansPerUnit}).`,
      },
    }
  }
  return pass(rule)
}
