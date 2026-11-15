// Cloudflare Worker in front of the static site (dist/).
//
//  * /v1/* and /health are passed on to the API: the API Worker through the `API` service
//    binding when there is one (wrangler.jsonc), otherwise the address in API_ORIGIN (an
//    API on a Node host). The browser only ever talks to this one https address, so there
//    is no cross-site (CORS) setup, and the API address can change without a rebuild.
//    (A plain fetch to another Worker on the same account is refused by Cloudflare, error
//    1042, which is why the API Worker is reached through the binding.)
//  * Any other address that is not a file is a screen of one of the two apps, so it
//    gets that app's index.html: /app/... the mobile app, everything else the web system.
//
// Files that exist (scripts, styles, icons, the service worker) are served by Cloudflare
// directly and never reach this code.

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

// A free API host (Render) sleeps when idle and answers 502/503/504 for up to a minute while it
// wakes. Those answers come from the host's gateway, before the request reaches the app, so
// sending the request again is safe. Retry for about 45 seconds instead of showing an error.
const WAKING = new Set([502, 503, 504])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function callApi(env, target, method, headers, body) {
  for (let attempt = 0; ; attempt++) {
    try {
      const forward = new Request(target, { method, headers, body, redirect: "manual" })
      const res = await (env.API ? env.API.fetch(forward) : fetch(forward))
      if (!WAKING.has(res.status) || attempt >= 8 || env.API) return res
    } catch {
      if (attempt >= 8) return json(502, { error: "unavailable", message: "The API could not be reached." })
    }
    await sleep(5000)
  }
}

export default {
  // Cron trigger (wrangler.jsonc): a small request every 10 minutes keeps the free API host awake.
  async scheduled(_event, env, ctx) {
    if (env.API_ORIGIN && !env.API) ctx.waitUntil(fetch(new URL("/health", env.API_ORIGIN)).catch(() => {}))
  },

  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/v1/") || url.pathname === "/health") {
      if (!env.API && !env.API_ORIGIN) return json(503, { error: "unavailable", message: "The API address is not set (API_ORIGIN)." })
      const target = new URL(url.pathname + url.search, env.API ? "https://api.internal" : env.API_ORIGIN)
      const headers = new Headers(request.headers)
      headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") ?? "")
      headers.set("x-forwarded-proto", "https")
      // Read the body once so the request can be sent again if the API is still waking up.
      const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer()
      return callApi(env, target, request.method, headers, body)
    }

    const inApp = url.pathname === "/app" || url.pathname.startsWith("/app/")
    const page = await env.ASSETS.fetch(new URL(inApp ? "/app/index.html" : "/index.html", url))
    return new Response(page.body, { status: 200, headers: page.headers })
  },
}
