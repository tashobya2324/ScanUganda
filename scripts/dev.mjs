// Starts the whole system for development with one command: `pnpm dev`.
//
//   web  (console)  http://localhost:$PORT (8443)      the web system
//   app  (PWA)      http://localhost:$PORT/app/        the mobile app, served through the same address
//   api             http://localhost:3000              the backend (docs at /docs)
//
// On a fresh clone it also creates apps/api/.env with random local secrets and
// loads the sample data, so nothing needs configuring by hand.

import { spawn, execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync, writeFileSync } from "node:fs"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const api = path.join(root, "apps/api")
const pwa = path.join(root, "apps/pwa")
const webPort = process.env.PORT || "8443"
const DEMO_PASSWORD = "demo-password-1"

const need = (file, hint) => {
  if (!existsSync(file)) throw new Error(`${file} is missing. ${hint}`)
  return file
}
const hint = "Run `pnpm install` first."
const tsx = need(path.join(api, "node_modules/tsx/dist/cli.mjs"), hint)
const viteApp = need(path.join(pwa, "node_modules/vite/bin/vite.js"), hint)
const viteWeb = need(path.join(root, "node_modules/vite/bin/vite.js"), hint)

/* ---------- first-run setup for the API ---------- */

const envFile = path.join(api, ".env")
if (!existsSync(envFile)) {
  const secret = () => randomBytes(32).toString("hex")
  writeFileSync(
    envFile,
    [
      "# Created by `pnpm dev` for local development only. Not committed (git-ignored).",
      "API_PORT=3000",
      "DB_PATH=./data/scanuganda.db",
      "KEYS_DIR=./data/keys",
      `TOKEN_SECRET=${secret()}`,
      `LOOKUP_PEPPER=${secret()}`,
      `SEED_PASSWORD=${DEMO_PASSWORD}`,
      "",
    ].join("\n"),
  )
  console.log("[setup] created apps/api/.env with new local secrets")
}
if (!existsSync(path.join(api, "data/scanuganda.db"))) {
  console.log("[setup] loading sample data…")
  execFileSync(process.execPath, [tsx, "src/seed-cli.ts"], { cwd: api, stdio: "inherit" })
  console.log(`[setup] sign in with admin@scanuganda.test / ${DEMO_PASSWORD}   (also pearl@… and inspector@…)`)
}

/* ---------- run the three servers ---------- */

const children = []
const inUse = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1")
    s.once("connect", () => (s.destroy(), resolve(true)))
    s.once("error", () => resolve(false))
  })

async function start(name, port, file, args, cwd, env = {}) {
  if (await inUse(port)) {
    console.log(`[${name}] port ${port} is already in use: assuming it is already running`)
    return
  }
  const child = spawn(process.execPath, [file, ...args], { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] })
  children.push(child)
  const pipe = (stream, out) =>
    stream.on("data", (d) => {
      for (const line of String(d).split(/\r?\n/)) if (line.trim()) out.write(`[${name}] ${line}\n`)
    })
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on("exit", (code) => console.log(`[${name}] stopped (${code})`))
}

const stopAll = () => children.forEach((c) => c.kill())
process.on("SIGINT", () => (stopAll(), process.exit(0)))
process.on("SIGTERM", () => (stopAll(), process.exit(0)))
process.on("exit", stopAll)

await start("api", 3000, tsx, ["src/server.ts"], api)
await start("app", 5175, viteApp, [], pwa, { PWA_BASE: "/app/" })
await start("web", Number(webPort), viteWeb, [], root)

console.log(`\n  Web system   http://localhost:${webPort}/\n  Mobile app   http://localhost:${webPort}/app/\n  API docs     http://localhost:3000/docs\n`)
