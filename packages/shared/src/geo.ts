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
  return [EARTH_RADIUS_KM * c * Math.cos(lo), EARTH_RADIUS_KM * c * Math.sin(lo), EARTH_RADIUS_KM * Math.sin(la)];
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

/** The point on the sphere in the direction of `v` (any length). */
export function fromXyz(v: Xyz): LatLon {
  const r = Math.hypot(v[0], v[1], v[2]);
  return { lat: (Math.asin(v[2] / r) * 180) / Math.PI, lon: (Math.atan2(v[1], v[0]) * 180) / Math.PI };
}

/** Initial bearing from `a` to `b`, degrees clockwise from north. */
export function bearing(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180;
  const dLon = (b.lon - a.lon) * r;
  const y = Math.sin(dLon) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
