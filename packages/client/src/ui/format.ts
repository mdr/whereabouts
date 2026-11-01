import type { Km, Points } from "@whereabouts/shared/units"
export function formatDistance(km: Km): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`
}

export function formatPoints(points: Points): string {
  return `${Math.round(points).toLocaleString()} pts`
}
