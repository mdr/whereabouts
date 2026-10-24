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
import { Vector3 } from "three"
import type { Theme } from "../themes"
import { latLonToLocal, localToLatLon } from "./sphere"

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

/** Longest step along a cell's edge, radians; about a pixel of the land picture. */
const EDGE_STEP = (0.1 * Math.PI) / 180

/**
 * A cell's outline, unwrapped across the antimeridian; undefined for one
 * around a pole. Its edges are great circles, which drawn straight on the
 * flat picture would miss the small cells beside them, far from the equator
 * by many pixels, so long ones go in short steps.
 */
export function cellRing(cell: H3Cell): number[][] | undefined {
  let b = alongGreatCircles(cellToBoundary(cell, true))
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
function alongGreatCircles(ring: number[][]): [number, number][] {
  const out: [number, number][] = []
  const a = new Vector3()
  const b = new Vector3()
  const p = new Vector3()
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon0, lat0] = ring[i]!
    const [lon1, lat1] = ring[i + 1]!
    out.push([lon0!, lat0!])
    latLonToLocal({ lat: lat0!, lon: lon0! }, a)
    latLonToLocal({ lat: lat1!, lon: lon1! }, b)
    const steps = Math.ceil(a.angleTo(b) / EDGE_STEP)
    for (let k = 1; k < steps; k++) {
      const { lat, lon } = localToLatLon(p.copy(a).lerp(b, k / steps))
      out.push([lon, lat])
    }
  }
  out.push(out[0]!)
  return out
}

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

/** Returns the land alone, on a clear sea. */
export function drawLand(canvas: HTMLCanvasElement, land: LandMaskData, theme: Theme): HTMLCanvasElement {
  const { width: w, height: h } = canvas
  const landOnly = document.createElement("canvas")
  landOnly.width = w
  landOnly.height = h
  const ctx = landOnly.getContext("2d")!
  ctx.fillStyle = ctx.strokeStyle = theme.land
  ctx.lineWidth = 1
  // Each fill's soft edge leaves a faint seam where it meets the next; a
  // thin stroke round it in the same colour closes them.
  const fill = () => {
    ctx.fill()
    ctx.stroke()
  }
  // Chrome builds one huge path far more slowly than many small ones: all
  // 40,000 cells in one took 5 s, in fills of 500 under 1 s.
  ctx.beginPath()
  landCells(land).forEach((cell, i) => {
    const ring = cellRing(cell)
    if (ring) traceRing(ctx, ring, w, h)
    if (i % 500 === 499) {
      fill()
      ctx.beginPath()
    }
  })
  fill()
  // The cells around the south pole are skipped above, and it is all ice.
  ctx.fillRect(0, y(-86, h), w, h)

  const out = canvas.getContext("2d")!
  out.fillStyle = theme.water
  out.fillRect(0, 0, w, h)
  out.drawImage(landOnly, 0, 0)
  return landOnly
}

/** Natural Earth II colour relief, as the page's map shows on the reveal; its zoom 2 is about the land picture's detail. */
const COLOUR_TILES = "https://tiles.openfreemap.org/natural_earth/ne2sr/2/{x}/{y}.png"
const COLOUR_TILE_COUNT = 4
const MERCATOR_MAX_LAT = 85.0511

/**
 * The land picture with natural colour over the land, dimmed as the page's
 * map dims it for the dark theme. The colour's own sea is opaque, so `landOnly` (from drawLand) cuts it to the land.
 */
export async function drawColour(
  canvas: HTMLCanvasElement,
  land: HTMLCanvasElement,
  landOnly: HTMLCanvasElement
): Promise<void> {
  const tiles = await Promise.all(
    Array.from({ length: COLOUR_TILE_COUNT ** 2 }, async (_, i) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = COLOUR_TILES.replace("{x}", String(i % COLOUR_TILE_COUNT)).replace(
        "{y}",
        String(Math.floor(i / COLOUR_TILE_COUNT))
      )
      await img.decode()
      return img
    })
  )
  const tile = tiles[0]!.naturalWidth
  const mercator = document.createElement("canvas")
  mercator.width = mercator.height = tile * COLOUR_TILE_COUNT
  const m = mercator.getContext("2d")!
  // The page's raster-brightness-max 0.55 and raster-saturation 0.2.
  m.filter = "brightness(0.55) saturate(1.25)"
  tiles.forEach((img, i) => m.drawImage(img, (i % COLOUR_TILE_COUNT) * tile, Math.floor(i / COLOUR_TILE_COUNT) * tile))

  const { width: w, height: h } = canvas
  const flat = document.createElement("canvas")
  flat.width = w
  flat.height = h
  const f = flat.getContext("2d")!
  // Mercator rows to the flat picture's, one row at a time.
  const size = mercator.height
  for (let j = 0; j < h; j++) {
    const lat = 90 - ((j + 0.5) / h) * 180
    if (Math.abs(lat) > MERCATOR_MAX_LAT) continue
    const merc = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
    const sy = ((1 - merc / Math.PI) / 2) * size
    f.drawImage(mercator, 0, Math.min(size - 1, Math.floor(sy)), size, 1, 0, j, w, 1)
  }
  f.globalCompositeOperation = "destination-in"
  f.drawImage(landOnly, 0, 0)

  const ctx = canvas.getContext("2d")!
  ctx.drawImage(land, 0, 0)
  ctx.globalAlpha = 0.9
  ctx.drawImage(flat, 0, 0)
  ctx.globalAlpha = 1
}

/** National borders on a clear canvas, to lay over the land when the map shows them. */
export function drawBorders(canvas: HTMLCanvasElement, borders: BordersData, theme: Theme): void {
  const ctx = canvas.getContext("2d")!
  const { width: w, height: h } = canvas
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
