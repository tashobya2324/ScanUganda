import type { Position } from "./api"
import { getPrefs } from "./prefs"

export type LocationState = "granted" | "denied" | "prompt" | "unsupported"

export async function locationPermission(): Promise<LocationState> {
  if (!("geolocation" in navigator)) return "unsupported"
  try {
    const s = await navigator.permissions?.query({ name: "geolocation" })
    return (s?.state as LocationState | undefined) ?? "prompt"
  } catch {
    return "prompt"
  }
}

/**
 * One position fix, or undefined. Never blocks a verdict for long: if the phone
 * has no fix within `timeoutMs`, the scan goes ahead without a location (the
 * server then skips only the sale-area check).
 */
export function getPosition(timeoutMs = 4000): Promise<Position | undefined> {
  if (!getPrefs().shareLocation || !("geolocation" in navigator)) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const done = (p?: Position) => resolve(p)
    const timer = setTimeout(() => done(undefined), timeoutMs + 500)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer)
        done({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) })
      },
      () => {
        clearTimeout(timer)
        done(undefined)
      },
      // A cached fix up to 2 minutes old is fine for a sale-area check and is instant.
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 120_000 },
    )
  })
}
