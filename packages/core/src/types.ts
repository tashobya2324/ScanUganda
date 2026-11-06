/**
 * Domain types shared by the API, the console, the PWA and the USSD handler.
 * Timestamps are epoch milliseconds (UTC). Distances are kilometres.
 */

export type Verdict = "GENUINE" | "CHECK" | "STOP"

export type LifecycleState =
  | "IN_FACTORY"
  | "IN_TRANSIT"
  | "AT_DISTRIBUTOR"
  | "AT_RETAIL"

export type ScanChannel = "PWA" | "USSD" | "SMS"

/** Who is scanning. Consumers and retailers scan at a point of sale. */
export type ScannerRole = "consumer" | "retailer" | "inspector"

export type ProductCategory = "FOOD" | "BEVERAGE" | "COSMETIC" | "AGRO_CHEMICAL"

export interface GeoPoint {
  lat: number
  lng: number
}

/** A location with an optional accuracy radius (GPS fix, or a district centre over USSD). */
export interface Position extends GeoPoint {
  accuracyM?: number
}

export interface Region {
  id: string
  name: string
  center: GeoPoint
  /** Radius that approximates the district, in km. */
  radiusKm: number
}

export interface Manufacturer {
  id: string
  name: string
}

export interface Product {
  id: string
  manufacturerId: string
  name: string
  category: ProductCategory
  /** e.g. "1 kg packet" */
  packSize: string
}

export interface Batch {
  id: string
  productId: string
  manufacturerId: string
  /** Manufacturer's own batch label, e.g. "KS-2408-17". */
  batchCode: string
  /** Which signing key issued this batch's codes. */
  keyId: string
  manufacturedAt: number
  expiresAt: number
  /** Empty means distributed nationwide. */
  designatedRegionIds: string[]
  recall: { at: number; reason: string } | null
}

export interface Unit {
  serial: string
  batchId: string
  lifecycle: LifecycleState
}

export interface PriorScan {
  at: number
  position?: Position
}

export interface ScanContext {
  at: number
  channel: ScanChannel
  scannerRole: ScannerRole
  position?: Position
}

export type AlertType =
  | "COUNTERFEIT_SUSPECTED"
  | "DISTRIBUTION_ANOMALY"
  | "IMPOSSIBLE_TRAVEL"
  | "PARALLEL_MARKET"
  | "DUPLICATE_SCANS"

export type AlertPriority = "low" | "medium" | "high"

export interface AlertDraft {
  type: AlertType
  priority: AlertPriority
  message: string
}

export type ReasonCode =
  | "UNKNOWN_CODE"
  | "INVALID_SIGNATURE"
  | "BATCH_RECALLED"
  | "BATCH_EXPIRED"
  | "LIFECYCLE_IN_FACTORY"
  | "LIFECYCLE_IN_TRANSIT"
  | "OUTSIDE_REGION"
  | "IMPOSSIBLE_TRAVEL"
  | "REPEAT_LIMIT"
  | "OFFLINE_UNCONFIRMED"
  | "LOCATION_UNAVAILABLE"

export interface Reason {
  code: ReasonCode
  message: string
}

export type RuleOutcome = "pass" | "check" | "stop" | "skip"

export interface RuleResult {
  rule: string
  outcome: RuleOutcome
  reason?: Reason
  alert?: AlertDraft
}

export interface VerifyResult {
  verdict: Verdict
  /** Reasons from every rule that did not pass, most severe first. */
  reasons: Reason[]
  alerts: AlertDraft[]
  /** Raw per-rule results, for logging and the console. */
  checks: RuleResult[]
}

export interface RuleConfig {
  /** Fastest plausible travel between two scans of one unit. */
  maxSpeedKmh: number
  /** Differences smaller than this are treated as GPS noise. */
  minTravelKm: number
  /** Scans of one unit (all places) before it is treated as a possible clone. */
  maxScansPerUnit: number
}

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  maxSpeedKmh: 120,
  minTravelKm: 5,
  maxScansPerUnit: 5,
}
