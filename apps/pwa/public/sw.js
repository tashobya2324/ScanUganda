/* ScanUganda service worker.
 *
 * - On install: download every file listed in precache-manifest.json (written
 *   at build time), so the whole app opens offline after one visit.
 * - Pages: network first (always the newest app when online), cached shell when offline.
 * - Static files (hashed names): cache first.
 * - The API (/v1/*) is never cached here: the app keeps its own offline data in
 *   IndexedDB and decides what a stale answer means.
 *
 * All paths are relative to the worker's scope, so the app can live at "/" or "/app/".
 */
const PREFIX = "scanuganda-"
let cacheName = PREFIX + "boot"
const inScope = (path) => new URL(path, self.registration.scope).href

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch(inScope("precache-manifest.json"), { cache: "no-store" })
      const { version, urls } = await res.json()
      cacheName = PREFIX + version
      const cache = await caches.open(cacheName)
      await cache.addAll(urls.map(inScope))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Keep the cache this install just filled; drop older versions.
      const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX))
      const keep = names.includes(cacheName) ? cacheName : names[names.length - 1]
      cacheName = keep
      await Promise.all(names.filter((n) => n !== keep).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== "GET" || url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/v1/") || url.pathname === "/health" || url.pathname.endsWith("/sw.js")) return

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(inScope(""), { ignoreSearch: true, ignoreVary: true })) ?? Response.error()),
    )
    return
  }

  event.respondWith(
    (async () => {
      // ignoreVary: dev and preview servers send "Vary: Origin", and a script tag with
      // `crossorigin` then never matches the copy stored at install. Names are content-hashed, so this is safe.
      const hit = await caches.match(req, { ignoreVary: true })
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) (await caches.open(cacheName)).put(req, res.clone())
      return res
    })(),
  )
})
