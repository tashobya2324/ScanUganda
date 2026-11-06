import { useCallback } from "react"
import { usePrefs } from "../lib/prefs"
import { en, type StringKey } from "./en"
import { lg } from "./lg"

export type { StringKey }

const TABLES: Record<"en" | "lg", Partial<Record<StringKey, string>>> = { en, lg }

/** Looks a key up in the chosen language, falls back to English, fills `{name}` slots. */
export function translate(lang: "en" | "lg", key: StringKey, vars?: Record<string, string | number>): string {
  const raw = TABLES[lang][key] ?? en[key]
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : raw
}

export type T = (key: StringKey, vars?: Record<string, string | number>) => string

export function useT(): { t: T; lang: "en" | "lg" } {
  const { lang } = usePrefs()
  const t = useCallback<T>((key, vars) => translate(lang, key, vars), [lang])
  return { t, lang }
}

/** "just now", "5 min ago", "2 h ago", "3 d ago", then a date. */
export function timeAgo(t: T, ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 45) return t("common.justNow")
  if (s < 3600) return t("common.minAgo", { n: Math.max(1, Math.round(s / 60)) })
  if (s < 86_400) return t("common.hAgo", { n: Math.round(s / 3600) })
  if (s < 7 * 86_400) return t("common.dAgo", { n: Math.round(s / 86_400) })
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export const formatDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
