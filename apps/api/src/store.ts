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
import { all, get, run, type Db, type Param, type Queryable } from "./db.ts"
import type { Role } from "./http.ts"
import type { KeyRows } from "./keys.ts"

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/** Short URL-safe id (fits the signed-code payload alphabet). */
export const shortId = (): string => b64url(crypto.getRandomValues(new Uint8Array(8)))
export const uuid = (): string => crypto.randomUUID()

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
  /** Comma-separated designated region ids ("" = nationwide). */
  region_ids: string
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

/** Builds a WHERE clause with numbered placeholders ($1, $2...). */
class Where {
  readonly params: Param[] = []
  private parts: string[] = []
  /** `sql` holds one "?" for its value. */
  add(sql: string, value: Param): this {
    this.params.push(value)
    this.parts.push(sql.replace("?", `$${this.params.length}`))
    return this
  }
  /** Placeholder for a value used after the WHERE clause (e.g. LIMIT). */
  next(value: Param): string {
    this.params.push(value)
    return `$${this.params.length}`
  }
  toString(): string {
    return this.parts.length ? `WHERE ${this.parts.join(" AND ")}` : ""
  }
}

/** A batch's designated regions, in the same query: one round trip per list, not one per batch. */
const REGION_IDS = `COALESCE((SELECT string_agg(r.region_id, ',' ORDER BY r.region_id) FROM batch_regions r WHERE r.batch_id = b.id), '') AS region_ids`

export class Store implements KeyRows {
  /**
   * @param db  the database (opens transactions)
   * @param q   where queries go: the database itself, or an open transaction
   */
  constructor(
    public readonly db: Db,
    private readonly q: Queryable = db,
    private readonly memo = new Map<string, { at: number; value: unknown }>(),
    private readonly inTx = false,
  ) {}

