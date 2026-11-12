import { mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { hashPassword, signToken, verifyPassword, verifyToken } from "./auth.ts"
import { all, get, migrate, run } from "./db.ts"
import { openPglite } from "./db-pglite.ts"
import { MemoryKeyStore, SealedKeyStore, type KeyRows, type KeyStore } from "./keys.ts"
import { FileKeyStore } from "./keys-file.ts"
import { Store } from "./store.ts"

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
  it("applies migrations once and is safe to reopen", async () => {
    const dir = mkdtempSync(join(tmpdir(), "su-db-"))
    try {
      const first = await openPglite(join(dir, "pg"))
      expect(await migrate(first)).toContain("001_init")
      const n = (await all(first, "SELECT id FROM schema_migrations")).length
      expect(n).toBeGreaterThanOrEqual(3)
      await first.close()
      const second = await openPglite(join(dir, "pg"))
      expect(await migrate(second)).toEqual([])
      expect((await all(second, "SELECT id FROM schema_migrations")).length).toBe(n)
      await second.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000) // creating an on-disk database twice is slow on Windows

  it("rolls back a failed transaction and treats undefined parameters as NULL", async () => {
    const db = await openPglite()
    await migrate(db)
    await expect(
      db.transaction(async (tx) => {
        await run(tx, "INSERT INTO manufacturers VALUES ($1,$2,$3)", "m1", "A", 1)
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    expect(await all(db, "SELECT * FROM manufacturers")).toHaveLength(0)
    // undefined is sent as NULL, which the NOT NULL column rejects
    await expect(run(db, "INSERT INTO manufacturers VALUES ($1,$2,$3)", "m2", "B", undefined)).rejects.toThrow(/null value/)
    await db.close()
  })

  it("returns BIGINT and COUNT(*) as numbers, and reports changed rows", async () => {
    const db = await openPglite()
    await migrate(db)
    expect(await run(db, "INSERT INTO manufacturers VALUES ($1,$2,$3)", "m", "M", 1_731_400_000_123)).toBe(1)
    expect(await get(db, "SELECT created_at, COUNT(*) OVER () AS n FROM manufacturers")).toEqual({ created_at: 1_731_400_000_123, n: 1 })
    expect(await run(db, "UPDATE manufacturers SET name = 'N' WHERE id = 'nope'")).toBe(0)
    await db.close()
  })

  it("a Store transaction commits together or not at all, and nested calls join it", async () => {
    const db = await openPglite()
    await migrate(db)
    const store = new Store(db)
    await expect(
      store.tx(async (s) => {
        await s.insertManufacturer("Kept only if all succeed")
        await s.tx(async (inner) => inner.insertManufacturer("Inner"))
        throw new Error("late failure")
      }),
    ).rejects.toThrow("late failure")
    expect(await store.manufacturers()).toEqual([])
    await store.tx(async (s) => {
      await s.insertManufacturer("A")
      await s.insertManufacturer("B")
    })
    expect((await store.manufacturers()).map((m) => m.name)).toEqual(["A", "B"])
    await db.close()
  })
})

describe("key stores", () => {
  const dir = mkdtempSync(join(tmpdir(), "su-keys-"))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const noRows = {} as KeyRows // file and memory stores do not use the database

  it("file store keeps the private key on disk, returns only the public one, and refuses overwrites", async () => {
    const store = new FileKeyStore(join(dir, "keys"))
    const pub = await store.create("k_one")
    expect(pub).toMatch(/^[0-9a-f]{64}$/)
    expect(await store.getPrivate("k_one")).toMatch(/^[0-9a-f]{64}$/)
    expect(await store.getPrivate("k_one")).not.toBe(pub)
    expect(await store.getPrivate("k_missing")).toBeUndefined()
    await expect(store.create("k_one")).rejects.toThrow(/exists/)
    if (process.platform !== "win32") expect(statSync(join(dir, "keys", "k_one.key")).mode & 0o077).toBe(0)
  })

  it("rejects ids that could escape the directory", async () => {
    const store = new FileKeyStore(join(dir, "keys2"))
    for (const bad of ["../x", "a/b", "a\b", "", "a b"]) {
      await expect(store.create(bad)).rejects.toThrow()
      await expect(store.getPrivate(bad)).rejects.toThrow()
    }
  })

  it("memory store behaves the same way", async () => {
    const store: KeyStore = new MemoryKeyStore()
    await store.create("a", noRows)
    expect(await store.getPrivate("a", noRows)).toBeTruthy()
    await expect(store.create("a", noRows)).rejects.toThrow()
  })

  describe("sealed store (keys in the database, encrypted)", () => {
    const rowsInMemory = () => {
      const m = new Map<string, string>()
      return { rows: { putSealedKey: async (id: string, v: string) => void m.set(id, v), sealedKey: async (id: string) => m.get(id) } satisfies KeyRows, m }
    }
    const secret = "x".repeat(40)

    it("stores only ciphertext and gives the private key back", async () => {
      const { rows, m } = rowsInMemory()
      const store = new SealedKeyStore(secret)
      const pub = await store.create("k_1", rows)
      const priv = await store.getPrivate("k_1", rows)
      expect(priv).toMatch(/^[0-9a-f]{64}$/)
      expect(priv).not.toBe(pub)
      expect(m.get("k_1")).toMatch(/^v1\./)
      expect(m.get("k_1")).not.toContain(priv)
      expect(await store.getPrivate("k_missing", rows)).toBeUndefined()
      await expect(store.create("k_1", rows)).rejects.toThrow(/exists/)
    })

    it("cannot be opened with another secret, or moved to another key id", async () => {
      const { rows, m } = rowsInMemory()
      await new SealedKeyStore(secret).create("k_a", rows)
      await expect(new SealedKeyStore("y".repeat(40)).getPrivate("k_a", rows)).rejects.toThrow(/KEY_ENCRYPTION_KEY/)
      m.set("k_b", m.get("k_a")!)
      await expect(new SealedKeyStore(secret).getPrivate("k_b", rows)).rejects.toThrow(/does not decrypt/)
    })

    it("refuses a short secret and unsafe ids", async () => {
      expect(() => new SealedKeyStore("short")).toThrow(/32/)
      await expect(new SealedKeyStore(secret).create("../x", rowsInMemory().rows)).rejects.toThrow(/Unsafe/)
    })
  })
})
