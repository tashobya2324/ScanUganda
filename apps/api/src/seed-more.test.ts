import { describe, expect, it } from "vitest"
import { openPglite } from "./db-pglite.ts"
import { migrate } from "./db.ts"
import { SealedKeyStore } from "./keys.ts"
import { seedDemo } from "./seed.ts"
import { MORE_MARKER, seedMore } from "./seed-more.ts"
import { Store } from "./store.ts"
import { testConfig } from "./test-helpers.ts"

describe("extra sample data", () => {
  it("adds batches, scans and alerts once, and refuses a second run", async () => {
    const db = await openPglite()
    await migrate(db)
    const store = new Store(db)
    const keys = new SealedKeyStore(testConfig().keyEncryptionKey!)
    const pepper = testConfig().lookupPepper
    await seedDemo(store, keys, pepper, "correct-horse-battery")
    const r = await seedMore(store, keys, pepper)
    expect(r.scans).toBe(240)
    expect(r.batches).toBeGreaterThan(10)
    expect(r.alerts).toBeGreaterThan(5)
    expect((await store.manufacturers()).some((m) => m.name === MORE_MARKER)).toBe(true)
    const scans = await store.scans({ limit: 500 })
    expect(scans.filter((s) => s.lat !== null).length).toBeGreaterThan(150)
    expect(new Set(scans.map((s) => s.verdict))).toEqual(new Set(["GENUINE", "CHECK", "STOP"]))
    await expect(seedMore(store, keys, pepper)).rejects.toThrow(/already loaded/)
  })
})
