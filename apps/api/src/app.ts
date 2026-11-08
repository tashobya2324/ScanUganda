import cors from "@fastify/cors"
import formbody from "@fastify/formbody"
import rateLimit from "@fastify/rate-limit"
import Fastify, { type FastifyError, type FastifyRequest } from "fastify"
import { verifyToken } from "./auth.ts"
import type { Config } from "./config.ts"
import {
  buildOpenApi, HttpError, makeRoute, swaggerPage,
  type AuthUser, type Registry,
} from "./http.ts"
import type { KeyStore } from "./keys.ts"
import { channelRoutes } from "./routes-channels.ts"
import { publicRoutes } from "./routes-public.ts"
import { staffRoutes } from "./routes-staff.ts"
import { AfricasTalkingSms, NoSmsSender, type SmsSender } from "./sms.ts"
import type { Store } from "./store.ts"

export interface AppDeps {
  store: Store
  keys: KeyStore
  config: Config
  /** `true` logs to stdout; an object lets tests capture the log. Query strings are never logged (they can carry the channel key). */
  logger?: boolean | { stream: NodeJS.WritableStream }
  /** How SMS replies are delivered. Defaults to Africa's Talking when configured, otherwise nothing is sent. */
  sms?: SmsSender
}

export async function buildApp({ store, keys, config, logger = false, sms }: AppDeps) {
  const app = Fastify({
    bodyLimit: 1_000_000,
    trustProxy: config.trustProxy,
    logger: logger
      ? {
          ...(typeof logger === "object" ? { stream: logger.stream } : {}),
          // Log what happened, not who or with what secret: path only, no query string, no headers.
          serializers: { req: (req) => ({ method: req.method, url: req.url?.split("?")[0] }) },
        }
      : false,
  })

  await app.register(formbody) // aggregators post USSD and SMS callbacks as forms
  await app.register(cors, { origin: config.corsOrigins.length ? config.corsOrigins : false })
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, ctx) =>
      new HttpError(429, "RATE_LIMITED", `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)} seconds.`),
  })

  app.addHook("onSend", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff")
    reply.header("Referrer-Policy", "no-referrer")
    reply.header("Cross-Origin-Resource-Policy", "same-site")
    // The API only ever returns data, so nothing it sends may run or be framed. The docs page loads Swagger UI from a CDN.
    if (!req.url.startsWith("/docs")) reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    // Only meaningful (and only safe to send) when the request came in over https, e.g. through a proxy.
    if (req.headers["x-forwarded-proto"] === "https") reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    // Anything fetched with a token (staff data, freshly generated codes) must not be cached.
    if (req.headers.authorization) reply.header("Cache-Control", "no-store")
  })

  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } })
    }
    const status = (err as FastifyError).statusCode
    if (status && status >= 400 && status < 500) {
      // Framework-level client errors (bad JSON, payload too large, ...)
      return reply.status(status).send({ error: { code: "BAD_REQUEST", message: err.message } })
    }
    req.log.error(err)
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Something went wrong on our side." } })
  })
  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ error: { code: "NOT_FOUND", message: "No such route" } }),
  )

  const authenticate = async (req: FastifyRequest): Promise<AuthUser | null> => {
    const header = req.headers.authorization
    if (!header?.startsWith("Bearer ")) return null
    const sub = verifyToken(config.tokenSecret, header.slice(7))
    if (!sub) return null
    const u = store.userById(sub)
    return u ? { id: u.id, role: u.role, manufacturerId: u.manufacturer_id, email: u.email, name: u.name } : null
  }

  const registry: Registry = { specs: [] }
  const route = makeRoute({ app, registry, authenticate, validateResponses: config.validateResponses })
  publicRoutes(route, store, config)
  staffRoutes(route, store, keys, config)
  channelRoutes(route, store, config, sms ?? (config.africasTalking ? new AfricasTalkingSms(config.africasTalking) : new NoSmsSender()))

  let spec: ReturnType<typeof buildOpenApi> | undefined
  app.get("/openapi.json", { config: { rateLimit: false } }, async () => (spec ??= buildOpenApi(registry.specs)))
  app.get("/docs", { config: { rateLimit: false } }, async (_req, reply) =>
    reply.type("text/html").send(swaggerPage("/openapi.json")),
  )

  return app
}
