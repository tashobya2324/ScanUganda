# API stack and conventions (Phase 2)

Date: 2026-11-06 · Tasks: P2-1 to P2-10, P0-6

## Context
PLAN §2 named "Fastify + SQLite via better-sqlite3". Building the API surfaced several choices that differ from, or add to, that.

## Decisions
1. **`node:sqlite` instead of `better-sqlite3`.** It ships inside Node (22.13+ and 24), so there is no native build step on Windows student laptops or on the host. Trade-off: the module is still marked experimental and prints a warning on Node 22. Moving to Postgres later only touches `db.ts` and the SQL in `store.ts`.
2. **Own route registry instead of fastify-swagger.** `http.ts` registers each route with zod schemas for body, query, params and response; the same schemas validate input, build `/openapi.json`, and (in tests) check that every response still matches its declared shape. One definition, no drift. `/docs` loads Swagger UI from a CDN, so it needs internet when opened.
3. **Timestamps are epoch milliseconds** in the API and database, matching `packages/core`.
4. **A payload that is not shaped like a ScanUganda code returns 422 `NOT_A_SCANUGANDA_CODE` and is not recorded.** A shopper scanning a menu QR must not create a counterfeit alert. A well-formed code that is unknown or has a bad signature *is* recorded and alerts.
5. **Product details are withheld** when a code is forged or unknown, so a counterfeiter cannot use the API to learn what a real code looks like for a product.
6. **Private signing keys live outside the database** (`KEYS_DIR`, one file per key, git-ignored). The database holds only public keys. Losing `KEYS_DIR` means existing printed codes still verify but no new codes can be generated for that key.
7. **Lookup codes are stored as HMAC with a server pepper** and cannot be recovered. They are shown once, when generated.
8. **Sample data uses invented companies** (Pearl Sugar Works, Nile Valley Beverages, Acacia Cosmetics, Kilimo Agro-Chem), not the real brands named in the proposal, because the seed stages recalls and counterfeits and must not attach those to real businesses. The PWA prototype's mock screens still say "Kakira Sugar" and will be replaced in P4-5.
9. **Offline scan retries are idempotent** through a device-assigned `clientId` (migration `002_scan_client_id`).

## Consequences / known gaps
- `GET /v1/sync` returns the full cache, not a delta. Fine at demo scale; revisit if batches grow into the thousands.
- Report photo upload is not implemented (`reports.photo_path` is unused).
- Alerts are not de-duplicated: an attacker hammering one forged code can create many alerts. Rate limiting bounds it; proper de-duplication belongs in P6-2.
- No user self-service (password change, lockout after repeated failures) yet; login is rate limited to 10 per minute per IP.
