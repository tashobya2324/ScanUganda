# USSD and SMS: from simulator to a live short code

What is built, what a team member must do to run it through an aggregator's sandbox (P5-4), and what going live on MTN and Airtel Uganda involves (P5-6, for the report).

> **Verification status.** The menu, the `CON`/`END` format, the form-encoded callback and the chain-of-inputs behaviour follow how Africa's Talking documents USSD and are tested here against our own simulator. **Nothing in this file has been checked against a live aggregator account.** Items marked *confirm* are things we do not know and must read on the aggregator's site or ask them. Costs, timelines and approval rules are deliberately not stated: we do not have reliable figures.

## 1. What exists in the code

| Piece | Where | Notes |
|---|---|---|
| USSD menu (check, report) | `apps/api/src/ussd.ts` | Rebuilt from the chain of inputs on every request; no session stored. Every screen ≤ 160 characters, basic-phone alphabet only. |
| USSD callback | `POST /v1/ussd` | Form fields `sessionId, serviceCode, phoneNumber, networkCode, text`; replies `text/plain` starting `CON ` or `END `. |
| SMS check | `POST /v1/sms` | Form fields `from, to, text, id`; replies by SMS through the provider, and also returns the reply as JSON. |
| Simulator | Console → *USSD simulator* | Same menu, same protocol, staff sign-in. Works with no account. |
| Shared secret | `CHANNEL_SECRET` | If set, callbacks must send it as header `x-channel-key` or `?key=`. **Set it in any deployment.** |
| Rate limit | in `routes-channels.ts` | 15 checks per phone number per 10 minutes, shared by USSD and SMS. In memory: per server process. |
| Languages | `ussd.ts` | English only. Luganda is not offered until a fluent speaker has written and reviewed the wording (same rule as the mobile app). |

Dialling: the simulator uses `*284#` and `*284*123456789012#` (from the team's flow mockup). A real service code is assigned by the aggregator and the networks; the sandbox gives its own test code. The code in our dial strings is only a label.

## 2. Run it through an aggregator sandbox (P5-4)

For a team member with an aggregator account (Africa's Talking is the usual choice; *confirm* its current sandbox rules).

1. Create an account and open the **sandbox** app.
2. Make the API reachable on public **HTTPS**. For a laptop demo use a tunnel, e.g. `cloudflared tunnel --url http://localhost:3000`, which prints an `https://….trycloudflare.com` address.
3. Put a secret in `apps/api/.env`: `CHANNEL_SECRET=` followed by 16+ random characters. Restart the API.
4. In the sandbox, create a **USSD channel** (the sandbox provides a test service code) and set its callback URL to
   `https://<your-tunnel>/v1/ussd?key=<CHANNEL_SECRET>`
5. Open the sandbox's **phone simulator**, dial the service code, and walk through: menu → check → a 12-digit code from `apps/api/data/demo-codes.json` → district → verdict. Then try a recalled code, a mistyped code, *Back*, and a report.
6. Expect the same text the console simulator shows. If the simulator says the service is unavailable, check: callback URL reachable over HTTPS, key correct, API running.
7. Optional, SMS: create an SMS channel with an incoming-message callback to `https://<your-tunnel>/v1/sms?key=<CHANNEL_SECRET>`, and set `AT_USERNAME`, `AT_API_KEY` (sandbox keys) in `.env` so replies are sent. `AT_SANDBOX=false` selects the live host. **The sending code (`AfricasTalkingSms`) has never run against the real service**: its URL and field names come from public documentation, so *confirm* them in step 7 and fix the class if they differ.
8. Record what you saw (screenshots of the simulator, the callback logs) for the report, and tell the team any wording or behaviour that differs from this file.

Record on the task board: who ran it, when, and the result.

## 3. Going live (level L3: for the report, not before the deadline)

A live short code on the Ugandan networks involves parties and decisions outside the code. *Confirm every item with the aggregator.*

| Area | What to find out or do |
|---|---|
| Service code | Whether a dedicated code (e.g. `*xxx#`) or a shared/menu code is used; how it is applied for; who the applicant must be (a registered company is likely). |
| Network approval | Approval path and requirements for each network (MTN Uganda, Airtel Uganda, others); the regulator's role (Uganda Communications Commission) and any content or consumer-protection rules. |
| Cost model | Who pays for sessions (user or us), setup and monthly fees, SMS prices. We have no reliable figures. |
| Hosting | Always-on HTTPS server with low latency (USSD sessions time out in seconds; *confirm* each network's limit); backups; monitoring. |
| Security | `CHANNEL_SECRET` set; consider also restricting callbacks to the aggregator's IP range if they publish one; move rate limiting to a shared store if running more than one server. |
| Privacy | Phone numbers are used only for rate limiting (hashed in memory) and are never stored with scans. Confirm this meets the Data Protection and Privacy Act, 2019 obligations before launch (consent, retention, registration). |
| Wording | Luganda and other local languages reviewed by fluent speakers; verdict wording tested with real users. |
| Support | Who answers when a shopper is told STOP about a product they already bought. |
| Fallbacks | What happens when the API is down (the menu already answers "something went wrong, try again"). |

**Honest position for the demo:** USSD is demonstrated through our simulator and, if a team member completes section 2, through the aggregator's sandbox phone simulator. It has not been tested from a physical phone over a mobile network.
