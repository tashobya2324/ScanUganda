import { z } from "zod"
import { hashPassword } from "./auth.ts"
import { generateUnits } from "./codegen.ts"
import type { Config } from "./config.ts"
import { badRequest, HttpError, notFound, raw, type AuthUser, type Route } from "./http.ts"
import type { KeyStore } from "./keys.ts"
import {
  AlertViewSchema, BatchViewSchema, CategorySchema, IdParam, LifecycleSchema, Limit, RoleSchema,
  ScanViewSchema, UserViewSchema, VerdictSchema,
} from "./schemas.ts"
import { LIFECYCLE_ORDER, shortId, type Store } from "./store.ts"

const STAFF = ["admin", "manufacturer", "inspector"] as const
const MAKERS = ["admin", "manufacturer"] as const
const ADMIN = ["admin"] as const

/** Manufacturers see only their own data; admins and inspectors see all. */
const scopeOf = (u: AuthUser): string | undefined => (u.role === "manufacturer" ? (u.manufacturerId ?? "none") : undefined)

async function ownBatch(store: Store, u: AuthUser, id: string) {
  const b = await store.batchView(id)
  // 404, not 403: do not reveal that another manufacturer's batch exists.
  if (!b || (u.role === "manufacturer" && b.manufacturerId !== u.manufacturerId)) throw notFound("Batch")
  return b
}

const MAX_UNITS_PER_REQUEST = 5000

