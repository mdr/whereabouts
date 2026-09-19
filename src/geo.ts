/** Earth radius in kilometres (mean sphere). */
export const EARTH_RADIUS_KM = 6371.0;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Unit-free 3D position on the Earth sphere, in kilometres. */
export type Xyz = readonly [number, number, number];

export function toXyz({ lat, lon }: LatLon): Xyz {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const c = Math.cos(la);
  return [
    EARTH_RADIUS_KM * c * Math.cos(lo),
    EARTH_RADIUS_KM * c * Math.sin(lo),
    EARTH_RADIUS_KM * Math.sin(la),
  ];
}

/** Straight-line (chord) distance between two points on the sphere, km. */
export function chordDistance(a: Xyz, b: Xyz): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function chordDistanceSq(a: Xyz, b: Xyz): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Great-circle distance, km. Used only for display. */
export function greatCircleDistance(a: LatLon, b: LatLon): number {
  const d = chordDistance(toXyz(a), toXyz(b));
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, d / (2 * EARTH_RADIUS_KM)));
}
