/** The service code the simulator pretends to be. A real aggregator assigns its own (the sandbox has a test code). */
export const SERVICE_CODE = "284"

/**
 * Reads what a person would dial and returns the inputs after the service code.
 *   "*284#"                 → []        (open the menu)
 *   "*284*123456789012#"    → ["123456789012"]  (jump straight to a code)
 * Returns null if it is not a dial string for our service code.
 */
export function parseDial(dial: string): string[] | null {
  const m = dial.trim().match(/^\*(\d{2,6})((?:\*[^*#]*)*)#$/)
  if (!m || m[1] !== SERVICE_CODE) return null
  const rest = m[2] ?? ""
  return rest === "" ? [] : rest.slice(1).split("*")
}
