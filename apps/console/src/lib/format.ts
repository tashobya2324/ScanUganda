import type { Batch } from "./types"

const DAY = 86_400_000

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date. */
export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 45) return "just now"
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < DAY / 1000) return `${Math.round(s / 3600)} h ago`
  if (s < 7 * DAY / 1000) return `${Math.round(s / (DAY / 1000))} d ago`
  return formatDate(ms)
}

export function percent(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${Math.round((part / whole) * 100)}%`
}

export type BatchStatus = "recalled" | "expired" | "expiring" | "active"

export function batchStatus(b: Pick<Batch, "recall" | "expiresAt">, now = Date.now()): BatchStatus {
  if (b.recall) return "recalled"
  if (b.expiresAt < now) return "expired"
  if (b.expiresAt - now < 30 * DAY) return "expiring"
  return "active"
}

/** "123456789012" → "1234 5678 9012" */
export function groupCode(code: string): string {
  return code.replace(/(\d{4})(?=\d)/g, "$1 ")
}

export const ALERT_LABELS: Record<string, string> = {
  COUNTERFEIT_SUSPECTED: "Suspected counterfeit",
  DISTRIBUTION_ANOMALY: "Outside sale area",
  IMPOSSIBLE_TRAVEL: "Impossible travel",
  PARALLEL_MARKET: "Parallel-market stock",
  DUPLICATE_SCANS: "Repeated scans",
}

export const STAGE_LABELS = {
  IN_FACTORY: "In factory",
  IN_TRANSIT: "In transit",
  AT_DISTRIBUTOR: "At distributor",
  AT_RETAIL: "At retail",
} as const

export const CATEGORY_LABELS = {
  FOOD: "Food",
  BEVERAGE: "Beverage",
  COSMETIC: "Cosmetic",
  AGRO_CHEMICAL: "Agro-chemical",
} as const

/** Builds the CSV a printer or label vendor expects. Quotes nothing: values never contain commas. */
export function unitsToCsv(units: { serial: string; payload: string; lookupCode: string }[]): string {
  return ["serial,payload,lookup_code", ...units.map((u) => `${u.serial},${u.payload},${u.lookupCode}`)].join("\n") + "\n"
}
