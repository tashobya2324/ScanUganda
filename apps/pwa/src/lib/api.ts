import type { Reason, Verdict } from "@scanuganda/core"
import type { CacheSnapshot, ProductInfo } from "./db"

const BASE: string = import.meta.env.VITE_API_URL ?? ""

export class ApiError extends Error {
  constructor(
    /** 0 means the server could not be reached at all. */
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
  get unreachable() {
    return this.status === 0 || this.status >= 502
  }
}

async function request<T>(method: string, path: string, body?: unknown, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the server.")
  } finally {
    clearTimeout(timer)
  }
  if (res.ok) return (await res.json()) as T
  let err: { code?: string; message?: string } = {}
  try {
    err = ((await res.json()) as { error: typeof err }).error
  } catch {
    // not JSON (e.g. a proxy error page)
  }
  throw new ApiError(res.status, err.code ?? "ERROR", err.message ?? `Request failed (${res.status})`)
}

export interface Position {
  lat: number
  lng: number
  accuracyM?: number
}

export interface ScanOutcome {
  scanId: string
  verdict: Verdict
  reasons: Reason[]
  product: ProductInfo | null
  duplicate: boolean
}

export type SyncResult =
  | { clientId: string; ok: true; outcome: ScanOutcome }
  | { clientId: string; ok: false; error: { code: string; message: string } }

export const api = {
  verify: (b: { payload?: string; code?: string; position?: Position; scannerRole: "consumer" | "retailer"; channel?: "PWA" }) =>
    request<ScanOutcome>("POST", "/v1/verify", { channel: "PWA", ...b }),
  sync: () => request<CacheSnapshot & { regions: unknown[] }>("GET", "/v1/sync"),
  uploadScans: (scans: { clientId: string; payload?: string; code?: string; scannedAt: number; position?: Position; scannerRole: "consumer" | "retailer" }[]) =>
    request<{ results: SyncResult[] }>("POST", "/v1/sync/scans", { scans }, 20000),
  report: (r: { description: string; shopName?: string; position?: Position; scanId?: string; contact?: string }) =>
    request<{ id: string }>("POST", "/v1/reports", r),
}
