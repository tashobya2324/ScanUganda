# ScanUganda: Phased Work Plan

Source of truth for *what* we build and *in what order*. Live status of each task is in [TASKS.md](TASKS.md). How we work day to day is in [PROCEDURE.md](PROCEDURE.md). Visual rules are in [DESIGN.md](DESIGN.md).

## 1. Scope

| Surface | What it is | Users |
|---|---|---|
| **API** | Verification engine, registry, lifecycle, alerts. One backend behind everything else. | all surfaces |
| **Web console** | Browser dashboard to register products and batches, generate signed codes, watch scans on a map, handle alerts and recalls. | Manufacturers, UNBS inspectors, admins |
| **PWA** | Installable mobile web app: scan QR, type a code, get a verdict, work offline, report a suspect product. | Consumers, retailers, field inspectors |
| **USSD / SMS** | Menu on a feature phone: enter the code under the scratch layer, get a verdict. | Rural and basic-phone users |

**Deferred (out of scope for now):** native Android/iOS app. The PWA is built so it can be wrapped later (Capacitor) without a rewrite.

### MVP cut line
If time runs out, the order of sacrifice (last item dropped first) is: native app (already out) → SMS → map view → report flow polish → offline sync. **Never dropped:** API, signed-code verification, the three context checks, the PWA scan-to-verdict path, the USSD sandbox demo, the console's batch and code generation.

## 2. Architecture decisions

| # | Decision | Reason |
|---|---|---|
| A1 | TypeScript everywhere, pnpm workspaces monorepo: `apps/pwa`, `apps/console`, `apps/api`, `packages/core`. | One language for the team; shared types and logic. |
| A2 | `packages/core` holds the **verification engine** as pure functions (no I/O). The API, the USSD handler and the offline PWA all call the same code. | One set of rules, testable without a server. |
| A3 | Backend: Hono + PostgreSQL (PGlite in-process for development and tests). Runs on Node or Cloudflare Workers. *Was Fastify + SQLite until 2026-11-12, see decisions/2026-11-12-postgres-hono-separate-deploys.md.* | Hosting on Cloudflare; still zero setup locally. |
| A4 | Codes are **Ed25519-signed**. QR payload = `batchId.serial.signature`. The server holds the private key; the PWA caches only public keys. | Offline validation without shipping a secret. HMAC would require the secret on the device. |
| A5 | Scratch/USSD code is a random 12-digit lookup stored **hashed** server-side. It needs the server (no offline). | Feature phones cannot verify signatures; short codes cannot carry one. |
| A6 | PWA: Vite + React + service worker (`vite-plugin-pwa`), IndexedDB (Dexie) as the offline store, `BarcodeDetector` with `zxing-wasm` fallback for QR. | Service worker and IndexedDB are the browser equivalents of the proposal's "local SQLite cache". |
| A7 | Location context: browser Geolocation API in the PWA; district chosen by the user over USSD (no GPS there). | USSD gives no coordinates; honest fallback. |

Decisions are logged in `docs/decisions/` as short dated notes whenever one is changed (see PROCEDURE §7).

## 3. How verification works (the rules the engine implements)

A scan produces a verdict **GENUINE / CHECK / STOP** plus reasons:

1. **Signature** invalid or unknown code → STOP (counterfeit).
2. **Recall** on the batch → STOP.
3. **Expired** → STOP.
4. **Lifecycle mismatch:** scanned at retail while state is `IN_FACTORY` → STOP (parallel market or theft). State `IN_TRANSIT` at a retail scan → CHECK.
5. **Spatial:** scan is outside the batch's designated regions → CHECK, raises a distribution-anomaly alert.
6. **Temporal:** the same unit scanned in two places faster than travel is possible (distance ÷ time over a speed ceiling) → STOP, high-priority alarm. Repeat scans in the same place are allowed (a shopper and the shopkeeper) up to a configurable limit.
7. Everything fine → GENUINE.
8. Offline with only a cached key: signature + expiry + recall list as of last sync → CHECK ("checked offline, not yet confirmed") and queued for the server.

## 4. Phases

Each phase has an **exit gate**: all listed checks pass before the next phase's tasks are started (a few tasks may run in parallel; see dependencies in TASKS.md).

### Phase 0: Foundation
Goal: everyone can run, test and build the same thing; rules are in place.
- Convert the repo to the monorepo layout; keep the current prototype running while it is migrated.
- Lint, format, typecheck, test runner and a CI workflow on every push.
- Design tokens and base components from DESIGN.md.
- Seed script with realistic Ugandan sample data.

**Exit gate:** fresh clone → `pnpm install && pnpm dev` runs all apps; CI green; DESIGN tokens in place.

### Phase 1: Domain and verification engine
Goal: the brain exists and is tested before any UI depends on it.
- Data model: manufacturer, product, batch, unit, code, scan, alert, recall, region, user.
- Code generation and Ed25519 signing/verification.
- The rules in §3 as pure functions with exhaustive unit tests (each rule, each combination that matters, boundary values for the speed check).

**Exit gate:** ≥ 90 % line coverage on `packages/core`; a table of scenario → expected verdict passes.

### Phase 2: API
Goal: every surface talks to one backend.
- Auth (manufacturer/admin accounts; consumers can scan anonymously).
- Endpoints: verify, scan history, report, batches, units, code generation, recalls, alerts, sync, public keys.
- Migrations, validation, rate limiting, error format, OpenAPI doc.
- Integration tests against a temp database.

