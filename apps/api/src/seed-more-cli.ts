// Adds extra sample data (more companies, batches and ~240 scans) to a database that was
// already seeded: `pnpm --filter @scanuganda/api seed:more`. Same settings as the server.
import { loadConfig } from "./config.ts"
import { loadDotEnv, openNodeDeps } from "./node-runtime.ts"
import { seedMore } from "./seed-more.ts"

loadDotEnv()
const config = loadConfig()
const { store, keys, where } = await openNodeDeps(config)
try {
  const r = await seedMore(store, keys, config.lookupPepper)
  console.log(`Added extra sample data to ${where}: ${r.batches} batches in total, ${r.scans} scans, ${r.alerts} alerts.`)
} finally {
  await store.close()
}
