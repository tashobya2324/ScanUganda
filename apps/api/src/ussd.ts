import { isValidLookupCode, normalizeLookupCode, type Region } from "@scanuganda/core"
import { composeVerdict, MAX_SCREEN, toGsm } from "./channel-text.ts"
import type { ScanOutcome } from "./verification.ts"

/**
 * USSD menu. The aggregator calls us on every key press with the *whole* chain
 * of inputs so far ("1*123456789012*3"), so the state is rebuilt from that
 * chain each time: no session is stored on the server, and a dropped or
 * replayed request cannot leave it out of step.
 *
 * Replies start with CON (keep the session open) or END (close it) and stay
 * within one 160-character screen.
 */

export interface UssdDeps {
  regions: Region[]
  /** Runs the check. `region` is the district the user picked, if any. */
  check: (code: string, region: Region | undefined) => Promise<ScanOutcome>
  /** Files a report. */
  report: (description: string) => Promise<void>
  /** Called before any action that writes data; false means "too many attempts". */
  allow: () => boolean
}

export interface UssdReply {
  type: "CON" | "END"
  message: string
  /** What goes on the wire: "CON ..." or "END ...". */
  wire: string
}

const PAGE = 5
const NAME_MAX = 14
const MIN_REPORT = 10

type State =
  | { s: "main"; note?: string }
  | { s: "code"; note?: string }
  | { s: "region"; code: string; page: number; note?: string }
  | { s: "report"; note?: string }

const reply = (type: "CON" | "END", message: string): UssdReply => {
  const text = toGsm(message)
  if (text.length > MAX_SCREEN) throw new Error(`USSD screen too long (${text.length}): ${text}`)
  return { type, message: text, wire: `${type} ${text}` }
}

const pages = (r: Region[]) => Math.max(1, Math.ceil(r.length / PAGE))

function render(state: State, regions: Region[]): UssdReply {
  const note = state.note ? `${state.note}\n` : ""
  switch (state.s) {
    case "main":
      return reply("CON", `${note}ScanUganda\n1. Check a product\n2. Report a product`)
    case "code":
      return reply("CON", `${note}Enter the 12-digit code under the scratch layer.\n0. Back`)
    case "report":
      return reply("CON", `${note}Describe the problem in a few words.\n0. Back`)
    case "region": {
      const slice = regions.slice(state.page * PAGE, state.page * PAGE + PAGE)
      const list = slice.map((r, i) => `${i + 1}. ${r.name.slice(0, NAME_MAX)}`).join("\n")
      const more = pages(regions) > 1 ? "\n6. More" : ""
      return reply("CON", `${note}Where are you?\n${list}${more}\n0. Not sure`)
    }
  }
}

type Step = State | UssdReply

const isReply = (x: Step): x is UssdReply => "wire" in x

async function step(state: State, input: string, deps: UssdDeps): Promise<Step> {
  const key = input.trim()
  switch (state.s) {
    case "main":
      if (key === "1") return { s: "code" }
      if (key === "2") return { s: "report" }
      return { s: "main", note: "Choose 1 or 2." }

    case "code": {
      if (key === "0") return { s: "main" }
      const code = normalizeLookupCode(key).replace(/\D/g, "")
      if (!isValidLookupCode(code)) return { s: "code", note: "That code does not look right. Check each digit and try again." }
      return { s: "region", code, page: 0 }
    }

    case "region": {
      const total = pages(deps.regions)
      if (key === "6" && total > 1) return { ...state, page: (state.page + 1) % total, note: undefined }
      let region: Region | undefined
      if (key !== "0") {
        const n = Number(key)
        region = Number.isInteger(n) && n >= 1 && n <= PAGE ? deps.regions[state.page * PAGE + n - 1] : undefined
        if (!region) return { ...state, note: "Choose a number." }
      }
      if (!deps.allow()) return reply("END", "Too many checks from this number. Please try again later.")
      return reply("END", composeVerdict(await deps.check(state.code, region)))
    }

    case "report": {
      if (key === "0") return { s: "main" }
      // The first entry of 10+ characters ends the session, so each entry is judged on its own.
      const description = key
      if (description.length < MIN_REPORT) return { s: "report", note: "Please write at least 10 characters." }
      if (!deps.allow()) return reply("END", "Too many reports from this number. Please try again later.")
      await deps.report(description.slice(0, 500))
      return reply("END", "Thank you. We have your report.")
    }
  }
}

/** Turns the chain of inputs the aggregator sent into this screen's reply. */
export async function runUssd(text: string, deps: UssdDeps): Promise<UssdReply> {
  const inputs = text === "" ? [] : text.split("*")
  // Dialling *284*123456789012# jumps straight to the code step.
  const direct = inputs.length > 0 && /^\d{12}$/.test(normalizeLookupCode(inputs[0]!))
  let state: State = direct ? { s: "code" } : { s: "main" }

  for (let i = 0; i < inputs.length; i++) {
    const next = await step(state, inputs[i]!, deps)
    if (isReply(next)) return next
    state = next
  }
  return render(state, deps.regions)
}
