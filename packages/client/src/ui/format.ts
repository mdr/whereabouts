import type { Km, Points } from "@whereabouts/shared/units"
export const formatDistance = (km: Km): string =>
  km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`

export const formatPoints = (points: Points): string => `${Math.round(points).toLocaleString()} pts`
