export interface Config {
  port: number
  dbPath: string
  keysDir: string
  tokenSecret: string
  lookupPepper: string
  corsOrigins: string[]
  /** Requests per minute per IP on the global limiter. */
  rateLimitMax: number
  /** In tests, every response is checked against its declared schema. */
  validateResponses: boolean
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
    validateResponses: false,
  }
}
