import { useSyncExternalStore } from "react"

/** A counter that changes whenever stored scans, the queue or the offline list change. */
let version = 0
const listeners = new Set<() => void>()

export function notifyChange() {
  version++
  listeners.forEach((l) => l())
}

export const useDataVersion = (): number =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    () => version,
  )
