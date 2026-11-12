import { migrations } from "@scanuganda/core"

/**
 * The one database interface the API uses (PostgreSQL). Two drivers implement it:
 *   - `db-pglite.ts`: Postgres compiled to WebAssembly, in-process. Local development
 *     and tests: nothing to install.
 *   - `db-postgres.ts`: a real server over the network (Neon, Supabase, Cloudflare
 *     Hyperdrive, a container...), chosen with DATABASE_URL.
 *
 * SQL uses Postgres placeholders ($1, $2...). Driver details (how BIGINT is parsed,
 * how a transaction is opened) stay inside the drivers.
 */

export type Param = string | number | boolean | null | undefined

export interface QueryResult<T> {
  rows: T[]
  /** Rows inserted, updated or deleted. */
  affected: number
}

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<QueryResult<T>>
  /** Several statements at once, no parameters (migrations). */
  exec(sql: string): Promise<void>
}

export interface Db extends Queryable {
  /**
   * Runs `fn` in one transaction: committed if it returns, rolled back if it throws.
   * Inside `fn`, use ONLY `tx`: with a single connection (PGlite) a query on the outer
   * `Db` would wait for this transaction to finish, which never happens.
   */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** `undefined` becomes NULL, as with every other optional field. */
export const clean = (params: Param[] = []): (string | number | boolean | null)[] =>
  params.map((p) => (p === undefined ? null : p))

/** Typed helpers (rows are trusted to match T: keep SQL and types together). */
export async function all<T>(q: Queryable, sql: string, ...params: Param[]): Promise<T[]> {
  return (await q.query<T>(sql, params)).rows
}
export async function get<T>(q: Queryable, sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await q.query<T>(sql, params)).rows[0]
}
/** Returns how many rows changed. */
export async function run(q: Queryable, sql: string, ...params: Param[]): Promise<number> {
  return (await q.query(sql, params)).affected
}

/**
 * Applies every migration not yet recorded, each in its own transaction.
 * An advisory lock keeps two servers starting at once from racing.
 */
export async function migrate(db: Db): Promise<string[]> {
  const applied: string[] = []
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(727274)") // any fixed number: "ScanUganda migrations"
    await tx.query("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)")
    const done = new Set((await all<{ id: string }>(tx, "SELECT id FROM schema_migrations")).map((r) => r.id))
    for (const m of migrations) {
      if (done.has(m.id)) continue
      try {
        // Postgres runs DDL inside transactions, so a failed migration leaves nothing behind.
        await tx.exec(m.sql)
      } catch (e) {
        throw new Error(`Migration ${m.id} failed: ${(e as Error).message}`)
      }
      await tx.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)", [m.id, Date.now()])
      applied.push(m.id)
    }
  })
  return applied
}
