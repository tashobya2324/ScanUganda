# Deploying ScanUganda

Three parts, each deployable on its own:

| Part | Folder | What it is | Where it can run |
|---|---|---|---|
| **API** | `apps/api` | Hono + PostgreSQL | Cloudflare Worker (`wrangler.jsonc`), or any Node host (`pnpm start`) |
| **Web system** | `apps/console` | Static files | Cloudflare (`wrangler.jsonc`), or any static host |
| **Mobile app** | `apps/pwa` | Static files + service worker | Cloudflare (`wrangler.jsonc`), or any static host |
| Database | (hosted) | PostgreSQL | Neon, Supabase, or any Postgres 14+ |

Why it is built this way: [decisions/2026-11-12-postgres-hono-separate-deploys.md](decisions/2026-11-12-postgres-hono-separate-deploys.md).

Two ways to put the two apps online. Pick one:

- **A. Separate sites (this guide, §3).** Three addresses: `scanuganda-api…`, `scanuganda-web…`, `scanuganda-app…`. Each part is updated on its own. The API allows the two sites through `CORS_ORIGINS`.
- **B. One combined site** (`/` the web system, `/app/` the mobile app, the API behind a proxy): [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md). One address, no CORS.

Both use the same API and database (§1, §2).

You need: a Cloudflare account, `pnpm install` done, and `npx wrangler login` once.

---

## 1. The database

1. Create a Postgres database. Neon's free plan is enough for a demo; pick the region closest to Uganda (Europe). Copy its connection string, `postgres://…?sslmode=require`.
2. Create the tables from your laptop:

   ```
   cd apps/api
   DATABASE_URL="postgres://…" pnpm db:migrate
   ```

   (PowerShell: `$env:DATABASE_URL="postgres://…"; pnpm db:migrate`)
3. Choose the secrets **once** and keep them in the team's password manager. Each one is a long random string; generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

   | Secret | Purpose | If lost |
   |---|---|---|
   | `TOKEN_SECRET` | Signs sign-in tokens | Everyone signs in again |
   | `LOOKUP_PEPPER` | Hashes the 12-digit codes | **Every printed 12-digit code stops working** |
   | `KEY_ENCRYPTION_KEY` | Encrypts signing keys in the database | **No new codes for existing keys** (rotate keys) |

4. **Demo deployments only** (never a system real users will use, see [SECURITY.md](SECURITY.md)): load the sample data **into this database**. Use the same `LOOKUP_PEPPER` and `KEY_ENCRYPTION_KEY` the API will use, or the demo codes will not verify:

   ```
   DATABASE_URL="postgres://…" LOOKUP_PEPPER=… TOKEN_SECRET=… KEY_ENCRYPTION_KEY=… SEED_PASSWORD="choose-a-strong-one" pnpm seed
   ```

   The sample accounts include an **administrator**. Use a strong `SEED_PASSWORD`, never `demo-password-1` (see §5).

## 2. The API as a Cloudflare Worker

**Plan:** the API needs **Workers Paid** ($5/month). A sign-in costs about 27 ms of CPU and generating 5,000 codes about 2 s. The free plan stops a request at 10 ms. The two apps are fine on the free plan.

