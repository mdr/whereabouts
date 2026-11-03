/**
 * The VR globe's land, drawn in equirectangular projection from the "Trim
 * sea" mask with every country's outline. No labels, so nothing gives an
 * answer away.
 */
import {
  cellBoundaryLonLat,
  cellToChildren,
  cellToLatLng,
  getResolution,
  h3Cell,
  h3Resolution,
  latLngToCell,
  type H3Cell
} from "@whereabouts/shared/h3"
import { decodeRing, ringOf, type BordersData } from "@whereabouts/shared/borders"
import { toRadians, type Ring } from "@whereabouts/shared/geo"
import type { Degrees, Radians } from "@whereabouts/shared/units"
import type { LandMaskData } from "@whereabouts/shared/paint/land"
import { Vector3 } from "three"
import { MAX_LAT } from "../../map/map-geometry"
import type { Theme } from "../../map/themes"
import { latLonToLocal, localToLatLon } from "./sphere"

const lonToX = (lon: Degrees, width: number): number => ((lon + 180) / 360) * width
const latToY = (lat: Degrees, height: number): number => ((90 - lat) / 180) * height

/** Trace a ring of [lon, lat] points, and again a world to the left if it runs past 180°. */
const traceRing = (ctx: CanvasRenderingContext2D, ring: Ring, width: number, height: number): void => {
  let east = false
  for (const shift of [0, -360]) {
    if (shift && !east) return
    for (let i = 0; i < ring.length; i++) {
      const [lon, lat] = ring[i]!
      if (lon > 180) east = true
      if (i === 0) ctx.moveTo(lonToX(lon + shift, width), latToY(lat, height))
      else ctx.lineTo(lonToX(lon + shift, width), latToY(lat, height))
    }
    ctx.closePath()
  }
}

/** Longest step along a cell's edge: about a pixel of the land picture. */
const EDGE_STEP: Radians = toRadians(0.1)

/**
 * A cell's outline, unwrapped across the antimeridian; undefined for one
 * around a pole. Its edges are great circles, which drawn straight on the
 * flat picture would miss the small cells beside them, far from the equator
 * by many pixels, so long ones go in short steps.
 */
export const cellRing = (cell: H3Cell): Ring | undefined => {
  let ring = alongGreatCircles(cellBoundaryLonLat(cell))
  const lons = ring.map(([lon]) => lon)
  if (Math.max(...lons) - Math.min(...lons) <= 180) return ring
  ring = ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat])
  const shifted = ring.map(([lon]) => lon)
  return Math.max(...shifted) - Math.min(...shifted) <= 180 ? ring : undefined
}

/**
 * The mask's cells, plus any finest cell of a coarse one that no mask
 * cell's hexagon covers: an H3 parent's outline only roughly follows its
 * children, so filling the mask alone leaves slivers of land undrawn.
 */
const alongGreatCircles = (ring: Ring): Ring => {
  const out: Ring = []
  const a = new Vector3()
  const b = new Vector3()
  const p = new Vector3()
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon0, lat0] = ring[i]!
    const [lon1, lat1] = ring[i + 1]!
    out.push([lon0, lat0])
    latLonToLocal({ lat: lat0, lon: lon0 }, a)
    latLonToLocal({ lat: lat1, lon: lon1 }, b)
    const steps = Math.ceil(a.angleTo(b) / EDGE_STEP)
    for (let k = 1; k < steps; k++) {
      const { lat, lon } = localToLatLon(p.copy(a).lerp(b, k / steps))
      out.push([lon, lat])
    }
  }
  out.push(out[0]!)
  return out
}

export const landCells = (land: LandMaskData): H3Cell[] => {
  const finest = h3Resolution(land.resolution)
  const mask = new Set(land.cells.map(h3Cell))
  const resolutions = Array.from({ length: finest + 1 }, (_, resolution) => h3Resolution(resolution))
  const out = [...mask]
  for (const cell of mask) {
    const resolution = getResolution(cell)
    if (resolution === finest) continue
    for (const k of cellToChildren(cell, finest)) {
      const [lat, lon] = cellToLatLng(k)
      if (latLngToCell(lat, lon, resolution) === cell) continue
      if (!resolutions.some((resolution) => mask.has(latLngToCell(lat, lon, resolution)))) out.push(k)
    }
  }
  return out
}

