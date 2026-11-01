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
  cellBoundaryLonLat,
  cellToChildren,
  cellToLatLng,
  cellToParent,
  edgeLength,
  getResolution,
  cellsToMultiPolygon,
  gridDisk,
  gridDiskDistances,
  gridDistance,
  latLngToCell,
  cellEntries,
  finerRes,
  h3Res,
  type H3Cell,
  type H3Res
} from "../h3.ts"
import { chordDistanceSq, toDegrees, toRadians, toXyz, type LatLon, type Ring } from "../geo.ts"
import type { Degrees, Km, SquareKm } from "../units.ts"

/** Cells across the brush radius a stamp aims for; sets the stamp resolution. */
const TARGET_RINGS = 5
/** Safety cap on rings per stamp; unreachable in practice now that the resolution adapts. */
const MAX_RINGS = 40

export function resolutionForTolerance(tolerance: Km): H3Res {
  const target = tolerance / 4
  for (let res = 0; res <= 10; res++) {
    if (edgeLength(h3Res(res)) <= target) return h3Res(Math.max(1, res))
  }
  return h3Res(10)
}

/** Centre-to-centre distance between neighbouring cells. */
export function cellSpacing(res: H3Res): Km {
  return edgeLength(res) * Math.sqrt(3)
}

export interface PaintCell {
  lat: Degrees
  lon: Degrees
  intensity: number
  area: SquareKm
  /** H3 index, so scoring can refine a coarse cell where precision matters. */
  h3: H3Cell
}

export interface Blob {
  /** Fraction of painted mass (excludes the floor). */
  fraction: number
  cells: number
  centroid: LatLon
}

export interface StampResult {
  /** Resolution the stamp was written at. */
  res: H3Res
  rings: number
  /** Cells touched. */
  cells: number
}

const EPSILON = 1e-4

/** Grid distance, or undefined where H3 cannot compute one (across pentagons or far apart). */
function safeGridDistance(a: H3Cell, b: H3Cell): number | undefined {
  try {
    const distance = gridDistance(a, b)
    return Number.isFinite(distance) && distance >= 0 ? distance : undefined
  } catch {
    return undefined
  }
}
/** Circumradius of a hexagon from its area, with a margin for H3's distortion. */
const CIRCUMRADIUS_FACTOR = 1.1 * Math.sqrt(2 / (3 * Math.sqrt(3)))

export class PaintLayer {
  /** Finest resolution this layer may use, from the question's tolerance. */
  readonly res: H3Res
  readonly cells = new Map<H3Cell, number>()
  private boundaryCache = new Map<H3Cell, Ring>()
  private areaCache = new Map<H3Cell, SquareKm>()
  private centreCache = new Map<H3Cell, LatLon>()
  /** Incremented on every change; cheap dirty-check for renderers. */
  version = 0

  constructor(res: H3Res) {
    this.res = res
  }

  /**
   * The coarsest resolution (not finer than the layer's) that still puts
   * about TARGET_RINGS cells across the brush radius.
   */
  stampResolution(radius: Km): H3Res {
    for (let resolution = 0; resolution < this.res; resolution++) {
      if (cellSpacing(h3Res(resolution)) <= radius / TARGET_RINGS) return h3Res(resolution)
    }
    return this.res
  }

  /**
   * How a stamp of this radius would be laid out. At the layer's finest
   * resolution a brush smaller than half a cell is a single cell (zero rings),
   * so zoomed right in the smallest brush paints exactly one hex.
   */
  stampPlan(radius: Km): { res: H3Res; rings: number } {
    const res = this.stampResolution(radius)
    const rings = Math.min(MAX_RINGS, Math.max(0, Math.round(radius / cellSpacing(res))))
    return { res, rings }
  }

  /** The cells a stamp of this radius at `at` would touch, for previewing its footprint. */
  stampCells(at: LatLon, radius: Km): H3Cell[] {
    const { res, rings } = this.stampPlan(radius)
    return gridDisk(latLngToCell(at.lat, at.lon, res), rings)
  }

