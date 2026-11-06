import { writeFileSync } from "node:fs"
import { loadConfig } from "./config.ts"
import { openDb, get } from "./db.ts"
import { FileKeyStore } from "./keys.ts"
import { seedDemo } from "./seed.ts"
import { Store } from "./store.ts"

try {
  process.loadEnvFile?.(".env")
} catch {
  // no .env file
}

const config = loadConfig()
const password = process.env.SEED_PASSWORD
if (!password || password.length < 10) {
  throw new Error("Set SEED_PASSWORD (10+ characters) in .env to choose the demo users' password")
}

const db = openDb(config.dbPath)
if (get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM manufacturers")!.n > 0) {
  throw new Error(`${config.dbPath} already has data. Delete it (and ${config.keysDir}) to re-seed.`)
}

const result = await seedDemo(new Store(db), new FileKeyStore(config.keysDir), config.lookupPepper, password)
const out = "./data/demo-codes.json"
writeFileSync(out, JSON.stringify(result.codes, null, 2))
console.log(`Seeded sample data. Users (password from SEED_PASSWORD):\n${result.users.map((u) => `  ${u.role.padEnd(13)} ${u.email}`).join("\n")}`)
console.log(`\nPrintable demo codes written to ${out} (local only, git-ignored).`)
