/**
 * The VR globe's land, drawn in equirectangular projection from the "Trim
 * sea" mask with every country's outline. No labels, so nothing gives an
 * answer away.
 */
import {
  cellToBoundary,
  cellToChildren,
  cellToLatLng,
  decodeRing,
  getResolution,
  h3Cell,
  h3Res,
  latLngToCell,
  type BordersData,
  type H3Cell,
  type LandMaskData
} from "@whereabouts/shared"
import type { Theme } from "../themes"

/** [lon, lat] points, as GeoJSON has them; longitudes past 180 wrap. */
type Ring = readonly (readonly number[])[]

const x = (lon: number, w: number) => ((lon + 180) / 360) * w
const y = (lat: number, h: number) => ((90 - lat) / 180) * h

/** Trace a ring of [lon, lat] points, and again a world to the left if it runs past 180°. */
function traceRing(ctx: CanvasRenderingContext2D, ring: Ring, w: number, h: number): void {
  let east = false
  for (const shift of [0, -360]) {
    if (shift && !east) return
    for (let i = 0; i < ring.length; i++) {
      const [lon, lat] = ring[i]!
      if (lon! > 180) east = true
      if (i === 0) ctx.moveTo(x(lon! + shift, w), y(lat!, h))
      else ctx.lineTo(x(lon! + shift, w), y(lat!, h))
    }
    ctx.closePath()
  }
}

/** A cell's outline, unwrapped across the antimeridian; undefined for one around a pole. */
function cellRing(cell: H3Cell): number[][] | undefined {
  let b = cellToBoundary(cell, true)
  const lons = b.map(([lon]) => lon)
  if (Math.max(...lons) - Math.min(...lons) <= 180) return b
  b = b.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat])
  const shifted = b.map(([lon]) => lon)
  return Math.max(...shifted) - Math.min(...shifted) <= 180 ? b : undefined
}

/**
 * The mask's cells, plus any finest cell of a coarse one that no mask
 * cell's hexagon covers: an H3 parent's outline only roughly follows its
 * children, so filling the mask alone leaves slivers of land undrawn.
 */
export function landCells(land: LandMaskData): H3Cell[] {
  const finest = h3Res(land.res)
  const mask = new Set(land.cells.map(h3Cell))
  const resolutions = Array.from({ length: finest + 1 }, (_, r) => h3Res(r))
  const out = [...mask]
  for (const c of mask) {
    const res = getResolution(c)
    if (res === finest) continue
    for (const k of cellToChildren(c, finest)) {
      const [lat, lon] = cellToLatLng(k)
      if (latLngToCell(lat, lon, res) === c) continue
      if (!resolutions.some((r) => mask.has(latLngToCell(lat, lon, r)))) out.push(k)
    }
  }
  return out
}

export function drawLand(canvas: HTMLCanvasElement, land: LandMaskData, borders: BordersData, theme: Theme): void {
  const ctx = canvas.getContext("2d")!
  const { width: w, height: h } = canvas
  ctx.fillStyle = theme.water
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = theme.land
  // Chrome builds one huge path far more slowly than many small ones: all
  // 40,000 cells in one took 5 s, in fills of 500 under 1 s.
  ctx.beginPath()
  landCells(land).forEach((cell, i) => {
    const ring = cellRing(cell)
    if (ring) traceRing(ctx, ring, w, h)
    if (i % 500 === 499) {
      ctx.fill()
      ctx.beginPath()
    }
  })
  ctx.fill()
  // The cells around the south pole are skipped above, and it is all ice.
  ctx.fillRect(0, y(-86, h), w, h)

  ctx.strokeStyle = theme.border
  ctx.lineWidth = Math.max(1, w / 4096)
  ctx.beginPath()
  for (const steps of [...borders.countries.flatMap((c) => c.rings), ...borders.none]) {
    const flat = decodeRing(steps)
    const ring: number[][] = []
    for (let i = 0; i < flat.length; i += 2) ring.push([flat[i]!, flat[i + 1]!])
    traceRing(ctx, ring, w, h)
  }
  ctx.stroke()
}