export function staffRoutes(route: Route, store: Store, keys: KeyStore, config: Config): void {
  /* ---------- overview ---------- */

  route({
    method: "GET", url: "/v1/overview", tag: "Console", auth: [...STAFF], summary: "Headline numbers and a 7-day trend",
    response: z.object({
      last24h: z.object({ total: z.number(), genuine: z.number(), check: z.number(), stop: z.number() }),
      openAlerts: z.object({ high: z.number(), medium: z.number(), low: z.number() }),
      batches: z.number(), recalledBatches: z.number(),
      daily: z.array(z.object({ date: z.string(), GENUINE: z.number(), CHECK: z.number(), STOP: z.number() })),
    }),
    handler: ({ user }) => store.overview(scopeOf(user!), Date.now()),
  })

  /* ---------- manufacturers and users (admin) ---------- */

  route({
    method: "GET", url: "/v1/manufacturers", tag: "Admin", auth: [...ADMIN], summary: "List manufacturers",
    response: z.array(z.object({ id: z.string(), name: z.string() })),
    handler: () => store.manufacturers(),
  })

  route({
    method: "POST", url: "/v1/manufacturers", tag: "Admin", auth: [...ADMIN], status: 201,
    summary: "Create a manufacturer and its first signing key",
    body: z.object({ name: z.string().trim().min(2).max(120) }),
    response: z.object({ id: z.string(), keyId: z.string() }),
    handler: ({ body }) =>
      store.tx(async (s) => {
        // Any error rolls the whole transaction back, so nothing is left half-made.
        let id: string
        try { id = await s.insertManufacturer(body.name) } catch { throw new HttpError(409, "ALREADY_EXISTS", "A manufacturer with that name exists") }
        const keyId = `k_${shortId()}`
        await s.insertKey(keyId, id, await keys.create(keyId, s))
        return { id, keyId }
      }),
  })

  route({
    method: "POST", url: "/v1/manufacturers/:id/rotate-key", tag: "Admin", auth: [...ADMIN], status: 201,
    summary: "Issue a new signing key. New batches use it; codes already printed keep verifying.",
    params: IdParam,
    response: z.object({ keyId: z.string() }),
    handler: ({ params }) =>
      store.tx(async (s) => {
        if (!(await s.manufacturerExists(params.id))) throw notFound("Manufacturer")
        const keyId = `k_${shortId()}`
        const publicKey = await keys.create(keyId, s) // new key first: if this fails, nothing was retired
        await s.retireKeys(params.id)
        await s.insertKey(keyId, params.id, publicKey)
        return { keyId }
      }),
  })

  route({
    method: "GET", url: "/v1/users", tag: "Admin", auth: [...ADMIN], summary: "List users",
    response: z.array(UserViewSchema), handler: () => store.users(),
  })

  route({
    method: "POST", url: "/v1/users", tag: "Admin", auth: [...ADMIN], status: 201, summary: "Create a user",
    body: z.object({
      email: z.string().email().max(200), name: z.string().trim().min(1).max(120),
      password: z.string().min(10).max(200), role: RoleSchema, manufacturerId: z.string().optional(),
    }),
    response: z.object({ id: z.string() }),
    handler: async ({ body }) => {
      if (body.role === "manufacturer" && !body.manufacturerId) throw badRequest("VALIDATION_FAILED", "A manufacturer user needs manufacturerId")
      if (body.role !== "manufacturer" && body.manufacturerId) throw badRequest("VALIDATION_FAILED", "Only manufacturer users belong to a manufacturer")
      if (body.manufacturerId && !(await store.manufacturerName(body.manufacturerId))) throw badRequest("VALIDATION_FAILED", "Unknown manufacturerId")
      if (await store.userByEmail(body.email)) throw new HttpError(409, "ALREADY_EXISTS", "That email is already registered")
      const id = await store.insertUser({ email: body.email, passwordHash: await hashPassword(body.password), name: body.name, role: body.role, manufacturerId: body.manufacturerId ?? null })
      return { id }
    },
  })

  /* ---------- products ---------- */

  const ProductView = z.object({ id: z.string(), manufacturerId: z.string(), name: z.string(), category: CategorySchema, packSize: z.string() })

  route({
    method: "GET", url: "/v1/products", tag: "Catalogue", auth: [...STAFF], summary: "List products",
    response: z.array(ProductView), handler: ({ user }) => store.products(scopeOf(user!)),
  })

  route({
    method: "POST", url: "/v1/products", tag: "Catalogue", auth: [...MAKERS], status: 201, summary: "Create a product",
    body: z.object({
      name: z.string().trim().min(2).max(120), category: CategorySchema, packSize: z.string().trim().min(1).max(60),
      manufacturerId: z.string().optional(),
    }),
    response: z.object({ id: z.string() }),
    handler: async ({ body, user }) => {
      const manufacturerId = user!.role === "manufacturer" ? user!.manufacturerId : body.manufacturerId
      if (!manufacturerId || !(await store.manufacturerName(manufacturerId))) throw badRequest("VALIDATION_FAILED", "manufacturerId is required and must exist")
      return { id: await store.insertProduct({ manufacturerId, name: body.name, category: body.category, packSize: body.packSize }) }
    },
  })

  /* ---------- batches ---------- */

  route({
    method: "GET", url: "/v1/batches", tag: "Catalogue", auth: [...STAFF], summary: "List batches",
    response: z.array(BatchViewSchema), handler: ({ user }) => store.batches(scopeOf(user!)),
  })

  route({
    method: "POST", url: "/v1/batches", tag: "Catalogue", auth: [...MAKERS], status: 201,
    summary: "Create a batch. Empty regionIds means distributed nationwide.",
    body: z.object({
      productId: z.string(), batchCode: z.string().trim().min(1).max(60),
      manufacturedAt: z.number().int(), expiresAt: z.number().int(), regionIds: z.array(z.string()).max(50).default([]),
    }),
    response: z.object({ id: z.string() }),
    handler: async ({ body, user }) => {
      const product = await store.product(body.productId)
      if (!product || (user!.role === "manufacturer" && product.manufacturerId !== user!.manufacturerId)) throw badRequest("VALIDATION_FAILED", "Unknown product")
      if (body.expiresAt <= body.manufacturedAt) throw badRequest("VALIDATION_FAILED", "expiresAt must be after manufacturedAt")
      const known = new Set((await store.regions()).map((r) => r.id))
      const bad = body.regionIds.filter((r) => !known.has(r))
      if (bad.length) throw badRequest("VALIDATION_FAILED", `Unknown regions: ${bad.join(", ")}`)
      const keyId = await store.activeKeyId(product.manufacturerId)
      if (!keyId) throw new HttpError(409, "NO_SIGNING_KEY", "This manufacturer has no active signing key")
      try {
        return { id: await store.insertBatch({ productId: product.id, manufacturerId: product.manufacturerId, batchCode: body.batchCode, keyId, manufacturedAt: body.manufacturedAt, expiresAt: body.expiresAt, regionIds: body.regionIds }) }
      } catch {
        throw new HttpError(409, "ALREADY_EXISTS", "That batch code is already used")
      }
    },
  })

  route({
    method: "GET", url: "/v1/batches/:id", tag: "Catalogue", auth: [...STAFF], summary: "One batch with unit counts per lifecycle stage",
    params: IdParam,
    response: BatchViewSchema.extend({ lifecycle: z.record(LifecycleSchema, z.number()) }),
    handler: async ({ params, user }) => ({ ...(await ownBatch(store, user!, params.id)), lifecycle: await store.unitCountsByLifecycle(params.id) }),
  })

  route({
    method: "POST", url: "/v1/batches/:id/units", tag: "Codes", auth: [...MAKERS], status: 201, rateLimit: 30,
    summary: "Generate signed codes. Lookup codes are shown only here: they cannot be recovered later. Add ?format=csv for a CSV download.",
    params: IdParam,
    query: z.object({ format: z.enum(["json", "csv"]).default("json") }),
    body: z.object({ count: z.number().int().min(1).max(MAX_UNITS_PER_REQUEST) }),
    response: z.object({
      batchId: z.string(), count: z.number(),
      units: z.array(z.object({ serial: z.string(), payload: z.string(), lookupCode: z.string() })),
    }),
    handler: async ({ params, query, body, user }) => {
      const batch = await ownBatch(store, user!, params.id)
      if (batch.recall) throw new HttpError(409, "BATCH_RECALLED", "Cannot generate codes for a recalled batch")
      const units = await generateUnits(store, keys, config.lookupPepper, batch, body.count)
      const headers = { "Cache-Control": "no-store" }
      if (query.format === "csv") {
        const csv = ["serial,payload,lookup_code", ...units.map((u) => `${u.serial},${u.payload},${u.lookupCode}`)].join("\n") + "\n"
        return raw({ status: 201, contentType: "text/csv", body: csv, headers: { ...headers, "Content-Disposition": `attachment; filename="${batch.batchCode}-codes.csv"` } })
      }
      return { batchId: batch.id, count: units.length, units }
    },
  })

  route({
    method: "POST", url: "/v1/batches/:id/lifecycle", tag: "Catalogue", auth: [...MAKERS],
    summary: "Move every unit in one stage to the next (factory → transit → distributor → retail)",
    params: IdParam, body: z.object({ from: LifecycleSchema, to: LifecycleSchema }),
    response: z.object({ moved: z.number() }),
    handler: async ({ params, body, user }) => {
      await ownBatch(store, user!, params.id)
      if (LIFECYCLE_ORDER.indexOf(body.to) !== LIFECYCLE_ORDER.indexOf(body.from) + 1) {
        throw badRequest("INVALID_TRANSITION", "Units can only move one stage forward")
      }
      return { moved: await store.advanceLifecycle(params.id, body.from, body.to) }
    },
  })

  route({
    method: "POST", url: "/v1/batches/:id/recall", tag: "Recalls", auth: [...MAKERS], summary: "Recall a batch: every channel answers STOP from now on",
    params: IdParam, body: z.object({ reason: z.string().trim().min(5).max(300) }),
    response: z.object({ recalledAt: z.number() }),
    handler: async ({ params, body, user }) => {
      const b = await ownBatch(store, user!, params.id)
      if (b.recall) throw new HttpError(409, "ALREADY_RECALLED", "This batch is already recalled")
      const at = Date.now()
      await store.setRecall(b.id, { at, reason: body.reason })
      return { recalledAt: at }
    },
  })

  route({
    method: "DELETE", url: "/v1/batches/:id/recall", tag: "Recalls", auth: [...MAKERS], summary: "Lift a recall",
    params: IdParam,
    handler: async ({ params, user }) => {
      const b = await ownBatch(store, user!, params.id)
      if (!b.recall) throw new HttpError(409, "NOT_RECALLED", "This batch is not recalled")
      await store.setRecall(b.id, null)
      return { ok: true }
    },
  })

  /* ---------- alerts and scans ---------- */

  route({
    method: "GET", url: "/v1/alerts", tag: "Alerts", auth: [...STAFF], summary: "Alerts, highest priority first",
    query: z.object({ status: z.enum(["open", "investigating", "resolved"]).optional(), priority: z.enum(["low", "medium", "high"]).optional(), limit: Limit }),
    response: z.array(AlertViewSchema),
    handler: ({ query, user }) => store.alerts({ ...query, manufacturerId: scopeOf(user!) }),
  })

  route({
    method: "PATCH", url: "/v1/alerts/:id", tag: "Alerts", auth: [...STAFF], summary: "Change an alert's status or assignee",
    params: IdParam, body: z.object({ status: z.enum(["open", "investigating", "resolved"]), assignedTo: z.string().optional() }),
    response: AlertViewSchema,
    handler: async ({ params, body, user }) => {
      const a = await store.alert(params.id)
      if (!a || (user!.role === "manufacturer" && a.manufacturerId !== user!.manufacturerId)) throw notFound("Alert")
      if (body.assignedTo && !(await store.userById(body.assignedTo))) throw badRequest("VALIDATION_FAILED", "Unknown assignee")
      await store.updateAlert(a.id, body.status, body.assignedTo)
      const { manufacturerId: _m, ...view } = (await store.alert(a.id))!
      void _m
      return view
    },
  })

  route({
    method: "GET", url: "/v1/scans", tag: "Alerts", auth: [...STAFF], summary: "Recent scans (live feed and map)",
    query: z.object({ verdict: VerdictSchema.optional(), batchId: z.string().optional(), since: z.coerce.number().int().optional(), limit: Limit }),
    response: z.array(ScanViewSchema),
    handler: async ({ query, user }) => {
      if (query.batchId) await ownBatch(store, user!, query.batchId)
      return store.scans({ ...query, manufacturerId: scopeOf(user!) })
    },
  })
}
