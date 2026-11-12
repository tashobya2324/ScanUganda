import { Hono, type Context } from "hono"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { verifyToken } from "./auth.ts"
import type { Config } from "./config.ts"
import {
  buildOpenApi, HttpError, makeRoute, swaggerPage,
  type AuthUser, type Log, type Registry, type RequestInfo,
} from "./http.ts"
import type { KeyStore } from "./keys.ts"
import { FixedWindowLimiter } from "./limiter.ts"
import { channelRoutes } from "./routes-channels.ts"
import { publicRoutes } from "./routes-public.ts"
import { staffRoutes } from "./routes-staff.ts"
import { AfricasTalkingSms, NoSmsSender, type SmsSender } from "./sms.ts"
import type { Store } from "./store.ts"

export interface AppDeps {
  store: Store
  keys: KeyStore
  config: Config
  /**
   * `true` logs JSON lines to the console; an object with `stream` lets tests capture them.
   * Logs hold the method, path and status only: never a query string (it can carry the
   * channel key), a header or a body.
   */
  logger?: boolean | { stream: { write(line: string): unknown } }
  /** How SMS replies are delivered. Defaults to Africa's Talking when configured, otherwise nothing is sent. */
  sms?: SmsSender
  /**
   * The address the connection came from, as the runtime knows it: the socket on Node
   * (`server.ts`), CF-Connecting-IP on Cloudflare (`worker.ts`). Used for limits and
   * lockouts. X-Forwarded-For is believed instead only when `config.trustProxy` is set.
   */
  remoteAddress?: (c: Context) => string | undefined
}

/** Node: the socket address that @hono/node-server passes in `c.env.incoming`. */
export const nodeRemoteAddress = (c: Context): string | undefined =>
  (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress

function makeLog(logger: AppDeps["logger"]): Log {
  if (!logger) return { info: () => {}, error: () => {} }
  const write = typeof logger === "object" ? (line: string) => void logger.stream.write(line) : (line: string) => console.log(line.trimEnd())
  const out = (level: number, entry: Record<string, unknown>) => write(JSON.stringify({ level, time: Date.now(), ...entry }) + "\n")
  return {
    info: (entry) => out(30, entry),
    error: (err) => out(50, err instanceof Error ? { err: { type: err.name, message: err.message, stack: err.stack } } : { err: String(err) }),
  }
}

export function buildApp({ store, keys, config, logger = false, sms, remoteAddress = nodeRemoteAddress }: AppDeps) {
  const app = new Hono()
  const log = makeLog(logger)

  const clientIp = (c: Context): string => {
    if (config.trustProxy) {
      // Behind a proxy we control: the left-most address is the visitor.
      const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      if (forwarded) return forwarded
    }
    return remoteAddress(c) ?? "unknown"
  }
  const requestInfo = (c: Context): RequestInfo => ({
    ip: clientIp(c),
    header: (name) => c.req.header(name),
    query: (name) => c.req.query(name),
    log,
  })

  // Request log: path only (no query string), status and time.
  app.use(async (c, next) => {
    const started = Date.now()
    await next()
    log.info({ req: { method: c.req.method, url: c.req.path }, res: { statusCode: c.res.status }, responseTime: Date.now() - started })
  })

  if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins, maxAge: 600 }))

  app.use(async (c, next) => {
    await next()
    const h = c.res.headers
    h.set("X-Content-Type-Options", "nosniff")
    h.set("Referrer-Policy", "no-referrer")
    h.set("Cross-Origin-Resource-Policy", "same-site")
    // The API only ever returns data, so nothing it sends may run or be framed. The docs page loads Swagger UI from a CDN.
    if (!c.req.path.startsWith("/docs")) h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    // Only meaningful (and only safe to send) when the request came in over https, e.g. through a proxy.
    if (c.req.header("x-forwarded-proto") === "https" || new URL(c.req.url).protocol === "https:") {
      h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    }
    // Anything fetched with a token (staff data, freshly generated codes) must not be cached.
    if (c.req.header("authorization")) h.set("Cache-Control", "no-store")
  })

  app.use(
    bodyLimit({
      maxSize: 1_000_000,
      onError: () => {
        throw new HttpError(413, "BAD_REQUEST", "Request body is too large")
      },
    }),
  )

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400)
    }
    if (err instanceof HTTPException && err.status < 500) {
      return c.json({ error: { code: "BAD_REQUEST", message: err.message } }, err.status)
    }
    log.error(err)
    return c.json({ error: { code: "INTERNAL", message: "Something went wrong on our side." } }, 500)
  })
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "No such route" } }, 404))

  const authenticate = async (c: Context): Promise<AuthUser | null> => {
    const header = c.req.header("authorization")
    if (!header?.startsWith("Bearer ")) return null
    const sub = verifyToken(config.tokenSecret, header.slice(7))
    if (!sub) return null
    const u = await store.userById(sub)
    return u ? { id: u.id, role: u.role, manufacturerId: u.manufacturer_id, email: u.email, name: u.name } : null
  }

  const registry: Registry = { specs: [] }
  const route = makeRoute({
    app,
    registry,
    authenticate,
    requestInfo,
    limiter: new FixedWindowLimiter(),
    globalLimit: config.rateLimitMax,
    validateResponses: config.validateResponses,
  })
  publicRoutes(route, store, config)
  staffRoutes(route, store, keys, config)
  channelRoutes(route, store, config, sms ?? (config.africasTalking ? new AfricasTalkingSms(config.africasTalking) : new NoSmsSender()))

  let spec: ReturnType<typeof buildOpenApi> | undefined
  app.get("/openapi.json", (c) => c.json((spec ??= buildOpenApi(registry.specs))))
  app.get("/docs", (c) => c.html(swaggerPage("/openapi.json")))

  return app
}

export type App = ReturnType<typeof buildApp>
