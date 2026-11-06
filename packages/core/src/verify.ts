import {
  checkExpiry,
  checkLifecycle,
  checkRecall,
  checkSignature,
  checkSpatial,
  checkTemporal,
} from "./rules.ts"
import {
  DEFAULT_RULE_CONFIG,
  type AlertDraft,
  type Batch,
  type PriorScan,
  type Reason,
  type Region,
  type RuleConfig,
  type RuleResult,
  type ScanContext,
  type Unit,
  type Verdict,
  type VerifyResult,
} from "./types.ts"

export type Credential =
  /** QR / signed payload. Verified against the batch's public key. */
  | { kind: "signed"; payload: string }
  /** 12-digit code matched by the caller via its hash (USSD, manual entry). */
  | { kind: "lookup" }

export interface VerifyInput {
  credential: Credential
  /** Records resolved by the caller. `null` means no match was found. */
  batch: Batch | null
  unit: Unit | null
  /** keyId → public key (hex). */
  publicKeys: Record<string, string>
  regions: Region[]
  /** Earlier scans of this same unit, any order. */
  priorScans: PriorScan[]
  context: ScanContext
  config?: Partial<RuleConfig>
}

const SEVERITY: Record<RuleResult["outcome"], number> = { stop: 0, check: 1, skip: 2, pass: 3 }

function combine(checks: RuleResult[]): VerifyResult {
  const verdict: Verdict = checks.some((c) => c.outcome === "stop")
    ? "STOP"
    : checks.some((c) => c.outcome === "check")
      ? "CHECK"
      : "GENUINE"
  const reasons: Reason[] = checks
    .filter((c) => c.reason)
    .sort((a, b) => SEVERITY[a.outcome] - SEVERITY[b.outcome])
    .map((c) => c.reason as Reason)
  const alerts: AlertDraft[] = checks.flatMap((c) => (c.alert ? [c.alert] : []))
  return { verdict, reasons, alerts, checks }
}

const UNKNOWN: RuleResult = {
  rule: "registry",
  outcome: "stop",
  reason: { code: "UNKNOWN_CODE", message: "This code is not in the registry." },
  alert: {
    type: "COUNTERFEIT_SUSPECTED",
    priority: "medium",
    message: "A code that does not exist in the registry was scanned.",
  },
}

/**
 * The verification engine. Pure: it performs no I/O, so the API, the USSD
 * handler and tests all get identical answers. Any rule that says STOP wins;
 * otherwise any CHECK wins; otherwise the product is GENUINE.
 */
export function verifyScan(input: VerifyInput): VerifyResult {
  const { credential, batch, unit, publicKeys, regions, priorScans, context } = input
  const config: RuleConfig = { ...DEFAULT_RULE_CONFIG, ...input.config }

  if (!batch || !unit || unit.batchId !== batch.id) return combine([UNKNOWN])

  const checks: RuleResult[] = []

  if (credential.kind === "signed") {
    const sig = checkSignature(
      credential.payload,
      { batchId: batch.id, serial: unit.serial },
      publicKeys[batch.keyId],
    )
    checks.push(sig)
    // A forged code says nothing reliable about the batch, so stop here.
    if (sig.outcome !== "pass") return combine(checks)
  }

  checks.push(
    checkRecall(batch.recall),
    checkExpiry(batch.expiresAt, context.at),
    checkLifecycle(unit.lifecycle, context.scannerRole),
    checkSpatial(batch.designatedRegionIds, regions, context.position),
    checkTemporal(priorScans, context, config),
  )
  return combine(checks)
}
