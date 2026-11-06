import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

/** scrypt hash stored as `scrypt$<salt hex>$<hash hex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 32)
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$")
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, "hex")
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/**
 * Compact signed token: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * Stateless; expires. Rotate TOKEN_SECRET to revoke everything at once.
 */
export interface TokenPayload {
  sub: string
  exp: number
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url")

export function signToken(secret: string, sub: string, ttlMs: number, now = Date.now()): string {
  const body = b64(JSON.stringify({ sub, exp: now + ttlMs } satisfies TokenPayload))
  const sig = createHmac("sha256", secret).update(body).digest()
  return `${body}.${b64(sig)}`
}

/** Returns the subject, or null if the token is malformed, forged or expired. */
export function verifyToken(secret: string, token: string, now = Date.now()): string | null {
  const [body, sig, extra] = token.split(".")
  if (!body || !sig || extra !== undefined) return null
  const expected = createHmac("sha256", secret).update(body).digest()
  const given = Buffer.from(sig, "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload
    return typeof p.sub === "string" && typeof p.exp === "number" && p.exp > now ? p.sub : null
  } catch {
    return null
  }
}
