# ScanUganda: Task Board

**Every person and every agent reads this file before starting work and updates it when they claim, block or finish a task.** Rules are in [PROCEDURE.md §3](PROCEDURE.md). Phase goals are in [PLAN.md](PLAN.md).

**Status values:** `TODO` · `IN PROGRESS` · `BLOCKED` · `REVIEW` · `DONE`
**Owner:** a person's name or an agent label (e.g. `agent-api`). Leave `-` when unclaimed.
**Size:** S ≤ 2 h · M ≤ half a day · L ≤ 1 day. Split anything bigger.
**Deps:** task IDs that must be `DONE` first.

**Everything that needs the team is listed in [TEAM-INPUT.md](TEAM-INPUT.md).**

**Current phase: 6 done except what needs people (P6-4 real phones; see TEAM-INPUT). Phase 7 (delivery) is next, and its deployment and demo tasks need the team. Phase 5 built except the aggregator sandbox run (P5-4, needs a team member's account). Phase 4 exit gate also still open (real-phone test, Lighthouse, Luganda review). Phase 6 (integration and hardening) is next. Phases 1 and 2 were started before Phase 0 finished, at the team's request. Phase 0 leftovers (P0-1..P0-5, P0-7, P0-8) still open. Console design tokens exist in `apps/console/src/index.css` but are not yet shared with the PWA (P0-4).**

---

## Phase 0: Foundation

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P0-1 | Convert repo to pnpm workspaces (`apps/pwa`, `apps/console`, `apps/api`, `packages/core`); move the prototype into `apps/pwa` without breaking it | Tashobya | DONE | M | - | Workspaces in place (`apps/console`, `apps/pwa`, `apps/api`, `packages/core`). The prototype is not a product, so it moved to `docs/mockups/` (reference only) and the root preview now serves the real web system; the mobile app is served at `/app/`. |
| P0-2 | Lint, format, typecheck, test runner (Vitest) scripts at the root | Tashobya | IN PROGRESS | S | P0-1 | Root `pnpm test` and `pnpm typecheck` run every package. Lint and format checks still missing. |
| P0-3 | CI workflow: install, typecheck, lint, test, build on every push and PR | - | TODO | S | P0-2 | |
| P0-4 | Design tokens and base components (button, input, field, sheet, verdict mark, table) per DESIGN.md | - | TODO | M | P0-1 | |
| P0-5 | Audit current prototype against DESIGN.md; list what to keep or redo | Tashobya | DONE | S | P0-4 | Not needed: the team confirmed the prototype is a flow mockup, not a look to follow. Kept in `docs/mockups/`. |
| P0-6 | Seed data: 4 manufacturers, ~12 products, batches, regions (districts with coordinates), units | Tashobya | DONE | M | P1-1 | Done in `apps/api/src/seed.ts`: 4 invented manufacturers, 5 products, 6 scenario batches, 9 regions. Real brands deliberately not used (see decision note) |
| P0-7 | Rewrite root `README.md` (what it is, how to run, where docs are) | Tashobya | DONE | S | P0-1 | README and AGENTS.md rewritten for the real structure. |
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
| P3-1 | App shell, routing, sign-in, role-based navigation | Tashobya | DONE | M | P0-4, P2-2 | Sign-in, session expiry handling, role-based nav. Narrow-screen layout built but not visually checked. |
| P3-2 | Overview dashboard (scans, alerts, genuine ratio, trend) | Tashobya | DONE | M | P3-1, P2-6 | |
| P3-3 | Products and batches CRUD | Tashobya | DONE | M | P3-1, P2-4 | Create and list only; no edit or delete of products/batches yet. |
| P3-4 | Generate codes; CSV export and printable QR sheet | Tashobya | DONE | M | P3-3 | CSV built in the browser from the one-time result; QR sheet uses the print stylesheet. |
| P3-5 | Live scan feed | Tashobya | DONE | M | P3-1, P2-3 | Polls every 5 s (pausable); not a websocket. |
| P3-6 | Map of scans and alerts | Tashobya | DONE | M | P3-5 | Leaflet + OpenStreetMap tiles |
| P3-7 | Alert inbox with status workflow | Tashobya | DONE | M | P3-1, P2-6 | |
| P3-8 | Recalls: issue and lift | Tashobya | DONE | S | P3-3, P2-5 | |
| P3-9 | Users and roles management | Tashobya | DONE | S | P3-1 | List and create only; no disable, edit or password reset yet. |

## Phase 4: PWA (`apps/pwa`)

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P4-1 | Typed API client and app state; replace mock timers with real calls | Tashobya | DONE | M | P2-3 | |
| P4-2 | Camera QR scanning (BarcodeDetector + wasm fallback) | Tashobya | DONE | M | P4-1 | Native BarcodeDetector, jsQR fallback. Verified with a fake camera showing a real QR; not yet on a real phone or with printed codes. |
| P4-3 | Manual 12-digit entry wired to verify | Tashobya | DONE | S | P4-1 | |
| P4-4 | Geolocation permission flow and coarse-location fallback | Tashobya | DONE | M | P4-1 | Optional, 4 s limit, scans proceed without a fix. Settings switch plus browser permission. |
| P4-5 | Verdict screens with real reasons, product facts and journey | Tashobya | DONE | M | P4-1 | |
| P4-6 | Scan history and report-a-product (with photo) | Tashobya | DONE | M | P2-7 | History is on-device. Report has no photo upload (API gap) and needs a connection. |
| P4-7 | Web manifest, icons, service worker, install prompt | Tashobya | DONE | M | P4-1 | Manifest, icons, service worker, install button verified in headless Chromium. Install on a real Android phone not yet tested. |
| P4-8 | IndexedDB store: cached public keys, recall list, scan queue | Tashobya | DONE | M | P4-7, P1-10 | |
| P4-9 | Offline verdicts and background sync on reconnect | Tashobya | DONE | L | P4-8, P2-8 | Verified end to end including a recall made while offline. Browser Background Sync API not used: sync runs on start, reconnect, foreground and every minute while scans wait. |
| P4-10 | Accessibility and low-end-device performance pass | Tashobya | DONE | M | P4-5 | Lighthouse 12 (mobile): Accessibility 100, SEO 100, Best Practices 96, Performance 89. Real low-end phone test still needed (TEAM-INPUT #1). |
| P4-11 | English and Luganda strings | Tashobya | IN PROGRESS | M | P4-5 | Strings in one file per language |

## Phase 5: USSD and SMS

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P5-1 | USSD handler: menu tree, language, district choice, verify by lookup code | Tashobya | DONE | L | P2-3 | Responses start `CON`/`END`, ≤ 160 chars |
| P5-2 | Session handling and input validation (invalid, timeout, back) | Tashobya | DONE | M | P5-1 | State is rebuilt from the chain of inputs each request, so nothing is stored per session. Network timeouts are the aggregator's. 15 checks per phone per 10 min (in memory). Any server fault becomes a polite END screen. |
| P5-3 | Local USSD simulator page in the console | Tashobya | DONE | M | P5-1, P3-1 | Console page `USSD simulator`: same menu and protocol, shows each step exchanged. Records real scans (channel USSD). |
| P5-4 | Aggregator sandbox account, public callback URL, run the flow from their simulator | - | BLOCKED | M | P5-1 | Needs a team member to create the aggregator account and run the steps in `docs/USSD-GO-LIVE.md`. Everything on our side is built so it only needs the callback URL and a secret. |
| P5-5 | SMS verify (stretch, sandbox only) | Tashobya | DONE | M | P5-4 | Drop first if short on time |
| P5-6 | Write up L3 (live short code) requirements for the report | Tashobya | DONE | S | P5-4 | See `docs/USSD-GO-LIVE.md`. Costs, timelines and approval rules are left as "confirm with the aggregator" because we have no reliable figures. |

## Phase 6: Integration and hardening

| ID | Task | Owner | Status | Size | Deps | Notes |
|---|---|---|---|---|---|---|
| P6-1 | End-to-end tests for PLAN §6 scenarios E1–E8 (Playwright) | Tashobya | DONE | L | P4-9, P5-1, P3-7 | `pnpm e2e`: 32 checks, all eight scenarios, real browser + fake camera, throwaway stack. Console is not in it (exercised by hand and by unit tests). |
| P6-2 | Security pass (validation, rate limits, secrets, logs without PII, key rotation note) | Tashobya | DONE | M | P2-9 | See `docs/SECURITY.md`: log redaction, sign-in lockout, alert de-duplication, key rotation, headers, proxy setting, dependency upgrades (audit clean). Audit log and public-key revocation left to the team (TEAM-INPUT #15). |
| P6-3 | Load check on `/verify` | Tashobya | DONE | S | P2-10 | `pnpm load`: QR check 13.9 → 2.5 ms; 50 req/s target met with ~3-5x margin. Numbers are noisy on this low-memory laptop: re-run on a healthy machine (TEAM-INPUT #14). |
| P6-4 | Real-phone test round; bug triage with severity | - | BLOCKED | M | P4-10 | Needs real phones and people: see `docs/TEAM-INPUT.md` #1 and #2. |

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

- 2026-11-08 · Tashobya · P4 polish · App now looks and feels like an installed app: green header, raised Scan button in a five-item bottom bar, no text selection on chrome, phone-sized frame on wide screens. Home and Settings carry a clear "Download the app" card (one-tap install where the browser allows; written steps for iPhone Safari and others). Added `docs/RUNNING.md`. PWA 37 tests, `pnpm e2e` 32/32. Not committed; install on a real phone still unverified (TEAM-INPUT #1, #2).

- 2026-11-08 · Tashobya · P6-1,2,3, P4-10 · Phase 6 done except P6-4. `pnpm e2e` (32/32), `pnpm load`, security pass (`docs/SECURITY.md`), Lighthouse. API 152 tests, core 86, console 49, PWA 37. Real findings fixed: signature checking was 80 % of QR-check cost (now native on the server); verify counted a batch's units on every scan; one forged code flooded alerts; sign-in could be guessed; no key rotation; request logs held the channel key. Dev-tool vulnerabilities cleared (Vite 8.3.6, Vitest 4.1.12). Not committed. Added TEAM-INPUT #13-16 (incl. Ethan co-author request).

- 2026-11-08 · Tashobya · P6-1..P6-4 · Phase 5 committed (e7fb946, not pushed). Phase 6 started: doing everything possible alone first (security pass, end-to-end scenarios, load check, accessibility audit); P6-4 BLOCKED on real phones. Created `docs/TEAM-INPUT.md`, the register of everything that needs the team.

- 2026-11-08 · Tashobya · P5-1,2,3,5,6 · USSD menu, SMS check, simulator page and go-live write-up built. API 120 tests (98.7 % coverage), console 49. Checked through the real server with a form-encoded callback exactly as an aggregator sends it, and in a browser through the simulator. NOT done: aggregator sandbox run (P5-4) and any test from a physical phone. Found and fixed: an emoji became two "?" in SMS text (regex needed the `u` flag). Not committed.

- 2026-11-08 · Tashobya · P5-1,2,3,5,6 · Claimed. P5-4 marked BLOCKED: needs a team member's aggregator account.

- 2026-11-06 · Tashobya · P0-1, P0-5, P0-7 · Team clarified the original prototype was a flow mockup, not the product. Moved it to `docs/mockups/` (not served). The preview at :8443 now serves the real web system (`apps/console`) and the mobile app at `/app/`; `pnpm dev` starts API + app + web and, on a fresh clone, creates local secrets and sample data. Found and fixed a real offline bug in the PWA service worker (cache lookups missed when the server sends `Vary: Origin`; deep links failed offline). Pushed to GitHub at the team's request.

- 2026-11-06 · Tashobya · P4-1..P4-11 · PWA built in `apps/pwa` (see decision note 2026-11-06-pwa-design-and-scope). 37 tests pass; headless-Chromium run with a fake camera covered online scan, typed code, offline reload, offline scan, recall while offline, and sync on reconnect. P4-10 and P4-11 left open; Phase 4 exit gate NOT met until tested on a real Android phone with Lighthouse ≥ 90. Not committed (AGENTS.md: commit only when asked).
- 2026-11-06 · Tashobya · - · Preview on :8443 went blank after a workspace install re-linked packages under the running Vite process (`__BUNDLED_DEV__ is not defined`). Restart the root dev server after any `pnpm install`.

- 2026-11-06 · Tashobya · P4-1..P4-11 · Claimed. Building `apps/pwa` as a fresh mobile-first app that reuses the prototype's flow as a reference; the root prototype stays in place (Figma Make needs it at the root), so P0-1's "move the prototype" is replaced by this. See decision note when done.

- 2026-11-06 · Tashobya · P3-1..P3-9 · Console built in `apps/console`: sign-in, overview + trend, batches and products, code generation (CSV + QR print sheet), lifecycle release, recall/lift, live feed, map, alerts inbox, team. 33 UI tests; typecheck and build pass. Walked through in a headless browser as admin and manufacturer: create batch → generate → CSV download → print view → release → recall → lift, no browser errors. Also reworded the impossible-travel message in core ("in under a minute" instead of "within 0 minutes"; 84 core tests). Not yet committed.

- 2026-11-06 · Tashobya · P2-1..P2-10, P0-6 · API built in `apps/api` (Fastify + node:sqlite): verify, offline sync, reports, auth, batches/codes/recalls, alerts, scans, overview, admin; OpenAPI at `/docs`. 74 tests pass, 98.6 % coverage; smoke-tested over real HTTP with a seeded file database. Fixed along the way: two queries bound a parameter that had no placeholder. Not yet committed.

- 2026-11-06 · Tashobya · P1-1..P1-11 · Phase 1 built in `packages/core`: types, SQL migration, Ed25519 codes, lookup codes with check digit, five rules, verdict combiner, offline verifier. 83 tests pass, 99 % line coverage; scenarios E1–E6, E8 in `verify.test.ts`, E7 in `offline.test.ts`. Not yet committed or reviewed.
- 2026-11-06 · Tashobya · P0-1, P0-2 · Started: workspace file and `packages/core` created so Phase 1 could proceed.
- 2026-11-06 · setup · all · Plan, board, procedure and design guide created. Nothing started.
