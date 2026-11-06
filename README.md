# ScanUganda

A context-aware mobile computing system for real-time product verification and supply-chain integrity in Ugandan manufacturing. A shopper scans the QR code (or types the 12-digit code under the scratch layer) and gets one of three answers, **Genuine**, **Check** or **Stop**, based on the code's signature, the batch's recall and expiry state, where the product is supposed to be sold, and whether the same code has been seen in impossible places.

Course project: Mobile Computing & Mobile Communication (group "Anthropic").

## What is in the repository

| Part | Folder | For |
|---|---|---|
| Web system | `apps/console` | Manufacturers, UNBS inspectors, administrators: batches, signed codes, recalls, live scans, map, alerts |
| Mobile app (PWA) | `apps/pwa` | Shoppers and shopkeepers: scan, check, offline use, report a product |
| API | `apps/api` | One backend for all channels (app, USSD, SMS) |
| Verification engine | `packages/core` | The rules, shared by the API and the offline app |
| Plan, tasks, procedure, design | `docs/` | How we build it. Start with `docs/TASKS.md` |

## Run it

Requires Node 22+ and pnpm (versions in `.mise.toml`).

```
pnpm install
pnpm dev
```

- Web system: http://localhost:8443/
- Mobile app: http://localhost:8443/app/
- API docs: http://localhost:3000/docs

The first run creates local secrets and loads sample data. Sign in with `admin@scanuganda.test` / `demo-password-1` (also `pearl@scanuganda.test` for a manufacturer and `inspector@scanuganda.test`). The camera and offline features need `localhost` or https; to try the mobile app on a phone, use an https tunnel.

```
pnpm test        # all test suites
pnpm typecheck   # all type checks
```

## Where things stand

See `docs/TASKS.md` for the live board. In short: engine, API, web system and mobile app are built and tested; USSD/SMS (Phase 5), hardening (Phase 6) and deployment (Phase 7) are next. The mobile app's exit gate (real-phone and Lighthouse checks, Luganda review) is still open.

## Team

Ashaba Martin Bob · Tashobya Treasure · Samuel Ethan Higenyi · Agum Jeremiah Jones · Opio Travis Emma
