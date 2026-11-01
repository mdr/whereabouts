import { toDegrees, toRadians, type LatLon } from "../geo.ts"
import { cellToParent, getResolution, gridDisk, h3Resolution, type H3Cell } from "../h3.ts"
import type { PaintLayer } from "./paint.ts"

export interface Blob {
  /** Fraction of painted mass (excludes the floor). */
  fraction: number
  cells: number
  centroid: LatLon
}

/**
 * Connected components of painted cells, largest mass first. Adjacency is
 * judged at the coarsest resolution present (every cell is mapped to its
 * ancestor there), which is exact when one resolution is in use and a fair
 * approximation otherwise. Diagnostic only.
 */
export const paintBlobs = (layer: PaintLayer): Blob[] => {
  if (layer.cells.size === 0) return []
  const groups = groupByCoarsestAncestor(layer)
  let totalMass = 0
  for (const [cell, intensity] of layer.cells) totalMass += intensity * layer.area(cell)

  return connectedKeyGroups(groups)
    .map((keys) =>
      summariseBlob(
        layer,
        keys.flatMap((key) => groups.get(key)!),
        totalMass
      )
    )
    .sort((a, b) => b.fraction - a.fraction)
}

/** Cells grouped under their ancestor at the coarsest resolution present. */
const groupByCoarsestAncestor = (layer: PaintLayer): Map<H3Cell, H3Cell[]> => {
  let min = Infinity
  for (const cell of layer.cells.keys()) min = Math.min(min, getResolution(cell))
  const coarsest = h3Resolution(min)

  const groups = new Map<H3Cell, H3Cell[]>()
  for (const cell of layer.cells.keys()) {
    const key = getResolution(cell) === coarsest ? cell : cellToParent(cell, coarsest)
    const list = groups.get(key)
    if (list) list.push(cell)
    else groups.set(key, [cell])
  }
  return groups
}

const summariseBlob = (layer: PaintLayer, cells: H3Cell[], totalMass: number): Blob => {
  let mass = 0
  let sx = 0,
    sy = 0,
    sz = 0
  for (const cell of cells) {
    const weight = layer.cells.get(cell)! * layer.area(cell)
    mass += weight
    const { lat, lon } = layer.centre(cell)
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

/** Keys of `groups` split into runs of H3-adjacent cells, each in traversal order. */
const connectedKeyGroups = (groups: ReadonlyMap<H3Cell, unknown>): H3Cell[][] => {
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
