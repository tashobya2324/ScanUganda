export interface Config {
  port: number
  /** postgres://... for a real server. Unset: an in-process database (PGlite) in `pgliteDir`. */
  databaseUrl?: string
  /** PGlite data folder for local development (ignored when databaseUrl is set). */
  pgliteDir: string
  /** Folder for private signing keys, one file each (Node hosts). Ignored when keyEncryptionKey is set. */
  keysDir: string
  /** Set: private keys are kept in the database, encrypted with this secret (required on Cloudflare Workers). */
  keyEncryptionKey?: string
  tokenSecret: string
  lookupPepper: string
  corsOrigins: string[]
  /** Requests per minute per IP on the global limiter. */
  rateLimitMax: number
  /** Verify requests per minute per IP (the public check endpoint). Raised only for load tests. */
  verifyRateLimit: number
  /** Sign-in requests per minute per IP. (Separately, 10 failures per address and account lock that pair for 15 minutes.) */
  loginRateLimit: number
  /** Behind a reverse proxy: believe its X-Forwarded-For for the client address, so limits and lockouts apply per visitor, not per proxy. Leave off when the API is exposed directly (the header could then be forged). */
  trustProxy: boolean
  /** In tests, every response is checked against its declared schema. */
  validateResponses: boolean
  /** Shared secret the aggregator sends with USSD/SMS callbacks. Unset means open (development only). */
  channelSecret?: string
  /** Africa's Talking credentials for sending SMS replies. Unset means replies are returned but not sent. */
  africasTalking?: { username: string; apiKey: string; sandbox: boolean; from?: string }
}

/** Reads configuration from the environment. Refuses to start with weak secrets. */
export function loadConfig(env: Record<string, unknown> = process.env): Config {
  const str = (name: string): string | undefined => (typeof env[name] === "string" && env[name] !== "" ? (env[name] as string) : undefined)
  const need = (name: string): string => {
    const v = str(name)
    if (!v || v.length < 32) {
      throw new Error(`${name} must be set to a random string of at least 32 characters (see apps/api/.env.example)`)
    }
    return v
  }
  const optionalSecret = (v: string | undefined) => {
    if (!v) return undefined
    if (v.length < 16) throw new Error("CHANNEL_SECRET must be at least 16 characters")
    return v
  }
  const tokenSecret = need("TOKEN_SECRET")
  const lookupPepper = need("LOOKUP_PEPPER")
  if (tokenSecret === lookupPepper) throw new Error("TOKEN_SECRET and LOOKUP_PEPPER must differ")
  const keyEncryptionKey = str("KEY_ENCRYPTION_KEY")
  if (keyEncryptionKey !== undefined && keyEncryptionKey.length < 32) throw new Error("KEY_ENCRYPTION_KEY must be at least 32 characters")
  if (keyEncryptionKey !== undefined && [tokenSecret, lookupPepper].includes(keyEncryptionKey)) throw new Error("KEY_ENCRYPTION_KEY must differ from the other secrets")
  return {
    port: Number(str("API_PORT") ?? 3000),
    databaseUrl: str("DATABASE_URL"),
    pgliteDir: str("PGLITE_DIR") ?? "./data/pglite",
    keysDir: str("KEYS_DIR") ?? "./data/keys",
    keyEncryptionKey,
    tokenSecret,
    lookupPepper,
    corsOrigins: (str("CORS_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    rateLimitMax: Number(str("RATE_LIMIT_MAX") ?? 120),
    verifyRateLimit: Number(str("VERIFY_RATE_LIMIT") ?? 60),
    loginRateLimit: Number(str("LOGIN_RATE_LIMIT") ?? 10),
    trustProxy: str("TRUST_PROXY") === "true",
    validateResponses: false,
    channelSecret: optionalSecret(str("CHANNEL_SECRET")),
    africasTalking: (() => {
      const username = str("AT_USERNAME")
      const apiKey = str("AT_API_KEY")
      return username && apiKey ? { username, apiKey, sandbox: str("AT_SANDBOX") !== "false", from: str("AT_SMS_FROM") } : undefined
    })(),
  }
}
