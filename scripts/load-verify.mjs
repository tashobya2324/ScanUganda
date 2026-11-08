// Load check for the public verify endpoint: `node scripts/load-verify.mjs [--rps 50] [--seconds 15]`
//
// Starts its own API on a spare port with a throwaway database and keys (your
// dev data is untouched), creates a batch of real signed units, then fires
// requests at a fixed rate ("open loop": a slow answer does not slow the next
// request, as with real shoppers) and reports throughput and latency.
//
// Pass criteria (PLAN Phase 6): no errors, and p95 under 300 ms at 50 requests/second.

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? Number(process.argv[i + 1]) : fallback
}
const RPS = arg("rps", 50)
const SECONDS = arg("seconds", 15)
const UNITS = 500
const PORT = 3199
const BASE = `http://127.0.0.1:${PORT}`
const P95_LIMIT_MS = 300

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const api = path.join(root, "apps/api")
const dir = mkdtempSync(path.join(tmpdir(), "scanuganda-load-"))
const secret = () => randomBytes(32).toString("hex")
const PASSWORD = "load-test-password-1"

const env = {
  ...process.env,
  API_PORT: String(PORT),
  DB_PATH: path.join(dir, "load.db"),
  KEYS_DIR: path.join(dir, "keys"),
  TOKEN_SECRET: secret(),
  LOOKUP_PEPPER: secret(),
  SEED_PASSWORD: PASSWORD,
  RATE_LIMIT_MAX: "1000000",
  VERIFY_RATE_LIMIT: "1000000",
  LOGIN_RATE_LIMIT: "1000000",
}
const tsx = path.join(api, "node_modules/tsx/dist/cli.mjs")

let server
const stop = () => {
  server?.kill()
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* Windows may still hold the file for a moment */ }
}
process.on("exit", stop)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const J = { "content-type": "application/json" }

async function main() {
  const seed = spawn(process.execPath, [tsx, "src/seed-cli.ts"], { cwd: api, env, stdio: "ignore" })
  await new Promise((res, rej) => seed.on("exit", (c) => (c === 0 ? res() : rej(new Error("seed failed")))))
  server = spawn(process.execPath, [tsx, "src/server.ts"], { cwd: api, env, stdio: "ignore" })
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) break } catch { /* not up yet */ }
    await sleep(500)
  }

  const login = await (await fetch(`${BASE}/v1/auth/login`, { method: "POST", headers: J, body: JSON.stringify({ email: "pearl@scanuganda.test", password: PASSWORD }) })).json()
  const auth = { ...J, authorization: `Bearer ${login.token}` }
  const product = (await (await fetch(`${BASE}/v1/products`, { headers: auth })).json())[0]
  const now = Date.now()
  const batch = await (await fetch(`${BASE}/v1/batches`, { method: "POST", headers: auth, body: JSON.stringify({ productId: product.id, batchCode: "LOAD-1", manufacturedAt: now - 864e5, expiresAt: now + 3e10 }) })).json()
  const { units } = await (await fetch(`${BASE}/v1/batches/${batch.id}/units`, { method: "POST", headers: auth, body: JSON.stringify({ count: UNITS }) })).json()
  for (const [from, to] of [["IN_FACTORY", "IN_TRANSIT"], ["IN_TRANSIT", "AT_DISTRIBUTOR"]]) {
    await fetch(`${BASE}/v1/batches/${batch.id}/lifecycle`, { method: "POST", headers: auth, body: JSON.stringify({ from, to }) })
  }
  console.log(`Ready: ${units.length} signed units. Sending ${RPS} requests/second for ${SECONDS} s (${RPS * SECONDS} requests), half by QR and half by typed code.`)

  // Warm up the server (JIT, statement cache) so the first request does not skew the numbers.
  for (let i = 0; i < 20; i++) await fetch(`${BASE}/v1/verify`, { method: "POST", headers: J, body: JSON.stringify({ payload: units[i].payload }) })

  const latencies = []
  const verdicts = {}
  let errors = 0
  const total = RPS * SECONDS
  const started = performance.now()
  const inflight = []
  for (let i = 0; i < total; i++) {
    const due = started + (i * 1000) / RPS
    const wait = due - performance.now()
    if (wait > 0) await sleep(wait)
    const u = units[(i * 7) % units.length]
    const body = i % 2 === 0 ? { payload: u.payload } : { code: u.lookupCode, channel: "USSD" }
    const t0 = performance.now()
    inflight.push(
      fetch(`${BASE}/v1/verify`, { method: "POST", headers: J, body: JSON.stringify({ ...body, position: { lat: 0.3476, lng: 32.5825, accuracyM: 30 } }) })
        .then(async (res) => {
          const out = await res.json()
          latencies.push(performance.now() - t0)
          if (!res.ok) errors++
          else verdicts[out.verdict] = (verdicts[out.verdict] ?? 0) + 1
        })
        .catch(() => { errors++ }),
    )
  }
  await Promise.all(inflight)
  const elapsed = (performance.now() - started) / 1000

  latencies.sort((a, b) => a - b)
  const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]
  const rows = [
    ["requests sent", total],
    ["answered", latencies.length],
    ["errors", errors],
    ["achieved rate", `${(latencies.length / elapsed).toFixed(1)} req/s`],
    ["latency p50", `${pct(50).toFixed(1)} ms`],
    ["latency p95", `${pct(95).toFixed(1)} ms`],
    ["latency p99", `${pct(99).toFixed(1)} ms`],
    ["latency max", `${latencies[latencies.length - 1].toFixed(1)} ms`],
    ["verdicts", JSON.stringify(verdicts)],
  ]
  for (const [k, v] of rows) console.log(`  ${String(k).padEnd(15)} ${v}`)

  const ok = errors === 0 && pct(95) < P95_LIMIT_MS
  console.log(ok ? `\nPASS: no errors and p95 under ${P95_LIMIT_MS} ms at ${RPS} req/s.` : `\nFAIL: needs zero errors and p95 under ${P95_LIMIT_MS} ms.`)
  return ok
}

main().then((ok) => { stop(); process.exit(ok ? 0 : 1) }, (e) => { console.error(e); stop(); process.exit(1) })
