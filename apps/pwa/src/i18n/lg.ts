import type { StringKey } from "./en"

/**
 * Luganda overrides. Any key missing here falls back to English.
 *
 * Deliberately empty: verdict wording ("Genuine", "Check", "Stop") is safety
 * critical, so it must be written and reviewed by a fluent Luganda speaker, not
 * guessed. Add entries here after review (tracked as P4-11 on the task board).
 */
export const lg: Partial<Record<StringKey, string>> = {}
