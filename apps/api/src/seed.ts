import type { Region } from "@scanuganda/core"
import { hashPassword } from "./auth.ts"
import { generateUnits } from "./codegen.ts"
import type { KeyStore } from "./keys.ts"
import { shortId, type Store } from "./store.ts"

/**
 * SAMPLE DATA for development and demos. The companies are invented and the
 * situations (recalls, expiries, wrong-region stock) are staged on purpose.
 */

const DAY = 24 * 3_600_000

export const SEED_REGIONS: Region[] = [
  { id: "kampala", name: "Kampala", center: { lat: 0.3476, lng: 32.5825 }, radiusKm: 15 },
  { id: "entebbe", name: "Entebbe", center: { lat: 0.0512, lng: 32.4637 }, radiusKm: 10 },
  { id: "jinja", name: "Jinja", center: { lat: 0.4244, lng: 33.2041 }, radiusKm: 15 },
  { id: "mbale", name: "Mbale", center: { lat: 1.0821, lng: 34.1751 }, radiusKm: 15 },
  { id: "kapchorwa", name: "Kapchorwa", center: { lat: 1.3988, lng: 34.45 }, radiusKm: 20 },
  { id: "fortportal", name: "Fort Portal", center: { lat: 0.671, lng: 30.275 }, radiusKm: 12 },
  { id: "mbarara", name: "Mbarara", center: { lat: -0.6072, lng: 30.6545 }, radiusKm: 15 },
  { id: "masaka", name: "Masaka", center: { lat: -0.3338, lng: 31.7341 }, radiusKm: 12 },
  { id: "gulu", name: "Gulu", center: { lat: 2.7746, lng: 32.299 }, radiusKm: 15 },
]

export interface DemoCode {
  scenario: string
  batchCode: string
  product: string
  serial: string
  payload: string
  lookupCode: string
}

export interface SeedResult {
  users: { email: string; role: string }[]
  codes: DemoCode[]
}

type Stage = "IN_FACTORY" | "IN_TRANSIT" | "AT_DISTRIBUTOR" | "AT_RETAIL"
const STAGES: Stage[] = ["IN_FACTORY", "IN_TRANSIT", "AT_DISTRIBUTOR", "AT_RETAIL"]

export async function seedDemo(
  store: Store,
  keys: KeyStore,
  pepper: string,
  password: string,
  now = Date.now(),
): Promise<SeedResult> {
  for (const r of SEED_REGIONS) store.insertRegion(r)

  const maker = (name: string) => {
    const id = store.insertManufacturer(name)
    const keyId = `k_${shortId()}`
    store.insertKey(keyId, id, keys.create(keyId))
    return id
  }
  const pearl = maker("Pearl Sugar Works")
  const nile = maker("Nile Valley Beverages")
  const acacia = maker("Acacia Cosmetics")
  const kilimo = maker("Kilimo Agro-Chem")

  const product = (manufacturerId: string, name: string, category: "FOOD" | "BEVERAGE" | "COSMETIC" | "AGRO_CHEMICAL", packSize: string) =>
    store.insertProduct({ manufacturerId, name, category, packSize })
  const sugar = product(pearl, "Premium White Sugar", "FOOD", "1 kg packet")
  const cereal = product(pearl, "Infant Maize Cereal", "FOOD", "400 g tin")
  const orange = product(nile, "Sparkling Orange", "BEVERAGE", "500 ml bottle")
  const lotion = product(acacia, "Shea Body Lotion", "COSMETIC", "400 ml")
  const pesticide = product(kilimo, "Cypermethrin 50 EC", "AGRO_CHEMICAL", "250 ml")

  const users = [
    { email: "admin@scanuganda.test", name: "Site Admin", role: "admin" as const, manufacturerId: null },
    { email: "pearl@scanuganda.test", name: "Pearl Sugar QA", role: "manufacturer" as const, manufacturerId: pearl },
    { email: "inspector@scanuganda.test", name: "UNBS Inspector", role: "inspector" as const, manufacturerId: null },
  ]
  const hash = await hashPassword(password)
  for (const u of users) store.insertUser({ ...u, passwordHash: hash })

  const codes: DemoCode[] = []
  const batch = (
    scenario: string, manufacturerId: string, productId: string, productName: string, batchCode: string,
    opts: { ageDays: number; lifeDays: number; regions?: string[]; stage: Stage; units: number; recall?: string },
  ) => {
    const keyId = store.activeKeyId(manufacturerId)!
    const id = store.insertBatch({
      productId, manufacturerId, batchCode, keyId,
      manufacturedAt: now - opts.ageDays * DAY, expiresAt: now + opts.lifeDays * DAY, regionIds: opts.regions ?? [],
    })
    const units = generateUnits(store, keys, pepper, { id, keyId }, opts.units)
    for (let i = 0; i < STAGES.indexOf(opts.stage); i++) store.advanceLifecycle(id, STAGES[i]!, STAGES[i + 1]!)
    if (opts.recall) store.setRecall(id, { at: now - DAY, reason: opts.recall })
    for (const u of units) codes.push({ scenario, batchCode, product: productName, serial: u.serial, payload: u.payload, lookupCode: u.lookupCode })
  }

  batch("E1 genuine, on sale nationwide", pearl, sugar, "Premium White Sugar", "PS-2408-17", { ageDays: 60, lifeDays: 300, stage: "AT_DISTRIBUTOR", units: 10 })
  batch("E3 regional stock (Kapchorwa, Mbale only)", kilimo, pesticide, "Cypermethrin 50 EC", "KA-2410-03", { ageDays: 30, lifeDays: 500, regions: ["kapchorwa", "mbale"], stage: "AT_DISTRIBUTOR", units: 10 })
  batch("E5 still in the factory", nile, orange, "Sparkling Orange", "NV-2411-01", { ageDays: 2, lifeDays: 180, stage: "IN_FACTORY", units: 5 })
  batch("in transit", nile, orange, "Sparkling Orange", "NV-2410-04", { ageDays: 14, lifeDays: 180, stage: "IN_TRANSIT", units: 5 })
  batch("E6 recalled", pearl, cereal, "Infant Maize Cereal", "PC-2406-02", { ageDays: 120, lifeDays: 200, stage: "AT_RETAIL", units: 5, recall: "Packaging fault: seal may fail" })
  batch("expired", acacia, lotion, "Shea Body Lotion", "AC-2305-09", { ageDays: 700, lifeDays: -10, stage: "AT_RETAIL", units: 3 })

  return { users: users.map((u) => ({ email: u.email, role: u.role })), codes }
}
