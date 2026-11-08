import { isValidLookupCode, normalizeLookupCode, parsePayload } from "@scanuganda/core/light"
import type { Reason } from "@scanuganda/core"
import { ApiError, api } from "./api"
import { notifyChange } from "./bus"
import { db, type ScanRecord } from "./db"
import { getPosition } from "./geo"
import { getPrefs } from "./prefs"

/** The input was not a usable code. Nothing was recorded. */
export class InputError extends Error {
  constructor(public code: "NOT_A_SCANUGANDA_CODE" | "INVALID_CODE_FORMAT", message: string) {
    super(message)
  }
}

const NO_LIST: Reason = {
  code: "OFFLINE_UNCONFIRMED",
  message: "No offline list on this phone yet. Check again when you have a connection.",
}

/** "123456789012" → "•••• •••• 9012" (the full code is never kept in the history). */
const maskCode = (code: string) => `•••• •••• ${code.slice(-4)}`

/**
 * Checks one QR payload or typed code and records it in the history.
 *
 * Online: the server judges it. Unreachable: the phone judges what it can
 * (QR codes only, never better than CHECK) and queues the scan for the server.
 */
export async function checkScan(input: { payload?: string; code?: string }, now = Date.now()): Promise<ScanRecord> {
  const payload = input.payload?.trim()
  const code = input.code !== undefined ? normalizeLookupCode(input.code) : undefined

  if (payload !== undefined) {
    if (!parsePayload(payload)) throw new InputError("NOT_A_SCANUGANDA_CODE", "This is not a ScanUganda code.")
  } else if (code === undefined || !isValidLookupCode(code)) {
    throw new InputError("INVALID_CODE_FORMAT", "The code must be 12 digits. Check it and try again.")
  }

  const id = crypto.randomUUID()
  const position = await getPosition()
  const role = getPrefs().role
  const base = {
    id,
    at: now,
    source: payload !== undefined ? ("qr" as const) : ("code" as const),
    label: payload !== undefined ? `QR · ${parsePayload(payload)!.serial}` : maskCode(code!),
    position,
  }

  try {
    const out = await api.verify({ payload, code, position, scannerRole: role })
    const record: ScanRecord = { ...base, status: "confirmed", verdict: out.verdict, reasons: out.reasons, product: out.product, serverScanId: out.scanId }
    await db.historyPut(record)
    notifyChange()
    return record
  } catch (e) {
    if (e instanceof ApiError && e.status === 422) throw new InputError("NOT_A_SCANUGANDA_CODE", e.message)
    if (e instanceof ApiError && e.code === "INVALID_CODE_FORMAT") throw new InputError("INVALID_CODE_FORMAT", e.message)
    if (!(e instanceof ApiError && e.unreachable)) throw e
  }

  // No connection to the server: judge on the phone and queue for later.
  await db.queueAdd({ clientId: id, payload, code, scannedAt: now, position, scannerRole: role })
  let record: ScanRecord
  if (payload !== undefined) {
    const cache = await db.getCache()
    // The signature library is only needed here, offline: load it then, not at start-up.
    const { verifyOffline } = await import("@scanuganda/core")
    const r = cache ? verifyOffline(payload, cache, now) : null
    record = { ...base, status: "offline", verdict: r?.verdict ?? "CHECK", reasons: r?.reasons ?? [NO_LIST], product: null }
  } else {
    record = { ...base, status: "waiting", verdict: null, reasons: [], product: null }
  }
  await db.historyPut(record)
  notifyChange()
  return record
}
