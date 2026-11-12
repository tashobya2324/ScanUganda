// End-to-end check of the eight headline scenarios (docs/PLAN.md §6): `pnpm e2e`
//
// Builds a throwaway stack (API with its own database and keys on :3198, the mobile
// app built and served on :5198) and drives a real Chromium with a fake camera that
// shows genuine QR codes made by the API. Your dev data and servers are untouched.
//
//   E1 genuine product             E5 unit still in the factory
//   E2 forged / never-issued code  E6 recalled batch, on every channel
//   E3 stock outside its area      E7 offline scan, then reconnect
//   E4 impossible travel           E8 same unit through USSD

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const QR = createRequire(path.join(root, "apps/console/package.json"))("qrcode")
const tmp = mkdtempSync(path.join(tmpdir(), "scanuganda-e2e-"))
const API = "http://127.0.0.1:3198"
const APP = "http://127.0.0.1:5198/"
const PASSWORD = "e2e-test-password-1"
const J = { "content-type": "application/json" }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PLACES = {
  kampala: { latitude: 0.3476, longitude: 32.5825, accuracy: 25 },
  jinja: { latitude: 0.4244, longitude: 33.2041, accuracy: 25 },
  fortPortal: { latitude: 0.671, longitude: 30.275, accuracy: 25 },
  kapchorwa: { latitude: 1.3988, longitude: 34.45, accuracy: 25 },
}

/* ---------- results ---------- */

const results = []
function check(scenario, what, ok, detail = "") {
  results.push({ scenario, what, ok: !!ok, detail })
  console.log(`  ${ok ? "ok  " : "FAIL"} ${scenario}  ${what}${ok || !detail ? "" : `   (${detail})`}`)
}

/* ---------- servers ---------- */

const children = []
function run(file, args, cwd, env = {}) {
  const child = spawn(process.execPath, [file, ...args], { cwd, env: { ...process.env, ...env }, stdio: "ignore" })
  children.push(child)
  return child
}
function cleanup() {
  for (const c of children) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" })
      else c.kill()
    } catch { /* already gone */ }
  }
  setTimeout(() => { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* Windows may still hold a file */ } }, 1500)
}
async function waitFor(url, label) {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) return } catch { /* not up yet */ }
    await sleep(500)
  }
  throw new Error(`${label} did not start`)
}

async function startStack() {
  const secret = () => randomBytes(32).toString("hex")
  const apiEnv = {
    API_PORT: "3198", PGLITE_DIR: path.join(tmp, "pg"), KEYS_DIR: path.join(tmp, "keys"),
    DATABASE_URL: "", KEY_ENCRYPTION_KEY: "", // never a real database from a developer's .env
    TOKEN_SECRET: secret(), LOOKUP_PEPPER: secret(), SEED_PASSWORD: PASSWORD,
    RATE_LIMIT_MAX: "100000", VERIFY_RATE_LIMIT: "100000", LOGIN_RATE_LIMIT: "100000",
  }
  const tsx = path.join(root, "apps/api/node_modules/tsx/dist/cli.mjs")
  await new Promise((res, rej) => run(tsx, ["src/seed-cli.ts"], path.join(root, "apps/api"), apiEnv).on("exit", (c) => (c === 0 ? res() : rej(new Error("seed failed")))))
  run(tsx, ["src/server.ts"], path.join(root, "apps/api"), apiEnv)

  const vite = path.join(root, "apps/pwa/node_modules/vite/bin/vite.js")
  const pwaDir = path.join(root, "apps/pwa")
  const out = path.join(tmp, "pwa")
  console.log("Building the mobile app…")
  await new Promise((res, rej) => run(vite, ["build", "--outDir", out, "--emptyOutDir"], pwaDir, { PWA_BASE: "/" }).on("exit", (c) => (c === 0 ? res() : rej(new Error("PWA build failed")))))
  run(vite, ["preview", "--outDir", out, "--port", "5198"], pwaDir, { PWA_BASE: "/", VITE_API_PROXY: API })
  await waitFor(`${API}/health`, "API")
  await waitFor(APP, "mobile app")
}

/* ---------- the API as staff ---------- */