  /**
   * Apply a soft (Gaussian) brush centred on `at`. `strength` is the intensity
   * added at the centre; the edge ring receives about a tenth of that.
   * Negative strength erases (see `erase`).
   */
  stamp(at: LatLon, radius: Km, strength: number): StampResult {
    if (strength < 0) return this.erase(at, radius, -strength)
    const { res, rings } = this.stampPlan(radius)
    const centre = latLngToCell(at.lat, at.lon, res)
    const byDistance = gridDiskDistances(centre, rings)
    const denominator = (rings + 0.5) * (rings + 0.5)
    let count = 0
    byDistance.forEach((cellsAtDistance, distance) => {
      const weight = strength * Math.exp((-Math.LN10 * distance * distance) / denominator)
      for (const cell of cellsAtDistance) {
        this.add(cell, weight)
        count++
      }
    })
    this.version++
    return { res, rings, cells: count }
  }

  /**
   * Remove paint under a soft brush. Works on whatever cells are stored:
   * cells at or finer than the brush's own resolution, or wholly inside the
   * brush, are reduced by the falloff at their centre; coarser cells that
   * straddle the brush edge are split into children first, one level at a
   * time, so paint outside the brush survives. Density is conserved by the
   * split, and only cells touching the brush are ever split.
   */
  erase(at: LatLon, radius: Km, strength: number): StampResult {
    const { res: eraseRes, rings } = this.stampPlan(radius)
    const spacing = cellSpacing(eraseRes)
    const reach = (rings + 0.5) * spacing
    const denominator = (rings + 0.5) * (rings + 0.5)
    const centreCell = latLngToCell(at.lat, at.lon, eraseRes)
    const centre = toXyz(at)
    const queue = [...this.cells.keys()]
    let touched = 0
    while (queue.length) {
      const cell = queue.pop()!
      const intensity = this.cells.get(cell)
      if (intensity === undefined) continue
      const distance = Math.sqrt(chordDistanceSq(centre, toXyz(this.centre(cell))))
      const circumradius = CIRCUMRADIUS_FACTOR * Math.sqrt(this.area(cell))
      if (distance - circumradius > reach) continue // clear of the brush
      const cellResolution = getResolution(cell)
      if (cellResolution === eraseRes) {
        // Same grid as the stamp: mirror its ring weights exactly, so an
        // erase over a stamp of the same size cancels it.
        const ring = safeGridDistance(centreCell, cell)
        if (ring === undefined || ring > rings) continue
        this.add(cell, -strength * Math.exp((-Math.LN10 * ring * ring) / denominator))
        touched++
        continue
      }
      if (cellResolution > eraseRes || distance + circumradius <= reach) {
        const ring = distance / spacing
        this.add(cell, -strength * Math.exp((-Math.LN10 * ring * ring) / denominator))
        touched++
        continue
      }
      // Straddles the edge and is coarser than the brush: refine one level.
      this.cells.delete(cell)
      for (const child of cellToChildren(cell, finerRes(cellResolution))) {
        this.cells.set(child, intensity)
        queue.push(child)
      }
    }
    this.version++
    return { res: eraseRes, rings, cells: touched }
  }

  /** Add an even coat of `v` over these cells (a Fill: at or coarser than the layer, disjoint). */
  addCoat(cells: readonly H3Cell[], intensity: number): void {
    for (const cell of cells) this.add(cell, intensity)
    this.version++
  }

  /**
   * Take back a coat laid with addCoat. Where the eraser or Trim sea has
   * since split one of its cells (so it is gone), the coat comes off the
   * pieces instead; finer paint inside a cell still there is left alone.
   */
  removeCoat(cells: readonly H3Cell[], intensity: number): void {
    const split = new Set<H3Cell>()
    for (const cell of cells) {
      if (this.cells.has(cell)) this.add(cell, -intensity)
      else split.add(cell)
    }
    if (split.size > 0) {
      const resolutions = [...new Set([...split].map(getResolution))]
      for (const cell of [...this.cells.keys()]) {
        const resolution = getResolution(cell)
        if (
          resolutions.some(
            (splitResolution) => splitResolution < resolution && split.has(cellToParent(cell, splitResolution))
          )
        )
          this.add(cell, -intensity)
      }
    }
    this.version++
  }

  private add(cell: H3Cell, weight: number): void {
    const current = this.cells.get(cell) ?? 0
    const next = current + weight
    if (next <= EPSILON) this.cells.delete(cell)
    else this.cells.set(cell, next)
  }

  clear(): void {
    this.cells.clear()
    this.version++
  }

  get isEmpty(): boolean {
    return this.cells.size === 0
  }

  /** Replace every cell at once (undo/redo). */
  replaceCells(cells: Map<H3Cell, number>): void {
    this.cells.clear()
    for (const [cell, intensity] of cells) this.cells.set(cell, intensity)
    this.version++
  }

