import type { Config } from "./config.ts"
import { migrate, type Db } from "./db.ts"
import { openPglite } from "./db-pglite.ts"
import { openPostgres } from "./db-postgres.ts"
import { SealedKeyStore, type KeyStore } from "./keys.ts"
import { FileKeyStore } from "./keys-file.ts"
import { Store } from "./store.ts"

/** Loads `.env` from the current folder if there is one (Node only). */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile?.(".env")
  } catch {
    // no .env file: rely on the real environment
  }
}

/**
 * The database and key store a Node process uses, from configuration:
 *   DATABASE_URL set      → that Postgres server; otherwise PGlite in PGLITE_DIR.
 *   KEY_ENCRYPTION_KEY set → private keys sealed in the database; otherwise files in KEYS_DIR.
 * Applies pending migrations before returning.
 *
 * PGlite is single-process: stop the dev server before running the seed or migrate
 * commands against the same folder.
 */
export async function openNodeDeps(config: Config): Promise<{ db: Db; store: Store; keys: KeyStore; where: string }> {
  const db = config.databaseUrl ? openPostgres(config.databaseUrl) : await openPglite(config.pgliteDir)
  await migrate(db)
  const keys = config.keyEncryptionKey ? new SealedKeyStore(config.keyEncryptionKey) : new FileKeyStore(config.keysDir)
  const where = config.databaseUrl ? `Postgres at ${new URL(config.databaseUrl).host}` : `PGlite in ${config.pgliteDir}`
  return { db, store: new Store(db), keys, where }
}