/** Returns the land alone, on a clear sea. */
export const drawLand = (canvas: HTMLCanvasElement, land: LandMaskData, theme: Theme): HTMLCanvasElement => {
  const { width: width, height: height } = canvas
  const landOnly = document.createElement("canvas")
  landOnly.width = width
  landOnly.height = height
  const ctx = landOnly.getContext("2d")!
  ctx.fillStyle = ctx.strokeStyle = theme.land
  ctx.lineWidth = 1
  // Each fill's soft edge leaves a faint seam where it meets the next; a
  // thin stroke round it in the same colour closes them.
  const fill = (): void => {
    ctx.fill()
    ctx.stroke()
  }
  // Chrome builds one huge path far more slowly than many small ones: all
  // 40,000 cells in one took 5 s, in fills of 500 under 1 s.
  ctx.beginPath()
  landCells(land).forEach((cell, i) => {
    const ring = cellRing(cell)
    if (ring) traceRing(ctx, ring, width, height)
    if (i % 500 === 499) {
      fill()
      ctx.beginPath()
    }
  })
  fill()
  // The cells around the south pole are skipped above, and it is all ice.
  ctx.fillRect(0, latToY(-86, height), width, height)

  const out = canvas.getContext("2d")!
  out.fillStyle = theme.water
  out.fillRect(0, 0, width, height)
  out.drawImage(landOnly, 0, 0)
  return landOnly
}

/** Natural Earth II colour relief, as the page's map shows on the reveal; its zoom 2 is about the land picture's detail. */
const COLOUR_TILES = "https://tiles.openfreemap.org/natural_earth/ne2sr/2/{x}/{y}.png"
const COLOUR_TILE_COUNT = 4

/**
 * The land picture with natural colour over the land, dimmed as the page's
 * map dims it for the dark theme. The colour's own sea is opaque, so `landOnly` (from drawLand) cuts it to the land.
 */
export const drawColour = async (
  canvas: HTMLCanvasElement,
  land: HTMLCanvasElement,
  landOnly: HTMLCanvasElement
): Promise<void> => {
  const tiles = await Promise.all(
    Array.from({ length: COLOUR_TILE_COUNT ** 2 }, async (_, i) => {
      const image = new Image()
      image.crossOrigin = "anonymous"
      image.src = COLOUR_TILES.replace("{x}", String(i % COLOUR_TILE_COUNT)).replace(
        "{y}",
        String(Math.floor(i / COLOUR_TILE_COUNT))
      )
      await image.decode()
      return image
    })
  )
  const tile = tiles[0]!.naturalWidth
  const mercator = document.createElement("canvas")
  mercator.width = mercator.height = tile * COLOUR_TILE_COUNT
  const mercatorContext = mercator.getContext("2d")!
  // The page's raster-brightness-max 0.55 and raster-saturation 0.2.
  mercatorContext.filter = "brightness(0.55) saturate(1.25)"
  tiles.forEach((image, i) =>
    mercatorContext.drawImage(image, (i % COLOUR_TILE_COUNT) * tile, Math.floor(i / COLOUR_TILE_COUNT) * tile)
  )

  const { width: width, height: height } = canvas
  const flat = document.createElement("canvas")
  flat.width = width
  flat.height = height
  const flatContext = flat.getContext("2d")!
  // Mercator rows to the flat picture's, one row at a time.
  const size = mercator.height
  for (let j = 0; j < height; j++) {
    const lat = 90 - ((j + 0.5) / height) * 180
    if (Math.abs(lat) > MAX_LAT) continue
    const mercatorY = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
    const sy = ((1 - mercatorY / Math.PI) / 2) * size
    flatContext.drawImage(mercator, 0, Math.min(size - 1, Math.floor(sy)), size, 1, 0, j, width, 1)
  }
  flatContext.globalCompositeOperation = "destination-in"
  flatContext.drawImage(landOnly, 0, 0)

  const ctx = canvas.getContext("2d")!
  ctx.drawImage(land, 0, 0)
  ctx.globalAlpha = 0.9
  ctx.drawImage(flat, 0, 0)
  ctx.globalAlpha = 1
}

/** National borders on a clear canvas, to lay over the land when the map shows them. */
export const drawBorders = (canvas: HTMLCanvasElement, borders: BordersData, theme: Theme): void => {
  const ctx = canvas.getContext("2d")!
  const { width: width, height: height } = canvas
  ctx.strokeStyle = theme.border
  ctx.lineWidth = Math.max(1, width / 4096)
  ctx.beginPath()
  for (const steps of [...borders.countries.flatMap((country) => country.rings), ...borders.none]) {
    traceRing(ctx, ringOf(decodeRing(steps)), width, height)
  }
  ctx.stroke()
}
