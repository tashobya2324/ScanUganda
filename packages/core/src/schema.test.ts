import { DatabaseSync } from "node:sqlite"
import { describe, expect, it } from "vitest"
import { migrations } from "./schema.ts"

function freshDb() {
  const db = new DatabaseSync(":memory:")
  db.exec("PRAGMA foreign_keys = ON")
  for (const m of migrations) db.exec(m.sql)
  return db
}

describe("schema migrations (P1-1)", () => {
  it("applies cleanly to an empty SQLite database", () => {
    const db = freshDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name)
    expect(tables).toEqual(
      expect.arrayContaining([
        "alerts", "batch_regions", "batches", "manufacturers", "products",
        "regions", "reports", "scans", "signing_keys", "units", "users",
      ]),
    )
  })

  it("has unique, ordered migration ids", () => {
    const ids = migrations.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(ids)
  })

  it("enforces key rules: expiry after manufacture, recall fields together, unique lookup hash", () => {
    const db = freshDb()
    db.exec(`
      INSERT INTO manufacturers VALUES ('m1','Kakira',0);
      INSERT INTO signing_keys VALUES ('k1','m1','pk',0,NULL);
      INSERT INTO products VALUES ('p1','m1','Sugar','FOOD','1 kg');`)
    const batch = (id: string, man: number, exp: number, at: string, why: string) =>
      db.exec(`INSERT INTO batches VALUES ('${id}','p1','m1','${id}','k1',${man},${exp},${at},${why})`)

    expect(() => batch("b1", 10, 5, "NULL", "NULL")).toThrow() // expires before manufacture
    expect(() => batch("b2", 1, 5, "3", "NULL")).toThrow() // recalled_at without a reason
    batch("b3", 1, 5, "NULL", "NULL")

    db.exec("INSERT INTO units VALUES ('s1','b3','IN_FACTORY','h1')")
    expect(() => db.exec("INSERT INTO units VALUES ('s2','b3','IN_FACTORY','h1')")).toThrow() // dup hash
    expect(() => db.exec("INSERT INTO units VALUES ('s3','b3','LOST','h3')")).toThrow() // bad state
  })

  it("rejects a manufacturer user without a manufacturer and orphan foreign keys", () => {
    const db = freshDb()
    expect(() =>
      db.exec("INSERT INTO users VALUES ('u1','a@b.c','x','A','manufacturer',NULL,0)"),
    ).toThrow()
    expect(() => db.exec("INSERT INTO products VALUES ('p','nope','S','FOOD','1')")).toThrow()
  })
})
