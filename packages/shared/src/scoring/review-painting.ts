import { EARTH_RADIUS, greatCircleDistance, toDegrees, toRadians, type LatLon } from "../geo.ts"
import { cellArea, cellToLatLng } from "../h3.ts"
import { PaintLayer, resolutionForTolerance } from "../paint/paint.ts"
import { AnswerType, answerCentre, shuffle, type PointAnswer } from "../questions.ts"
import type { Degrees, Km, SquareKm } from "../units.ts"
import { insideRegion, regionCells, type Area, type ScoredAnswer } from "./regions.ts"
import { GuessType } from "./score-verdict.ts"

type PointGuess =
  | GuessType.BULLSEYE
  | GuessType.CLOSE
  | GuessType.NEAR_MISS
  | GuessType.FAR_MISS
  | GuessType.WIDE
  | GuessType.HEDGE
  | GuessType.SCATTERED
type RegionGuess =
  | GuessType.WHOLE
  | GuessType.PART
  | GuessType.SPILL
  | GuessType.CENTRE
  | GuessType.NEIGHBOUR
  | GuessType.FAR_MISS
  | GuessType.WIDE
  | GuessType.HEDGE

export const POINT_GUESSES: readonly PointGuess[] = [
  GuessType.BULLSEYE,
  GuessType.CLOSE,
  GuessType.NEAR_MISS,
  GuessType.FAR_MISS,
  GuessType.WIDE,
  GuessType.HEDGE,
  GuessType.SCATTERED
]
export const REGION_GUESSES: readonly RegionGuess[] = [
  GuessType.WHOLE,
  GuessType.PART,
  GuessType.SPILL,
  GuessType.CENTRE,
  GuessType.NEIGHBOUR,
  GuessType.FAR_MISS,
  GuessType.WIDE,
  GuessType.HEDGE
]

export interface ReviewGuess {
  type: GuessType
  layer: PaintLayer
}

/** Paints the nth of the answer's shuffled kinds of guess. */
export const guessPainter = (
  answer: ScoredAnswer,
  seed: number,
  random: () => number
): ((index: number) => ReviewGuess) => {
  if (answer.type === AnswerType.AREA) {
    const types = shuffle([...REGION_GUESSES], seed)
    return (index) => paintRegionGuess(answer, types[index]!, random)
  }
  const types = shuffle([...POINT_GUESSES], seed)
  return (index) => paintPointGuess(answer, types[index]!, random)
}

const paintPointGuess = (answer: PointAnswer, type: PointGuess, random: () => number): ReviewGuess => {
  const { layer, between, blob } = painting(answer, random)
  pointGuess(type, blob, between, random)
  return { type, layer }
}

/** A blank layer for the answer, with the way to paint rough patches on it. */
const painting = (answer: ScoredAnswer, random: () => number) => {
  const between = (low: number, high: number) => low + (high - low) * random()
  const tolerance = answer.tolerance
  const layer = new PaintLayer(resolutionForTolerance(tolerance))
  /** A rough patch `tolerancesAcross` tolerances across, `tolerancesAway` tolerances from the answer in a random direction. */
  const blob = (tolerancesAway: number, tolerancesAcross: number, strength = 1) => {
    const centre = offset(answerCentre(answer), tolerancesAway * tolerance, random() * 360)
    const radiusKm = tolerancesAcross * tolerance
    scribble(layer, random, {
      sample: () => offset(centre, radiusKm * Math.sqrt(random()), random() * 360),
      inside: (point) => greatCircleDistance(centre, point) <= radiusKm,
      area: Math.PI * radiusKm * radiusKm,
      brush: Math.max(0.3 * tolerance, radiusKm * between(0.45, 0.7)),
      strength
    })
  }
  return { layer, between, blob }
}

