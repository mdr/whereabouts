/**
 * Sparse paint layer on H3 hexagons, at mixed resolutions.
 *
 * Cells are near-equal-area within a resolution, so intensity is a density and
 * converts to probability mass with only a per-cell area factor. A layer has a
 * finest resolution, chosen per question so a cell edge is at most a quarter
 * of the tolerance; each brush stroke then picks the coarsest resolution that
 * still fits a few cells across the brush. Painting a continent at world zoom
 * writes a few hundred large cells rather than tens of thousands of tiny ones,
 * and the cost of a stamp is roughly constant whatever the zoom.
 *
 * Densities at different resolutions simply add where they overlap. Erasing
 * splits any coarser cell that straddles the brush edge into its children
 * first, so only the part under the brush is removed.
 */
import {
  cellArea,
  cellToBoundary,
  cellToChildren,
  cellToLatLng,
  cellToParent,
  getHexagonEdgeLengthAvg,
  getResolution,
  cellsToMultiPolygon,
  gridDisk,
  gridDiskDistances,
  gridDistance,
  latLngToCell,
  UNITS,
} from "h3-js";
import { chordDistanceSq, toXyz, type LatLon } from "./geo.ts";

/** Cells across the brush radius a stamp aims for; sets the stamp resolution. */
const TARGET_RINGS = 5;
/** Safety cap on rings per stamp; unreachable in practice now that the resolution adapts. */
const MAX_RINGS = 40;

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
  /** H3 index, so scoring can refine a coarse cell where precision matters. */
  h3: string;
}

export interface Blob {
  /** Fraction of painted mass (excludes the floor). */
  fraction: number;
  cells: number;
  centroid: LatLon;
}

export interface StampResult {
  /** Resolution the stamp was written at. */
  res: number;
  rings: number;
  /** Cells touched. */
  cells: number;
}

const EPS = 1e-4;

/** Grid distance, or null where H3 cannot compute one (across pentagons or far apart). */
function safeGridDistance(a: string, b: string): number | null {
  try {
    const d = gridDistance(a, b);
    return Number.isFinite(d) && d >= 0 ? d : null;
  } catch {
    return null;
  }
}
/** Circumradius of a hexagon from its area, with a margin for H3's distortion. */
const CIRCUMRADIUS_FACTOR = 1.1 * Math.sqrt(2 / (3 * Math.sqrt(3)));

export class PaintLayer {
  /** Finest resolution this layer may use, from the question's tolerance. */
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

  /**
   * The coarsest resolution (not finer than the layer's) that still puts
   * about TARGET_RINGS cells across the brush radius.
   */
  stampResolution(radiusKm: number): number {
    for (let r = 0; r < this.res; r++) {
      if (cellSpacingKm(r) <= radiusKm / TARGET_RINGS) return r;
    }
    return this.res;
  }

  /**
   * How a stamp of this radius would be laid out. At the layer's finest
   * resolution a brush smaller than half a cell is a single cell (zero rings),
   * so zoomed right in the smallest brush paints exactly one hex.
   */
  stampPlan(radiusKm: number): { res: number; rings: number } {
    const res = this.stampResolution(radiusKm);
    const rings = Math.min(MAX_RINGS, Math.max(0, Math.round(radiusKm / cellSpacingKm(res))));
    return { res, rings };
  }

  /** The cells a stamp of this radius at `at` would touch, for previewing its footprint. */
  stampCells(at: LatLon, radiusKm: number): string[] {
    const { res, rings } = this.stampPlan(radiusKm);
    return gridDisk(latLngToCell(at.lat, at.lon, res), rings);
  }

  /**
   * Apply a soft (Gaussian) brush centred on `at`. `strength` is the intensity
   * added at the centre; the edge ring receives about a tenth of that.
   * Negative strength erases (see `erase`).
   */
  stamp(at: LatLon, radiusKm: number, strength: number): StampResult {
    if (strength < 0) return this.erase(at, radiusKm, -strength);
    const { res, rings } = this.stampPlan(radiusKm);
    const centre = latLngToCell(at.lat, at.lon, res);
    const byDistance = gridDiskDistances(centre, rings);
    const denom = (rings + 0.5) * (rings + 0.5);
    let count = 0;
    byDistance.forEach((ring, d) => {
      const w = strength * Math.exp((-Math.LN10 * d * d) / denom);
      for (const h of ring) {
        this.add(h, w);
        count++;
      }
    });
    this.version++;
    return { res, rings, cells: count };
  }

