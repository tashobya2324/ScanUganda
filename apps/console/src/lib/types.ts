export type Role = "admin" | "manufacturer" | "inspector"
export type Verdict = "GENUINE" | "CHECK" | "STOP"
export type Lifecycle = "IN_FACTORY" | "IN_TRANSIT" | "AT_DISTRIBUTOR" | "AT_RETAIL"
export type Category = "FOOD" | "BEVERAGE" | "COSMETIC" | "AGRO_CHEMICAL"
export type AlertStatus = "open" | "investigating" | "resolved"
export type AlertPriority = "low" | "medium" | "high"

export interface User {
  id: string
  email: string
  name: string
  role: Role
  manufacturerId: string | null
}

export interface Region {
  id: string
  name: string
  center: { lat: number; lng: number }
  radiusKm: number
}

export interface Product {
  id: string
  manufacturerId: string
  name: string
  category: Category
  packSize: string
}

export interface Batch {
  id: string
  productId: string
  manufacturerId: string
  batchCode: string
  keyId: string
  manufacturedAt: number
  expiresAt: number
  designatedRegionIds: string[]
  recall: { at: number; reason: string } | null
  productName: string
  packSize: string
  category: Category
  manufacturerName: string
  unitCount: number
}

export interface BatchDetail extends Batch {
  lifecycle: Record<Lifecycle, number>
}

export interface Alert {
  id: string
  scanId: string
  batchId: string | null
  batchCode: string | null
  productName: string | null
  type: string
  priority: AlertPriority
  status: AlertStatus
  message: string
  createdAt: number
  updatedAt: number
  assignedTo: string | null
}

export interface Scan {
  id: string
  batchId: string | null
  batchCode: string | null
  serial: string | null
  scannedAt: number
  channel: "PWA" | "USSD" | "SMS"
  scannerRole: "consumer" | "retailer" | "inspector"
  lat: number | null
  lng: number | null
  verdict: Verdict
  reasons: { code: string; message: string }[]
  wasOffline: boolean
}

export interface Overview {
  last24h: { total: number; genuine: number; check: number; stop: number }
  openAlerts: { high: number; medium: number; low: number }
  batches: number
  recalledBatches: number
  daily: { date: string; GENUINE: number; CHECK: number; STOP: number }[]
}

export interface GeneratedUnit {
  serial: string
  payload: string
  lookupCode: string
}
