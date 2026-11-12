// Builds the whole static site into ./dist for hosting (Cloudflare):
//   /      the web system (apps/console, through the root Vite config)
//   /app/  the mobile app (apps/pwa, built with its base set to /app/)
// Run with `pnpm build`. The API is not part of this; see docs/DEPLOY.md.
// (To deploy the two apps as separate sites instead, see the same guide.)
import { execFileSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const vite = (cwd, args, env = {}) =>
  execFileSync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build", ...args], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  })

console.log("\n[1/2] web system -> dist/")
vite(root, [])

console.log("\n[2/2] mobile app -> dist/app/")
vite(path.join(root, "apps/pwa"), ["--outDir", path.join(root, "dist/app"), "--emptyOutDir"], { PWA_BASE: "/app/" })

// Cloudflare reads _headers only at the site root: move the mobile app's rules there,
// under /app/ (e.g. its service worker must never be cached).
const appHeaders = path.join(root, "dist/app/_headers")
if (existsSync(appHeaders)) {
  const rules = readFileSync(appHeaders, "utf8").replace(/^\//gm, "/app/")
  appendFileSync(path.join(root, "dist/_headers"), `\n# Mobile app (from apps/pwa/public/_headers)\n${rules}`)
  rmSync(appHeaders)
}

console.log("\nDone. Site is in dist/")
