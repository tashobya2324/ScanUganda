# USSD and SMS design (Phase 5)

Date: 2026-11-08 · Tasks: P5-1 to P5-6

## Context
Feature-phone users must get the same verdict as app users, over USSD and SMS, without GPS or a signed code. PLAN §5 set three levels: local simulator (L1), aggregator sandbox (L2), live short code (L3).

## Decisions
1. **Stateless menu.** The aggregator sends the whole chain of inputs on every request (`1*123456789012*3`). The menu is a pure function of that chain (`ussd.ts`), so no session is stored, a dropped or repeated request cannot leave the server out of step, and the same code serves the simulator, tests and the aggregator.
2. **One answer path for every channel.** USSD and SMS call the same `performScan` as the app. Verdict rules are not duplicated anywhere.
3. **Location from a district.** The user picks a district (or "Not sure"); the scan is recorded at the district centre with accuracy equal to its radius. The existing accuracy handling in `packages/core` then avoids false alarms from the blur.
4. **Everything fits one 160-character screen and the basic-phone alphabet.** Replies are built by dropping detail in order (full product, product name, nothing) and never cut the verdict word or the advice. A test asserts the limit on every screen.
5. **Typos are caught before the district question**, using the same check digit as the app, so a mistyped code costs one screen, not a lookup.
6. **Phone numbers are not stored.** They are hashed in memory to rate-limit (15 checks per number per 10 minutes, USSD and SMS together). Scans carry the channel but no number. In-memory limiting is per process: a second server needs a shared store.
7. **Aggregator callbacks are authenticated with a shared secret** (`CHANNEL_SECRET`, header or query). Unset means open, which is acceptable only in development; the go-live notes require it.
8. **A fault never shows an error page.** Any exception inside a USSD or SMS handler becomes "Sorry, something went wrong. Please try again."
9. **English only for now.** The menu has no language option until a fluent Luganda speaker has written and reviewed the wording; verdict text is safety-critical (same rule as the PWA, P4-11).
10. **SMS reply sending is behind an interface.** Without credentials nothing is sent and the reply is returned in the HTTP response (development and tests). The Africa's Talking sender is written from public documentation and **has never run against the real service**.
11. **The simulator is a staff-only endpoint**, not the public one, so no secret reaches a browser. It records real scans.

## Verified
Menu paths, pagination, direct dial, typo and back handling, all verdict scenarios (E1, E3, E5, E6, expired, unknown), reports, rate limiting, the secret, failure handling, SMS parsing (with and without a town), message length and alphabet, and the provider request shape (against a mock). Run through the real server with a form-encoded POST like an aggregator's, and in a browser through the simulator.

## Not verified
- Any run through a real aggregator sandbox (P5-4) or from a physical phone.
- The Africa's Talking SMS endpoint and fields.
- Real network session time-outs and how each network renders line breaks and long screens.
- Behaviour behind a public HTTPS tunnel or host.
