import { useSyncExternalStore } from "react"

export interface Prefs {
  lang: "en" | "lg"
  /** Share location with scans. The browser asks separately; this is our own switch. */
  shareLocation: boolean
  /** Shopkeepers are judged as "retailer"; everyone else as "consumer". */
  role: "consumer" | "retailer"
}

const KEY = "scanuganda.prefs"
const DEFAULTS: Prefs = { lang: "en", shareLocation: true, role: "consumer" }

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>) }
  } catch {
    return DEFAULTS
  }
}

let current = read()
const listeners = new Set<() => void>()

export const getPrefs = () => current
export function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch }
  localStorage.setItem(KEY, JSON.stringify(current))
  listeners.forEach((l) => l())
}
export const usePrefs = (): Prefs =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    getPrefs,
  )
