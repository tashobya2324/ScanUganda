import type { GeoPoint, Position } from "./types.ts"

const EARTH_RADIUS_KM = 6371.0088

const rad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in km (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Distance between two positions with both accuracy radii removed, so two
 * fuzzy fixes of the same place count as zero apart. Never negative.
 */
export function effectiveDistanceKm(a: Position, b: Position): number {
  const slack = ((a.accuracyM ?? 0) + (b.accuracyM ?? 0)) / 1000
  return Math.max(0, distanceKm(a, b) - slack)
}
