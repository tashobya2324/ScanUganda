# Needs the team

Everything that an agent or one person cannot finish alone: a decision, an account, a physical device, a fluent speaker. Review this at the weekly check. When an item is resolved, move it to **Done** with the date and the answer. New items go at the top of the open list.

Related: [TASKS.md](TASKS.md) · [PLAN.md](PLAN.md)

## Open

| # | Needed | Why we cannot do it alone | Who / what is required | Blocks | Added |
|---|---|---|---|---|---|
| 1 | **Real Android phone test** of the mobile app: install it, switch to airplane mode, scan a *printed* QR code in normal and poor light, try a typed code, reconnect and see it sync. | Needs a physical device and printed codes. Camera decoding quality and install behaviour on real phones are unproven. | One teammate with an Android phone (Chrome) and the app reachable over **https** (tunnel or deployed). Print a few QR codes from the console's *Print QR sheet*. Report what failed. | P4 exit gate, P6-4 | 2026-11-06 |
| 2 | **iPhone check** of the mobile app (Safari). | iOS has no install prompt and no native QR detector; we rely on a fallback decoder that is untested on iOS. | One teammate with an iPhone. | P6-4 | 2026-11-06 |
| 3 | **Luganda wording** for the app, USSD and SMS (verdicts first: Genuine / Check / Stop and "Safe to buy", "Wait before you buy", "Do not buy or use"). | A wrong word on a safety verdict is a serious fault, so it must be written and reviewed by a fluent speaker, not guessed. | A fluent Luganda speaker in the team or someone they trust, plus a second reader to review. Strings go in `apps/pwa/src/i18n/lg.ts`; USSD/SMS text needs a matching table (an agent will wire it once the words exist). | P4-11 | 2026-11-06 |
| 4 | **Aggregator sandbox account** and a run of the USSD flow through its phone simulator. | Needs a person to create an account (Africa's Talking is the usual choice) and a public HTTPS callback address. | One teammate follows `docs/USSD-GO-LIVE.md` §2 and records screenshots and any difference. | P5-4, Phase 5 exit gate | 2026-11-08 |
| 5 | **Confirm the SMS sending call** against the aggregator's sandbox. | `AfricasTalkingSms` was written from documentation and has never run against the real service. | Same teammate as #4, step 7 of the same guide. | P5-5 | 2026-11-08 |
| 6 | **Decide on removing the AI co-author line** from the first commit (`4c8fb47`). | Needs a force-push to `main`, which rewrites history for everyone who has cloned. Forbidden by our own procedure unless the team approves. | The repo owner decides; if yes, everyone re-clones afterwards. | P0-8 | 2026-11-06 |
| 7 | **Confirm the verification rule choices.** Speed ceiling 120 km/h, noise distance 5 km, 5 scans per unit before "possible clone", stock "at distributor" passes a shop scan, "in transit" at a shop is CHECK, inspectors skip the lifecycle rule. | These are judgement calls about how Ugandan supply chains really work, not technical facts. | The team (ideally with input from the lecturer or someone from a manufacturer). All values are in `packages/core/src/types.ts` (`DEFAULT_RULE_CONFIG`) and `rules.ts`. | Report credibility | 2026-11-06 |
| 8 | **Deployment**: choose a host, create the account, point a domain or use a free address, and set production secrets. | Needs accounts, possibly payment details, and a decision on where data lives. | One teammate with the host account; secrets are shared privately, never in git. Follow the checklist in `docs/SECURITY.md` (new secrets, **no demo users**, https, `TRUST_PROXY`, backups of the database and keys). | P7-1 | 2026-11-06 |
| 9 | **Demo plan**: who presents, what the script is, which scenarios (PLAN §6) to show live, and a phone for the live demo. | A human decision and rehearsal. | The whole team, once Phase 6 is green. | P7-2, P7-4 | 2026-11-06 |
| 10 | **Add teammates to the GitHub repository** (Settings → Collaborators). | Only the repo owner can. | Repo owner. | Team workflow | 2026-11-06 |
| 11 | **Privacy wording** for the app (what is collected, why). | The text in Settings → Privacy is a plain-language draft; Uganda's Data Protection and Privacy Act, 2019 may require specific wording and consent. | The team, ideally checked by someone who knows the Act. | Before any public use | 2026-11-08 |
| 12 | **Report writing**: map the final report to the original proposal and write the sections only the team can (course context, evaluation, reflections). | Course submission content. An agent can draft the technical parts. | The team. | P7-3 | 2026-11-06 |
| 13 | **Credit Samuel Ethan Higenyi as a co-author** on commits (requested 2026-11-08). | A co-author line needs his email (the one on his GitHub account); I will not guess it. Also: which commits? New ones only, or the existing history too? Rewriting existing commits needs the same force-push as #6. | Ethan's GitHub email (or his `...@users.noreply.github.com` address) and a yes/no on rewriting history. Humans are welcome as co-authors; the rule is only that AI tools are not credited. | Commits | 2026-11-08 |
| 14 | **Re-run the load check on a healthy machine and on the deployment host** (`pnpm load`). | This laptop has ~400 MB free memory; results swing from 26 ms to 970 ms for the same load. The server itself is fast (2.5 ms per check), the machine is the noise. | Anyone with a machine that is not short of memory; later, the host chosen in #8. | P6-3 sign-off | 2026-11-08 |
| 15 | **Decide on an audit log and on revoking a stolen public key.** | Recalls, key rotations and user creation leave no durable record, and a stolen signing key cannot be revoked (only rotated away from). Both are design choices about how much accountability the system owes manufacturers and UNBS. | The team, ideally with a manufacturer's or UNBS view. See `docs/SECURITY.md` limits 5 and "How a signing key is rotated". | Real use | 2026-11-08 |
| 16 | **Who may see scan locations, and for how long are scans kept?** | Staff can see where each code was checked. A retention and access policy is a legal and ethical decision, not a technical one. | The team; check the Data Protection and Privacy Act, 2019. Feeds #11. | Real use | 2026-11-08 |

## Done

| # | What | When | Answer |
|---|---|---|---|
| – | Original prototype was a flow mockup, not the look | 2026-11-06 | Moved to `docs/mockups/`; both apps follow `docs/DESIGN.md`. |
