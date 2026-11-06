# ScanUganda: Task Board

**Every person and every agent reads this file before starting work and updates it when they claim, block or finish a task.** Rules are in [PROCEDURE.md §3](PROCEDURE.md). Phase goals are in [PLAN.md](PLAN.md).

**Status values:** `TODO` · `IN PROGRESS` · `BLOCKED` · `REVIEW` · `DONE`
**Owner:** a person's name or an agent label (e.g. `agent-api`). Leave `-` when unclaimed.
**Size:** S ≤ 2 h · M ≤ half a day · L ≤ 1 day. Split anything bigger.
**Deps:** task IDs that must be `DONE` first.

**Current phase: 2 done, 3 next (Web console). Phases 1 and 2 were started before Phase 0 finished, at the team's request. Phase 0 leftovers (P0-1..P0-5, P0-7, P0-8) still open.**

---

## Phase 0: Foundation

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P0-1 | Convert repo to pnpm workspaces (`apps/pwa`, `apps/console`, `apps/api`, `packages/core`); move the prototype into `apps/pwa` without breaking it | Tashobya | IN PROGRESS | M | - | Partly done: `pnpm-workspace.yaml` + `packages/core` exist. Prototype still at repo root; moving it to `apps/pwa` and adding `apps/api`/`apps/console` remain. Keep dev server on `$PORT` (see AGENTS.md) |
| P0-2 | Lint, format, typecheck, test runner (Vitest) scripts at the root | Tashobya | IN PROGRESS | S | P0-1 | Vitest + typecheck scripts exist in `packages/core` only; root scripts and lint remain |
| P0-3 | CI workflow: install, typecheck, lint, test, build on every push and PR | - | TODO | S | P0-2 | |
| P0-4 | Design tokens and base components (button, input, field, sheet, verdict mark, table) per DESIGN.md | - | TODO | M | P0-1 | |
| P0-5 | Audit current prototype against DESIGN.md; list what to keep or redo | - | TODO | S | P0-4 | Output: note in `docs/decisions/` |
| P0-6 | Seed data: 4 manufacturers, ~12 products, batches, regions (districts with coordinates), units | Tashobya | DONE | M | P1-1 | Done in `apps/api/src/seed.ts`: 4 invented manufacturers, 5 products, 6 scenario batches, 9 regions. Real brands deliberately not used (see decision note) |
| P0-7 | Rewrite root `README.md` (what it is, how to run, where docs are) | - | TODO | S | P0-1 | |
| P0-8 | Replace the first commit's AI co-author trailer? (needs a force-push; **team decision**) | - | BLOCKED | S | - | Awaiting decision from repo owner |

## Phase 1: Domain and verification engine (`packages/core`)

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P1-1 | Data model types and SQL schema + migrations | Tashobya | DONE | M | P0-1 | |
| P1-2 | Ed25519 keypair handling, code generation, payload format `batchId.serial.sig` | Tashobya | DONE | M | P1-1 | |
| P1-3 | 12-digit lookup code generation and hashing | Tashobya | DONE | S | P1-1 | |
| P1-4 | Rule: signature and unknown-code check | Tashobya | DONE | S | P1-2 | |
| P1-5 | Rule: recall and expiry checks | Tashobya | DONE | S | P1-1 | |
| P1-6 | Rule: lifecycle vs scan-context mismatch | Tashobya | DONE | M | P1-1 | |
| P1-7 | Rule: spatial anomaly (designated regions, distance) | Tashobya | DONE | M | P1-1 | |
| P1-8 | Rule: temporal anomaly (impossible travel speed, repeat-scan limit) | Tashobya | DONE | M | P1-1 | Boundary tests required |
| P1-9 | Verdict combiner (rule results → GENUINE/CHECK/STOP + reasons + alerts) | Tashobya | DONE | M | P1-4..P1-8 | |
| P1-10 | Offline verifier (signature + expiry + cached recall list) | Tashobya | DONE | M | P1-2, P1-5 | Used by the PWA |
| P1-11 | Scenario table test (PLAN §6 E1–E7) and coverage ≥ 90 % | Tashobya | DONE | M | P1-9, P1-10 | |

## Phase 2: API (`apps/api`)

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P2-1 | Server skeleton: config, logging, error format, health route, DB connection | Tashobya | DONE | S | P1-1 | |
| P2-2 | Auth for manufacturer/admin (sessions or JWT), roles | Tashobya | DONE | M | P2-1 | |
| P2-3 | `POST /verify` (anonymous allowed) using core engine; stores scan | Tashobya | DONE | M | P1-9, P2-1 | |
| P2-4 | Batches, units and code generation endpoints; CSV export | Tashobya | DONE | M | P2-2 | |
| P2-5 | Recalls and lifecycle state transitions | Tashobya | DONE | M | P2-2 | |
| P2-6 | Alerts: list, filter, status changes | Tashobya | DONE | M | P2-3 | |
| P2-7 | Scan history and report-a-product endpoints | Tashobya | DONE | M | P2-3 | Staff scan list is server-side; a shopper's own history is kept on the device (no accounts). Report photo upload not built yet |
| P2-8 | Sync endpoints: public keys, recall list delta, batch queued offline scans | Tashobya | DONE | M | P2-3 | Full cache returned, not a delta (see decision note) |
| P2-9 | Validation, rate limiting, OpenAPI at `/docs` | Tashobya | DONE | M | P2-3 | Swagger UI loads from a CDN (needs internet) |
| P2-10 | Integration tests on a temp DB for every endpoint | Tashobya | DONE | L | P2-3..P2-8 | |

