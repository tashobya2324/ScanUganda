import type { Context, Hono } from "hono"
import { z } from "zod"
import type { RateLimiter } from "./limiter.ts"

export type Role = "admin" | "manufacturer" | "inspector"

export interface AuthUser {
  id: string
  role: Role
  manufacturerId: string | null
  email: string
  name: string
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new HttpError(400, code, message, details)
export const notFound = (what: string) => new HttpError(404, "NOT_FOUND", `${what} not found`)
export const forbidden = (message = "You do not have access to this") =>
  new HttpError(403, "FORBIDDEN", message)

/** Reply wrapper so a handler can set status or send raw (CSV, USSD text) bodies. */
export interface Raw {
  __raw: true
  status?: number
  contentType: string
  body: string
  headers?: Record<string, string>
}
export const raw = (r: Omit<Raw, "__raw">): Raw => ({ __raw: true, ...r })

/** What the API logs. Never a query string, a header or a phone number. */
export interface Log {
  info(entry: Record<string, unknown>): void
  error(err: unknown): void
}

/** The parts of a request a handler may use (no framework types leak into routes). */
export interface RequestInfo {
  /** Client address (see `clientIp` in app.ts for how it is found). */
  ip: string
  header(name: string): string | undefined
  /** The raw query string values, before any route schema. */
  query(name: string): string | undefined
  log: Log
}

interface Ctx<B, Q, P> {
  body: B
  query: Q
  params: P
  /** null on public routes when nobody is signed in. */
  user: AuthUser | null
  req: RequestInfo
}

type Schema = z.ZodType<any>

export interface RouteSpec<B extends Schema, Q extends Schema, P extends Schema> {
  method: "GET" | "POST" | "PATCH" | "DELETE"
  url: string
  summary: string
  tag: string
  /** "public": anyone. "optional": public, but identifies the user if a token is sent. Otherwise the allowed roles. */
  auth: "public" | "optional" | Role[]
  body?: B
  query?: Q
  params?: P
  /** Declared success body, used for the OpenAPI document and (in tests) to check responses. */
  response?: Schema
  /** Per-route limit, requests per minute per IP. Routes without one share the global limit. */
  rateLimit?: number
  status?: number
  handler: (c: Ctx<z.infer<B>, z.infer<Q>, z.infer<P>>) => Promise<unknown> | unknown
}

export interface Registry {
  specs: RouteSpec<Schema, Schema, Schema>[]
}

export interface RouteDeps {
  app: Hono
  registry: Registry
  authenticate: (c: Context) => Promise<AuthUser | null>
  requestInfo: (c: Context) => RequestInfo
  limiter: RateLimiter
  /** Requests per minute per IP for routes without their own `rateLimit`. */
  globalLimit: number
  validateResponses: boolean
}

const FORM = "application/x-www-form-urlencoded"

/** JSON or form body (aggregators post USSD and SMS callbacks as forms). Undefined when empty. */
async function readBody(c: Context): Promise<unknown> {
  const type = c.req.header("content-type") ?? ""
  const text = await c.req.text()
  if (text === "") return undefined
  if (type.startsWith(FORM)) return Object.fromEntries(new URLSearchParams(text))
  if (type.includes("json")) {
    try {
      return JSON.parse(text)
    } catch {
      throw new HttpError(400, "BAD_REQUEST", "Body is not valid JSON")
    }
  }
  throw new HttpError(415, "BAD_REQUEST", `Unsupported content type: ${type || "none"}`)
}

export function makeRoute(deps: RouteDeps) {
  return function route<
    B extends Schema = z.ZodUndefined,
    Q extends Schema = z.ZodUndefined,
    P extends Schema = z.ZodUndefined,
  >(spec: RouteSpec<B, Q, P>): void {
    deps.registry.specs.push(spec as unknown as RouteSpec<Schema, Schema, Schema>)
    const bucket = spec.rateLimit ? `${spec.method} ${spec.url}` : "global"
    const max = spec.rateLimit ?? deps.globalLimit

    deps.app.on(spec.method, spec.url, async (c) => {
      const req = deps.requestInfo(c)
      const limited = deps.limiter.hit(`${bucket}|${req.ip}`, max)
      if (limited) {
        c.header("Retry-After", String(limited.retryAfterS))
        throw new HttpError(429, "RATE_LIMITED", `Too many requests. Try again in ${limited.retryAfterS} seconds.`)
      }

      const user = await deps.authenticate(c)
      if (Array.isArray(spec.auth)) {
        if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue")
        if (!spec.auth.includes(user.role)) throw forbidden()
      }
      const parse = <S extends Schema>(s: S | undefined, value: unknown, where: string) => {
        if (!s) return undefined
        const r = s.safeParse(value)
        if (!r.success) {
          throw badRequest("VALIDATION_FAILED", `Invalid ${where}`, z.flattenError(r.error as z.ZodError))
        }
        return r.data
      }
      const out = await spec.handler({
        body: parse(spec.body, spec.body ? await readBody(c) : undefined, "body") as z.infer<B>,
        query: parse(spec.query, c.req.query(), "query") as z.infer<Q>,
        params: parse(spec.params, c.req.param(), "path") as z.infer<P>,
        user,
        req,
      })
      if (out && typeof out === "object" && (out as Raw).__raw) {
        const r = out as Raw
        return c.body(r.body, (r.status ?? 200) as 200, { ...r.headers, "Content-Type": r.contentType })
      }
      if (deps.validateResponses && spec.response) {
        const check = spec.response.safeParse(out)
        if (!check.success) {
          throw new Error(`Response for ${spec.method} ${spec.url} drifted from its schema: ${check.error.message}`)
        }
      }
      return c.json(out ?? { ok: true }, (spec.status ?? 200) as 200)
    })
  }
}

export type Route = ReturnType<typeof makeRoute>

/* ---------- OpenAPI ---------- */

const toJson = (s: Schema, io: "input" | "output" = "input") => {
  const { $schema, ...rest } = z.toJSONSchema(s, { io, unrepresentable: "any" }) as Record<string, unknown>
  void $schema
  return rest
}

function paramsOf(schema: Schema | undefined, where: "query" | "path") {
  if (!schema) return []
  const json = toJson(schema) as { properties?: Record<string, object>; required?: string[] }
  return Object.entries(json.properties ?? {}).map(([name, s]) => ({
    name,
    in: where,
    required: where === "path" || (json.required ?? []).includes(name),
    schema: s,
  }))
}

export function buildOpenApi(specs: Registry["specs"]) {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const s of specs) {
    const path = s.url.replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    const secured = Array.isArray(s.auth)
    paths[path] ??= {}
    paths[path]![s.method.toLowerCase()] = {
      summary: s.summary,
      tags: [s.tag],
      security: secured ? [{ bearer: [] }] : s.auth === "optional" ? [{}, { bearer: [] }] : [],
      description: secured ? `Roles: ${(s.auth as Role[]).join(", ")}` : undefined,
      parameters: [...paramsOf(s.params, "path"), ...paramsOf(s.query, "query")],
      requestBody: s.body
        ? { required: true, content: { "application/json": { schema: toJson(s.body) } } }
        : undefined,
      responses: {
        [String(s.status ?? 200)]: {
          description: "Success",
          content: s.response ? { "application/json": { schema: toJson(s.response, "output") } } : undefined,
        },
        ...(s.body || s.query || s.params
          ? { "400": { description: "Validation failed", content: { "application/json": { schema: errorSchema } } } }
          : {}),
        ...(secured
          ? {
              "401": { description: "Not signed in", content: { "application/json": { schema: errorSchema } } },
              "403": { description: "Role not allowed", content: { "application/json": { schema: errorSchema } } },
            }
          : {}),
      },
    }
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "ScanUganda API",
      version: "0.1.0",
      description:
        "Product verification for Ugandan manufacturers. Timestamps are epoch milliseconds; distances are kilometres.",
    },
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    paths,
  }
}

const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: { code: { type: "string" }, message: { type: "string" }, details: {} },
      required: ["code", "message"],
    },
  },
  required: ["error"],
}

export function swaggerPage(specUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>ScanUganda API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: ${JSON.stringify(specUrl)}, dom_id: "#ui" })</script></body></html>`
}