**Exit gate:** integration suite passes; OpenAPI published at `/docs`; an anonymous verify call returns the correct verdict for every seeded scenario.

### Phase 3: Web console
Goal: manufacturers and UNBS can run the system.
- Sign-in, overview (scans today, alert counts, genuine ratio).
- Products and batches; generate and export codes (CSV and printable QR sheet).
- Live scan feed and map; alert inbox with status (open, investigating, resolved).
- Recall issue/lift; user and role management.

**Exit gate:** a manufacturer can create a batch, export codes, and see a scan of one of them appear in the feed and raise an alert in the correct situation.

### Phase 4: PWA
Goal: the consumer and retailer path, installable and offline-capable.
- Port prototype screens to real data; remove mock timers.
- Camera QR scan, manual code entry, geolocation permission flow, verdict screens, history, report.
- Service worker, installability, offline verdict with cached public keys, queue and background sync.
- Accessibility and low-end-device performance pass.

**Exit gate:** installs on a mid-range Android phone via Chrome; works in airplane mode for cached keys; queued scans sync on reconnect; Lighthouse PWA and accessibility ≥ 90.

### Phase 5: USSD and SMS
Goal: feature-phone users get the same verdict.
- USSD session handler in the API (stateless per request, driven by the `text` field) with language choice (English, Luganda) and district selection.
- Local USSD simulator page in the console for development and demos.
- Register with an aggregator sandbox and run the real flow from the aggregator's simulator.
- SMS: "send code to short number → get verdict" (stretch; sandbox only).

**Exit gate:** a full verification run through the aggregator sandbox simulator, plus the local simulator, with session timeouts and invalid input handled. See §5 for what "works" means here.

### Phase 6: Integration and hardening
Goal: it holds together under realistic use.
- End-to-end tests of the headline scenarios (below).
- Security pass: input validation, rate limits, secrets handling, key rotation notes, no PII in logs.
- Load check on verify (target: 50 requests/sec on a laptop with p95 < 300 ms).
- Fix list from team-wide manual testing on real phones.

**Exit gate:** all end-to-end scenarios pass; open bug list has no S1/S2.

### Phase 7: Delivery
Goal: it can be demonstrated and handed in.
- Deploy API, console and PWA to a public host (HTTPS is required for camera, geolocation and service workers).
- Demo script and seeded data; backup recording of the demo.
- Final report sections mapped to the original proposal; user guide; README.

**Exit gate:** the demo runs from a clean deploy, on a phone, following the script, twice in a row.

## 5. USSD: how possible is it?

**Short answer:** the software is entirely doable; the *live short code* is the uncertain part and is outside our control.

How USSD works: the telecom network sends our server an HTTP request each time the user presses a key. We reply with text starting `CON` (keep session open) or `END` (close it). An **aggregator** (Africa's Talking is the usual choice in Uganda) sits between the telecoms and us.

| Level | What it needs | Realistic for us? |
|---|---|---|
| **L1: Local simulator** | Our own page that sends the same requests an aggregator would. | Yes, always. Demonstrates the logic fully. |
| **L2: Aggregator sandbox** | Free account, public HTTPS URL for the callback (tunnel or deploy), aggregator's phone simulator. | Yes. This is the target for the exit gate. |
| **L3: Live short code on MTN/Airtel** | Paid code, application to the aggregator and telecoms, approvals that take time. | Unlikely before the deadline. Treat as future work in the report, and say so honestly in the demo. |

Constraints to design around: a USSD screen is ~160 characters; sessions time out (~30–180 s depending on the network); no GPS, so location comes from the district the user picks; no cryptographic signature check, so USSD verifies the 12-digit lookup code on the server.

> Verify current sandbox limits and pricing on the aggregator's site before relying on this. We have not confirmed them.

## 6. Headline end-to-end scenarios (used in Phase 6 and in the demo)

| # | Scenario | Expected |
|---|---|---|
| E1 | Valid sugar packet scanned at a Kampala shop, batch delivered to distributor | GENUINE |
| E2 | Same code, never issued / altered signature | STOP |
| E3 | Agro-chemical meant for Kapchorwa scanned in Kampala | CHECK + distribution alert |
| E4 | Same unit scanned in Jinja then Fort Portal 2 minutes later | STOP + high-priority alarm |
| E5 | Unit still `IN_FACTORY` scanned at a retail shelf | STOP + theft/parallel-market alert |
| E6 | Batch recalled by manufacturer | STOP on every channel |
| E7 | Scan in airplane mode, then reconnect | CHECK offline, then synced and re-evaluated |
| E8 | Same E1 code through USSD simulator | GENUINE, same record in history |

## 7. Risks

| Risk | Mitigation |
|---|---|
| Time | MVP cut line (§1); phases have gates, not dates; re-plan weekly. |
| Merge conflicts between people/agents | Ownership by folder, small PRs, task claiming (PROCEDURE §3). |
| Camera/geolocation need HTTPS | Dev uses `localhost`; test on phones through a tunnel or the Phase 7 deploy. |
| USSD live code unavailable | Levels L1/L2 are the commitment (§5). |
| Prototype built without a real data model | Phase 1 before UI migration; the prototype is a visual reference only. |
| Scope creep | New ideas go to the Backlog section of TASKS.md, not into the current phase. |
