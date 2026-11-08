# Hardening and performance (Phase 6)

Date: 2026-11-08 · Tasks: P6-1, P6-2, P6-3, P4-10

## What was measured

**End to end (`pnpm e2e`).** A throwaway stack and a real Chromium with a fake camera showing real QR codes: 32 checks across the eight scenarios of PLAN §6, all passing. Covers the mobile app, the API, alerts, recalls on every channel, the offline path and USSD/SMS.

**Load (`pnpm load`).** `POST /v1/verify` at a fixed arrival rate on a memory-starved laptop (about 400 MB free):

| | Before | After |
|---|---|---|
| One QR check, in-process | 13.9 ms | 2.5 ms |
| One typed-code check, in-process | 2.1 ms | 1.8 ms |
| 50 req/s, p95 latency | 107 ms to 970 ms (noisy) | 26 ms to 288 ms, 4 of 4 runs pass |
| 150 req/s | errors, p95 11 s | 0 errors, p95 144 ms |
| 250 req/s | errors | 0 errors, p95 830 ms (degrades) |

The target (50 req/s, p95 under 300 ms, no errors) is met with about a 3 to 5 times margin. Results vary a lot run to run on this machine because the whole system stalls under memory pressure; re-run on a healthy machine and on the deployment host (TEAM-INPUT #14).

**Lighthouse 12.8, mobile emulation, production build.** Accessibility 100, SEO 100, Best Practices 96, Performance 89 (largest paint 2.0 s, total blocking time 400 ms under 4× CPU slowdown). The one Best Practices point is the audit running with no API behind it (a 502 for `/v1/sync`), which the app handles. Lighthouse 12 no longer has a separate PWA score; installability rests on the manifest, icons and service worker, tested in a browser but not yet on a real phone.

## Decisions

1. **Native Ed25519 on the server; portable on phones.** Signature checking was 80% of the cost of a QR check. Node's built-in crypto is about 100× faster. `packages/core` takes the checker as an optional hook, so the library stays browser-safe, and a test asserts the two implementations agree on valid, tampered, truncated and malformed input (a disagreement would let a code be genuine on one and forged on the other).
2. **Split `@scanuganda/core` into a light part and a heavy part.** `@scanuganda/core/light` (payload parsing, the 12-digit code) has no dependencies; the app loads the Ed25519 library only when an offline check needs it. Main bundle 307 kB → 269 kB; Lighthouse performance 85 → 89. The lazy chunk is in the precache list, and the offline end-to-end scenario proves it loads with no network.
3. **`synchronous=NORMAL` with WAL.** Avoids a disk flush on every saved scan. A power cut can lose the last moments of scans; it cannot corrupt the database.
4. **Short cache of districts and public keys (5 s).** Our own writes clear it at once; another process's writes appear within the TTL.
5. **Alerts fold repeats for one hour** rather than being unique per scan, to stop flooding. Every scan is still stored.
6. **Lockout is per address and account**, not per account, so an attacker elsewhere cannot lock a real user out. The cost: a determined attacker with many addresses is slowed by the per-address limit and the strong password hashing, not stopped.
7. **Rate limits are settings**, so a load test can raise them without code changes; production keeps the defaults.

## Not done (and why)

- Real-phone tests (TEAM-INPUT #1, #2): need devices and people.
- An audit log of staff actions: a design decision for the team (SECURITY.md, limit 5).
- Revoking a stolen public key: needs a team decision on the model (SECURITY.md, "How a signing key is rotated").
- Console end-to-end in a browser: the console flows were exercised by hand in a real browser in Phase 3 and by unit tests, but are not in `pnpm e2e`.
