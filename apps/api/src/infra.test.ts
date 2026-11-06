import { mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { hashPassword, signToken, verifyPassword, verifyToken } from "./auth.ts"
import { all, openDb, transaction, run } from "./db.ts"
import { FileKeyStore, MemoryKeyStore } from "./keys.ts"

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("s3cret-pass")
    const b = await hashPassword("s3cret-pass")
    expect(a).not.toBe(b)
    expect(a.startsWith("scrypt$")).toBe(true)
    expect(await verifyPassword("s3cret-pass", a)).toBe(true)
    expect(await verifyPassword("S3cret-pass", a)).toBe(false)
  })
  it("rejects malformed stored hashes", async () => {
    for (const bad of ["", "plain", "scrypt$$", "md5$aa$bb"]) expect(await verifyPassword("x", bad)).toBe(false)
  })
})

describe("tokens", () => {
  const secret = "s".repeat(40)
  it("round-trips the subject", () => {
    expect(verifyToken(secret, signToken(secret, "user-1", 1000))).toBe("user-1")
  })
  it("expires", () => {
    const t = signToken(secret, "u", 1000, 10_000)
    expect(verifyToken(secret, t, 10_999)).toBe("u")
    expect(verifyToken(secret, t, 11_000)).toBeNull()
  })
  it("rejects a wrong secret, tampering and malformed tokens", () => {
    const t = signToken(secret, "u", 60_000)
    expect(verifyToken("x".repeat(40), t)).toBeNull()
    const [body, sig] = t.split(".")
    const forged = Buffer.from(JSON.stringify({ sub: "admin", exp: Date.now() + 1e9 })).toString("base64url")
    expect(verifyToken(secret, `${forged}.${sig}`)).toBeNull()
    expect(verifyToken(secret, `${body}.`)).toBeNull()
    for (const bad of ["", "a", "a.b.c", "..", `${body}.${sig}.x`]) expect(verifyToken(secret, bad)).toBeNull()
  })
})

describe("database", () => {
  it("applies migrations once and is safe to reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "su-db-"))
    try {
      const path = join(dir, "x.db")
      const first = openDb(path)
      const n = all(first, "SELECT id FROM schema_migrations").length
      expect(n).toBeGreaterThanOrEqual(2)
      first.close()
      const second = openDb(path)
      expect(all(second, "SELECT id FROM schema_migrations").length).toBe(n)
      second.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("rolls back a failed transaction and treats undefined parameters as NULL", () => {
    const db = openDb(":memory:")
    expect(() =>
      transaction(db, () => {
        run(db, "INSERT INTO manufacturers VALUES (?,?,?)", "m1", "A", 1)
        throw new Error("boom")
      }),
    ).toThrow("boom")
    expect(all(db, "SELECT * FROM manufacturers")).toHaveLength(0)
    run(db, "INSERT INTO regions VALUES (?,?,?,?,?)", "r", "R", 1, 2, 3)
    // undefined is sent as NULL, which the NOT NULL column rejects (rather than node:sqlite throwing on undefined)
    expect(() => run(db, "INSERT INTO manufacturers VALUES (?,?,?)", "m2", "B", undefined)).toThrow(/NOT NULL/)
  })
})

describe("key stores", () => {
  const dir = mkdtempSync(join(tmpdir(), "su-keys-"))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it("file store keeps the private key on disk, returns only the public one, and refuses overwrites", () => {
    const store = new FileKeyStore(join(dir, "keys"))
    const pub = store.create("k_one")
    expect(pub).toMatch(/^[0-9a-f]{64}$/)
    expect(store.getPrivate("k_one")).toMatch(/^[0-9a-f]{64}$/)
    expect(store.getPrivate("k_one")).not.toBe(pub)
    expect(store.getPrivate("k_missing")).toBeUndefined()
    expect(() => store.create("k_one")).toThrow(/exists/)
    if (process.platform !== "win32") expect(statSync(join(dir, "keys", "k_one.key")).mode & 0o077).toBe(0)
  })

  it("rejects ids that could escape the directory", () => {
    const store = new FileKeyStore(join(dir, "keys2"))
    for (const bad of ["../x", "a/b", "a\\b", "", "a b"]) {
      expect(() => store.create(bad)).toThrow()
      expect(() => store.getPrivate(bad)).toThrow()
    }
  })

  it("memory store behaves the same way", () => {
    const store = new MemoryKeyStore()
    store.create("a")
    expect(store.getPrivate("a")).toBeTruthy()
    expect(() => store.create("a")).toThrow()
  })
})
