// Cloudflare Worker in front of the static site (dist/).
//
//  * /v1/* and /health are passed on to the API, whose address is the API_ORIGIN
//    setting. The browser only ever talks to this one https address, so there is no
//    cross-site (CORS) setup, and the API address can change without a rebuild.
//  * Any other address that is not a file is a screen of one of the two apps, so it
//    gets that app's index.html: /app/... the mobile app, everything else the web system.
//
// Files that exist (scripts, styles, icons, the service worker) are served by Cloudflare
// directly and never reach this code.

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/v1/") || url.pathname === "/health") {
      if (!env.API_ORIGIN) return json(503, { error: "unavailable", message: "The API address is not set (API_ORIGIN)." })
      const target = new URL(url.pathname + url.search, env.API_ORIGIN)
      const headers = new Headers(request.headers)
      headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") ?? "")
      headers.set("x-forwarded-proto", "https")
      try {
        return await fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: "manual" }))
      } catch {
        return json(502, { error: "unavailable", message: "The API could not be reached." })
      }
    }

    const inApp = url.pathname === "/app" || url.pathname.startsWith("/app/")
    const page = await env.ASSETS.fetch(new URL(inApp ? "/app/index.html" : "/index.html", url))
    return new Response(page.body, { status: 200, headers: page.headers })
  },
}
