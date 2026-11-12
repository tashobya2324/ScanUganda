# ScanUganda API

Hono + PostgreSQL backend. All verification rules live in `packages/core`; this app resolves records, calls the engine, stores scans and raises alerts.

It runs as a Node server (`src/server.ts`) or as a Cloudflare Worker (`src/worker.ts`, `wrangler.jsonc`). Locally the database is PGlite: Postgres running inside Node, data in `data/pglite/`, nothing to install. Set `DATABASE_URL` to use a real Postgres server instead. Deploying: [docs/DEPLOY.md](../../docs/DEPLOY.md).

## Run locally

```
cp .env.example .env        # then fill in TOKEN_SECRET, LOOKUP_PEPPER (32+ chars each, different) and SEED_PASSWORD
pnpm install                # from the repo root
pnpm --filter @scanuganda/api seed    # sample data; writes data/demo-codes.json
pnpm --filter @scanuganda/api dev     # http://localhost:3000, docs at /docs
```

Sample users (password = `SEED_PASSWORD`): `admin@`, `pearl@` (manufacturer), `inspector@` `scanuganda.test`.
`data/demo-codes.json` lists printable QR payloads and 12-digit codes for each demo scenario. Delete `data/` to start over (stop the server first: PGlite allows one process at a time).

Other commands: `db:migrate` (apply migrations; the Node server also does it on start), `dev:worker:db` + `dev:worker` (the API in Cloudflare's local runtime, see DEPLOY.md), `deploy:worker`.

## Test

```
pnpm --filter @scanuganda/api test
pnpm --filter @scanuganda/api test:coverage
```

Tests run on in-memory PGlite databases (one seeded per test file, copied for each app), and check every response against its declared schema. `db-postgres.test.ts` runs the network driver (the one production uses) against PGlite's Postgres wire-protocol server.

## Layout

| File | Role |
|---|---|
| `http.ts` | Route helper: validation, auth, error shape, OpenAPI generation |
| `routes-public.ts` | verify, sync, reports, login |
| `routes-staff.ts` | batches, codes, recalls, alerts, scans, overview, admin |
| `verification.ts` | the one place a scan is resolved, judged and stored (used by every channel) |
| `store.ts` | all SQL (Postgres, `$1` placeholders) |
| `db.ts`, `db-pglite.ts`, `db-postgres.ts` | database interface, migrations; in-process and network drivers |
| `codegen.ts`, `keys.ts`, `keys-file.ts` | code generation; private keys sealed in the database or kept as files |
| `server.ts`, `worker.ts` | entry points: Node server, Cloudflare Worker |
| `seed.ts` | sample data |

Decisions and known gaps: `docs/decisions/2026-11-06-api-stack-and-conventions.md`, `docs/decisions/2026-11-12-postgres-hono-separate-deploys.md`.