async function call(token, method, url, body) {
  const res = await fetch(API + url, { method, headers: { ...J, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 200)}`)
  return json
}
const loginAs = async (email) => (await call(null, "POST", "/v1/auth/login", { email, password: PASSWORD })).token

let batchCounter = 0
/** A fresh batch of real signed units. stage: how far the units have been released. */
async function makeBatch(token, { regions = [], count = 2, stage = "distributor" } = {}) {
  const product = (await call(token, "GET", "/v1/products"))[0]
  const now = Date.now()
  const batch = await call(token, "POST", "/v1/batches", { productId: product.id, batchCode: `E2E-${++batchCounter}-${String(now).slice(-5)}`, manufacturedAt: now - 864e5, expiresAt: now + 300 * 864e5, regionIds: regions })
  const { units } = await call(token, "POST", `/v1/batches/${batch.id}/units`, { count })
  const steps = { factory: 0, transit: 1, distributor: 2 }[stage]
  for (const [from, to] of [["IN_FACTORY", "IN_TRANSIT"], ["IN_TRANSIT", "AT_DISTRIBUTOR"]].slice(0, steps)) await call(token, "POST", `/v1/batches/${batch.id}/lifecycle`, { from, to })
  return { id: batch.id, units }
}

/* ---------- a phone with a fake camera ---------- */

/** A Y4M video of one QR code, which Chromium's fake camera plays on a loop. */
function cameraFor(payload, name) {
  const qr = QR.create(payload, { errorCorrectionLevel: "M" })
  const W = 640, H = 480, n = qr.modules.size, mod = Math.floor(360 / (n + 8)), side = (n + 8) * mod
  const x0 = (W - side) >> 1, y0 = (H - side) >> 1
  const Y = Buffer.alloc(W * H, 255)
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.data[r * n + c]) for (let dy = 0; dy < mod; dy++) for (let dx = 0; dx < mod; dx++) Y[(y0 + (r + 4) * mod + dy) * W + x0 + (c + 4) * mod + dx] = 0
  const frame = Buffer.concat([Buffer.from("FRAME\n"), Y, Buffer.alloc((W * H) / 4, 128), Buffer.alloc((W * H) / 4, 128)])
  const file = path.join(tmp, `${name}.y4m`)
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(12).fill(frame)]))
  return file
}

let cameraCounter = 0
async function openPhone(payload, place = "kampala") {
  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${cameraFor(payload, `cam${++cameraCounter}`)}`] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera", "geolocation"], geolocation: PLACES[place] })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  return { browser, context, page, errors, close: () => browser.close() }
}

/** Scan with the camera and return what the shopper sees. */
async function scanWithCamera(page) {
  await page.goto(APP)
  await page.waitForSelector("text=Check a product")
  await page.click("text=Scan QR code")
  await page.waitForURL(/\/result\//, { timeout: 30000 })
  const title = (await page.locator("h1[role=status]").innerText()).trim()
  const word = (await page.locator("section p").first().innerText().catch(() => "")).trim()
  const reasons = await page.locator("main ul li, section ul li").allInnerTexts().catch(() => [])
  return { title, word, reasons, text: await page.locator("body").innerText() }
}

const alertTypes = async (token, batchId) => (await call(token, "GET", "/v1/alerts?limit=500")).filter((a) => a.batchId === batchId).map((a) => a.type)
const ussd = async (text, phone = "+256700000111") =>
  (await fetch(`${API}/v1/ussd`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ sessionId: "e2e", serviceCode: "*284#", phoneNumber: phone, text }) })).text()

/* ---------- scenarios ---------- */

