import {
  hashLookupCode,
  isValidLookupCode,
  parsePayload,
  verifyScan,
  type Batch,
  type Position,
  type Reason,
  type ScanChannel,
  type ScannerRole,
  type Unit,
  type Verdict,
} from "@scanuganda/core"
import { HttpError } from "./http.ts"
import { verifyPayloadNative } from "./native-ed25519.ts"
import type { Store } from "./store.ts"

export interface ScanRequest {
  /** Exactly one of payload (QR) or code (12-digit) is set. */
  payload?: string
  code?: string
  channel: ScanChannel
  scannerRole: ScannerRole
  position?: Position
  /** When the scan happened on the device. */
  at: number
  wasOffline: boolean
  /** Device-assigned id making a retried sync a no-op. */
  clientId?: string
}

export interface ProductInfo {
  productName: string
  packSize: string
  category: string
  manufacturer: string
  batchCode: string
  manufacturedAt: number
  expiresAt: number
}

export interface ScanOutcome {
  scanId: string
  verdict: Verdict
  reasons: Reason[]
  /** Null when the code is forged or unknown: nothing about it can be trusted. */
  product: ProductInfo | null
  /** True when this clientId was already processed and the stored answer is returned. */
  duplicate: boolean
}

/**
 * Resolves records, runs the core engine, stores the scan and raises alerts.
 * Shared by HTTP verify, offline sync and USSD so every channel answers alike.
 */
export async function performScan(store: Store, pepper: string, req: ScanRequest): Promise<ScanOutcome> {
  if (req.clientId) {
    const prior = await store.scanByClientId(req.clientId)
    if (prior) {
      return {
        scanId: prior.id,
        verdict: prior.verdict,
        reasons: prior.reasons,
        product: await productFor(store, prior.batchId, prior.reasons),
        duplicate: true,
      }
    }
  }

  let batch: Batch | null = null
  let unit: Unit | null = null
  let claimed: { batchId: string; serial: string } | null = null

  if (req.payload !== undefined) {
    const parsed = parsePayload(req.payload)
    // Not shaped like our codes at all (a website QR, a barcode): say so without recording a scan.
    if (!parsed) throw new HttpError(422, "NOT_A_SCANUGANDA_CODE", "This is not a ScanUganda code, so it cannot be checked.")
    claimed = { batchId: parsed.batchId, serial: parsed.serial }
    batch = (await store.batch(parsed.batchId)) ?? null
    unit = batch ? ((await store.unit(batch.id, parsed.serial)) ?? null) : null
  } else if (req.code !== undefined) {
    if (!isValidLookupCode(req.code)) {
      throw new HttpError(400, "INVALID_CODE_FORMAT", "The code must be 12 digits. Check it and try again.")
    }
    unit = (await store.unitByLookupHash(hashLookupCode(req.code, pepper))) ?? null
    batch = unit ? ((await store.batch(unit.batchId)) ?? null) : null
    if (unit) claimed = { batchId: unit.batchId, serial: unit.serial }
  } else {
    throw new HttpError(400, "VALIDATION_FAILED", "Send either payload or code")
  }

  const priorScans = await store.priorScans(claimed?.batchId ?? null, claimed?.serial ?? null)
  const result = verifyScan({
    credential: req.payload !== undefined ? { kind: "signed", payload: req.payload } : { kind: "lookup" },
    batch,
    unit,
    publicKeys: await store.publicKeys(),
    verifySignature: verifyPayloadNative,
    regions: await store.regions(),
    priorScans,
    context: { at: req.at, channel: req.channel, scannerRole: req.scannerRole, position: req.position },
  })

  const scanId = await store.tx(async (s) => {
    const id = await s.insertScan({
      batchId: claimed?.batchId ?? null,
      serial: claimed?.serial ?? null,
      scannedAt: req.at,
      channel: req.channel,
      scannerRole: req.scannerRole,
      position: req.position,
      verdict: result.verdict,
      reasons: result.reasons,
      wasOffline: req.wasOffline,
      clientId: req.clientId,
    })
    for (const a of result.alerts) await s.insertAlert(id, batch?.id ?? null, a, { batchId: claimed?.batchId ?? null, serial: claimed?.serial ?? null })
    return id
  })

  return {
    scanId,
    verdict: result.verdict,
    reasons: result.reasons,
    product: await productFor(store, batch?.id ?? null, result.reasons),
    duplicate: false,
  }
}

async function productFor(store: Store, batchId: string | null, reasons: Reason[]): Promise<ProductInfo | null> {
  if (!batchId) return null
  if (reasons.some((r) => r.code === "INVALID_SIGNATURE" || r.code === "UNKNOWN_CODE")) return null
  return (await store.productInfo(batchId)) ?? null
}
