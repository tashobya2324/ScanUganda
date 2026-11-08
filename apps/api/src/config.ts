export interface Config {
  port: number
  dbPath: string
  keysDir: string
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
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = (name: string): string => {
    const v = env[name]
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
  return {
    port: Number(env.API_PORT ?? 3000),
    dbPath: env.DB_PATH ?? "./data/scanuganda.db",
    keysDir: env.KEYS_DIR ?? "./data/keys",
    tokenSecret,
    lookupPepper,
    corsOrigins: (env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    rateLimitMax: Number(env.RATE_LIMIT_MAX ?? 120),
    verifyRateLimit: Number(env.VERIFY_RATE_LIMIT ?? 60),
    loginRateLimit: Number(env.LOGIN_RATE_LIMIT ?? 10),
    trustProxy: env.TRUST_PROXY === "true",
    validateResponses: false,
    channelSecret: optionalSecret(env.CHANNEL_SECRET),
    africasTalking:
      env.AT_USERNAME && env.AT_API_KEY
        ? { username: env.AT_USERNAME, apiKey: env.AT_API_KEY, sandbox: env.AT_SANDBOX !== "false", from: env.AT_SMS_FROM || undefined }
        : undefined,
  }
}
