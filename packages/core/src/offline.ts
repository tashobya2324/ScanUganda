import { parsePayload } from "./codes.ts"
import { checkExpiry, checkRecall, checkSignature } from "./rules.ts"
import type { RuleResult, VerifyResult } from "./types.ts"

/**
 * What the PWA keeps on the device after a sync. Public keys only: no secret
 * ever reaches a client.
 */
export interface OfflineCache {
  /** keyId → public key (hex). */
  publicKeys: Record<string, string>
  /** batchId → what is needed to judge a code without the server. */
  batches: Record<string, { keyId: string; expiresAt: number }>
  recalledBatchIds: string[]
  syncedAt: number
}

/**
 * Judges a signed code with no network. It can prove a code is forged,
 * recalled (as of the last sync) or expired, but never that it is genuine:
 * location and scan-history rules need the server. So the best answer is
 * CHECK, and the scan is queued for the server to re-evaluate.
 */
export function verifyOffline(payload: string, cache: OfflineCache, now: number): VerifyResult {
  const parsed = parsePayload(payload)
  const batch = parsed ? cache.batches[parsed.batchId] : undefined

  const checks: RuleResult[] = []
  if (!parsed || !batch) {
    // Malformed is forged. Well-formed but unknown may be a batch created after
    // the last sync, so we cannot call it fake.
    checks.push(
      parsed
        ? {
            rule: "registry",
            outcome: "check",
            reason: {
              code: "OFFLINE_UNCONFIRMED",
              message: "This batch is not in your offline list yet. Check again when online.",
            },
          }
        : checkSignature(payload, { batchId: "", serial: "" }, undefined),
    )
  } else {
    checks.push(
      checkSignature(
        payload,
        { batchId: parsed.batchId, serial: parsed.serial },
        cache.publicKeys[batch.keyId],
      ),
    )
    if (checks[0]!.outcome === "pass") {
      checks.push(
        checkRecall(
          cache.recalledBatchIds.includes(parsed.batchId)
            ? { at: cache.syncedAt, reason: "recalled by the manufacturer" }
            : null,
        ),
        checkExpiry(batch.expiresAt, now),
      )
    }
  }

  const stopped = checks.filter((c) => c.outcome === "stop")
  if (stopped.length > 0) {
    return {
      verdict: "STOP",
      reasons: stopped.map((c) => c.reason!),
      alerts: [], // the server raises alerts when the queued scan syncs
      checks,
    }
  }
  const unconfirmed = checks.find((c) => c.reason?.code === "OFFLINE_UNCONFIRMED")
  return {
    verdict: "CHECK",
    reasons: [
      unconfirmed?.reason ?? {
        code: "OFFLINE_UNCONFIRMED",
        message: "Checked offline. We will confirm it when you are back online.",
      },
    ],
    alerts: [],
    checks,
  }
}