## Phase 3: Web console (`apps/console`)

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P3-1 | App shell, routing, sign-in, role-based navigation | - | TODO | M | P0-4, P2-2 | |
| P3-2 | Overview dashboard (scans, alerts, genuine ratio, trend) | - | TODO | M | P3-1, P2-6 | |
| P3-3 | Products and batches CRUD | - | TODO | M | P3-1, P2-4 | |
| P3-4 | Generate codes; CSV export and printable QR sheet | - | TODO | M | P3-3 | |
| P3-5 | Live scan feed | - | TODO | M | P3-1, P2-3 | |
| P3-6 | Map of scans and alerts | - | TODO | M | P3-5 | Leaflet + OpenStreetMap tiles |
| P3-7 | Alert inbox with status workflow | - | TODO | M | P3-1, P2-6 | |
| P3-8 | Recalls: issue and lift | - | TODO | S | P3-3, P2-5 | |
| P3-9 | Users and roles management | - | TODO | S | P3-1 | |

## Phase 4: PWA (`apps/pwa`)

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P4-1 | Typed API client and app state; replace mock timers with real calls | - | TODO | M | P2-3 | |
| P4-2 | Camera QR scanning (BarcodeDetector + wasm fallback) | - | TODO | M | P4-1 | |
| P4-3 | Manual 12-digit entry wired to verify | - | TODO | S | P4-1 | |
| P4-4 | Geolocation permission flow and coarse-location fallback | - | TODO | M | P4-1 | |
| P4-5 | Verdict screens with real reasons, product facts and journey | - | TODO | M | P4-1 | |
| P4-6 | Scan history and report-a-product (with photo) | - | TODO | M | P2-7 | |
| P4-7 | Web manifest, icons, service worker, install prompt | - | TODO | M | P4-1 | |
| P4-8 | IndexedDB store: cached public keys, recall list, scan queue | - | TODO | M | P4-7, P1-10 | |
| P4-9 | Offline verdicts and background sync on reconnect | - | TODO | L | P4-8, P2-8 | |
| P4-10 | Accessibility and low-end-device performance pass | - | TODO | M | P4-5 | |
| P4-11 | English and Luganda strings | - | TODO | M | P4-5 | Strings in one file per language |

## Phase 5: USSD and SMS

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P5-1 | USSD handler: menu tree, language, district choice, verify by lookup code | - | TODO | L | P2-3 | Responses start `CON`/`END`, ≤ 160 chars |
| P5-2 | Session handling and input validation (invalid, timeout, back) | - | TODO | M | P5-1 | |
| P5-3 | Local USSD simulator page in the console | - | TODO | M | P5-1, P3-1 | |
| P5-4 | Aggregator sandbox account, public callback URL, run the flow from their simulator | - | TODO | M | P5-1 | Needs a team member's account; record steps |
| P5-5 | SMS verify (stretch, sandbox only) | - | TODO | M | P5-4 | Drop first if short on time |
| P5-6 | Write up L3 (live short code) requirements for the report | - | TODO | S | P5-4 | |

## Phase 6: Integration and hardening

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P6-1 | End-to-end tests for PLAN §6 scenarios E1–E8 (Playwright) | - | TODO | L | P4-9, P5-1, P3-7 | |
| P6-2 | Security pass (validation, rate limits, secrets, logs without PII, key rotation note) | - | TODO | M | P2-9 | |
| P6-3 | Load check on `/verify` | - | TODO | S | P2-10 | |
| P6-4 | Real-phone test round; bug triage with severity | - | TODO | M | P4-10 | |

## Phase 7: Delivery

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P7-1 | Deploy API, console and PWA over HTTPS | - | TODO | M | P6-2 | |
| P7-2 | Demo script, demo data reset, backup recording | - | TODO | M | P7-1 | |
| P7-3 | Final report mapped to the proposal; user guide | - | TODO | L | P7-1 | |
| P7-4 | Two clean demo run-throughs on a phone | - | TODO | S | P7-2 | |

---

## Backlog (not scheduled; do not start without moving it into a phase)

- Native app via Capacitor (SQLite, native camera).
- Batch-level analytics export for UNBS.
- Push notifications for recalls.
- Live short code on MTN/Airtel (see PLAN §5, level L3).

## Blockers and questions

| Date | Raised by | Question or blocker | Resolution |
|---|---|---|---|
| 2026-11-06 | repo owner | First commit carries a Claude co-author trailer; rewrite history? (P0-8) | open |

## Activity log

Newest first. One line per update: `date · who · task ID · what changed`. Anyone changing a status adds a line here.

- 2026-11-06 · Tashobya · P2-1..P2-10, P0-6 · API built in `apps/api` (Fastify + node:sqlite): verify, offline sync, reports, auth, batches/codes/recalls, alerts, scans, overview, admin; OpenAPI at `/docs`. 74 tests pass, 98.6 % coverage; smoke-tested over real HTTP with a seeded file database. Fixed along the way: two queries bound a parameter that had no placeholder. Not yet committed.

- 2026-11-06 · Tashobya · P1-1..P1-11 · Phase 1 built in `packages/core`: types, SQL migration, Ed25519 codes, lookup codes with check digit, five rules, verdict combiner, offline verifier. 83 tests pass, 99 % line coverage; scenarios E1–E6, E8 in `verify.test.ts`, E7 in `offline.test.ts`. Not yet committed or reviewed.
- 2026-11-06 · Tashobya · P0-1, P0-2 · Started: workspace file and `packages/core` created so Phase 1 could proceed.
- 2026-11-06 · setup · all · Plan, board, procedure and design guide created. Nothing started.
