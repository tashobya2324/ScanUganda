import type { ScanOutcome } from "./verification.ts"

/** One USSD screen or one SMS. */
export const MAX_SCREEN = 160

/**
 * Basic phones show a limited alphabet (GSM 7-bit). Anything else is replaced
 * so a name with an accent or a curly quote never turns into garbage.
 */
export function toGsm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[[{]/g, "(")
    .replace(/[\]}]/g, ")")
    .replace(/[\\^~|`]/g, " ") // in the extension table: cost two characters each
    .replace(/[^\x20-\x7E\n]/gu, "?") // "u": one symbol, even an emoji, becomes one "?"
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 3)).trimEnd() + "..."
}

const stripDot = (s: string) => s.trim().replace(/\.+$/, "")

const ADVICE = { GENUINE: "Safe to buy.", CHECK: "Wait before you buy.", STOP: "Do not buy or use." } as const

/**
 * The answer as plain text for a basic phone: verdict word first, then what to
 * do, then why, then which product, dropping detail until it fits one screen.
 */
export function composeVerdict(o: Pick<ScanOutcome, "verdict" | "reasons" | "product">, max = MAX_SCREEN): string {
  const advice = ADVICE[o.verdict]
  const p = o.product
  const full = p ? `${p.productName} ${p.packSize}, batch ${p.batchCode}` : ""
  const name = p ? p.productName : ""
  const word = o.verdict

  let candidates: string[]
  if (o.verdict === "GENUINE") {
    candidates = [full && `${word}. ${full}. ${advice}`, name && `${word}. ${name}. ${advice}`, `${word}. ${advice}`]
  } else {
    const reason = o.reasons[0] ? stripDot(o.reasons[0].message) : ""
    candidates = [
      reason && full && `${word}. ${advice} ${reason}. ${full}.`,
      reason && name && `${word}. ${advice} ${reason}. ${name}.`,
      reason && `${word}. ${advice} ${reason}.`,
      `${word}. ${advice}`,
    ]
  }
  const fits = candidates.map(toGsm).find((c) => c && c.length <= max)
  if (fits) return fits
  // Even the shortest form with its reason is too long: cut the reason, keep the verdict and advice.
  const head = `${word}. ${advice} `
  return toGsm(head + truncate(o.reasons[0] ? stripDot(o.reasons[0].message) : "", max - head.length))
}