1. Connect the Worker to the database through Hyperdrive (pooling and caching close to Cloudflare's edge):

   ```
   cd apps/api
   npx wrangler hyperdrive create scanuganda-db --connection-string="postgres://…"
   ```

   Paste the `id` it prints into `apps/api/wrangler.jsonc` (`hyperdrive[0].id`).
2. Set the secrets (each command asks for the value):

   ```
   npx wrangler secret put TOKEN_SECRET
   npx wrangler secret put LOOKUP_PEPPER
   npx wrangler secret put KEY_ENCRYPTION_KEY
   npx wrangler secret put CHANNEL_SECRET      # only if USSD/SMS is used (docs/USSD-GO-LIVE.md)
   ```

3. In `apps/api/wrangler.jsonc`, set `CORS_ORIGINS` to the two app addresses from §3. Deploy each app once first to learn its address, or use your own domains.
4. Deploy: `pnpm deploy:api` from the repository root.
5. Check: open `https://scanuganda-api.<account>.workers.dev/health` (should say `"status":"ok"`) and `/docs`.

**Instead, a Node host** (Render, Railway, Fly.io, a VPS, Cloudflare Containers):

- Start command: `pnpm --filter @scanuganda/api start`.
- Environment: `DATABASE_URL`, the secrets above, `CORS_ORIGINS`, and `TRUST_PROXY=true` behind the host's proxy.
- It applies migrations itself on start. Without `KEY_ENCRYPTION_KEY` it keeps signing keys as files in `KEYS_DIR`, which then needs a lasting disk.

## 3. The web system and the mobile app (separate sites)

For each app, tell the build where the API is, then deploy:

```
cp apps/console/.env.example apps/console/.env.production   # edit: VITE_API_URL, VITE_PWA_URL
cp apps/pwa/.env.example     apps/pwa/.env.production       # edit: VITE_API_URL
pnpm deploy:web     # builds apps/console and publishes it as "scanuganda-web"
pnpm deploy:app     # builds apps/pwa and publishes it as "scanuganda-app"
```

The API address is baked in at build time: after changing it, deploy the app again. Both sites are static, so the Workers free plan is enough. Deep links (`/batches/…`, `/history`) open the app. The mobile app's service worker is served uncached (`apps/pwa/public/_headers`), so phones pick up new versions.

Then make sure the API's `CORS_ORIGINS` lists exactly these two addresses (§2 step 3), and redeploy the API if it changed.

## 4. Check it end to end

- [ ] `/health` on the API answers.
- [ ] The web system: sign in, open a batch, generate 1 code (proves the signing key decrypts).
- [ ] The mobile app on a phone: scan that code; the answer appears. Turn on airplane mode, scan again (offline check); reconnect and watch it sync.
- [ ] Reload a deep link on each site.
- [ ] Browser console has no CORS errors (if it does: `CORS_ORIGINS` does not match the site's address exactly, e.g. a trailing slash).

## 5. Before sharing the address

- The sample administrator can do anything. Use a strong `SEED_PASSWORD`, or seed no sample data and create real accounts.
- Rate limits on Workers are counted per Cloudflare isolate, not globally. For a public launch, add a Cloudflare rate-limiting rule for `/v1/verify` and `/v1/auth/login` (dashboard → Security → WAF → Rate limiting rules).
- Data stored with a provider outside Uganda: see the decision note (Data Protection and Privacy Act 2019).
- Back up the database (Neon keeps point-in-time history) and store the three secrets separately from it.

## Trying the Worker locally

```
cd apps/api
# .dev.vars (git-ignored) holds TOKEN_SECRET, LOOKUP_PEPPER and KEY_ENCRYPTION_KEY, as in .env.
# .env must hold the same KEY_ENCRYPTION_KEY and LOOKUP_PEPPER.
pnpm dev:worker:db    # terminal 1: a seeded throwaway Postgres on 127.0.0.1:54329
pnpm dev:worker       # terminal 2: the API in Cloudflare's runtime on http://localhost:8787
```

Demo codes for this database are written to `apps/api/data/worker-demo-codes.json`.

## What has and has not been tested

Tested on a developer laptop:

- All unit and API tests: 162 API tests, including the network Postgres driver against a Postgres wire-protocol server.
- `pnpm e2e` (32/32), with the Node API on Postgres.
- The API in Cloudflare's local runtime (`wrangler dev`): sign-in, QR and 12-digit checks, recall, code generation with encrypted keys, CSV, USSD, offline sync, overview, CORS.
- Dry-run builds of all three deploy configs and of the combined site.

**Not yet tested:** a real deploy to Cloudflare, Hyperdrive itself, a Neon database, and the apps on a phone at the deployed addresses.
