import type { AlertDraft, Reason, Region, Verdict } from "@scanuganda/core"
import { generateUnits } from "./codegen.ts"
import type { KeyStore } from "./keys.ts"
import { shortId, type Store } from "./store.ts"

/**
 * EXTRA SAMPLE DATA, added on top of seedDemo for demos and screenshots: more companies,
 * products and batches, and about 240 scans over the last 14 days spread across every region,
 * with some forged, cloned, recalled and out-of-region cases and the alerts they raise.
 * Invented companies. Deterministic: the same run gives the same data.
 */

const DAY = 24 * 3_600_000
const KM_PER_DEG = 111

/** Small seeded random number generator, so the data is the same on every run. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const MORE_MARKER = "Lake Victoria Dairy"

interface Made {
  id: string
  code: string
  serials: string[]
  regions: string[]
  recalled: boolean
}

export async function seedMore(store: Store, keys: KeyStore, pepper: string, now = Date.now()): Promise<{ batches: number; scans: number; alerts: number }> {
  if ((await store.manufacturers()).some((m) => m.name === MORE_MARKER)) throw new Error("The extra sample data is already loaded")
  const rand = rng(20261115)
  const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)]!

  const maker = (name: string) =>
    store.tx(async (s) => {
      const id = await s.insertManufacturer(name)
      const keyId = `k_${shortId()}`
      await s.insertKey(keyId, id, await keys.create(keyId, s))
      return id
    })
  const dairy = await maker(MORE_MARKER)
  const tea = await maker("Rwenzori Tea Estates")
  const bottlers = await maker("Savannah Bottlers")

  const milk = await store.insertProduct({ manufacturerId: dairy, name: "Fresh Whole Milk", category: "FOOD", packSize: "500 ml pouch" })
  const yoghurt = await store.insertProduct({ manufacturerId: dairy, name: "Natural Yoghurt", category: "FOOD", packSize: "250 g cup" })
  const tealeaf = await store.insertProduct({ manufacturerId: tea, name: "Black Tea Leaf", category: "FOOD", packSize: "100 g pack" })
  const water = await store.insertProduct({ manufacturerId: bottlers, name: "Spring Water", category: "BEVERAGE", packSize: "1.5 L bottle" })
  const cola = await store.insertProduct({ manufacturerId: bottlers, name: "Cola", category: "BEVERAGE", packSize: "300 ml bottle" })

  const stages = ["IN_FACTORY", "IN_TRANSIT", "AT_DISTRIBUTOR", "AT_RETAIL"] as const
  const created: Made[] = []
  const batch = async (
    manufacturerId: string, productId: string, code: string,
    o: { age: number; life: number; regions?: string[]; stage: number; units: number; recall?: string },
  ) => {
    const keyId = (await store.activeKeyId(manufacturerId))!
    const id = await store.insertBatch({
      productId, manufacturerId, batchCode: code, keyId,
      manufacturedAt: now - o.age * DAY, expiresAt: now + o.life * DAY, regionIds: o.regions ?? [],
    })
    const units = await generateUnits(store, keys, pepper, { id, keyId }, o.units)
    for (let i = 0; i < o.stage; i++) await store.advanceLifecycle(id, stages[i]!, stages[i + 1]!)
    if (o.recall) await store.setRecall(id, { at: now - 2 * DAY, reason: o.recall })
    created.push({ id, code, serials: units.map((u) => u.serial), regions: o.regions ?? [], recalled: !!o.recall })
  }
  await batch(dairy, milk, "LV-2411-01", { age: 6, life: 8, stage: 3, units: 12 })
  await batch(dairy, yoghurt, "LV-2411-02", { age: 9, life: 20, regions: ["kampala", "entebbe", "jinja"], stage: 3, units: 10 })
  await batch(tea, tealeaf, "RT-2409-05", { age: 80, life: 400, stage: 3, units: 12 })
  await batch(tea, tealeaf, "RT-2410-02", { age: 40, life: 500, regions: ["fortportal", "mbarara", "kampala"], stage: 3, units: 10 })
  await batch(bottlers, water, "SB-2410-11", { age: 30, life: 330, stage: 3, units: 14 })
  await batch(bottlers, cola, "SB-2411-03", { age: 12, life: 200, regions: ["gulu", "kampala"], stage: 2, units: 10 })
  await batch(bottlers, cola, "SB-2408-07", { age: 95, life: 120, stage: 3, units: 8, recall: "Contamination found in one bottling line" })

  // Include the batches from the first seed too, when they are present.
  for (const b of await store.batches()) {
    if (created.some((c) => c.id === b.id)) continue
    created.push({ id: b.id, code: b.batchCode, serials: ["000001", "000002", "000003"], regions: b.designatedRegionIds, recalled: !!b.recall })
  }

  const regions: Region[] = await store.regions()
  const around = (r: Region): { lat: number; lng: number } => {
    const radius = (r.radiusKm * 0.9 * Math.sqrt(rand())) / KM_PER_DEG
    const angle = rand() * 2 * Math.PI
    return {
      lat: r.center.lat + radius * Math.sin(angle),
      lng: r.center.lng + (radius * Math.cos(angle)) / Math.cos((r.center.lat * Math.PI) / 180),
    }
  }
  // Busier in the big towns.
  const weight: Record<string, number> = { kampala: 6, entebbe: 2, jinja: 3, mbale: 2, mbarara: 3, gulu: 2, fortportal: 2, masaka: 2, kapchorwa: 1 }
  const bag = regions.flatMap((r) => Array<Region>(weight[r.id] ?? 1).fill(r))

  let scans = 0
  let alerts = 0
  const record = async (
    b: Made, serial: string | null, region: Region, verdict: Verdict, reasons: Reason[], draft: AlertDraft | null,
    channel: "PWA" | "USSD" | "SMS", role: "consumer" | "retailer" | "inspector",
  ) => {
    await store.tx(async (s) => {
      const id = await s.insertScan({
        batchId: b.id, serial, scannedAt: now - Math.floor(rand() * 14 * DAY) - 60_000, channel, scannerRole: role,
        position: channel === "PWA" ? { ...around(region), accuracyM: 20 + Math.floor(rand() * 60) } : undefined,
        verdict, reasons, wasOffline: rand() < 0.08,
      })
      if (draft && (await s.insertAlert(id, b.id, draft))) alerts++
    })
    scans++
  }

  for (let i = 0; i < 240; i++) {
    const b = pick(created)
    const region = pick(bag)
    const channel = rand() < 0.8 ? "PWA" : rand() < 0.5 ? "SMS" : "USSD"
    const role = rand() < 0.1 ? "inspector" : rand() < 0.3 ? "retailer" : "consumer"
    const serial = pick(b.serials)
    const roll = rand()
    if (b.recalled) {
      await record(b, serial, region, "STOP", [{ code: "BATCH_RECALLED", message: "This batch was recalled" }], null, channel, role)
    } else if (roll < 0.74) {
      await record(b, serial, region, "GENUINE", [], null, channel, role)
    } else if (roll < 0.84) {
      await record(b, serial, region, "CHECK", [{ code: "REPEAT_LIMIT", message: "This code has been checked many times" }], { type: "DUPLICATE_SCANS", priority: "low", message: `Code ${b.code}-${serial} checked repeatedly` }, channel, role)
    } else if (roll < 0.9 && b.regions.length && !b.regions.includes(region.id)) {
      await record(b, serial, region, "CHECK", [{ code: "OUTSIDE_REGION", message: `Not meant to be sold in ${region.name}` }], { type: "PARALLEL_MARKET", priority: "medium", message: `${b.code} seen in ${region.name}, outside its sale zone` }, channel, role)
    } else if (roll < 0.95) {
      await record(b, serial, region, "STOP", [{ code: "IMPOSSIBLE_TRAVEL", message: "The same code was checked too far apart, too soon" }], { type: "IMPOSSIBLE_TRAVEL", priority: "high", message: `${b.code}-${serial} scanned in ${region.name} and far away within hours` }, channel, role)
    } else {
      await record(b, null, region, "STOP", [{ code: "INVALID_SIGNATURE", message: "This code was not issued by the manufacturer" }], { type: "COUNTERFEIT_SUSPECTED", priority: "high", message: `Forged code claiming to be ${b.code} in ${region.name}` }, channel, role)
    }
  }
  return { batches: created.length, scans, alerts }
}