async function main() {
  await startStack()
  const maker = await loginAs("pearl@scanuganda.test")
  const admin = await loginAs("admin@scanuganda.test")
  let phoneNo = 0
  const phone = () => `+25670000${String(++phoneNo).padStart(4, "0")}`

  console.log("\nE1  A genuine product at a shop in Kampala")
  const e1 = await makeBatch(maker, { count: 3 })
  const p1 = await openPhone(e1.units[0].payload, "kampala")
  const r1 = await scanWithCamera(p1.page)
  check("E1", "shopper is told it is safe to buy", r1.title === "Safe to buy", r1.title)
  check("E1", "the product and batch are shown", /Pearl Sugar Works/.test(r1.text) && r1.text.includes("E2E-1"))
  check("E1", "no browser errors", p1.errors.length === 0, p1.errors.join("; "))
  await p1.close()

  console.log("\nE2  A forged code, and a code that was never issued")
  const e2 = await makeBatch(maker, { count: 2 })
  const good = e2.units[0].payload
  const forged = good.slice(0, -6) + (good.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA")
  const p2 = await openPhone(forged)
  const r2 = await scanWithCamera(p2.page)
  check("E2", "altered signature: do not buy or use", r2.title === "Do not buy or use", r2.title)
  check("E2", "the product is not revealed for a forged code", !/Pearl Sugar Works/.test(r2.text))
  check("E2", "a counterfeit alert is raised for the staff", (await call(admin, "GET", "/v1/alerts?limit=500")).some((a) => a.type === "COUNTERFEIT_SUSPECTED"))
  await p2.close()
  const neverIssued = `NOSUCHBATCH.000001.${good.split(".")[2]}`
  const p2b = await openPhone(neverIssued)
  const r2b = await scanWithCamera(p2b.page)
  check("E2", "a well-formed code that was never issued: do not buy or use", r2b.title === "Do not buy or use", r2b.title)
  await p2b.close()

  console.log("\nE3  Stock meant for Kapchorwa, scanned in Kampala")
  const e3 = await makeBatch(maker, { regions: ["kapchorwa"], count: 2 })
  const p3 = await openPhone(e3.units[0].payload, "kampala")
  const r3 = await scanWithCamera(p3.page)
  check("E3", "scanned in Kampala: wait before you buy", r3.title === "Wait before you buy", r3.title)
  check("E3", "the sale area is named as the reason", /Kapchorwa/.test(r3.text))
  check("E3", "a distribution alert is raised", (await alertTypes(admin, e3.id)).includes("DISTRIBUTION_ANOMALY"))
  await p3.close()
  const p3b = await openPhone(e3.units[1].payload, "kapchorwa")
  const r3b = await scanWithCamera(p3b.page)
  check("E3", "the same product scanned in Kapchorwa is safe to buy", r3b.title === "Safe to buy", r3b.title)
  await p3b.close()

  console.log("\nE4  One unit scanned in Jinja, then Fort Portal moments later")
  const e4 = await makeBatch(maker, { count: 1 })
  const p4a = await openPhone(e4.units[0].payload, "jinja")
  const r4a = await scanWithCamera(p4a.page)
  check("E4", "first scan, in Jinja: safe to buy", r4a.title === "Safe to buy", r4a.title)
  await p4a.close()
  const p4b = await openPhone(e4.units[0].payload, "fortPortal")
  const r4b = await scanWithCamera(p4b.page)
  check("E4", "second scan, 300 km away: do not buy or use", r4b.title === "Do not buy or use", r4b.title)
  check("E4", "the reason says the code may be copied", /copied|km apart/.test(r4b.text))
  check("E4", "a high-priority impossible-travel alert is raised", (await call(admin, "GET", "/v1/alerts?priority=high&limit=500")).some((a) => a.batchId === e4.id && a.type === "IMPOSSIBLE_TRAVEL"))
  await p4b.close()

  console.log("\nE5  A unit still marked as in the factory, scanned at a shelf")
  const e5 = await makeBatch(maker, { count: 1, stage: "factory" })
  const p5 = await openPhone(e5.units[0].payload)
  const r5 = await scanWithCamera(p5.page)
  check("E5", "do not buy or use", r5.title === "Do not buy or use", r5.title)
  check("E5", "a parallel-market alert is raised", (await alertTypes(admin, e5.id)).includes("PARALLEL_MARKET"))
  await p5.close()

  console.log("\nE6  A recalled batch is stopped on every channel")
  const e6 = await makeBatch(maker, { count: 3 })
  await call(maker, "POST", `/v1/batches/${e6.id}/recall`, { reason: "Metal fragments found" })
  const p6 = await openPhone(e6.units[0].payload)
  const r6 = await scanWithCamera(p6.page)
  check("E6", "mobile app (QR): do not buy or use", r6.title === "Do not buy or use", r6.title)
  check("E6", "the recall reason is shown", /Metal fragments/.test(r6.text))
  await p6.close()
  check("E6", "mobile app / API with a typed code: stopped", (await call(null, "POST", "/v1/verify", { code: e6.units[1].lookupCode })).verdict === "STOP")
  const u6 = await ussd(`1*${e6.units[2].lookupCode}*0`, phone())
  check("E6", "USSD: stopped, with the reason", /^END STOP\./.test(u6) && /recalled/.test(u6), u6)
  const s6 = await call(null, "POST", "/v1/sms", { from: phone(), text: e6.units[2].lookupCode })
  check("E6", "SMS: stopped", /^STOP\./.test(s6.reply), s6.reply)

  console.log("\nE7  A scan made offline, then the phone reconnects")
  const e7 = await makeBatch(maker, { count: 2 })
  const p7 = await openPhone(e7.units[0].payload, "kampala")
  await p7.page.goto(APP)
  await p7.page.waitForSelector("text=Check a product")
  await p7.page.evaluate(() => navigator.serviceWorker.ready)
  await p7.page.waitForFunction(() => new Promise((res) => { const r = indexedDB.open("scanuganda"); r.onsuccess = () => { const g = r.result.transaction("kv").objectStore("kv").get("cache"); g.onsuccess = () => res(!!g.result) } }), null, { timeout: 20000 })
  await p7.page.waitForFunction(async () => (await caches.keys()).length > 0)
  await p7.context.setOffline(true)
  await p7.page.goto(APP)
  await p7.page.waitForSelector("text=Check a product")
  check("E7", "the app opens with no connection", true)
  const r7 = await scanWithCamera(p7.page)
  check("E7", "offline scan is only 'wait before you buy', never 'safe'", r7.title === "Wait before you buy", r7.title)
  check("E7", "the result says it was checked on the phone only", /Checked on this phone only/.test(r7.text))
  await p7.page.goto(APP)
  await p7.page.waitForSelector("text=1 waiting to be checked")
  check("E7", "the scan is queued", true)
  await call(maker, "POST", `/v1/batches/${e7.id}/recall`, { reason: "Contamination found" }) // while the phone is offline
  await p7.context.setOffline(false)
  await p7.page.waitForSelector("text=/has now been marked unsafe/", { timeout: 30000 })
  check("E7", "after reconnecting, the shopper is warned the check turned out unsafe", true)
  await p7.page.waitForFunction(() => !document.body.innerText.includes("waiting to be checked"), null, { timeout: 15000 })
  check("E7", "the queue is empty", true)
  const synced = (await call(admin, "GET", `/v1/scans?batchId=${e7.id}&limit=50`)).find((s) => s.wasOffline)
  check("E7", "the server holds the scan, marked as made offline, now judged STOP", synced?.verdict === "STOP", JSON.stringify(synced?.verdict))
  check("E7", "no browser errors", p7.errors.length === 0, p7.errors.join("; "))
  await p7.close()

  console.log("\nE8  The same unit as E1, through USSD")
  const u8 = await ussd(`1*${e1.units[0].lookupCode}*5`, phone()) // 5 = Kampala
  check("E8", "USSD says genuine, naming the same batch the app showed", /^END GENUINE\./.test(u8) && u8.includes(r1.text.match(/E2E-\d+-\d+/)?.[0] ?? "no-batch"), u8)
  const scans = await call(admin, "GET", "/v1/scans?limit=500")
  const serial = e1.units[0].serial
  const channels = new Set(scans.filter((s) => s.batchId === e1.id && s.serial === serial).map((s) => s.channel))
  check("E8", "the unit's history shows both the app and USSD scans", channels.has("PWA") && channels.has("USSD"), [...channels].join(","))
}

main()
  .catch((e) => { console.error("\nSetup or run failed:", e.message); results.push({ scenario: "run", what: e.message, ok: false }) })
  .finally(() => {
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`)
    if (failed.length) console.log("Failed:\n" + failed.map((f) => `  ${f.scenario}  ${f.what}  ${f.detail ?? ""}`).join("\n"))
    cleanup()
    setTimeout(() => process.exit(failed.length ? 1 : 0), 2000)
  })
