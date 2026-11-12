import { mkdirSync } from "node:fs"
import { PGlite, types, type PGliteInterface, type Transaction } from "@electric-sql/pglite"
import { clean, type Db, type Param, type Queryable } from "./db.ts"

/**
 * In-process Postgres (WebAssembly) for local development and tests. Node only.
 * `dataDir` keeps the data on disk; leave it out for a throwaway in-memory database.
 */
export async function openPglite(dataDir?: string): Promise<Db> {
  if (dataDir) mkdirSync(dataDir, { recursive: true })
  const pg = await PGlite.create(dataDir, { parsers: PARSERS })
  return wrapPglite(pg)
}

/** BIGINT (epoch milliseconds, COUNT(*)) as a JS number: safe up to 2^53, far past any date we store. */
const PARSERS = { [types.INT8]: (x: string) => Number(x) }

const asQueryable = (q: PGliteInterface | Transaction): Queryable => ({
  async query<T>(sql: string, params?: Param[]) {
    const r = await q.query<T>(sql, clean(params))
    return { rows: r.rows, affected: r.affectedRows ?? 0 }
  },
  async exec(sql: string) {
    await q.exec(sql)
  },
})

export function wrapPglite(pg: PGlite): Db & { pglite: PGlite } {
  return {
    ...asQueryable(pg),
    pglite: pg,
    transaction: (fn) => pg.transaction((tx) => fn(asQueryable(tx))),
    close: () => pg.close(),
  }
}

/** A copy of an existing database (tests: seed once, then hand each test file its own copy). */
export async function clonePglite(db: Db & { pglite: PGlite }): Promise<Db & { pglite: PGlite }> {
  const dump = await db.pglite.dumpDataDir("none")
  return wrapPglite(await PGlite.create({ loadDataDir: dump, parsers: PARSERS }))
}