  /** Number of painted cells. */
  get size(): number {
    return this.cells.size
  }

  /** Cell counts per resolution present, coarsest first. */
  resolutionCounts(): [res: number, count: number][] {
    const counts = new Map<number, number>()
    for (const cell of this.cells.keys()) {
      const resolution = getResolution(cell)
      counts.set(resolution, (counts.get(resolution) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0])
  }

  maxIntensity(): number {
    let highest = 0
    for (const intensity of this.cells.values()) if (intensity > highest) highest = intensity
    return highest
  }

  /** Total mass: sum of intensity x area, km². */
  mass(): number {
    let total = 0
    for (const [cell, intensity] of this.cells) total += intensity * this.area(cell)
    return total
  }

  area(cell: H3Cell): SquareKm {
    let area = this.areaCache.get(cell)
    if (area === undefined) {
      area = cellArea(cell)
      this.areaCache.set(cell, area)
    }
    return area
  }

  centre(cell: H3Cell): LatLon {
    let centre = this.centreCache.get(cell)
    if (centre === undefined) {
      const [lat, lon] = cellToLatLng(cell)
      centre = { lat, lon }
      this.centreCache.set(cell, centre)
    }
    return centre
  }

  /** Sparse wire form: H3 index -> intensity. */
  toRecord(): Record<H3Cell, number> {
    const out: Record<H3Cell, number> = {}
    for (const [cell, intensity] of this.cells) out[cell] = intensity
    return out
  }

  /**
   * Rebuild a layer from its wire form. Cells may be at `res` or coarser;
   * finer cells are dropped because they would undercut the tolerance-based
   * resolution the question was scored at.
   */
  static fromRecord(res: H3Res, cells: Record<H3Cell, number>): PaintLayer {
    const layer = new PaintLayer(res)
    for (const [cell, intensity] of cellEntries(cells)) {
      if (intensity > 0 && getResolution(cell) <= res) layer.cells.set(cell, intensity)
    }
    layer.version++
    return layer
  }

  *toCells(): IterableIterator<PaintCell> {
    for (const [cell, intensity] of this.cells) {
      const { lat, lon } = this.centre(cell)
      yield { lat, lon, intensity, area: this.area(cell), h3: cell }
    }
  }

  /**
   * GeoJSON polygons with `v` in [0,1] = intensity relative to the max.
   * Coarse cells come first so finer detail draws on top.
   */
  toGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.Polygon, { v: number }> {
    const max = this.maxIntensity() || 1
    const byRes: GeoJSON.Feature<GeoJSON.Polygon, { v: number }>[][] = []
    for (const [cell, intensity] of this.cells) {
      const resolution: number = getResolution(cell)
      ;(byRes[resolution] ??= []).push({
        type: "Feature",
        properties: { v: intensity / max },
        geometry: { type: "Polygon", coordinates: [this.boundary(cell)] }
      })
    }
    return { type: "FeatureCollection", features: byRes.flat() }
  }

  private boundary(cell: H3Cell): Ring {
    let boundary = this.boundaryCache.get(cell)
    if (boundary === undefined) {
      boundary = cellBoundaryLonLat(cell)
      // Cells straddling the antimeridian come back with longitudes on both
      // sides; unwrap so the polygon does not span the whole world.
      let minLon = Infinity
      let maxLon = -Infinity
      for (const [lon] of boundary) {
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
      }
      if (maxLon - minLon > 180) {
        boundary = boundary.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat])
      }
      this.boundaryCache.set(cell, boundary)
    }
    return boundary
  }

  /**
   * Connected components of painted cells, largest mass first. Adjacency is
   * judged at the coarsest resolution present (every cell is mapped to its
   * ancestor there), which is exact when one resolution is in use and a fair
   * approximation otherwise. Diagnostic only.
   */
  blobs(): Blob[] {
    if (this.cells.size === 0) return []
    const groups = this.groupByCoarsestAncestor()
    let totalMass = 0
    for (const [cell, intensity] of this.cells) totalMass += intensity * this.area(cell)

    return connectedKeyGroups(groups)
      .map((keys) =>
        this.summariseBlob(
          keys.flatMap((key) => groups.get(key)!),
          totalMass
        )
      )
      .sort((a, b) => b.fraction - a.fraction)
  }

  /** Cells grouped under their ancestor at the coarsest resolution present. */
  private groupByCoarsestAncestor(): Map<H3Cell, H3Cell[]> {
    let min = Infinity
    for (const cell of this.cells.keys()) min = Math.min(min, getResolution(cell))
    const coarsest = h3Res(min)

    const groups = new Map<H3Cell, H3Cell[]>()
    for (const cell of this.cells.keys()) {
      const key = getResolution(cell) === coarsest ? cell : cellToParent(cell, coarsest)
      const list = groups.get(key)
      if (list) list.push(cell)
      else groups.set(key, [cell])
    }
    return groups
  }

  private summariseBlob(cells: H3Cell[], totalMass: number): Blob {
    let mass = 0
    let sx = 0,
      sy = 0,
      sz = 0
    for (const cell of cells) {
      const weight = this.cells.get(cell)! * this.area(cell)
      mass += weight
      const { lat, lon } = this.centre(cell)
      const latRadians = toRadians(lat),
        lonRadians = toRadians(lon)
      sx += weight * Math.cos(latRadians) * Math.cos(lonRadians)
      sy += weight * Math.cos(latRadians) * Math.sin(lonRadians)
      sz += weight * Math.sin(latRadians)
    }
    const centroid = {
      lat: toDegrees(Math.atan2(sz, Math.hypot(sx, sy))),
      lon: toDegrees(Math.atan2(sy, sx))
    }
    return { fraction: mass / totalMass, cells: cells.length, centroid }
  }
}

