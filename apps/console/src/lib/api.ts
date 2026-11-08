import type {
  Alert, AlertPriority, AlertStatus, Batch, BatchDetail, Category, GeneratedUnit, Lifecycle,
  Overview, Product, Region, Role, Scan, User, Verdict,
} from "./types"

const BASE: string = import.meta.env.VITE_API_URL ?? ""
const STORAGE_KEY = "scanuganda.session"

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { fieldErrors?: Record<string, string[]> },
  ) {
    super(message)
  }
}

/* ---------- session ---------- */

export interface Session {
  token: string
  expiresAt: number
  user: User
}

let session: Session | null = readSession()
const listeners = new Set<() => void>()

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    return s.expiresAt > Date.now() ? s : null
  } catch {
    return null
  }
}

export const getSession = () => session
export function setSession(s: Session | null) {
  session = s
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  else localStorage.removeItem(STORAGE_KEY)
  listeners.forEach((l) => l())
}
export function onSessionChange(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/* ---------- transport ---------- */

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection and try again.")
  }
  if (res.ok) return (await res.json()) as T
  let err: { code?: string; message?: string; details?: ApiError["details"] } = {}
  try {
    err = ((await res.json()) as { error: typeof err }).error
  } catch {
    // non-JSON error body
  }
  // An expired or revoked token: drop the session so the app returns to sign-in.
  if (res.status === 401 && session && path !== "/v1/auth/login") setSession(null)
  throw new ApiError(res.status, err.code ?? "ERROR", err.message ?? `Request failed (${res.status})`, err.details)
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
  return p.length ? "?" + p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&") : ""
}

/* ---------- endpoints ---------- */

export const api = {
  login: (email: string, password: string) =>
    request<Session>("POST", "/v1/auth/login", { email, password }),

  overview: () => request<Overview>("GET", "/v1/overview"),
  regions: () => request<Region[]>("GET", "/v1/regions"),

  products: () => request<Product[]>("GET", "/v1/products"),
  createProduct: (p: { name: string; category: Category; packSize: string; manufacturerId?: string }) =>
    request<{ id: string }>("POST", "/v1/products", p),

  batches: () => request<Batch[]>("GET", "/v1/batches"),
  batch: (id: string) => request<BatchDetail>("GET", `/v1/batches/${id}`),
  createBatch: (b: { productId: string; batchCode: string; manufacturedAt: number; expiresAt: number; regionIds: string[] }) =>
    request<{ id: string }>("POST", "/v1/batches", b),
  generateUnits: (batchId: string, count: number) =>
    request<{ batchId: string; count: number; units: GeneratedUnit[] }>("POST", `/v1/batches/${batchId}/units`, { count }),
  advance: (batchId: string, from: Lifecycle, to: Lifecycle) =>
    request<{ moved: number }>("POST", `/v1/batches/${batchId}/lifecycle`, { from, to }),
  recall: (batchId: string, reason: string) =>
    request<{ recalledAt: number }>("POST", `/v1/batches/${batchId}/recall`, { reason }),
  liftRecall: (batchId: string) => request<{ ok: true }>("DELETE", `/v1/batches/${batchId}/recall`),

  alerts: (f: { status?: AlertStatus; priority?: AlertPriority; limit?: number } = {}) =>
    request<Alert[]>("GET", "/v1/alerts" + qs(f)),
  updateAlert: (id: string, status: AlertStatus, assignedTo?: string) =>
    request<Alert>("PATCH", `/v1/alerts/${id}`, { status, assignedTo }),

  scans: (f: { verdict?: Verdict; batchId?: string; limit?: number } = {}) =>
    request<Scan[]>("GET", "/v1/scans" + qs(f)),

  /** Runs one step of the USSD menu exactly as the aggregator would. `text` is the chain of inputs joined by "*". */
  ussd: (text: string) => request<{ type: "CON" | "END"; message: string; wire: string }>("POST", "/v1/ussd/simulate", { text }),

  users: () => request<User[]>("GET", "/v1/users"),
  createUser: (u: { email: string; name: string; password: string; role: Role; manufacturerId?: string }) =>
    request<{ id: string }>("POST", "/v1/users", u),
  manufacturers: () => request<{ id: string; name: string }[]>("GET", "/v1/manufacturers"),
  createManufacturer: (name: string) => request<{ id: string; keyId: string }>("POST", "/v1/manufacturers", { name }),
}
