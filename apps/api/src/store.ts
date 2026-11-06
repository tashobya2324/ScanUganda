import { randomBytes, randomUUID } from "node:crypto"
import type {
  AlertDraft,
  Batch,
  LifecycleState,
  PriorScan,
  ProductCategory,
  Reason,
  Region,
  ScanChannel,
  ScannerRole,
  Unit,
  Verdict,
} from "@scanuganda/core"
import { all, get, run, transaction, type Db } from "./db.ts"
import type { Role } from "./http.ts"

/** Short URL-safe id (fits the signed-code payload alphabet). */
export const shortId = (): string => randomBytes(8).toString("base64url")
export const uuid = (): string => randomUUID()

export const LIFECYCLE_ORDER: LifecycleState[] = ["IN_FACTORY", "IN_TRANSIT", "AT_DISTRIBUTOR", "AT_RETAIL"]

/* ---------- row shapes ---------- */

interface BatchRow {
  id: string
  product_id: string
  manufacturer_id: string
  batch_code: string
  key_id: string
  manufactured_at: number
  expires_at: number
  recalled_at: number | null
  recall_reason: string | null
}

export interface BatchView extends Batch {
  productName: string
  packSize: string
  category: ProductCategory
  manufacturerName: string
  unitCount: number
}

export interface UserRow {
  id: string
  email: string
  password_hash: string
  name: string
  role: Role
  manufacturer_id: string | null
}

export interface AlertView {
  id: string
  scanId: string
  batchId: string | null
  batchCode: string | null
  productName: string | null
  type: string
  priority: string
  status: string
  message: string
  createdAt: number
  updatedAt: number
  assignedTo: string | null
}

export interface ScanView {
  id: string
  batchId: string | null
  batchCode: string | null
  serial: string | null
  scannedAt: number
  channel: ScanChannel
  scannerRole: ScannerRole
  lat: number | null
  lng: number | null
  verdict: Verdict
  reasons: Reason[]
  wasOffline: boolean
}

export class Store {
  constructor(public db: Db) {}

  tx<T>(fn: () => T): T {
    return transaction(this.db, fn)
  }

  /* ----- reference data ----- */

  regions(): Region[] {
    return all<{ id: string; name: string; lat: number; lng: number; radius_km: number }>(
      this.db,
      "SELECT * FROM regions ORDER BY name",
    ).map((r) => ({ id: r.id, name: r.name, center: { lat: r.lat, lng: r.lng }, radiusKm: r.radius_km }))
  }

  insertRegion(r: Region): void {
    run(this.db, "INSERT INTO regions VALUES (?,?,?,?,?)", r.id, r.name, r.center.lat, r.center.lng, r.radiusKm)
  }

  /* ----- manufacturers, keys, users ----- */

  insertManufacturer(name: string): string {
    const id = uuid()
    run(this.db, "INSERT INTO manufacturers VALUES (?,?,?)", id, name, Date.now())
    return id
  }
  manufacturers(): { id: string; name: string }[] {
    return all(this.db, "SELECT id, name FROM manufacturers ORDER BY name")
  }
  manufacturerName(id: string): string | undefined {
    return get<{ name: string }>(this.db, "SELECT name FROM manufacturers WHERE id = ?", id)?.name
  }

  insertKey(id: string, manufacturerId: string, publicKey: string): void {
    run(this.db, "INSERT INTO signing_keys VALUES (?,?,?,?,NULL)", id, manufacturerId, publicKey, Date.now())
  }
  activeKeyId(manufacturerId: string): string | undefined {
    return get<{ id: string }>(
      this.db,
      "SELECT id FROM signing_keys WHERE manufacturer_id = ? AND retired_at IS NULL ORDER BY created_at DESC LIMIT 1",
      manufacturerId,
    )?.id
  }
  /** keyId → public key, including retired keys (old codes stay valid). */
  publicKeys(): Record<string, string> {
    return Object.fromEntries(
      all<{ id: string; public_key: string }>(this.db, "SELECT id, public_key FROM signing_keys").map((k) => [
        k.id,
        k.public_key,
      ]),
    )
  }

