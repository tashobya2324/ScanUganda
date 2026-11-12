import { PGlite } from "@electric-sql/pglite"
import { describe, expect, it } from "vitest"
import { migrations } from "./schema.ts"

async function freshDb() {
  const db = await PGlite.create()
  for (const m of migrations) await db.exec(m.sql)
  return db
}

describe("schema migrations (P1-1)", () => {
  it("applies cleanly to an empty Postgres database", async () => {
    const db = await freshDb()
    const tables = (
      await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    ).rows.map((r) => r.table_name)
    expect(tables).toEqual(
      expect.arrayContaining([
        "alerts", "batch_regions", "batches", "manufacturers", "products",
        "regions", "reports", "scans", "sealed_signing_keys", "signing_keys", "units", "users",
      ]),
    )
  })

  it("has unique, ordered migration ids", () => {
    const ids = migrations.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(ids)
  })

  it("enforces key rules: expiry after manufacture, recall fields together, unique lookup hash", async () => {
    const db = await freshDb()
    await db.exec(`
      INSERT INTO manufacturers VALUES ('m1','Kakira',0);
      INSERT INTO signing_keys VALUES ('k1','m1','pk',0,NULL);
      INSERT INTO products VALUES ('p1','m1','Sugar','FOOD','1 kg');`)
    const batch = (id: string, man: number, exp: number, at: string, why: string) =>
      db.exec(`INSERT INTO batches VALUES ('${id}','p1','m1','${id}','k1',${man},${exp},${at},${why})`)

    await expect(batch("b1", 10, 5, "NULL", "NULL")).rejects.toThrow() // expires before manufacture
    await expect(batch("b2", 1, 5, "3", "NULL")).rejects.toThrow() // recalled_at without a reason
    await batch("b3", 1, 5, "NULL", "NULL")

    await db.exec("INSERT INTO units VALUES ('s1','b3','IN_FACTORY','h1')")
    await expect(db.exec("INSERT INTO units VALUES ('s2','b3','IN_FACTORY','h1')")).rejects.toThrow() // dup hash
    await expect(db.exec("INSERT INTO units VALUES ('s3','b3','LOST','h3')")).rejects.toThrow() // bad state
  })

  it("rejects a manufacturer user without a manufacturer and orphan foreign keys", async () => {
    const db = await freshDb()
    await expect(db.exec("INSERT INTO users VALUES ('u1','a@b.c','x','A','manufacturer',NULL,0)")).rejects.toThrow()
    await expect(db.exec("INSERT INTO products VALUES ('p','nope','S','FOOD','1')")).rejects.toThrow()
  })

  it("keeps full precision for coordinates and millisecond timestamps", async () => {
    const db = await freshDb()
    await db.query("INSERT INTO regions VALUES ($1,$2,$3,$4,$5)", ["r", "R", 0.347612345, 32.582512345, 1])
    await db.query("INSERT INTO manufacturers VALUES ($1,$2,$3)", ["m", "M", 1_731_400_000_123])
    const r = (await db.query<{ lat: number; lng: number }>("SELECT lat, lng FROM regions")).rows[0]!
    expect(r).toEqual({ lat: 0.347612345, lng: 32.582512345 })
    const m = (await db.query<{ t: string }>("SELECT created_at::text AS t FROM manufacturers")).rows[0]!
    expect(m.t).toBe("1731400000123")
  })
})
