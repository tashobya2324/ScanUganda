# ScanUganda API

Fastify + SQLite (`node:sqlite`) backend. All verification rules live in `packages/core`; this app resolves records, calls the engine, stores scans and raises alerts.

## Run locally

```
cp .env.example .env        # then fill in TOKEN_SECRET, LOOKUP_PEPPER (32+ chars each, different) and SEED_PASSWORD
pnpm install                # from the repo root
pnpm --filter @scanuganda/api seed    # sample data; writes data/demo-codes.json
pnpm --filter @scanuganda/api dev     # http://localhost:3000, docs at /docs
```

Sample users (password = `SEED_PASSWORD`): `admin@`, `pearl@` (manufacturer), `inspector@` `scanuganda.test`.
`data/demo-codes.json` lists printable QR payloads and 12-digit codes for each demo scenario. Delete `data/` to start over.

## Test

```
pnpm --filter @scanuganda/api test
pnpm --filter @scanuganda/api test:coverage
```

Tests run against an in-memory database and in-memory keys, and check every response against its declared schema.

## Layout

| File | Role |
|---|---|
| `http.ts` | Route helper: validation, auth, error shape, OpenAPI generation |
| `routes-public.ts` | verify, sync, reports, login |
| `routes-staff.ts` | batches, codes, recalls, alerts, scans, overview, admin |
| `verification.ts` | the one place a scan is resolved, judged and stored (used by every channel) |
| `store.ts` | all SQL |
| `codegen.ts`, `keys.ts` | code generation and private-key storage |
| `seed.ts` | sample data |

Decisions and known gaps: `docs/decisions/2026-11-06-api-stack-and-conventions.md`.