/** Keys of `groups` split into runs of H3-adjacent cells, each in traversal order. */
function connectedKeyGroups(groups: ReadonlyMap<H3Cell, unknown>): H3Cell[][] {
  const out: H3Cell[][] = []
  const seen = new Set<H3Cell>()
  for (const start of groups.keys()) {
    if (seen.has(start)) continue
    seen.add(start)
    const stack = [start]
    const keys: H3Cell[] = []
    while (stack.length) {
      const key = stack.pop()!
      keys.push(key)
      for (const neighbour of gridDisk(key, 1)) {
        if (!seen.has(neighbour) && groups.has(neighbour)) {
          seen.add(neighbour)
          stack.push(neighbour)
        }
      }
    }
    out.push(keys)
  }
  return out
}

/** Cells a paint upload may carry: clients compact to it, and the server refuses more. */
export const PAINT_CELL_BUDGET = 6000

/**
 * Coarsen a sparse paint record until it fits the cell budget, merging
 * children into their H3 parent while conserving mass (intensity x area).
 * Scoring treats cells as patches, so a coarser representation of the same
 * mass scores almost identically. Cells end up at mixed resolutions, all at
 * or coarser than the original.
 */
export function compactRecord(cells: Record<H3Cell, number>, budget = PAINT_CELL_BUDGET): Record<H3Cell, number> {
  let current = cells
  let count = Object.keys(current).length
  while (count > budget) {
    // Coarsen only the finest resolution present, one level at a time.
    let finest = -1
    for (const [cell] of cellEntries(current)) finest = Math.max(finest, getResolution(cell))
    if (finest <= 0) break
    const next: Record<H3Cell, number> = {}
    const mass = new Map<H3Cell, number>()
    for (const [cell, intensity] of cellEntries(current)) {
      if (getResolution(cell) !== finest) {
        next[cell] = (next[cell] ?? 0) + intensity
        continue
      }
      const parent = cellToParent(cell, h3Res(finest - 1))
      mass.set(parent, (mass.get(parent) ?? 0) + intensity * cellArea(cell))
    }
    for (const [parent, parentMass] of mass) {
      next[parent] = (next[parent] ?? 0) + parentMass / cellArea(parent)
    }
    current = next
    count = Object.keys(current).length
  }
  return current
}

/** Outline of a set of cells as one GeoJSON MultiPolygon, e.g. a brush footprint. */
export function cellsOutline(cells: H3Cell[]): GeoJSON.MultiPolygon {
  // As in PaintLayer.boundary: a polygon straddling the antimeridian comes
  // back with longitudes on both sides; unwrap it so it does not span the world.
  const coordinates = cellsToMultiPolygon(cells, true).map((polygon) => {
    const lons = polygon.flat().map(([lon]) => lon)
    if (Math.max(...lons) - Math.min(...lons) <= 180) return polygon
    return polygon.map((ring) => ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]))
  })
  return { type: "MultiPolygon", coordinates }
}