const paintRegionGuess = (area: Area, type: RegionGuess, random: () => number): ReviewGuess => {
  const { layer, between, blob } = painting(area, random)
  const tolerance = area.tolerance
  // A region's tolerance is a fifth of its radius: R is about its radius.
  const R = 5
  const cells = regionCells(area, layer.resolution)
  const centres = cells.map((cell) => {
    const [lat, lon] = cellToLatLng(cell)
    return { lat, lon }
  })
  const oneCell: SquareKm = cells.length > 0 ? cellArea(cells[0]!) : 0
  /** Brush strokes over the region, or the part of it `keep` allows, `across` in radius. */
  const shape = (strength: number, keep: (point: LatLon) => boolean = () => true, across: Km = R * tolerance) => {
    const kept = centres.filter(keep)
    const from = kept.length > 0 ? kept : [area.centre]
    scribble(layer, random, {
      sample: () => from[Math.floor(random() * from.length)]!,
      inside: (point) => keep(point) && insideRegion(area, point),
      area: Math.max(kept.length * oneCell, Math.PI * tolerance * tolerance),
      brush: between(0.2, 0.32) * across,
      strength
    })
  }
  switch (type) {
    case GuessType.WHOLE:
      shape(1)
      break
    case GuessType.PART: {
      const from = centres[Math.floor(random() * centres.length)] ?? area.centre
      const reach = between(0.4, 0.8) * R * tolerance
      shape(1, (point) => greatCircleDistance(from, point) <= reach, reach)
      break
    }
    case GuessType.SPILL:
      shape(1)
      blob(between(0.8, 1.2) * R, between(0.4, 0.7) * R)
      break
    case GuessType.CENTRE:
      blob(0, between(0.4, 0.8) * R)
      break
    case GuessType.NEIGHBOUR:
      blob(between(1.5, 2.5) * R, between(0.5, 1) * R)
      break
    case GuessType.FAR_MISS:
      blob(between(6, 15) * R, between(0.5, 1) * R)
      break
    case GuessType.WIDE:
      blob(between(0, 1) * R, between(3, 5) * R)
      break
    case GuessType.HEDGE: {
      const share = [0.3, 0.5, 0.7][Math.floor(random() * 3)]!
      shape(share)
      blob(between(4, 8) * R, 0.8 * R, 1 - share)
      break
    }
  }
  return { type, layer }
}

/** Enough dabs for the biggest patch without making a set slow to paint. */
const MAX_DABS = 600

interface Patch {
  /** A point to start a stroke from. */
  sample: () => LatLon
  /** Whether a point is in what the hand is aiming to cover. */
  inside: (point: LatLon) => boolean
  area: SquareKm
  /** The brush's radius. */
  brush: Km
  strength: number
}

/**
 * Cover a patch as a hand would: wandering strokes of dabs that vary in
 * size and weight, about two coats in all, so some places get more and a
 * few none. A stroke that runs over the edge leaves a dab there before turning
 * back, so the paint overshoots the outline in places and misses others.
 */
const scribble = (layer: PaintLayer, random: () => number, patch: Patch): void => {
  const step = 0.7 * patch.brush
  let dabs = Math.min(MAX_DABS, Math.ceil((patch.area / (1.5 * step * patch.brush)) * (1.8 + 0.8 * random())))
  while (dabs > 0) {
    let at = patch.sample()
    let heading = random() * 360
    for (let strokeDabs = 6 + Math.floor(random() * 14); strokeDabs > 0 && dabs > 0; strokeDabs--, dabs--) {
      layer.stamp(at, patch.brush * (0.85 + 0.3 * random()), patch.strength * (0.75 + 0.35 * random()))
      heading += (random() - 0.5) * 60
      at = offset(at, step, heading)
      if (!patch.inside(at)) heading += 140 + random() * 80
    }
  }
}

const pointGuess = (
  type: PointGuess,
  blob: (tolerancesAway: number, tolerancesAcross: number, strength?: number) => void,
  between: (low: number, high: number) => number,
  random: () => number
): void => {
  switch (type) {
    case GuessType.BULLSEYE:
      return blob(between(0, 0.3), between(0.5, 1))
    case GuessType.CLOSE:
      return blob(between(0.5, 1.5), between(0.4, 0.8))
    case GuessType.NEAR_MISS:
      return blob(between(2, 4), between(0.5, 1.5))
    case GuessType.FAR_MISS:
      return blob(between(6, 20), between(0.5, 2))
    case GuessType.WIDE:
      return blob(between(0, 3), between(4, 10))
    case GuessType.HEDGE: {
      const share = [0.3, 0.5, 0.7][Math.floor(random() * 3)]!
      blob(between(0, 1), 1, share)
      return blob(between(4, 10), 1, 1 - share)
    }
    case GuessType.SCATTERED:
      for (let i = 3 + Math.floor(random() * 3); i > 0; i--) blob(between(0, 12), between(0.5, 1.5), between(0.5, 1))
      return
  }
}

/** The point `distance` from `from` on a bearing clockwise from north. */
const offset = (from: LatLon, distance: Km, bearing: Degrees): LatLon => {
  const angularDistance = distance / EARTH_RADIUS
  const bearingRadians = toRadians(bearing)
  const lat1 = toRadians(from.lat)
  const lon1 = toRadians(from.lon)
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRadians)
  )
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    )
  return { lat: toDegrees(lat2), lon: ((toDegrees(lon2) + 540) % 360) - 180 }
}
