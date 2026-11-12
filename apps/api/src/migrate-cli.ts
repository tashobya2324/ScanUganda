// Applies pending database migrations: `pnpm --filter @scanuganda/api db:migrate`.
// The Node server does this itself on start; the Cloudflare Worker does not (it would
// repeat the check on every cold start), so run this before deploying the Worker,
// with DATABASE_URL pointing at the production database.
// Needs only DATABASE_URL (or PGLITE_DIR), not the API's secrets.
import { migrate } from "./db.ts"
import { openPglite } from "./db-pglite.ts"
import { openPostgres } from "./db-postgres.ts"
import { loadDotEnv } from "./node-runtime.ts"

loadDotEnv()
const url = process.env.DATABASE_URL || undefined
const db = url ? openPostgres(url, { max: 1 }) : await openPglite(process.env.PGLITE_DIR || "./data/pglite")
console.log(`Migrating ${url ? `Postgres at ${new URL(url).host}` : "the local PGlite database"}…`)
try {
  const applied = await migrate(db)
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.")
} finally {
  await db.close()
}
