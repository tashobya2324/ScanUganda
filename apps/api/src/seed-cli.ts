// Loads the sample data: `pnpm --filter @scanuganda/api seed`.
// Uses the same settings as the server (DATABASE_URL, KEY_ENCRYPTION_KEY...), so it can
// seed a hosted database too. Refuses to touch a database that already has data.
import { mkdirSync, writeFileSync } from "node:fs"
import { loadConfig } from "./config.ts"
import { get } from "./db.ts"
import { loadDotEnv, openNodeDeps } from "./node-runtime.ts"
import { seedDemo } from "./seed.ts"

loadDotEnv()
const config = loadConfig()
const password = process.env.SEED_PASSWORD
if (!password || password.length < 10) {
  throw new Error("Set SEED_PASSWORD (10+ characters) in .env to choose the demo users' password")
}

const { db, store, keys, where } = await openNodeDeps(config)
try {
  if ((await get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM manufacturers"))!.n > 0) {
    throw new Error(`${where} already has data. Use a fresh database (locally: delete apps/api/data) to re-seed.`)
  }
  const result = await seedDemo(store, keys, config.lookupPepper, password)
  mkdirSync("./data", { recursive: true })
  const out = "./data/demo-codes.json"
  writeFileSync(out, JSON.stringify(result.codes, null, 2))
  console.log(`Seeded sample data into ${where}. Users (password from SEED_PASSWORD):\n${result.users.map((u) => `  ${u.role.padEnd(13)} ${u.email}`).join("\n")}`)
  console.log(`\nPrintable demo codes written to ${out} (local only, git-ignored).`)
} finally {
  await store.close()
}
