import type { Km } from "@whereabouts/shared/units"
export function formatDistance(km: Km): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`
}
