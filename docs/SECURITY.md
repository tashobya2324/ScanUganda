# Security notes

What was reviewed in Phase 6, what was fixed, what is knowingly accepted, and what must be done before the system faces real users. Written for the team and for the report.

Related: [decisions/2026-11-08-hardening-and-performance.md](decisions/2026-11-08-hardening-and-performance.md) · [TEAM-INPUT.md](TEAM-INPUT.md)

## What the system protects

| Asset | Why it matters | Where it lives |
|---|---|---|
| Signing private keys | Whoever holds one can print codes that verify as genuine. | One file per key in `KEYS_DIR` on the API host. Never in the database or git. |
| 12-digit lookup codes | Typed by shoppers; guessing them could reveal real codes. | Only as an HMAC (with a server pepper) in the database. Shown once at generation. |
| Staff accounts and tokens | Control recalls, codes and alerts. | scrypt password hashes; 12-hour signed tokens. |
| Scan records | Show where people were. | Database. Phone numbers are never stored with scans. |

## Fixed in Phase 6

| Finding | Fix | Test |
|---|---|---|
| Aggregator callbacks can carry a shared key in the URL, and request logs recorded the whole URL. | Logs keep the path only: no query string, headers or phone numbers. | `security.api.test.ts` › logs |
| One forged code, scanned repeatedly, flooded the alert inbox. | Repeats of the same alert for the same unit within an hour fold into the open alert (every scan is still recorded). | › alert flooding |
| Sign-in could be guessed within the per-minute IP limit. | 10 failed attempts per address **and** account lock that pair for 15 minutes. Successful sign-ins never count. Another address cannot lock a user out. | › sign-in lockout |
| No way to rotate a signing key. | `POST /v1/manufacturers/:id/rotate-key` (admin): new batches use the new key; codes already printed keep verifying; offline lists carry both public keys. | › signing key rotation |
| API responses lacked browser hardening. | `Content-Security-Policy: default-src 'none'`, `frame-ancestors 'none'`, `Cross-Origin-Resource-Policy`, HSTS only when the request came over https. | › response headers |
| Behind a proxy every visitor would share one address (limits and lockouts would hit everyone together). | `TRUST_PROXY=true` reads `X-Forwarded-For`. Off by default, because when the API is exposed directly the header can be forged. | › client address behind a proxy |
| Verify path was slow and degraded under load (Ed25519 in JavaScript; unit counting; repeated table reads). | Node's native Ed25519 on the server, proven identical to the portable one; lighter queries; short-lived cache of districts and public keys. | `native-ed25519.test.ts`, `pnpm load` |
| Dev tooling had known vulnerabilities (2 critical, 1 high, none in production code). | Vite 8.3.6, Vitest 4.1.12. `pnpm audit`: no known vulnerabilities. | all suites |
| Public check endpoint limit was fixed in code. | `VERIFY_RATE_LIMIT`, `LOGIN_RATE_LIMIT`, `RATE_LIMIT_MAX` are settings. | › public check limit |

Already in place from earlier phases: input validation on every route (zod), role checks with "not found" for other manufacturers' data, constant-time comparisons, same error for wrong email and wrong password, parameterised SQL everywhere, request size limit, per-route rate limits, CORS allow-list, no secrets in git (`.env`, `data/`, keys are git-ignored).

## Accepted limits (know these)

1. **Tokens live in the browser's `localStorage`.** A cross-site-scripting bug in the console would expose them. React escapes output and we render no user HTML (the QR sheet inserts only SVG generated from our own validated payloads), but the risk is not zero. Tokens last 12 hours.
2. **No token revocation.** Signing out only forgets the token on that device. Changing `TOKEN_SECRET` signs everyone out at once.
3. **Rate limits and lockouts are in memory, per server process.** They reset on restart, and a second server would not share them.
4. **No password reset, password change, or two-factor sign-in.** Accounts are created by an administrator.
5. **No audit trail of staff actions.** Recalls, lifts, key rotations and user creation are not logged anywhere durable. This is the most important gap to close if the system is used for real.
6. **Private keys are plain files on the API host.** A host compromise exposes them; back them up separately from the database. No hardware security module.
7. **Unit generation has no per-batch ceiling** (5,000 per request, 30 requests per minute per address).
8. **Scans carry location.** A staff member can see where a code was checked. Phone numbers are not stored with scans, but the policy for who may see locations has not been decided (see TEAM-INPUT #11).
9. **The offline list is public.** It contains public keys, batch ids, expiry dates and recalls: no secrets, but it does reveal which batches exist.
10. **SMS replies reach the aggregator in clear text** by nature of SMS.
11. **A power cut can lose the last moments of scans** (the database uses `synchronous=NORMAL` with WAL). It cannot corrupt the database.

## Before real users (checklist)

- [ ] New `TOKEN_SECRET`, `LOOKUP_PEPPER` and `CHANNEL_SECRET`, long and random, set in the host's settings, never in git. Changing `LOOKUP_PEPPER` later breaks every typed code, so choose once and back it up.
- [ ] **Delete the demo users and sample data.** The seed creates accounts with a known password (`demo-password-1`). Never seed a deployed system.
- [ ] https everywhere (camera, location and the service worker need it). Set `TRUST_PROXY=true` only if behind a proxy you control.
- [ ] `CORS_ORIGINS` set to the real console and app addresses only.
- [ ] Back up `data/` (database) and `KEYS_DIR` separately and test a restore. Losing the keys means no new codes can be generated for existing batches (old codes still verify).
- [ ] Decide who may see scan locations and how long records are kept; update the privacy text.
- [ ] Run `pnpm audit`, `pnpm test`, `pnpm e2e` and `pnpm load` against the deployed build.
- [ ] Restrict who holds admin accounts; give manufacturers their own accounts, never the admin one.

## How a signing key is rotated

1. An administrator calls `POST /v1/manufacturers/{id}/rotate-key` (or asks an agent to). The server writes the new private key file first, then retires the old key and records the new public key.
2. Batches created from then on are signed with the new key. Nothing already printed changes.
3. Phones pick up the new public key at their next sync. Until then, a code from a new batch checked offline shows "not in your offline list yet" (a CHECK, not a false alarm).
4. If a key is believed **stolen**, rotation is not enough: the stolen key can still sign codes that verify. Recall the affected batches, and ask the team to decide whether to add a way to revoke a public key outright (not built).
