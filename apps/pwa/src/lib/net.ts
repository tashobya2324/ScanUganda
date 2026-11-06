import { useEffect, useState } from "react"
import { db, type CacheSnapshot } from "./db"
import { useDataVersion } from "./bus"

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine !== false)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])
  return online
}

/** Offline-list state and the number of scans waiting to upload, kept fresh. */
export function useSyncState(): { cache: CacheSnapshot | undefined; queued: number; ready: boolean } {
  const version = useDataVersion()
  const [state, setState] = useState<{ cache: CacheSnapshot | undefined; queued: number; ready: boolean }>({ cache: undefined, queued: 0, ready: false })
  useEffect(() => {
    let live = true
    void Promise.all([db.getCache(), db.queueCount()]).then(([cache, queued]) => live && setState({ cache, queued, ready: true }))
    return () => {
      live = false
    }
  }, [version])
  return state
}

/** `beforeinstallprompt` handling for the "Install app" button. */
export interface InstallPrompt {
  prompt: () => Promise<void>
}
let deferred: (Event & { prompt: () => Promise<void> }) | undefined
const installListeners = new Set<() => void>()
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferred = e as typeof deferred
    installListeners.forEach((l) => l())
  })
  window.addEventListener("appinstalled", () => {
    deferred = undefined
    installListeners.forEach((l) => l())
  })
}
export function useInstall(): InstallPrompt | undefined {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    installListeners.add(l)
    return () => void installListeners.delete(l)
  }, [])
  return deferred && { prompt: async () => { await deferred!.prompt(); deferred = undefined; force((n) => n + 1) } }
}