  insertUser(u: { email: string; passwordHash: string; name: string; role: Role; manufacturerId: string | null }): string {
    const id = uuid()
    run(this.db, "INSERT INTO users VALUES (?,?,?,?,?,?,?)", id, u.email.toLowerCase(), u.passwordHash, u.name, u.role, u.manufacturerId, Date.now())
    return id
  }
  userByEmail(email: string): UserRow | undefined {
    return get<UserRow>(this.db, "SELECT * FROM users WHERE email = ?", email.toLowerCase())
  }
  userById(id: string): UserRow | undefined {
    return get<UserRow>(this.db, "SELECT * FROM users WHERE id = ?", id)
  }
  users(manufacturerId?: string) {
    return all<{ id: string; email: string; name: string; role: Role; manufacturer_id: string | null }>(
      this.db,
      `SELECT id, email, name, role, manufacturer_id FROM users ${manufacturerId ? "WHERE manufacturer_id = ?" : ""} ORDER BY name`,
      ...(manufacturerId ? [manufacturerId] : []),
    ).map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, manufacturerId: u.manufacturer_id }))
  }

  /* ----- products and batches ----- */

  insertProduct(p: { manufacturerId: string; name: string; category: ProductCategory; packSize: string }): string {
    const id = uuid()
    run(this.db, "INSERT INTO products VALUES (?,?,?,?,?)", id, p.manufacturerId, p.name, p.category, p.packSize)
    return id
  }
  products(manufacturerId?: string) {
    return all<{ id: string; manufacturer_id: string; name: string; category: ProductCategory; pack_size: string }>(
      this.db,
      `SELECT * FROM products ${manufacturerId ? "WHERE manufacturer_id = ?" : ""} ORDER BY name`,
      ...(manufacturerId ? [manufacturerId] : []),
    ).map((p) => ({ id: p.id, manufacturerId: p.manufacturer_id, name: p.name, category: p.category, packSize: p.pack_size }))
  }
  product(id: string) {
    return this.products().find((p) => p.id === id)
  }

  private toBatch(r: BatchRow): Batch {
    return {
      id: r.id,
      productId: r.product_id,
      manufacturerId: r.manufacturer_id,
      batchCode: r.batch_code,
      keyId: r.key_id,
      manufacturedAt: r.manufactured_at,
      expiresAt: r.expires_at,
      designatedRegionIds: all<{ region_id: string }>(this.db, "SELECT region_id FROM batch_regions WHERE batch_id = ?", r.id).map((x) => x.region_id),
      recall: r.recalled_at !== null ? { at: r.recalled_at, reason: r.recall_reason ?? "" } : null,
    }
  }

  insertBatch(b: {
    productId: string
    manufacturerId: string
    batchCode: string
    keyId: string
    manufacturedAt: number
    expiresAt: number
    regionIds: string[]
  }): string {
    return this.tx(() => {
      const id = shortId()
      run(this.db, "INSERT INTO batches VALUES (?,?,?,?,?,?,?,NULL,NULL)", id, b.productId, b.manufacturerId, b.batchCode, b.keyId, b.manufacturedAt, b.expiresAt)
      for (const rid of new Set(b.regionIds)) run(this.db, "INSERT INTO batch_regions VALUES (?,?)", id, rid)
      return id
    })
  }

  batch(id: string): Batch | undefined {
    const r = get<BatchRow>(this.db, "SELECT * FROM batches WHERE id = ?", id)
    return r ? this.toBatch(r) : undefined
  }

  batchView(id: string): BatchView | undefined {
    return this.batches(undefined, id)[0]
  }

  batches(manufacturerId?: string, id?: string): BatchView[] {
    const where = [manufacturerId ? "b.manufacturer_id = ?" : "", id ? "b.id = ?" : ""].filter(Boolean)
    const rows = all<BatchRow & { product_name: string; pack_size: string; category: ProductCategory; manufacturer_name: string; unit_count: number }>(
      this.db,
      `SELECT b.*, p.name AS product_name, p.pack_size, p.category, m.name AS manufacturer_name,
              (SELECT COUNT(*) FROM units u WHERE u.batch_id = b.id) AS unit_count
         FROM batches b JOIN products p ON p.id = b.product_id JOIN manufacturers m ON m.id = b.manufacturer_id
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY b.manufactured_at DESC`,
      ...[manufacturerId, id].filter((x): x is string => x !== undefined),
    )
    return rows.map((r) => ({
      ...this.toBatch(r),
      productName: r.product_name,
      packSize: r.pack_size,
      category: r.category,
      manufacturerName: r.manufacturer_name,
      unitCount: r.unit_count,
    }))
  }

  setRecall(batchId: string, recall: { at: number; reason: string } | null): void {
    run(this.db, "UPDATE batches SET recalled_at = ?, recall_reason = ? WHERE id = ?", recall?.at ?? null, recall?.reason ?? null, batchId)
  }

  /* ----- units ----- */

  nextSerial(batchId: string): number {
    const r = get<{ n: number | null }>(this.db, "SELECT MAX(CAST(serial AS INTEGER)) AS n FROM units WHERE batch_id = ?", batchId)
    return (r?.n ?? 0) + 1
  }
  insertUnit(batchId: string, serial: string, lookupHash: string): void {
    run(this.db, "INSERT INTO units VALUES (?,?,?,?)", serial, batchId, "IN_FACTORY", lookupHash)
  }
  unit(batchId: string, serial: string): Unit | undefined {
    const r = get<{ serial: string; batch_id: string; lifecycle: LifecycleState }>(this.db, "SELECT * FROM units WHERE batch_id = ? AND serial = ?", batchId, serial)
    return r ? { serial: r.serial, batchId: r.batch_id, lifecycle: r.lifecycle } : undefined
  }
  unitByLookupHash(hash: string): Unit | undefined {
    const r = get<{ serial: string; batch_id: string; lifecycle: LifecycleState }>(this.db, "SELECT * FROM units WHERE lookup_hash = ?", hash)
    return r ? { serial: r.serial, batchId: r.batch_id, lifecycle: r.lifecycle } : undefined
  }
  unitCountsByLifecycle(batchId: string): Record<LifecycleState, number> {
    const out: Record<LifecycleState, number> = { IN_FACTORY: 0, IN_TRANSIT: 0, AT_DISTRIBUTOR: 0, AT_RETAIL: 0 }
    for (const r of all<{ lifecycle: LifecycleState; n: number }>(this.db, "SELECT lifecycle, COUNT(*) AS n FROM units WHERE batch_id = ? GROUP BY lifecycle", batchId)) out[r.lifecycle] = r.n
    return out
  }
  /** Moves every unit currently in `from` to `to`. Returns how many changed. */
  advanceLifecycle(batchId: string, from: LifecycleState, to: LifecycleState): number {
    const n = get<{ n: number }>(this.db, "SELECT COUNT(*) AS n FROM units WHERE batch_id = ? AND lifecycle = ?", batchId, from)?.n ?? 0
    run(this.db, "UPDATE units SET lifecycle = ? WHERE batch_id = ? AND lifecycle = ?", to, batchId, from)
    return n
  }

  /* ----- scans and alerts ----- */

  priorScans(batchId: string | null, serial: string | null, excludeScanId?: string): PriorScan[] {
    if (!batchId || !serial) return []
    return all<{ scanned_at: number; lat: number | null; lng: number | null; accuracy_m: number | null }>(
      this.db,
      "SELECT scanned_at, lat, lng, accuracy_m FROM scans WHERE batch_id = ? AND serial = ? AND id <> ?",
      batchId, serial, excludeScanId ?? "",
    ).map((s) => ({
      at: s.scanned_at,
      position: s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng, accuracyM: s.accuracy_m ?? undefined } : undefined,
    }))
  }

  scanByClientId(clientId: string): { id: string; verdict: Verdict; reasons: Reason[]; batchId: string | null } | undefined {
    const r = get<{ id: string; verdict: Verdict; reasons_json: string; batch_id: string | null }>(this.db, "SELECT id, verdict, reasons_json, batch_id FROM scans WHERE client_id = ?", clientId)
    return r ? { id: r.id, verdict: r.verdict, reasons: JSON.parse(r.reasons_json) as Reason[], batchId: r.batch_id } : undefined
  }

  insertScan(s: {
    batchId: string | null
    serial: string | null
    scannedAt: number
    channel: ScanChannel
    scannerRole: ScannerRole
    position?: { lat: number; lng: number; accuracyM?: number }
    verdict: Verdict
    reasons: Reason[]
    wasOffline: boolean
    clientId?: string
  }): string {
    const id = uuid()
    run(this.db, "INSERT INTO scans (id,batch_id,serial,scanned_at,received_at,channel,scanner_role,lat,lng,accuracy_m,verdict,reasons_json,was_offline,client_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id, s.batchId, s.serial, s.scannedAt, Date.now(), s.channel, s.scannerRole, s.position?.lat, s.position?.lng, s.position?.accuracyM, s.verdict, JSON.stringify(s.reasons), s.wasOffline ? 1 : 0, s.clientId)
    return id
  }

  insertAlert(scanId: string, batchId: string | null, a: AlertDraft): void {
    const now = Date.now()
    run(this.db, "INSERT INTO alerts VALUES (?,?,?,?,?,'open',?,?,?,NULL)", uuid(), scanId, batchId, a.type, a.priority, a.message, now, now)
  }

  private alertSelect = `SELECT a.*, b.batch_code, p.name AS product_name, b.manufacturer_id AS m_id
      FROM alerts a LEFT JOIN batches b ON b.id = a.batch_id LEFT JOIN products p ON p.id = b.product_id`

  private toAlert(r: Record<string, unknown>): AlertView {
    return {
      id: r.id as string, scanId: r.scan_id as string, batchId: r.batch_id as string | null,
      batchCode: r.batch_code as string | null, productName: r.product_name as string | null,
      type: r.type as string, priority: r.priority as string, status: r.status as string,
      message: r.message as string, createdAt: r.created_at as number, updatedAt: r.updated_at as number,
      assignedTo: r.assigned_to as string | null,
    }
  }

  /** `manufacturerId` limits results to that manufacturer's batches. */
  alerts(f: { manufacturerId?: string; status?: string; priority?: string; limit: number }): AlertView[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (f.manufacturerId) { where.push("b.manufacturer_id = ?"); params.push(f.manufacturerId) }
    if (f.status) { where.push("a.status = ?"); params.push(f.status) }
    if (f.priority) { where.push("a.priority = ?"); params.push(f.priority) }
    return all<Record<string, unknown>>(
      this.db,
      `${this.alertSelect} ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY CASE a.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, a.created_at DESC LIMIT ?`,
      ...params, f.limit,
    ).map((r) => this.toAlert(r))
  }
  alert(id: string): (AlertView & { manufacturerId: string | null }) | undefined {
    const r = get<Record<string, unknown>>(this.db, `${this.alertSelect} WHERE a.id = ?`, id)
    return r ? { ...this.toAlert(r), manufacturerId: r.m_id as string | null } : undefined
  }
  updateAlert(id: string, status: string, assignedTo?: string | null): void {
    run(this.db, "UPDATE alerts SET status = ?, assigned_to = COALESCE(?, assigned_to), updated_at = ? WHERE id = ?", status, assignedTo, Date.now(), id)
  }

  scans(f: { manufacturerId?: string; verdict?: string; batchId?: string; since?: number; limit: number }): ScanView[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (f.manufacturerId) { where.push("b.manufacturer_id = ?"); params.push(f.manufacturerId) }
    if (f.verdict) { where.push("s.verdict = ?"); params.push(f.verdict) }
    if (f.batchId) { where.push("s.batch_id = ?"); params.push(f.batchId) }
    if (f.since !== undefined) { where.push("s.scanned_at >= ?"); params.push(f.since) }
    return all<Record<string, unknown>>(
      this.db,
      `SELECT s.*, b.batch_code FROM scans s LEFT JOIN batches b ON b.id = s.batch_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.scanned_at DESC LIMIT ?`,
      ...params, f.limit,
    ).map((r) => ({
      id: r.id as string, batchId: r.batch_id as string | null, batchCode: r.batch_code as string | null,
      serial: r.serial as string | null, scannedAt: r.scanned_at as number, channel: r.channel as ScanChannel,
      scannerRole: r.scanner_role as ScannerRole, lat: r.lat as number | null, lng: r.lng as number | null,
      verdict: r.verdict as Verdict, reasons: JSON.parse(r.reasons_json as string) as Reason[], wasOffline: r.was_offline === 1,
    }))
  }

  insertReport(r: { scanId?: string; description: string; shopName?: string; lat?: number; lng?: number; contact?: string }): string {
    const id = uuid()
    run(this.db, "INSERT INTO reports (id,scan_id,description,shop_name,lat,lng,photo_path,contact,created_at) VALUES (?,?,?,?,?,?,NULL,?,?)", id, r.scanId, r.description, r.shopName, r.lat, r.lng, r.contact, Date.now())
    return id
  }
  scanExists(id: string): boolean {
    return get(this.db, "SELECT 1 AS x FROM scans WHERE id = ?", id) !== undefined
  }

  /* ----- stats ----- */

  overview(manufacturerId: string | undefined, now: number) {
    const scope = manufacturerId ? "AND b.manufacturer_id = ?" : ""
    const join = "FROM scans s LEFT JOIN batches b ON b.id = s.batch_id"
    const p = manufacturerId ? [manufacturerId] : []
    const day = 24 * 3_600_000
    const verdicts = all<{ verdict: Verdict; n: number }>(this.db, `SELECT s.verdict, COUNT(*) AS n ${join} WHERE s.scanned_at >= ? ${scope} GROUP BY s.verdict`, now - day, ...p)
    const count = (v: Verdict) => verdicts.find((x) => x.verdict === v)?.n ?? 0
    const daily = all<{ d: string; verdict: Verdict; n: number }>(
      this.db,
      `SELECT strftime('%Y-%m-%d', s.scanned_at / 1000, 'unixepoch') AS d, s.verdict, COUNT(*) AS n ${join}
        WHERE s.scanned_at >= ? ${scope} GROUP BY d, s.verdict ORDER BY d`,
      now - 7 * day, ...p,
    )
    const days = new Map<string, { date: string; GENUINE: number; CHECK: number; STOP: number }>()
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now - i * day).toISOString().slice(0, 10)
      days.set(date, { date, GENUINE: 0, CHECK: 0, STOP: 0 })
    }
    for (const r of daily) { const d = days.get(r.d); if (d) d[r.verdict] = r.n }
    const alertScope = manufacturerId ? "WHERE b.manufacturer_id = ? AND" : "WHERE"
    const openAlerts = all<{ priority: string; n: number }>(this.db, `SELECT a.priority, COUNT(*) AS n FROM alerts a LEFT JOIN batches b ON b.id = a.batch_id ${alertScope} a.status <> 'resolved' GROUP BY a.priority`, ...p)
    const bScope = manufacturerId ? "WHERE manufacturer_id = ?" : ""
    return {
      last24h: { total: count("GENUINE") + count("CHECK") + count("STOP"), genuine: count("GENUINE"), check: count("CHECK"), stop: count("STOP") },
      openAlerts: { high: openAlerts.find((a) => a.priority === "high")?.n ?? 0, medium: openAlerts.find((a) => a.priority === "medium")?.n ?? 0, low: openAlerts.find((a) => a.priority === "low")?.n ?? 0 },
      batches: get<{ n: number }>(this.db, `SELECT COUNT(*) AS n FROM batches ${bScope}`, ...p)?.n ?? 0,
      recalledBatches: get<{ n: number }>(this.db, `SELECT COUNT(*) AS n FROM batches ${bScope ? bScope + " AND" : "WHERE"} recalled_at IS NOT NULL`, ...p)?.n ?? 0,
      daily: [...days.values()],
    }
  }
}
