import postgres from "postgres"
import { clean, type Db, type Param, type Queryable } from "./db.ts"

/**
 * A real Postgres server over the network. Used by the Node server when DATABASE_URL
 * is set, and by the Cloudflare Worker (through Hyperdrive). No Node-only imports:
 * this file must bundle for Workers.
 */
export function openPostgres(url: string, opts: { max?: number } = {}): Db {
  const sql = postgres(url, {
    max: opts.max ?? 10,
    // Skips a type-discovery round trip on connect; we use no custom or array types.
    fetch_types: false,
    // BIGINT (epoch milliseconds, COUNT(*)) as a JS number instead of a string.
    types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
    onnotice: () => {},
  })

  const asQueryable = (q: postgres.Sql | postgres.TransactionSql): Queryable => ({
    async query<T>(text: string, params?: Param[]) {
      const r = await q.unsafe(text, clean(params))
      return { rows: r as unknown as T[], affected: r.count ?? 0 }
    },
    async exec(text: string) {
      await q.unsafe(text).simple()
    },
  })

  return {
    ...asQueryable(sql),
    transaction: async <T>(fn: (tx: Queryable) => Promise<T>) => (await sql.begin((tx) => fn(asQueryable(tx)))) as T,
    close: () => sql.end({ timeout: 5 }),
  }
}
