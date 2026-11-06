import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { migrations } from "@scanuganda/core"

export type Db = DatabaseSync

/** Opens the database and applies any migration not yet recorded. */
export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec("PRAGMA foreign_keys = ON")
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL")
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)")
  const done = new Set(
    db.prepare("SELECT id FROM schema_migrations").all().map((r) => String(r.id)),
  )
  for (const m of migrations) {
    if (done.has(m.id)) continue
    db.exec("BEGIN")
    try {
      db.exec(m.sql)
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(m.id, Date.now())
      db.exec("COMMIT")
    } catch (e) {
      db.exec("ROLLBACK")
      throw new Error(`Migration ${m.id} failed: ${(e as Error).message}`)
    }
  }
  return db
}

/** Runs `fn` in a transaction; rolls back if it throws. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN")
  try {
    const out = fn()
    db.exec("COMMIT")
    return out
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
}

type Param = SQLInputValue | undefined
const clean = (params: Param[]): SQLInputValue[] => params.map((p) => (p === undefined ? null : p))

/** Typed query helpers (rows are trusted to match T: keep SQL and types together). */
export function all<T>(db: Db, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...clean(params)) as T[]
}
export function get<T>(db: Db, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...clean(params)) as T | undefined
}
export function run(db: Db, sql: string, ...params: Param[]): void {
  db.prepare(sql).run(...clean(params))
}
