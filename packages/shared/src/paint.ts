/**
 * Sparse paint layer on H3 hexagons.
 *
 * Cells are near-equal-area, so intensity is a density and converts to
 * probability mass with only a per-cell area factor. The resolution is chosen
 * per question so a cell edge is at most a quarter of the tolerance.
 */
import {
  cellArea,
  cellToBoundary,
  cellToLatLng,
  getHexagonEdgeLengthAvg,
  getResolution,
  gridDisk,
  gridDiskDistances,
  latLngToCell,
  UNITS,
} from "h3-js";
import type { LatLon } from "./geo.ts";

/** Largest brush radius in hex rings. Caps cells touched per stamp (~5,000). */
export const MAX_BRUSH_RINGS = 40;

export function resolutionForTolerance(toleranceKm: number): number {
  const target = toleranceKm / 4;
  for (let res = 0; res <= 10; res++) {
    if (getHexagonEdgeLengthAvg(res, UNITS.km) <= target) return Math.max(1, res);
  }
  return 10;
}

/** Centre-to-centre distance between neighbouring cells, km. */
export function cellSpacingKm(res: number): number {
  return getHexagonEdgeLengthAvg(res, UNITS.km) * Math.sqrt(3);
}

export interface PaintCell {
  lat: number;
  lon: number;
  intensity: number;
  areaKm2: number;
}

export interface Blob {
  /** Fraction of painted mass (excludes the floor). */
  fraction: number;
  cells: number;
  centroid: LatLon;
}

export interface StampResult {
  /** Rings actually used after clamping. */
  rings: number;
  clamped: boolean;
}

const EPS = 1e-4;

export class PaintLayer {
  readonly res: number;
  readonly cells = new Map<string, number>();
  private boundaryCache = new Map<string, number[][]>();
  private areaCache = new Map<string, number>();
  private centreCache = new Map<string, [number, number]>();
  /** Incremented on every change; cheap dirty-check for renderers. */
  version = 0;

  constructor(res: number) {
    this.res = res;
  }

  ringsForRadius(radiusKm: number): { rings: number; clamped: boolean } {
    const raw = Math.round(radiusKm / cellSpacingKm(this.res));
    return { rings: Math.min(MAX_BRUSH_RINGS, raw), clamped: raw > MAX_BRUSH_RINGS };
  }

  /**
   * Apply a soft (Gaussian) brush centred on `at`. `strength` is the intensity
   * added at the centre; the edge ring receives about a tenth of that.
   * Negative strength erases.
   */
  stamp(at: LatLon, radiusKm: number, strength: number): StampResult {
    const { rings, clamped } = this.ringsForRadius(radiusKm);
    const centre = latLngToCell(at.lat, at.lon, this.res);
    const byDistance = gridDiskDistances(centre, rings);
    const denom = (rings + 0.5) * (rings + 0.5);
    byDistance.forEach((ring, d) => {
      const w = strength * Math.exp((-Math.LN10 * d * d) / denom);
      for (const h of ring) this.add(h, w);
    });
    this.version++;
    return { rings, clamped };
  }

  private add(h: string, w: number): void {
    const cur = this.cells.get(h) ?? 0;
    const next = cur + w;
    if (next <= EPS) this.cells.delete(h);
    else this.cells.set(h, next);
  }

  clear(): void {
    this.cells.clear();
    this.version++;
  }

  get isEmpty(): boolean {
    return this.cells.size === 0;
  }

  maxIntensity(): number {
    let m = 0;
    for (const v of this.cells.values()) if (v > m) m = v;
    return m;
  }

  area(h: string): number {
    let a = this.areaCache.get(h);
    if (a === undefined) {
      a = cellArea(h, UNITS.km2);
      this.areaCache.set(h, a);
    }
    return a;
  }

  centre(h: string): [number, number] {
    let c = this.centreCache.get(h);
    if (c === undefined) {
      const [lat, lon] = cellToLatLng(h);
      c = [lat, lon];
      this.centreCache.set(h, c);
    }
    return c;
  }

  /** Sparse wire form: H3 index -> intensity. */
  toRecord(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [h, v] of this.cells) out[h] = v;
    return out;
  }

  /** Rebuild a layer from its wire form. Cells of another resolution are dropped. */
  static fromRecord(res: number, cells: Record<string, number>): PaintLayer {
    const layer = new PaintLayer(res);
    for (const [h, v] of Object.entries(cells)) {
      if (v > 0 && getResolution(h) === res) layer.cells.set(h, v);
    }
    layer.version++;
    return layer;
  }

  *toCells(): IterableIterator<PaintCell> {
    for (const [h, intensity] of this.cells) {
      const [lat, lon] = this.centre(h);
      yield { lat, lon, intensity, areaKm2: this.area(h) };
    }
  }

  /** GeoJSON polygons with `v` in [0,1] = intensity relative to the max. */
  toGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.Polygon, { v: number }> {
    const max = this.maxIntensity() || 1;
    const features: GeoJSON.Feature<GeoJSON.Polygon, { v: number }>[] = [];
    for (const [h, intensity] of this.cells) {
      features.push({
        type: "Feature",
        properties: { v: intensity / max },
        geometry: { type: "Polygon", coordinates: [this.boundary(h)] },
      });
    }
    return { type: "FeatureCollection", features };
  }

  private boundary(h: string): number[][] {
    let b = this.boundaryCache.get(h);
    if (b === undefined) {
      b = cellToBoundary(h, true);
      // Cells straddling the antimeridian come back with longitudes on both
      // sides; unwrap so the polygon does not span the whole world.
      let minLon = Infinity;
      let maxLon = -Infinity;
      for (const [lon] of b as [number, number][]) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
      if (maxLon - minLon > 180) {
        b = (b as [number, number][]).map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]);
      }
      this.boundaryCache.set(h, b);
    }
    return b;
  }

  /** Connected components of painted cells, largest mass first. */
  blobs(): Blob[] {
    const seen = new Set<string>();
    const out: Blob[] = [];
    let totalMass = 0;
    for (const [h, v] of this.cells) totalMass += v * this.area(h);
    if (totalMass === 0) return out;

    for (const start of this.cells.keys()) {
      if (seen.has(start)) continue;
      seen.add(start);
      const stack = [start];
      let mass = 0;
      let count = 0;
      let sx = 0,
        sy = 0,
        sz = 0;
      while (stack.length) {
        const h = stack.pop()!;
        const m = this.cells.get(h)! * this.area(h);
        mass += m;
        count++;
        const [lat, lon] = this.centre(h);
        const la = (lat * Math.PI) / 180,
          lo = (lon * Math.PI) / 180;
        sx += m * Math.cos(la) * Math.cos(lo);
        sy += m * Math.cos(la) * Math.sin(lo);
        sz += m * Math.sin(la);
        for (const nb of gridDisk(h, 1)) {
          if (!seen.has(nb) && this.cells.has(nb)) {
            seen.add(nb);
            stack.push(nb);
          }
        }
      }
      const centroid = {
        lat: (Math.atan2(sz, Math.hypot(sx, sy)) * 180) / Math.PI,
        lon: (Math.atan2(sy, sx) * 180) / Math.PI,
      };
      out.push({ fraction: mass / totalMass, cells: count, centroid });
    }
    out.sort((a, b) => b.fraction - a.fraction);
    return out;
  }
}
