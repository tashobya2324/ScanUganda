import { z } from "zod"
import { HttpError, type Route } from "./http.ts"
import { verifyPassword, hashPassword, signToken } from "./auth.ts"
import {
  ChannelSchema, PositionSchema, RegionSchema, ScanOutcomeSchema, ScannerRoleSchema, UserViewSchema,
} from "./schemas.ts"
import type { Config } from "./config.ts"
import type { Store } from "./store.ts"
import { performScan, type ScanRequest } from "./verification.ts"

const TOKEN_TTL_MS = 12 * 3_600_000
const MAX_SKEW_MS = 5 * 60_000
const MAX_AGE_MS = 30 * 24 * 3_600_000

const ScanInput = z
  .object({
    payload: z.string().min(1).max(300).optional(),
    code: z.string().min(1).max(24).optional(),
    position: PositionSchema.optional(),
  })
  .refine((v) => (v.payload === undefined) !== (v.code === undefined), {
    message: "Send exactly one of payload or code",
  })

let dummyHash: Promise<string> | undefined

export function publicRoutes(route: Route, store: Store, config: Config): void {
  route({
    method: "GET", url: "/health", tag: "System", summary: "Liveness check", auth: "public",
    response: z.object({ status: z.literal("ok"), time: z.number() }),
    handler: () => ({ status: "ok" as const, time: Date.now() }),
  })

  route({
    method: "GET", url: "/v1/regions", tag: "Reference", summary: "Districts used for sale-area checks", auth: "public",
    response: z.array(RegionSchema),
    handler: () => store.regions(),
  })

  /* ---------- verify ---------- */

  route({
    method: "POST", url: "/v1/verify", tag: "Verification", auth: "optional", rateLimit: 60,
    summary: "Check a product by its QR payload or 12-digit code",
    body: ScanInput.and(
      z.object({
        channel: ChannelSchema.default("PWA"),
        scannerRole: ScannerRoleSchema.default("consumer"),
      }),
    ),
    response: ScanOutcomeSchema,
    handler: ({ body, user }) => {
      if (body.scannerRole === "inspector" && !user) {
        throw new HttpError(401, "UNAUTHENTICATED", "Inspector scans need a signed-in account")
      }
      const req: ScanRequest = {
        payload: body.payload, code: body.code, position: body.position,
        channel: body.channel, scannerRole: body.scannerRole, at: Date.now(), wasOffline: false,
      }
      return performScan(store, config.lookupPepper, req)
    },
  })

  /* ---------- offline sync ---------- */

  route({
    method: "GET", url: "/v1/sync", tag: "Sync", auth: "public", rateLimit: 30,
    summary: "Everything the PWA caches to judge codes offline (public keys only)",
    response: z.object({
      syncedAt: z.number(),
      publicKeys: z.record(z.string(), z.string()),
      batches: z.record(z.string(), z.object({ keyId: z.string(), expiresAt: z.number() })),
      recalledBatchIds: z.array(z.string()),
      regions: z.array(RegionSchema),
    }),
    handler: () => {
      const batches = store.batches()
      return {
        syncedAt: Date.now(),
        publicKeys: store.publicKeys(),
        batches: Object.fromEntries(batches.map((b) => [b.id, { keyId: b.keyId, expiresAt: b.expiresAt }])),
        recalledBatchIds: batches.filter((b) => b.recall).map((b) => b.id),
        regions: store.regions(),
      }
    },
  })

  const QueuedScan = ScanInput.and(
    z.object({
      clientId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
      scannedAt: z.number().int(),
      scannerRole: z.enum(["consumer", "retailer"]).default("consumer"),
    }),
  )
  route({
    method: "POST", url: "/v1/sync/scans", tag: "Sync", auth: "public", rateLimit: 20,
    summary: "Upload scans queued while offline; each is judged as of its own time. Safe to retry.",
    body: z.object({ scans: z.array(QueuedScan).min(1).max(100) }),
    response: z.object({
      results: z.array(
        z.discriminatedUnion("ok", [
          z.object({ clientId: z.string(), ok: z.literal(true), outcome: ScanOutcomeSchema }),
          z.object({ clientId: z.string(), ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
        ]),
      ),
    }),
    handler: ({ body }) => {
      const now = Date.now()
      const results = body.scans.map((s) => {
        try {
          if (s.scannedAt > now + MAX_SKEW_MS) throw new HttpError(422, "SCAN_IN_FUTURE", "Scan time is in the future")
          if (s.scannedAt < now - MAX_AGE_MS) throw new HttpError(422, "SCAN_TOO_OLD", "Scan is older than 30 days")
          const outcome = performScan(store, config.lookupPepper, {
            payload: s.payload, code: s.code, position: s.position, channel: "PWA",
            scannerRole: s.scannerRole, at: s.scannedAt, wasOffline: true, clientId: s.clientId,
          })
          return { clientId: s.clientId, ok: true as const, outcome }
        } catch (e) {
          if (e instanceof HttpError) return { clientId: s.clientId, ok: false as const, error: { code: e.code, message: e.message } }
          throw e
        }
      })
      return { results }
    },
  })

  /* ---------- reports ---------- */

  route({
    method: "POST", url: "/v1/reports", tag: "Reports", auth: "public", rateLimit: 10, status: 201,
    summary: "Report a suspect product (photo upload is not supported yet)",
    body: z.object({
      description: z.string().trim().min(10).max(2000),
      shopName: z.string().trim().max(200).optional(),
      position: PositionSchema.optional(),
      scanId: z.string().max(64).optional(),
      contact: z.string().trim().max(200).optional(),
    }),
    response: z.object({ id: z.string() }),
    handler: ({ body }) => {
      if (body.scanId && !store.scanExists(body.scanId)) throw new HttpError(400, "UNKNOWN_SCAN", "That scan does not exist")
      const id = store.insertReport({
        scanId: body.scanId, description: body.description, shopName: body.shopName,
        lat: body.position?.lat, lng: body.position?.lng, contact: body.contact,
      })
      return { id }
    },
  })

  /* ---------- auth ---------- */

  route({
    method: "POST", url: "/v1/auth/login", tag: "Auth", auth: "public", rateLimit: 10,
    summary: "Sign in with email and password",
    body: z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) }),
    response: z.object({ token: z.string(), expiresAt: z.number(), user: UserViewSchema }),
    handler: async ({ body }) => {
      const u = store.userByEmail(body.email)
      // Always hash-compare, so a wrong email takes as long as a wrong password.
      dummyHash ??= hashPassword("not-a-real-password")
      const ok = await verifyPassword(body.password, u?.password_hash ?? (await dummyHash))
      if (!u || !ok) throw new HttpError(401, "BAD_CREDENTIALS", "Email or password is incorrect")
      return {
        token: signToken(config.tokenSecret, u.id, TOKEN_TTL_MS),
        expiresAt: Date.now() + TOKEN_TTL_MS,
        user: { id: u.id, email: u.email, name: u.name, role: u.role, manufacturerId: u.manufacturer_id },
      }
    },
  })

  route({
    method: "GET", url: "/v1/auth/me", tag: "Auth", auth: ["admin", "manufacturer", "inspector"],
    summary: "The signed-in user", response: UserViewSchema,
    handler: ({ user }) => ({ id: user!.id, email: user!.email, name: user!.name, role: user!.role, manufacturerId: user!.manufacturerId }),
  })
}