  /**
   * Runs `fn` in one transaction with a Store bound to it. Inside `fn`, use only the
   * Store it is given. A nested call joins the outer transaction.
   */
  tx<T>(fn: (s: Store) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this)
    return this.db.transaction((q) => fn(new Store(this.db, q, this.memo, true)))
  }

  close(): Promise<void> {
    return this.db.close()
  }

  /* ----- reference data ----- */

  /**
   * Reference data that every check needs but that almost never changes (districts, public
   * keys) is kept for a few seconds instead of re-read on each request. Our own writes drop
   * it at once; another server's writes show up within the TTL. Nothing read inside a
   * transaction is cached: it might still be rolled back.
   */
  private async cached<T>(key: string, load: () => Promise<T>, ttlMs = 5000): Promise<T> {
    const hit = this.memo.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
    const value = await load()
    if (!this.inTx) this.memo.set(key, { at: Date.now(), value })
    return value
  }

  regions(): Promise<Region[]> {
    return this.cached("regions", async () =>
      (await all<{ id: string; name: string; lat: number; lng: number; radius_km: number }>(this.q, "SELECT * FROM regions ORDER BY name")).map(
        (r) => ({ id: r.id, name: r.name, center: { lat: r.lat, lng: r.lng }, radiusKm: r.radius_km }),
      ),
    )
  }

  async insertRegion(r: Region): Promise<void> {
    await run(this.q, "INSERT INTO regions VALUES ($1,$2,$3,$4,$5)", r.id, r.name, r.center.lat, r.center.lng, r.radiusKm)
    this.memo.delete("regions")
  }

  /* ----- manufacturers, keys, users ----- */

  async insertManufacturer(name: string): Promise<string> {
    const id = uuid()
    await run(this.q, "INSERT INTO manufacturers VALUES ($1,$2,$3)", id, name, Date.now())
    return id
  }
  manufacturers(): Promise<{ id: string; name: string }[]> {
    return all(this.q, "SELECT id, name FROM manufacturers ORDER BY name")
  }
  async manufacturerName(id: string): Promise<string | undefined> {
    return (await get<{ name: string }>(this.q, "SELECT name FROM manufacturers WHERE id = $1", id))?.name
  }
  async manufacturerExists(id: string): Promise<boolean> {
    return (await get(this.q, "SELECT 1 AS x FROM manufacturers WHERE id = $1", id)) !== undefined
  }

  async insertKey(id: string, manufacturerId: string, publicKey: string): Promise<void> {
    await run(this.q, "INSERT INTO signing_keys VALUES ($1,$2,$3,$4,NULL)", id, manufacturerId, publicKey, Date.now())
    this.memo.delete("publicKeys")
  }
  async activeKeyId(manufacturerId: string): Promise<string | undefined> {
    return (
      await get<{ id: string }>(
        this.q,
        "SELECT id FROM signing_keys WHERE manufacturer_id = $1 AND retired_at IS NULL ORDER BY created_at DESC LIMIT 1",
        manufacturerId,
      )
    )?.id
  }
  /** Stops signing new codes with a manufacturer's current key(s). Old codes keep verifying: the public key stays. */
  async retireKeys(manufacturerId: string): Promise<void> {
    await run(this.q, "UPDATE signing_keys SET retired_at = $1 WHERE manufacturer_id = $2 AND retired_at IS NULL", Date.now(), manufacturerId)
  }
  /** keyId → public key, including retired keys (old codes stay valid). */
  publicKeys(): Promise<Record<string, string>> {
    return this.cached("publicKeys", async () =>
      Object.fromEntries(
        (await all<{ id: string; public_key: string }>(this.q, "SELECT id, public_key FROM signing_keys")).map((k) => [k.id, k.public_key]),
      ),
    )
  }

  /** Encrypted private keys (SealedKeyStore). */
  async putSealedKey(keyId: string, sealed: string): Promise<void> {
    await run(this.q, "INSERT INTO sealed_signing_keys VALUES ($1,$2,$3)", keyId, sealed, Date.now())
  }
  async sealedKey(keyId: string): Promise<string | undefined> {
    return (await get<{ sealed: string }>(this.q, "SELECT sealed FROM sealed_signing_keys WHERE key_id = $1", keyId))?.sealed
  }

  /** What a shopper is shown about a product. Cheaper than `batchView`: no unit count. */
  async productInfo(batchId: string) {
    const r = await get<{ batch_code: string; manufactured_at: number; expires_at: number; product_name: string; pack_size: string; category: string; manufacturer_name: string }>(
      this.q,
      `SELECT b.batch_code, b.manufactured_at, b.expires_at, p.name AS product_name, p.pack_size, p.category, m.name AS manufacturer_name
         FROM batches b JOIN products p ON p.id = b.product_id JOIN manufacturers m ON m.id = b.manufacturer_id WHERE b.id = $1`,
      batchId,
    )
    return r && {
      productName: r.product_name,
      packSize: r.pack_size,
      category: r.category,
      manufacturer: r.manufacturer_name,
      batchCode: r.batch_code,
      manufacturedAt: r.manufactured_at,
      expiresAt: r.expires_at,
    }
  }

  async insertUser(u: { email: string; passwordHash: string; name: string; role: Role; manufacturerId: string | null }): Promise<string> {
    const id = uuid()
    await run(this.q, "INSERT INTO users VALUES ($1,$2,$3,$4,$5,$6,$7)", id, u.email.toLowerCase(), u.passwordHash, u.name, u.role, u.manufacturerId, Date.now())
    return id
  }
  userByEmail(email: string): Promise<UserRow | undefined> {
    return get<UserRow>(this.q, "SELECT * FROM users WHERE email = $1", email.toLowerCase())
  }
  userById(id: string): Promise<UserRow | undefined> {
    return get<UserRow>(this.q, "SELECT * FROM users WHERE id = $1", id)
  }
  async users(manufacturerId?: string) {
    const where = new Where()
    if (manufacturerId) where.add("manufacturer_id = ?", manufacturerId)
    return (
      await all<{ id: string; email: string; name: string; role: Role; manufacturer_id: string | null }>(
        this.q,
        `SELECT id, email, name, role, manufacturer_id FROM users ${where} ORDER BY name`,
        ...where.params,
      )
    ).map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, manufacturerId: u.manufacturer_id }))
  }

  /* ----- products and batches ----- */

  async insertProduct(p: { manufacturerId: string; name: string; category: ProductCategory; packSize: string }): Promise<string> {
    const id = uuid()
    await run(this.q, "INSERT INTO products VALUES ($1,$2,$3,$4,$5)", id, p.manufacturerId, p.name, p.category, p.packSize)
    return id
  }
  async products(manufacturerId?: string, id?: string) {
    const where = new Where()
    if (manufacturerId) where.add("manufacturer_id = ?", manufacturerId)
    if (id) where.add("id = ?", id)
    return (
      await all<{ id: string; manufacturer_id: string; name: string; category: ProductCategory; pack_size: string }>(
        this.q,
        `SELECT * FROM products ${where} ORDER BY name`,
        ...where.params,
      )
    ).map((p) => ({ id: p.id, manufacturerId: p.manufacturer_id, name: p.name, category: p.category, packSize: p.pack_size }))
  }
  async product(id: string) {
    return (await this.products(undefined, id))[0]
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
      designatedRegionIds: r.region_ids ? r.region_ids.split(",") : [],
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
  }): Promise<string> {
    return this.tx(async (s) => {
      const id = shortId()
      await run(s.q, "INSERT INTO batches VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL)", id, b.productId, b.manufacturerId, b.batchCode, b.keyId, b.manufacturedAt, b.expiresAt)
      for (const rid of new Set(b.regionIds)) await run(s.q, "INSERT INTO batch_regions VALUES ($1,$2)", id, rid)
      return id
    })
  }

  async batch(id: string): Promise<Batch | undefined> {
    const r = await get<BatchRow>(this.q, `SELECT b.*, ${REGION_IDS} FROM batches b WHERE b.id = $1`, id)
    return r ? this.toBatch(r) : undefined
  }

  async batchView(id: string): Promise<BatchView | undefined> {
    return (await this.batches(undefined, id))[0]
  }

  async batches(manufacturerId?: string, id?: string): Promise<BatchView[]> {
    const where = new Where()
    if (manufacturerId) where.add("b.manufacturer_id = ?", manufacturerId)
    if (id) where.add("b.id = ?", id)
    const rows = await all<BatchRow & { product_name: string; pack_size: string; category: ProductCategory; manufacturer_name: string; unit_count: number }>(
      this.q,
      `SELECT b.*, p.name AS product_name, p.pack_size, p.category, m.name AS manufacturer_name, ${REGION_IDS},
              (SELECT COUNT(*) FROM units u WHERE u.batch_id = b.id) AS unit_count
         FROM batches b JOIN products p ON p.id = b.product_id JOIN manufacturers m ON m.id = b.manufacturer_id
         ${where}
         ORDER BY b.manufactured_at DESC`,
      ...where.params,
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

  async setRecall(batchId: string, recall: { at: number; reason: string } | null): Promise<void> {
    await run(this.q, "UPDATE batches SET recalled_at = $1, recall_reason = $2 WHERE id = $3", recall?.at ?? null, recall?.reason ?? null, batchId)
  }

  /* ----- units ----- */

  async nextSerial(batchId: string): Promise<number> {
    const r = await get<{ n: number | null }>(this.q, "SELECT MAX(serial::bigint) AS n FROM units WHERE batch_id = $1", batchId)
    return (r?.n ?? 0) + 1
  }
  /** False when the lookup hash is already taken (the caller draws a new code). */
  async insertUnit(batchId: string, serial: string, lookupHash: string): Promise<boolean> {
    // ON CONFLICT instead of catching an error: in Postgres any error aborts the whole transaction.
    return (await run(this.q, "INSERT INTO units VALUES ($1,$2,$3,$4) ON CONFLICT (lookup_hash) DO NOTHING", serial, batchId, "IN_FACTORY", lookupHash)) === 1
  }
  async unit(batchId: string, serial: string): Promise<Unit | undefined> {
    const r = await get<{ serial: string; batch_id: string; lifecycle: LifecycleState }>(this.q, "SELECT * FROM units WHERE batch_id = $1 AND serial = $2", batchId, serial)
    return r ? { serial: r.serial, batchId: r.batch_id, lifecycle: r.lifecycle } : undefined
  }
  async unitByLookupHash(hash: string): Promise<Unit | undefined> {
    const r = await get<{ serial: string; batch_id: string; lifecycle: LifecycleState }>(this.q, "SELECT * FROM units WHERE lookup_hash = $1", hash)
    return r ? { serial: r.serial, batchId: r.batch_id, lifecycle: r.lifecycle } : undefined
  }
  async unitCountsByLifecycle(batchId: string): Promise<Record<LifecycleState, number>> {
    const out: Record<LifecycleState, number> = { IN_FACTORY: 0, IN_TRANSIT: 0, AT_DISTRIBUTOR: 0, AT_RETAIL: 0 }
    for (const r of await all<{ lifecycle: LifecycleState; n: number }>(this.q, "SELECT lifecycle, COUNT(*) AS n FROM units WHERE batch_id = $1 GROUP BY lifecycle", batchId)) out[r.lifecycle] = r.n
    return out
  }
  /** Moves every unit currently in `from` to `to`. Returns how many changed. */
  advanceLifecycle(batchId: string, from: LifecycleState, to: LifecycleState): Promise<number> {
    return run(this.q, "UPDATE units SET lifecycle = $1 WHERE batch_id = $2 AND lifecycle = $3", to, batchId, from)
  }

  /* ----- scans and alerts ----- */

  async priorScans(batchId: string | null, serial: string | null, excludeScanId?: string): Promise<PriorScan[]> {
    if (!batchId || !serial) return []
    return (
      await all<{ scanned_at: number; lat: number | null; lng: number | null; accuracy_m: number | null }>(
        this.q,
        "SELECT scanned_at, lat, lng, accuracy_m FROM scans WHERE batch_id = $1 AND serial = $2 AND id <> $3",
        batchId, serial, excludeScanId ?? "",
      )
    ).map((s) => ({
      at: s.scanned_at,
      position: s.lat !== null && s.lng !== null ? { lat: s.lat, lng: s.lng, accuracyM: s.accuracy_m ?? undefined } : undefined,
    }))
  }

  async scanByClientId(clientId: string): Promise<{ id: string; verdict: Verdict; reasons: Reason[]; batchId: string | null } | undefined> {
    const r = await get<{ id: string; verdict: Verdict; reasons_json: string; batch_id: string | null }>(this.q, "SELECT id, verdict, reasons_json, batch_id FROM scans WHERE client_id = $1", clientId)
    return r ? { id: r.id, verdict: r.verdict, reasons: JSON.parse(r.reasons_json) as Reason[], batchId: r.batch_id } : undefined
  }

  async insertScan(s: {
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
  }): Promise<string> {
    const id = uuid()
    await run(this.q, "INSERT INTO scans (id,batch_id,serial,scanned_at,received_at,channel,scanner_role,lat,lng,accuracy_m,verdict,reasons_json,was_offline,client_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      id, s.batchId, s.serial, s.scannedAt, Date.now(), s.channel, s.scannerRole, s.position?.lat, s.position?.lng, s.position?.accuracyM, s.verdict, JSON.stringify(s.reasons), s.wasOffline, s.clientId)
    return id
  }

  /**
   * Raises an alert, unless the same kind is already open for the same unit within the
   * last hour. Repeated attempts on one forged or cloned code are folded into the alert
   * already waiting, so an attacker cannot flood the inbox. Returns whether one was created.
   */
  async insertAlert(scanId: string, batchId: string | null, a: AlertDraft, unit?: { batchId: string | null; serial: string | null }): Promise<boolean> {
    const now = Date.now()
    if (unit) {
      const dup = await get(
        this.q,
        `SELECT 1 AS x FROM alerts a JOIN scans s ON s.id = a.scan_id
          WHERE a.type = $1 AND a.status <> 'resolved' AND a.created_at > $2
            AND s.batch_id IS NOT DISTINCT FROM $3::text AND s.serial IS NOT DISTINCT FROM $4::text`,
        a.type, now - 3_600_000, unit.batchId, unit.serial,
      )
      if (dup) return false
    }
    await run(this.q, "INSERT INTO alerts VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8,NULL)", uuid(), scanId, batchId, a.type, a.priority, a.message, now, now)
    return true
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
  async alerts(f: { manufacturerId?: string; status?: string; priority?: string; limit: number }): Promise<AlertView[]> {
    const where = new Where()
    if (f.manufacturerId) where.add("b.manufacturer_id = ?", f.manufacturerId)
    if (f.status) where.add("a.status = ?", f.status)
    if (f.priority) where.add("a.priority = ?", f.priority)
    const limit = where.next(f.limit)
    return (
      await all<Record<string, unknown>>(
        this.q,
        `${this.alertSelect} ${where}
         ORDER BY CASE a.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, a.created_at DESC LIMIT ${limit}`,
        ...where.params,
      )
    ).map((r) => this.toAlert(r))
  }
  async alert(id: string): Promise<(AlertView & { manufacturerId: string | null }) | undefined> {
    const r = await get<Record<string, unknown>>(this.q, `${this.alertSelect} WHERE a.id = $1`, id)
    return r ? { ...this.toAlert(r), manufacturerId: r.m_id as string | null } : undefined
  }
  async updateAlert(id: string, status: string, assignedTo?: string | null): Promise<void> {
    await run(this.q, "UPDATE alerts SET status = $1, assigned_to = COALESCE($2::text, assigned_to), updated_at = $3 WHERE id = $4", status, assignedTo, Date.now(), id)
  }

  async scans(f: { manufacturerId?: string; verdict?: string; batchId?: string; since?: number; limit: number }): Promise<ScanView[]> {
    const where = new Where()
    if (f.manufacturerId) where.add("b.manufacturer_id = ?", f.manufacturerId)
    if (f.verdict) where.add("s.verdict = ?", f.verdict)
    if (f.batchId) where.add("s.batch_id = ?", f.batchId)
    if (f.since !== undefined) where.add("s.scanned_at >= ?", f.since)
    const limit = where.next(f.limit)
    return (
      await all<Record<string, unknown>>(
        this.q,
        `SELECT s.*, b.batch_code FROM scans s LEFT JOIN batches b ON b.id = s.batch_id
         ${where} ORDER BY s.scanned_at DESC LIMIT ${limit}`,
        ...where.params,
      )
    ).map((r) => ({
      id: r.id as string, batchId: r.batch_id as string | null, batchCode: r.batch_code as string | null,
      serial: r.serial as string | null, scannedAt: r.scanned_at as number, channel: r.channel as ScanChannel,
      scannerRole: r.scanner_role as ScannerRole, lat: r.lat as number | null, lng: r.lng as number | null,
      verdict: r.verdict as Verdict, reasons: JSON.parse(r.reasons_json as string) as Reason[], wasOffline: r.was_offline === true,
    }))
  }

  async insertReport(r: { scanId?: string; description: string; shopName?: string; lat?: number; lng?: number; contact?: string }): Promise<string> {
    const id = uuid()
    await run(this.q, "INSERT INTO reports (id,scan_id,description,shop_name,lat,lng,photo_path,contact,created_at) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8)", id, r.scanId, r.description, r.shopName, r.lat, r.lng, r.contact, Date.now())
    return id
  }
  async scanExists(id: string): Promise<boolean> {
    return (await get(this.q, "SELECT 1 AS x FROM scans WHERE id = $1", id)) !== undefined
  }

  /* ----- stats ----- */

  async overview(manufacturerId: string | undefined, now: number) {
    // $1 is the manufacturer, or NULL for everyone, in every query below.
    const scope = "($1::text IS NULL OR b.manufacturer_id = $1::text)"
    const join = "FROM scans s LEFT JOIN batches b ON b.id = s.batch_id"
    const m = manufacturerId ?? null
    const day = 24 * 3_600_000
    // Sequential, not Promise.all: inside one connection the queries queue anyway.
    const verdicts = await all<{ verdict: Verdict; n: number }>(this.q, `SELECT s.verdict, COUNT(*) AS n ${join} WHERE ${scope} AND s.scanned_at >= $2 GROUP BY s.verdict`, m, now - day)
    const daily = await all<{ d: string; verdict: Verdict; n: number }>(
      this.q,
      `SELECT to_char(to_timestamp(s.scanned_at / 1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d, s.verdict, COUNT(*) AS n ${join}
        WHERE ${scope} AND s.scanned_at >= $2 GROUP BY d, s.verdict ORDER BY d`,
      m, now - 7 * day,
    )
    const openAlerts = await all<{ priority: string; n: number }>(this.q, `SELECT a.priority, COUNT(*) AS n FROM alerts a LEFT JOIN batches b ON b.id = a.batch_id WHERE ${scope} AND a.status <> 'resolved' GROUP BY a.priority`, m)
    const batchCounts = await get<{ total: number; recalled: number }>(this.q, `SELECT COUNT(*) AS total, COUNT(b.recalled_at) AS recalled FROM batches b WHERE ${scope}`, m)

    const count = (v: Verdict) => verdicts.find((x) => x.verdict === v)?.n ?? 0
    const days = new Map<string, { date: string; GENUINE: number; CHECK: number; STOP: number }>()
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now - i * day).toISOString().slice(0, 10)
      days.set(date, { date, GENUINE: 0, CHECK: 0, STOP: 0 })
    }
    for (const r of daily) { const d = days.get(r.d); if (d) d[r.verdict] = r.n }
    const alerts = (p: string) => openAlerts.find((a) => a.priority === p)?.n ?? 0
    return {
      last24h: { total: count("GENUINE") + count("CHECK") + count("STOP"), genuine: count("GENUINE"), check: count("CHECK"), stop: count("STOP") },
      openAlerts: { high: alerts("high"), medium: alerts("medium"), low: alerts("low") },
      batches: batchCounts?.total ?? 0,
      recalledBatches: batchCounts?.recalled ?? 0,
      daily: [...days.values()],
    }
  }
}
