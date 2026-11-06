import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "./api"

export interface Loaded<T> {
  data: T | undefined
  error: ApiError | undefined
  /** True only until the first answer arrives. */
  loading: boolean
  reload: () => void
}

/**
 * Loads data and, if `everyMs` is given, refreshes it quietly. The previous
 * data stays on screen while a refresh runs, so tables do not flicker.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], everyMs?: number, paused = false): Loaded<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<ApiError>()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let live = true
    setError(undefined)
    fnRef.current().then(
      (d) => live && (setData(d), setLoading(false)),
      (e: unknown) => live && (setError(e instanceof ApiError ? e : new ApiError(0, "ERROR", String(e))), setLoading(false)),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  useEffect(() => {
    if (!everyMs || paused) return
    const id = setInterval(() => setTick((t) => t + 1), everyMs)
    return () => clearInterval(id)
  }, [everyMs, paused])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

/** Re-renders every `ms` so relative times ("5 min ago") stay current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
