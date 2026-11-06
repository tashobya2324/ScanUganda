import { z } from "zod"

export const PositionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(1_000_000).optional(),
})

export const ChannelSchema = z.enum(["PWA", "USSD", "SMS"])
export const ScannerRoleSchema = z.enum(["consumer", "retailer", "inspector"])
export const VerdictSchema = z.enum(["GENUINE", "CHECK", "STOP"])
export const LifecycleSchema = z.enum(["IN_FACTORY", "IN_TRANSIT", "AT_DISTRIBUTOR", "AT_RETAIL"])
export const CategorySchema = z.enum(["FOOD", "BEVERAGE", "COSMETIC", "AGRO_CHEMICAL"])
export const RoleSchema = z.enum(["admin", "manufacturer", "inspector"])

export const ReasonSchema = z.object({ code: z.string(), message: z.string() })

export const ProductInfoSchema = z.object({
  productName: z.string(),
  packSize: z.string(),
  category: z.string(),
  manufacturer: z.string(),
  batchCode: z.string(),
  manufacturedAt: z.number(),
  expiresAt: z.number(),
})

export const ScanOutcomeSchema = z.object({
  scanId: z.string(),
  verdict: VerdictSchema,
  reasons: z.array(ReasonSchema),
  product: ProductInfoSchema.nullable(),
  duplicate: z.boolean(),
})

export const RegionSchema = z.object({
  id: z.string(),
  name: z.string(),
  center: z.object({ lat: z.number(), lng: z.number() }),
  radiusKm: z.number(),
})

export const IdParam = z.object({ id: z.string().min(1).max(64) })

export const Limit = z.coerce.number().int().min(1).max(500).default(100)

export const UserViewSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: RoleSchema,
  manufacturerId: z.string().nullable(),
})

export const BatchViewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  manufacturerId: z.string(),
  batchCode: z.string(),
  keyId: z.string(),
  manufacturedAt: z.number(),
  expiresAt: z.number(),
  designatedRegionIds: z.array(z.string()),
  recall: z.object({ at: z.number(), reason: z.string() }).nullable(),
  productName: z.string(),
  packSize: z.string(),
  category: CategorySchema,
  manufacturerName: z.string(),
  unitCount: z.number(),
})

export const AlertViewSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  batchId: z.string().nullable(),
  batchCode: z.string().nullable(),
  productName: z.string().nullable(),
  type: z.string(),
  priority: z.string(),
  status: z.string(),
  message: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  assignedTo: z.string().nullable(),
})

export const ScanViewSchema = z.object({
  id: z.string(),
  batchId: z.string().nullable(),
  batchCode: z.string().nullable(),
  serial: z.string().nullable(),
  scannedAt: z.number(),
  channel: ChannelSchema,
  scannerRole: ScannerRoleSchema,
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  verdict: VerdictSchema,
  reasons: z.array(ReasonSchema),
  wasOffline: z.boolean(),
})