  /**
   * Remove paint under a soft brush. Works on whatever cells are stored:
   * cells at or finer than the brush's own resolution, or wholly inside the
   * brush, are reduced by the falloff at their centre; coarser cells that
   * straddle the brush edge are split into children first, one level at a
   * time, so paint outside the brush survives. Density is conserved by the
   * split, and only cells touching the brush are ever split.
   */
  erase(at: LatLon, radiusKm: number, strength: number): StampResult {
    const { res: eraseRes, rings } = this.stampPlan(radiusKm);
    const spacing = cellSpacingKm(eraseRes);
    const reach = (rings + 0.5) * spacing;
    const denom = (rings + 0.5) * (rings + 0.5);
    const centreCell = latLngToCell(at.lat, at.lon, eraseRes);
    const centre = toXyz(at);
    const queue = [...this.cells.keys()];
    let touched = 0;
    while (queue.length) {
      const h = queue.pop()!;
      const v = this.cells.get(h);
      if (v === undefined) continue;
      const [lat, lon] = this.centre(h);
      const d = Math.sqrt(chordDistanceSq(centre, toXyz({ lat, lon })));
      const rc = CIRCUMRADIUS_FACTOR * Math.sqrt(this.area(h));
      if (d - rc > reach) continue; // clear of the brush
      const hRes = getResolution(h);
      if (hRes === eraseRes) {
        // Same grid as the stamp: mirror its ring weights exactly, so an
        // erase over a stamp of the same size cancels it.
        const ring = safeGridDistance(centreCell, h);
        if (ring === null || ring > rings) continue;
        this.add(h, -strength * Math.exp((-Math.LN10 * ring * ring) / denom));
        touched++;
        continue;
      }
      if (hRes > eraseRes || d + rc <= reach) {
        const ring = d / spacing;
        this.add(h, -strength * Math.exp((-Math.LN10 * ring * ring) / denom));
        touched++;
        continue;
      }
      // Straddles the edge and is coarser than the brush: refine one level.
      this.cells.delete(h);
      for (const child of cellToChildren(h, hRes + 1)) {
        this.cells.set(child, v);
        queue.push(child);
      }
    }
    this.version++;
    return { res: eraseRes, rings, cells: touched };
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

  /** Replace every cell at once (undo/redo). */
  replaceCells(cells: Map<string, number>): void {
    this.cells.clear();
    for (const [h, v] of cells) this.cells.set(h, v);
    this.version++;
  }

  /** Number of painted cells. */
  get size(): number {
    return this.cells.size;
  }

  /** Cell counts per resolution present, coarsest first. */
  resolutionCounts(): [number, number][] {
    const counts = new Map<number, number>();
    for (const h of this.cells.keys()) {
      const r = getResolution(h);
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }

  maxIntensity(): number {
    let m = 0;
    for (const v of this.cells.values()) if (v > m) m = v;
    return m;
  }

  /** Total mass: sum of intensity x area, km². */
  mass(): number {
    let t = 0;
    for (const [h, v] of this.cells) t += v * this.area(h);
    return t;
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

  /**
   * Rebuild a layer from its wire form. Cells may be at `res` or coarser;
   * finer cells are dropped because they would undercut the tolerance-based
   * resolution the question was scored at.
   */
  static fromRecord(res: number, cells: Record<string, number>): PaintLayer {
    const layer = new PaintLayer(res);
    for (const [h, v] of Object.entries(cells)) {
      if (v > 0 && getResolution(h) <= res) layer.cells.set(h, v);
    }
    layer.version++;
    return layer;
  }

  *toCells(): IterableIterator<PaintCell> {
    for (const [h, intensity] of this.cells) {
      const [lat, lon] = this.centre(h);
      yield { lat, lon, intensity, areaKm2: this.area(h), h3: h };
    }
  }

  /**
   * GeoJSON polygons with `v` in [0,1] = intensity relative to the max.
   * Coarse cells come first so finer detail draws on top.
   */
  toGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.Polygon, { v: number }> {
    const max = this.maxIntensity() || 1;
    const byRes: GeoJSON.Feature<GeoJSON.Polygon, { v: number }>[][] = [];
    for (const [h, intensity] of this.cells) {
      const r = getResolution(h);
      (byRes[r] ??= []).push({
        type: "Feature",
        properties: { v: intensity / max },
        geometry: { type: "Polygon", coordinates: [this.boundary(h)] },
      });
    }
    return { type: "FeatureCollection", features: byRes.flat() };
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

  /**
   * Connected components of painted cells, largest mass first. Adjacency is
   * judged at the coarsest resolution present (every cell is mapped to its
   * ancestor there), which is exact when one resolution is in use and a fair
   * approximation otherwise. Diagnostic only.
   */
  blobs(): Blob[] {
    const out: Blob[] = [];
    if (this.cells.size === 0) return out;
    let coarsest = Infinity;
    for (const h of this.cells.keys()) coarsest = Math.min(coarsest, getResolution(h));

    // Group cells under their ancestor at the coarsest resolution.
    const groups = new Map<string, string[]>();
    for (const h of this.cells.keys()) {
      const key = getResolution(h) === coarsest ? h : cellToParent(h, coarsest);
      const list = groups.get(key);
      if (list) list.push(h);
      else groups.set(key, [h]);
    }

    let totalMass = 0;
    for (const [h, v] of this.cells) totalMass += v * this.area(h);

    const seen = new Set<string>();
    for (const start of groups.keys()) {
      if (seen.has(start)) continue;
      seen.add(start);
      const stack = [start];
      let mass = 0;
      let count = 0;
      let sx = 0,
        sy = 0,
        sz = 0;
      while (stack.length) {
        const key = stack.pop()!;
        for (const h of groups.get(key)!) {
          const m = this.cells.get(h)! * this.area(h);
          mass += m;
          count++;
          const [lat, lon] = this.centre(h);
          const la = (lat * Math.PI) / 180,
            lo = (lon * Math.PI) / 180;
          sx += m * Math.cos(la) * Math.cos(lo);
          sy += m * Math.cos(la) * Math.sin(lo);
          sz += m * Math.sin(la);
        }
        for (const nb of gridDisk(key, 1)) {
          if (!seen.has(nb) && groups.has(nb)) {
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

/** Cells a submission may carry after compaction; keeps frames well under the transport limit. */
export const PAINT_CELL_BUDGET = 6000;

/**
 * Coarsen a sparse paint record until it fits the cell budget, merging
 * children into their H3 parent while conserving mass (intensity x area).
 * Scoring treats cells as patches, so a coarser representation of the same
 * mass scores almost identically. Cells end up at mixed resolutions, all at
 * or coarser than the original.
 */
export function compactRecord(cells: Record<string, number>, budget = PAINT_CELL_BUDGET): Record<string, number> {
  let current = cells;
  let count = Object.keys(current).length;
  while (count > budget) {
    // Coarsen only the finest resolution present, one level at a time.
    let finest = -1;
    for (const h of Object.keys(current)) finest = Math.max(finest, getResolution(h));
    if (finest <= 0) break;
    const next: Record<string, number> = {};
    const mass = new Map<string, number>();
    for (const [h, v] of Object.entries(current)) {
      if (getResolution(h) !== finest) {
        next[h] = (next[h] ?? 0) + v;
        continue;
      }
      const parent = cellToParent(h, finest - 1);
      mass.set(parent, (mass.get(parent) ?? 0) + v * cellArea(h, UNITS.km2));
    }
    for (const [parent, m] of mass) {
      next[parent] = (next[parent] ?? 0) + m / cellArea(parent, UNITS.km2);
    }
    current = next;
    count = Object.keys(current).length;
  }
  return current;
}

/** Outline of a set of cells as one GeoJSON MultiPolygon, e.g. a brush footprint. */
export function cellsOutline(cells: string[]): GeoJSON.MultiPolygon {
  return { type: "MultiPolygon", coordinates: cellsToMultiPolygon(cells, true) };
}
