# 2026-11-12: Postgres instead of SQLite, Hono instead of Fastify, parts deployed separately

Tasks: P7-5, P7-6, P7-7. Changes PLAN §2 A3.

## Context

The team wants to host on Cloudflare. The API was Fastify on `node:sqlite` with private signing keys as files. None of that runs on Cloudflare Workers: no long-running Node server, no SQLite file, no disk. The team also asked for a layout where the API, the web system and the mobile app can be deployed on their own.

## Decisions

1. **PostgreSQL is the only database.** Migrations in `packages/core/src/schema.ts` were rewritten in Postgres dialect (BIGINT epoch milliseconds, DOUBLE PRECISION coordinates, BOOLEAN). They were rewritten in place, not added to, because no SQLite database had been deployed.
2. **Two drivers behind one small interface** (`apps/api/src/db.ts`):
   - **PGlite**, Postgres compiled to WebAssembly and running in-process, for `pnpm dev` and tests. A fresh clone still needs nothing installed.
   - **`postgres` (postgres.js)** for a real server, chosen by setting `DATABASE_URL`. That covers Neon, Supabase, a container, or Cloudflare Hyperdrive.
3. **The data layer is async.** That is the price of any networked database. Store, verification, codegen, USSD and SMS changed accordingly. Transactions get their own Store (`store.tx(async (s) => ...)`). Inside one, only `s` may be used: with PGlite's single connection, a query on the outer store would wait forever.
4. **Codegen uses `INSERT ... ON CONFLICT DO NOTHING`** instead of catching a unique-key error. In Postgres any error aborts the whole transaction, so the old catch-and-retry would have failed every later insert.
5. **Hono replaces Fastify.** It runs unchanged on Node (`src/server.ts`) and on Workers (`src/worker.ts`). Our own route registry kept the same zod schemas, OpenAPI document, error format, headers, lockouts and per-route limits. `@fastify/rate-limit` became a small fixed-window limiter (`limiter.ts`).
6. **Private signing keys can live in the database, encrypted** (`SealedKeyStore`): AES-256-GCM, with the key id bound in. The encryption secret `KEY_ENCRYPTION_KEY` lives only in the host's secret store. This is required on Workers. Node hosts can keep using one file per key (`FileKeyStore`) by leaving the secret unset. A copy of the database alone still cannot sign codes.
7. **On Workers, each request opens its own database connection**, which Cloudflare requires. Hyperdrive keeps the real connections warm. An AsyncLocalStorage-backed `Db` hands each request its connection, so routes did not change.
8. **Each part has its own deploy config:**
   - `apps/api/wrangler.jsonc`: the Worker.
   - `apps/console/wrangler.jsonc` and `apps/pwa/wrangler.jsonc`: static sites.
   - The root `wrangler.jsonc` (combined site with a proxy, commit 894b759) stays as the alternative. It can now reach the API Worker through a service binding.

   Steps for both layouts are in `docs/DEPLOY.md`.

## Consequences

- `pnpm dev`, `pnpm test` and `pnpm e2e` still work on a fresh clone. The local database moved from `apps/api/data/scanuganda.db` to `apps/api/data/pglite/`, and `pnpm dev` reseeds once.
- Tests seed one PGlite database per test file and give each app a copy. `db-postgres.test.ts` runs the network driver against PGlite's Postgres wire-protocol server.
- **Cost:** on Workers, sign-in costs about 27 ms of CPU (scrypt), and generating 5,000 codes about 1.8 s. The Workers free plan allows 10 ms per request, so **the API Worker needs Workers Paid ($5/month)**. The two static sites are fine on the free plan. Alternatively, run the API on a Node host.
- **Rate limits on Workers are per isolate** (in memory). For a public launch, add a Cloudflare rate-limiting rule in front of `/v1/verify` and `/v1/auth/login`.
- **Data residency:** managed Postgres providers have no region in Uganda. Personal data (accounts, scan locations) would be stored abroad, which the Data Protection and Privacy Act 2019 regulates. Fine for a demo; say so in the report.
- Verified in Cloudflare's local runtime (`wrangler dev`, workerd) against a real Postgres wire protocol: sign-in, QR and 12-digit checks, recall, code generation with sealed keys, CSV, USSD, offline sync, overview, CORS and headers. **Not verified:** a real Cloudflare deploy, Hyperdrive itself, and Neon.
