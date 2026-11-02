/**
 * Paint on an area answer's disputed land counts for nothing: it is taken
 * out, and the rest scaled up to the same total, as if it had never been
 * painted.
 */
import {
  cellArea,
  cellToChildren,
  cellToParent,
  getResolution,
  polygonToCells,
  type H3Cell,
  type H3Resolution
} from "../h3.ts"
import type { OutlineId } from "../ids.ts"
import type { Outline } from "../questions.ts"
import { cellPoint, type Distribution, type WeightedPoint } from "./scoring.ts"

export interface DisputedLand {
  outline: OutlineId
  polygons: Outline
}

interface DisputedCells {
  cells: Set<H3Cell>
  /** Their ancestors at each coarser resolution, filled in as needed. */
  ancestors: Map<H3Resolution, Set<H3Cell>>
}

const cached = new Map<string, DisputedCells>()

const disputedCells = (land: DisputedLand, resolution: H3Resolution): DisputedCells => {
  const key = `${land.outline}|${resolution}`
  let found = cached.get(key)
  if (!found) {
    found = {
      cells: new Set(land.polygons.flatMap((polygon) => polygonToCells(polygon, resolution, true))),
      ancestors: new Map()
    }
    cached.set(key, found)
  }
  return found
}

const overlaps = (disputed: DisputedCells, cell: H3Cell, resolution: H3Resolution): boolean => {
  let set = disputed.ancestors.get(resolution)
  if (!set) {
    set = new Set([...disputed.cells].map((disputedCell) => cellToParent(disputedCell, resolution)))
    disputed.ancestors.set(resolution, set)
  }
  return set.has(cell)
}

/** What of a painted point is off the disputed land: itself, none of it, or, for a coarser cell over the land, its other children. */
const undisputedPart = (point: WeightedPoint, disputed: DisputedCells, resolution: H3Resolution): WeightedPoint[] => {
  if (!point.cell) return [point]
  const own = getResolution(point.cell)
  if (own >= resolution)
    return disputed.cells.has(own === resolution ? point.cell : cellToParent(point.cell, resolution)) ? [] : [point]
  if (!overlaps(disputed, point.cell, own)) return [point]
  const children = cellToChildren(point.cell, resolution)
  const areas = children.map((child) => cellArea(child))
  const total = areas.reduce((a, b) => a + b, 0)
  return children.flatMap((child, i) =>
    disputed.cells.has(child) ? [] : [cellPoint(child, (point.p * areas[i]!) / total)]
  )
}

/**
 * The paint without what lies on the disputed land, judged at `resolution`
 * (the painting resolution). Undefined when nothing else is painted.
 */
export const withoutDisputed = (
  painted: Distribution,
  land: DisputedLand,
  resolution: H3Resolution
): Distribution | undefined => {
  const disputed = disputedCells(land, resolution)
  const kept: WeightedPoint[] = []
  let dropped = false
  for (const point of painted.points) {
    const part = undisputedPart(point, disputed, resolution)
    if (part.length !== 1 || part[0] !== point) dropped = true
    kept.push(...part)
  }
  if (!dropped) return painted
  const mass = kept.reduce((sum, point) => sum + point.p, 0)
  if (mass <= 0) return undefined
  const scale = (1 - painted.floor) / mass
  return { points: kept.map((point) => ({ ...point, p: point.p * scale })), floor: painted.floor }
}
