import { isValidLookupCode, normalizeLookupCode, type Region } from "@scanuganda/core"
import { composeVerdict, toGsm } from "./channel-text.ts"
import type { ScanOutcome } from "./verification.ts"

/**
 * SMS check: the shopper texts the 12-digit code (optionally with a town) and
 * gets one reply. Examples: "1234 5678 9012", "CHECK 123456789012 Jinja".
 */

export interface SmsDeps {
  regions: Region[]
  check: (code: string, region: Region | undefined) => ScanOutcome
  allow: () => boolean
}

const HELP = "Send the 12-digit code under the scratch layer, e.g. 1234 5678 9012. Add your town for a better check, e.g. 1234 5678 9012 Jinja."

/** Pulls the code and an optional town out of free text. */
export function parseSms(text: string, regions: Region[]): { code: string | null; region: Region | undefined } {
  const match = text.match(/\d(?:[\s-]?\d){11}/)
  const code = match ? normalizeLookupCode(match[0]) : null
  const rest = (match ? text.replace(match[0], " ") : text).toLowerCase()
  const region = regions.find((r) => new RegExp(`\\b${r.name.toLowerCase().replace(/[^a-z ]/g, "")}\\b`).test(rest))
  return { code, region }
}

export function smsReply(text: string, deps: SmsDeps): string {
  const { code, region } = parseSms(text, deps.regions)
  if (!code) return toGsm(HELP)
  if (!isValidLookupCode(code)) return toGsm("That code does not look right. Check each digit and send it again.")
  if (!deps.allow()) return toGsm("Too many checks from this number. Please try again later.")
  return composeVerdict(deps.check(code, region))
}

/* ---------- sending the reply ---------- */

export interface SmsSender {
  send(to: string, message: string): Promise<void>
}

/** Used when no provider is configured (development, tests): the reply is returned by the route instead. */
export class NoSmsSender implements SmsSender {
  async send(): Promise<void> {}
}

export interface AfricasTalkingConfig {
  username: string
  apiKey: string
  sandbox: boolean
  from?: string
}

/**
 * Sends through Africa's Talking's messaging API.
 * NOT VERIFIED against the live service: written from their public documentation and
 * untested without an account. Confirm the endpoint and fields in the sandbox (P5-4).
 */
export class AfricasTalkingSms implements SmsSender {
  constructor(
    private cfg: AfricasTalkingConfig,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, message: string): Promise<void> {
    const host = this.cfg.sandbox ? "api.sandbox.africastalking.com" : "api.africastalking.com"
    const body = new URLSearchParams({ username: this.cfg.username, to, message })
    if (this.cfg.from) body.set("from", this.cfg.from)
    const res = await this.fetchImpl(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: { apiKey: this.cfg.apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    if (!res.ok) throw new Error(`SMS provider answered ${res.status}`)
  }
}
