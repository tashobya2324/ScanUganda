# Putting ScanUganda on Cloudflare (free plan)

This is layout **B** from [DEPLOY.md](DEPLOY.md): one combined site. Cloudflare's free plan serves the **web system and the mobile app** over https, and a small Worker passes `/v1/*` through to the API.

Since 2026-11-12 the API itself can also run on Cloudflare, as its own Worker with a Postgres database (DEPLOY.md §1-2; it needs Workers Paid). The proxy then reaches it through a **service binding**: uncomment `services` in the root `wrangler.jsonc` and leave `API_ORIGIN` empty. The options in §2 below still apply when the API runs elsewhere.

```
phone / browser ──https──> Cloudflare (free)
                              ├─ /            web system   (static files)
                              ├─ /app/        mobile app   (static files)
                              └─ /v1/*, /health  ──> Worker ──> the API (API_ORIGIN)
```

Because the browser only ever talks to the one Cloudflare address, there is no CORS setup, and the API's address can change without rebuilding.

## 1. Cloudflare project settings

In the Cloudflare dashboard (Workers & Pages → the project → Settings → Build):

| Setting | Value |
|---|---|
| Root directory | `/` (repository root) |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |

`pnpm run build` builds both apps into `dist/` (`scripts/build-site.mjs`). `wrangler.jsonc` tells Wrangler to publish `dist/` and the Worker in `worker/index.js`. (The earlier failure, "run in the root of a workspace", happened because there was no `wrangler.jsonc`.)

Then add the variable **`API_ORIGIN`** (Settings → Variables and Secrets): the API's https address with no trailing slash. Until it is set, the apps load but every API call answers "The API address is not set".

## 2. Where the API runs (free options)

| Option | Cost | Good for | Watch out |
|---|---|---|---|
| **Your laptop + a Cloudflare quick tunnel** | Free, no card | Demos and phone testing | The laptop must be on and `pnpm dev` running. The tunnel address changes each time you start it, so update `API_ORIGIN` each time. Works through campus Wi-Fi (it only makes outgoing connections). |
| **The API as a Cloudflare Worker** (DEPLOY.md) | Workers Paid ($5/month) + free Neon database | An always-on API with no server to look after | Set up the database and three secrets once (DEPLOY.md §1). |
| **Oracle Cloud "Always Free" VM** | Free, needs a card for identity check | An always-on API | More setup; availability depends on region. |
| Fly.io, Railway, Render | Free tiers change | With a hosted Postgres (`DATABASE_URL`) and `KEY_ENCRYPTION_KEY`, no disk is needed any more | Without those two settings, a restart wipes the local database **and the signing keys**. Check current terms before using. |

**Laptop + quick tunnel**, step by step:
1. Install once: `winget install Cloudflare.cloudflared`.
2. Start the project: `pnpm dev`.
3. In another terminal: `cloudflared tunnel --url http://localhost:3000`. It prints `https://something.trycloudflare.com`.
4. Put that address in `API_ORIGIN` in the Cloudflare dashboard and save. No rebuild needed.
5. In `apps/api/.env` set `TRUST_PROXY=true`, then restart `pnpm dev`.
6. Open your Cloudflare address (`https://scanuganda.<your-account>.workers.dev/app/`) on the phone.

## 3. Before you share the address

The sample data contains accounts with a **known password** (`demo-password-1`, including an administrator). Once the API is reachable from the internet, anyone who finds the address can sign in as admin. Before sharing the link with anyone outside the team:
- change those passwords, or
- run the API against a fresh database with only accounts you created (see `docs/SECURITY.md`, "Before real users").

## 4. After the first deploy

- Open `/app/` on a phone: the camera works (https) and **Download the app** installs it.
- Reload a deep link such as `/app/history` to confirm it opens the app, not the web system.
- Free plan limits (about 100,000 Worker requests a day) are far above a university demo.

## What was tested

The Worker was run locally with `wrangler dev` against the running API: the web system and app pages load, deep links return the right app, a sign-in through the Worker works, and `/health` is passed through. **Not yet tested:** a real Cloudflare deploy, a phone on the Cloudflare address, and the quick tunnel.
